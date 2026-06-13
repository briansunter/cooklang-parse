import { hasAllExtensions, resolveExtensions } from "./parser/extensions"
import { maskFrontmatter, parseYamlFrontmatter, splitYamlFrontmatter } from "./parser/frontmatter"
import type { DefineMode, DirectiveNode, DuplicateMode } from "./parser/internal-types"
import {
  applyDirectiveMode,
  applyDuplicateMode,
  checkStandardMetadata,
  createDeprecatedMetadataWarning,
  isSpecialDirectiveKey,
} from "./parser/metadata"
import { parseWithOhm } from "./parser/ohm-ast"
import { stripBlockComments } from "./parser/preprocess"
import { getStepItemPosition, serializeStepItemRaw } from "./parser/raw-step-items"
import {
  applyAdvancedUnits,
  applyAliasMode,
  applyComponentModifierParsing,
  applyInlineQuantityExtraction,
  applySpacedMarkerParsing,
  DEFAULT_POSITION,
  mergeConsecutiveTexts,
  removeBlockCommentPlaceholders,
  splitInvalidMarkerTextItems,
  warnTimerMissingUnit,
  warnUnnecessaryScalingLock,
} from "./parser/step-processing"
import type {
  CooklangRecipe,
  ParseCooklangOptions,
  ParseError,
  RecipeCookware,
  RecipeIngredient,
  RecipeInlineQuantity,
  RecipeSection,
  RecipeStepItem,
} from "./types"

function emptyRecipe(errors: ParseError[], warnings: ParseError[] = []): CooklangRecipe {
  return {
    metadata: {},
    sections: [],
    ingredients: [],
    cookware: [],
    timers: [],
    inlineQuantities: [],
    errors,
    warnings,
  }
}

export function parseCooklang(source: string, options: ParseCooklangOptions = {}): CooklangRecipe {
  const extensions = resolveExtensions(options)
  const allExtensions = hasAllExtensions(options)

  const frontmatterSplit = splitYamlFrontmatter(source)
  const sourceForParsing = maskFrontmatter(source, frontmatterSplit)
  const preprocessed = stripBlockComments(sourceForParsing)
  const withoutBlockComments = preprocessed.source

  const parsed = parseWithOhm(withoutBlockComments)
  if (!parsed.ok) {
    return emptyRecipe([parsed.error])
  }

  const result = parsed.value

  const yaml = frontmatterSplit
    ? parseYamlFrontmatter(frontmatterSplit.yamlText, frontmatterSplit.yamlOffset)
    : null

  const warnings: ParseError[] = []
  const errors: ParseError[] = []
  // Parse-stage fatal errors (e.g. timers without a duration). When present,
  // cooklang-rs discards all output and keeps only these errors.
  const fatalErrors: ParseError[] = []

  if (yaml?.warning) {
    warnings.push({
      message: yaml.warning,
      position: yaml.position ?? DEFAULT_POSITION,
      severity: "warning",
    })
  }

  const hasFrontmatter = frontmatterSplit !== null
  const metadata: Record<string, unknown> = { ...(yaml?.data ?? {}) }
  const usedMetadataDirectives: DirectiveNode[] = []

  const allSections: RecipeSection[] = []
  const componentSteps: Array<{
    items: RecipeStepItem[]
    definedInStep: boolean
    defineMode: DefineMode
    duplicateMode: DuplicateMode
  }> = []
  const inlineQuantities: RecipeInlineQuantity[] = []

  let defineMode: DefineMode = "all"
  let duplicateMode: DuplicateMode = "new"
  let currentSection: RecipeSection = { name: null, content: [] }
  allSections.push(currentSection)

  let stepNumber = 1
  for (const item of result.items) {
    if (item.kind === "directive") {
      const dir = item.directive
      const isSpecial = isSpecialDirectiveKey(dir.key)

      if (extensions.modes && isSpecial) {
        defineMode = applyDirectiveMode(defineMode, dir.key, dir.rawValue)
        duplicateMode = applyDuplicateMode(duplicateMode, dir.key, dir.rawValue)
        continue
      }

      if (hasFrontmatter) {
        if (defineMode === "components") continue

        if (defineMode === "text") {
          currentSection.content.push({ type: "text", value: dir.rawLine })
          continue
        }

        const directiveStepItems = applyInlineQuantityExtraction(
          [{ type: "text", value: dir.rawLine }],
          inlineQuantities,
          extensions.inlineQuantities,
        )

        currentSection.content.push({
          type: "step",
          items: directiveStepItems,
          number: stepNumber++,
        })
        componentSteps.push({
          items: directiveStepItems,
          definedInStep: true,
          defineMode,
          duplicateMode,
        })
        continue
      }

      metadata[dir.key] = dir.rawValue
      usedMetadataDirectives.push(dir)
      continue
    }

    if (item.kind === "section") {
      currentSection = { name: item.name, content: [] }
      allSections.push(currentSection)
      stepNumber = 1
      continue
    }

    if (item.kind === "note") {
      const last = currentSection.content[currentSection.content.length - 1]
      if (last?.type === "text") {
        last.value = `${last.value} ${item.text}`
      } else {
        currentSection.content.push({ type: "text", value: item.text })
      }
      continue
    }

    let stepItems = applySpacedMarkerParsing(item.items)
    stepItems = removeBlockCommentPlaceholders(stepItems, preprocessed.commentRanges)
    stepItems = applyAdvancedUnits(stepItems, allExtensions)
    stepItems = applyComponentModifierParsing(stepItems, allExtensions)
    stepItems = applyAliasMode(stepItems, allExtensions)
    stepItems = mergeConsecutiveTexts(stepItems)
    stepItems = splitInvalidMarkerTextItems(stepItems)

    // Timers with no quantity are fatal in cooklang-rs and discard all output.
    // Extended mode (TIMER_REQUIRES_TIME) rejects any timer without a duration;
    // canonical only rejects timers that also have no name.
    for (const stepItem of stepItems) {
      if (stepItem.type !== "timer" || stepItem.quantity !== "") continue
      if (allExtensions) {
        fatalErrors.push({
          message: "Invalid timer: missing quantity",
          shortMessage: "Invalid timer: missing quantity",
          position: getStepItemPosition(stepItem) ?? DEFAULT_POSITION,
          severity: "error",
        })
      } else if (stepItem.name === "") {
        fatalErrors.push({
          message: "Invalid timer: neither quantity nor name",
          shortMessage: "Invalid timer: neither quantity nor name",
          position: getStepItemPosition(stepItem) ?? DEFAULT_POSITION,
          severity: "error",
        })
      }
    }

    warnTimerMissingUnit(stepItems, warnings)
    warnUnnecessaryScalingLock(stepItems, warnings)

    if (defineMode === "components") {
      componentSteps.push({
        items: stepItems,
        definedInStep: false,
        defineMode,
        duplicateMode,
      })
      continue
    }

    if (defineMode === "text") {
      const textOnly = stepItems
        .map(stepItem => {
          if (stepItem.type === "text") return stepItem.value
          if (
            stepItem.type === "ingredient" ||
            stepItem.type === "cookware" ||
            stepItem.type === "timer"
          ) {
            warnings.push({
              message: `Ignoring ${stepItem.type} in text mode`,
              position: getStepItemPosition(stepItem) ?? DEFAULT_POSITION,
              severity: "warning",
            })
            return serializeStepItemRaw(stepItem)
          }
          return ""
        })
        .join("")

      if (textOnly) {
        currentSection.content.push({ type: "text", value: textOnly })
      }
      continue
    }

    stepItems = applyInlineQuantityExtraction(
      stepItems,
      inlineQuantities,
      extensions.inlineQuantities,
    )

    currentSection.content.push({
      type: "step",
      items: stepItems,
      number: stepNumber++,
    })
    componentSteps.push({
      items: stepItems,
      definedInStep: true,
      defineMode,
      duplicateMode,
    })
  }

  if (fatalErrors.length > 0) {
    return emptyRecipe(fatalErrors)
  }

  checkStandardMetadata(metadata, warnings, usedMetadataDirectives)

  const deprecatedWarning = createDeprecatedMetadataWarning(usedMetadataDirectives)
  if (deprecatedWarning) {
    warnings.push(deprecatedWarning)
  }

  const sections = allSections.filter(s => s.name !== null || s.content.length > 0)

  // Collect components and link references in document order, matching cooklang-rs:
  // top-level arrays keep every parsed component, not a deduplicated shopping list.
  const ingredients: RecipeIngredient[] = []
  const cookware: RecipeCookware[] = []
  const ingredientLastDefinitionByName = new Map<string, number>()
  const cookwareLastDefinitionByName = new Map<string, number>()
  const timers = componentSteps.flatMap(step => step.items.filter(item => item.type === "timer"))

  function referenceNotFoundError(item: RecipeIngredient | RecipeCookware): ParseError {
    return {
      message: `Reference not found: ${item.name}`,
      shortMessage: `Reference not found: ${item.name}`,
      position: getStepItemPosition(item) ?? DEFAULT_POSITION,
      severity: "error",
    }
  }

  function linkIngredientReference(item: RecipeIngredient, referencesTo: number): void {
    item.modifiers = { ...item.modifiers, reference: true }
    item.relation = {
      type: "reference",
      referencesTo,
      referenceTarget: "ingredient",
    }
    const referenceIndex = ingredients.length
    const defRelation = ingredients[referencesTo]?.relation
    if (defRelation?.type === "definition") {
      defRelation.referencedFrom.push(referenceIndex)
    }
  }

  function linkCookwareReference(item: RecipeCookware, referencesTo: number): void {
    item.modifiers = { ...item.modifiers, reference: true }
    item.relation = { type: "reference", referencesTo }
    const referenceIndex = cookware.length
    const defRelation = cookware[referencesTo]?.relation
    if (defRelation?.type === "definition") {
      defRelation.referencedFrom.push(referenceIndex)
    }
  }

  // Collect every component of one type in document order, resolving each to a
  // definition or a reference to the last same-named definition (matching
  // cooklang-rs reference resolution). Ingredients and cookware differ only in
  // how a reference relation is recorded, so that is delegated to `link`.
  function collectComponents<T extends RecipeIngredient | RecipeCookware>(
    type: T["type"],
    target: T[],
    lastDefinitionByName: Map<string, number>,
    link: (item: T, referencesTo: number) => void,
  ): void {
    for (const step of componentSteps) {
      for (const item of step.items) {
        if (item.type !== type) continue
        const comp = item as T

        const nameKey = comp.name.toLowerCase()
        const previousDefinition = lastDefinitionByName.get(nameKey)
        const isExplicitReference = comp.modifiers.reference === true
        const isImplicitStepsReference = step.defineMode === "steps" && !comp.modifiers.new
        const isImplicitDuplicateReference =
          step.duplicateMode === "reference" &&
          !comp.modifiers.new &&
          previousDefinition !== undefined
        const shouldReference =
          isExplicitReference || isImplicitStepsReference || isImplicitDuplicateReference

        comp.relation = {
          type: "definition",
          referencedFrom: [],
          definedInStep: step.definedInStep,
        }

        if (shouldReference) {
          if (previousDefinition !== undefined) {
            link(comp, previousDefinition)
          } else if (isExplicitReference || isImplicitStepsReference) {
            errors.push(referenceNotFoundError(comp))
          }
        }

        const itemIndex = target.length
        target.push(comp)
        if (comp.modifiers.reference !== true) {
          lastDefinitionByName.set(nameKey, itemIndex)
        }
      }
    }
  }

  collectComponents(
    "ingredient",
    ingredients,
    ingredientLastDefinitionByName,
    linkIngredientReference,
  )
  collectComponents("cookware", cookware, cookwareLastDefinitionByName, linkCookwareReference)

  return {
    metadata,
    sections,
    ingredients,
    cookware,
    timers,
    inlineQuantities,
    errors,
    warnings,
  }
}
