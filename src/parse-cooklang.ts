import { hasAllExtensions, resolveExtensions } from "./parser/extensions"
import { parseYamlFrontmatter } from "./parser/frontmatter"
import type { DefineMode, DirectiveNode } from "./parser/internal-types"
import {
  applyDirectiveMode,
  checkStandardMetadata,
  createDeprecatedMetadataWarning,
  isSpecialDirectiveKey,
} from "./parser/metadata"
import { parseWithOhm } from "./parser/ohm-ast"
import { normalizeMarkerSpacing, stripBlockComments } from "./parser/preprocess"
import { serializeStepItemRaw } from "./parser/raw-step-items"
import {
  applyAdvancedUnits,
  applyAliasMode,
  applyInlineQuantityExtraction,
  checkStepsModeReferences,
  collectUniqueFromSteps,
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
  RecipeTimer,
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

  const normalizedSource = normalizeMarkerSpacing(source)
  const withoutBlockComments = stripBlockComments(normalizedSource)

  const parsed = parseWithOhm(withoutBlockComments)
  if (!parsed.ok) {
    return emptyRecipe([parsed.error])
  }

  const result = parsed.value

  const yamlStartOffset = result.frontmatter ? normalizedSource.indexOf("---") + 4 : 0
  const yaml = result.frontmatter ? parseYamlFrontmatter(result.frontmatter, yamlStartOffset) : null

  const warnings: ParseError[] = []
  const errors: ParseError[] = []

  if (yaml?.warning) {
    warnings.push({
      message: yaml.warning,
      position: yaml.position ?? { line: 1, column: 1, offset: 0 },
      severity: "warning",
    })
  }

  const hasFrontmatter = result.frontmatter !== null
  const metadata: Record<string, unknown> = { ...(yaml?.data ?? {}) }
  const usedMetadataDirectives: DirectiveNode[] = []

  const allSections: RecipeSection[] = []
  const allStepsForComponents: RecipeStepItem[][] = []
  const inlineQuantities: RecipeInlineQuantity[] = []

  let defineMode: DefineMode = "all"
  let currentSection: RecipeSection = { name: null, content: [] }
  allSections.push(currentSection)

  let stepNumber = 1
  const knownIngredientDefs = new Set<string>()
  const knownCookwareDefs = new Set<string>()

  for (const item of result.items) {
    if (item.kind === "directive") {
      const dir = item.directive
      const isSpecial = isSpecialDirectiveKey(dir.key)

      if (extensions.modes && isSpecial) {
        defineMode = applyDirectiveMode(defineMode, dir.key, dir.rawValue)
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
        allStepsForComponents.push(directiveStepItems)
        continue
      }

      metadata[dir.key] = dir.rawValue || ""
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

    let stepItems = applyAdvancedUnits(item.items, allExtensions)
    stepItems = applyAliasMode(stepItems, allExtensions)
    stepItems = splitInvalidMarkerTextItems(stepItems)

    if (allExtensions) {
      const invalidTimer = stepItems.find(
        stepItem => stepItem.type === "timer" && stepItem.quantity === "" && stepItem.units === "",
      )
      if (invalidTimer) {
        return emptyRecipe(
          [
            {
              message: "Invalid timer: missing quantity",
              shortMessage: "Invalid timer: missing quantity",
              position: { line: 1, column: 1, offset: 0 },
              severity: "error",
            },
          ],
          warnings,
        )
      }
    }

    warnTimerMissingUnit(stepItems, warnings)
    warnUnnecessaryScalingLock(stepItems, warnings)
    checkStepsModeReferences(stepItems, defineMode, knownIngredientDefs, knownCookwareDefs, errors)

    if (defineMode === "components") {
      allStepsForComponents.push(stepItems)
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
              position: { line: 1, column: 1, offset: 0 },
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
    allStepsForComponents.push(stepItems)
  }

  checkStandardMetadata(metadata, warnings, usedMetadataDirectives)

  const deprecatedWarning = createDeprecatedMetadataWarning(usedMetadataDirectives)
  if (deprecatedWarning) {
    warnings.push(deprecatedWarning)
  }

  const sections = allSections.filter(s => s.name !== null || s.content.length > 0)

  const keyFn = (i: { name: string; quantity: string | number; units: string }) =>
    `${i.name}|${i.quantity}|${i.units}`

  // Collect and link ingredients
  const ingredients: RecipeIngredient[] = []
  const cookware: RecipeCookware[] = []

  // Extract all definitions first (items without the reference '&' modifier)
  for (const step of allStepsForComponents) {
    for (const item of step) {
      if (item.type === "ingredient" && !item.modifiers.reference) {
        if (!ingredients.find(i => keyFn(i) === keyFn(item))) ingredients.push(item)
      } else if (item.type === "cookware" && !item.modifiers.reference) {
        if (!cookware.find(c => c.name === item.name)) cookware.push(item)
      }
    }
  }

  // Fallback: if a reference appears but no definition, the first reference becomes the definition (implicitly)
  for (const step of allStepsForComponents) {
    for (const item of step) {
      if (item.type === "ingredient" && item.modifiers.reference) {
        if (!ingredients.find(i => i.name === item.name)) {
          const pseudoDef = {
            ...item,
            modifiers: { ...item.modifiers, reference: false },
            relation: { type: "definition" as const, referencedFrom: [], definedInStep: true },
          }
          ingredients.push(pseudoDef)
        }
      } else if (item.type === "cookware" && item.modifiers.reference) {
        if (!cookware.find(c => c.name === item.name)) {
          const pseudoDef = {
            ...item,
            modifiers: { ...item.modifiers, reference: false },
            relation: { type: "definition" as const, referencedFrom: [], definedInStep: true },
          }
          cookware.push(pseudoDef)
        }
      }
    }
  }

  // Link references to definitions
  let globalStepIndex = 0
  for (const section of sections) {
    for (const content of section.content) {
      if (content.type !== "step") continue

      for (const item of content.items) {
        if (item.type === "ingredient") {
          const defIndex = ingredients.findIndex(i =>
            item.modifiers.reference ? i.name === item.name : keyFn(i) === keyFn(item),
          )
          if (item.modifiers.reference) {
            item.relation = {
              type: "reference",
              referencesTo: defIndex,
              referenceTarget: "ingredient",
            }
            if (defIndex >= 0) {
              const defRelation = ingredients[defIndex]?.relation
              if (defRelation?.type === "definition" && defRelation.referencedFrom) {
                defRelation.referencedFrom.push(globalStepIndex)
              }
            }
          }
        } else if (item.type === "cookware") {
          const defIndex = cookware.findIndex(c => c.name === item.name)
          if (item.modifiers.reference) {
            item.relation = { type: "reference", referencesTo: defIndex }
            if (defIndex >= 0) {
              const defRelation = cookware[defIndex]?.relation
              if (defRelation?.type === "definition" && defRelation.referencedFrom) {
                defRelation.referencedFrom.push(globalStepIndex)
              }
            }
          }
        }
      }
      globalStepIndex++
    }
  }

  return {
    metadata,
    sections,
    ingredients,
    cookware,
    timers: collectUniqueFromSteps<RecipeTimer>(allStepsForComponents, "timer", keyFn),
    inlineQuantities,
    errors,
    warnings,
  }
}
