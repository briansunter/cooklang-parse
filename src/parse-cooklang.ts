import { hasAllExtensions, resolveExtensions } from "./parser/extensions"
import { parseYamlFrontmatter } from "./parser/frontmatter"
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
  applyDuplicateReferenceMode,
  applyInlineQuantityExtraction,
  applySpacedMarkerParsing,
  checkStepsModeReferences,
  collectUniqueFromSteps,
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

  const preprocessed = stripBlockComments(source)
  const withoutBlockComments = preprocessed.source

  const parsed = parseWithOhm(withoutBlockComments)
  if (!parsed.ok) {
    return emptyRecipe([parsed.error])
  }

  const result = parsed.value

  const yamlStartOffset = result.frontmatter ? source.indexOf("---") + 4 : 0
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
  const componentSeedSteps: RecipeStepItem[][] = []
  const inlineQuantities: RecipeInlineQuantity[] = []

  let defineMode: DefineMode = "all"
  let duplicateMode: DuplicateMode = "new"
  let currentSection: RecipeSection = { name: null, content: [] }
  allSections.push(currentSection)

  let stepNumber = 1
  const knownIngredientDefs = new Set<string>()
  const knownCookwareDefs = new Set<string>()
  const duplicateIngredientDefs = new Set<string>()

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

    let stepItems = applySpacedMarkerParsing(item.items, true)
    stepItems = removeBlockCommentPlaceholders(stepItems, preprocessed.commentRanges)
    stepItems = applyAdvancedUnits(stepItems, allExtensions)
    stepItems = applyAliasMode(stepItems, allExtensions)
    stepItems = applyDuplicateReferenceMode(stepItems, duplicateMode, duplicateIngredientDefs)
    stepItems = mergeConsecutiveTexts(stepItems)
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
              position: invalidTimer
                ? (getStepItemPosition(invalidTimer) ?? { line: 1, column: 1, offset: 0 })
                : { line: 1, column: 1, offset: 0 },
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
      componentSeedSteps.push(stepItems)
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
              position: getStepItemPosition(stepItem) ?? { line: 1, column: 1, offset: 0 },
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

  // Collect definitions and link references in document order.
  const ingredients: RecipeIngredient[] = []
  const cookware: RecipeCookware[] = []
  const ingredientIndexByKey = new Map<string, number>()
  const ingredientLastDefinitionByName = new Map<string, number>()
  const cookwareIndexByName = new Map<string, number>()
  const cookwareLastDefinitionByName = new Map<string, number>()

  for (const step of componentSeedSteps) {
    for (const item of step) {
      if (item.type === "ingredient" && item.relation.type !== "reference") {
        const definitionKey = keyFn(item)
        const nameKey = item.name.toLowerCase()
        let defIndex = ingredientIndexByKey.get(definitionKey)
        if (defIndex === undefined) {
          defIndex = ingredients.length
          ingredients.push(item)
          ingredientIndexByKey.set(definitionKey, defIndex)
        }
        ingredientLastDefinitionByName.set(nameKey, defIndex)
      } else if (item.type === "cookware" && item.relation.type !== "reference") {
        const nameKey = item.name.toLowerCase()
        let defIndex = cookwareIndexByName.get(nameKey)
        if (defIndex === undefined) {
          defIndex = cookware.length
          cookware.push(item)
          cookwareIndexByName.set(nameKey, defIndex)
        }
        cookwareLastDefinitionByName.set(nameKey, defIndex)
      }
    }
  }

  let globalStepIndex = 0
  for (const section of sections) {
    for (const content of section.content) {
      if (content.type !== "step") continue

      for (const item of content.items) {
        if (item.type === "ingredient") {
          const nameKey = item.name.toLowerCase()

          if (item.relation.type === "reference") {
            let defIndex = ingredientLastDefinitionByName.get(nameKey)

            if (defIndex === undefined) {
              const pseudoDef = {
                ...item,
                modifiers: { ...item.modifiers, reference: false },
                relation: { type: "definition" as const, referencedFrom: [], definedInStep: true },
              }
              defIndex = ingredients.length
              ingredients.push(pseudoDef)
              ingredientIndexByKey.set(keyFn(pseudoDef), defIndex)
              ingredientLastDefinitionByName.set(nameKey, defIndex)
            }

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
            continue
          }

          const definitionKey = keyFn(item)
          let defIndex = ingredientIndexByKey.get(definitionKey)
          if (defIndex === undefined) {
            defIndex = ingredients.length
            ingredients.push(item)
            ingredientIndexByKey.set(definitionKey, defIndex)
          }
          ingredientLastDefinitionByName.set(nameKey, defIndex)
        } else if (item.type === "cookware") {
          const nameKey = item.name.toLowerCase()

          if (item.relation.type === "reference") {
            let defIndex = cookwareLastDefinitionByName.get(nameKey)

            if (defIndex === undefined) {
              const pseudoDef = {
                ...item,
                modifiers: { ...item.modifiers, reference: false },
                relation: { type: "definition" as const, referencedFrom: [], definedInStep: true },
              }
              defIndex = cookware.length
              cookware.push(pseudoDef)
              cookwareIndexByName.set(nameKey, defIndex)
              cookwareLastDefinitionByName.set(nameKey, defIndex)
            }

            item.relation = { type: "reference", referencesTo: defIndex }
            if (defIndex >= 0) {
              const defRelation = cookware[defIndex]?.relation
              if (defRelation?.type === "definition" && defRelation.referencedFrom) {
                defRelation.referencedFrom.push(globalStepIndex)
              }
            }
            continue
          }

          let defIndex = cookwareIndexByName.get(nameKey)
          if (defIndex === undefined) {
            defIndex = cookware.length
            cookware.push(item)
            cookwareIndexByName.set(nameKey, defIndex)
          }
          cookwareLastDefinitionByName.set(nameKey, defIndex)
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
