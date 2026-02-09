import { parseCooklang } from "../src/index"
import type { CooklangRecipe, RecipeStepItem } from "../src/types"

export type CanonicalStepItem =
  | { type: "text"; value: string }
  | { type: "ingredient"; name: string; alias?: string; quantity: string | number; units: string }
  | { type: "cookware"; name: string; alias?: string; quantity: string | number; units: string }
  | { type: "timer"; name: string; quantity: string | number; units: string }

export type ExtendedStepItem =
  | { type: "text"; value: string }
  | {
      type: "ingredient"
      name: string
      alias?: string
      quantity: string | number
      units: string
      fixed?: true
      note?: string
    }
  | { type: "cookware"; name: string; alias?: string; quantity: string | number; units: string; note?: string }
  | { type: "timer"; name: string; quantity: string | number; units: string }

export interface CanonicalResult {
  metadata: Record<string, string>
  steps: CanonicalStepItem[][]
}

export interface ExtendedCanonicalResult {
  metadata: Record<string, string>
  steps: ExtendedStepItem[][]
  notes?: string[]
  sections?: string[]
}

function sortKeys<T>(obj: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)))
}

// ---------------------------------------------------------------------------
// Helpers to extract flat steps/notes/sections from new RecipeSection[] structure
// ---------------------------------------------------------------------------

/** Get flat list of steps from sections (each step is an array of items). */
export function getSteps(recipe: CooklangRecipe): RecipeStepItem[][] {
  const steps: RecipeStepItem[][] = []
  for (const section of recipe.sections) {
    for (const content of section.content) {
      if (content.type === "step") {
        steps.push(content.items)
      }
    }
  }
  return steps
}

/** Get flat list of note texts from sections. */
export function getNotes(recipe: CooklangRecipe): string[] {
  const notes: string[] = []
  for (const section of recipe.sections) {
    for (const content of section.content) {
      if (content.type === "text") {
        notes.push(content.value)
      }
    }
  }
  return notes
}

/** Get flat list of section names (excluding the implicit null-named section). */
export function getSectionNames(recipe: CooklangRecipe): string[] {
  return recipe.sections.filter(s => s.name !== null).map(s => s.name as string)
}

// ---------------------------------------------------------------------------
// Canonical format parsers
// ---------------------------------------------------------------------------

export function parseToCanonical(source: string): CanonicalResult {
  const recipe = parseCooklang(source)

  const metadata = sortKeys(
    Object.fromEntries(Object.entries(recipe.metadata).map(([k, v]) => [k, String(v)])),
  )

  const flatSteps = getSteps(recipe)
  const steps: CanonicalStepItem[][] = flatSteps.map(step =>
    step.map((item): CanonicalStepItem => {
      if (item.type === "ingredient") {
        const result: CanonicalStepItem = { type: "ingredient", name: item.name, quantity: item.quantity, units: item.units }
        if (item.alias) {
          ;(result as { alias?: string }).alias = item.alias
        }
        return result
      }
      if (item.type === "cookware") {
        const result: CanonicalStepItem = { type: "cookware", name: item.name, quantity: item.quantity, units: item.units }
        if (item.alias) {
          ;(result as { alias?: string }).alias = item.alias
        }
        return result
      }
      return item
    }),
  )

  return { metadata, steps }
}

export function parseToExtendedCanonical(source: string): ExtendedCanonicalResult {
  const recipe = parseCooklang(source)

  const metadata = sortKeys(
    Object.fromEntries(Object.entries(recipe.metadata).map(([k, v]) => [k, String(v)])),
  )

  const flatSteps = getSteps(recipe)
  const steps: ExtendedStepItem[][] = flatSteps.map(step =>
    step.map((item): ExtendedStepItem => {
      if (item.type === "ingredient") {
        const result: ExtendedStepItem = {
          type: "ingredient",
          name: item.name,
          quantity: item.quantity,
          units: item.units,
        }
        if (item.alias) {
          ;(result as { alias?: string }).alias = item.alias
        }
        if (item.fixed) {
          ;(result as { fixed?: true }).fixed = true
        }
        if (item.note) {
          ;(result as { note?: string }).note = item.note
        }
        return result
      }
      if (item.type === "cookware") {
        const result: ExtendedStepItem = {
          type: "cookware",
          name: item.name,
          quantity: item.quantity,
          units: item.units,
        }
        if (item.alias) {
          ;(result as { alias?: string }).alias = item.alias
        }
        if (item.note) {
          ;(result as { note?: string }).note = item.note
        }
        return result
      }
      return item
    }),
  )

  const result: ExtendedCanonicalResult = { metadata, steps }

  const notes = getNotes(recipe)
  if (notes.length > 0) {
    result.notes = notes
  }
  const sectionNames = getSectionNames(recipe)
  if (sectionNames.length > 0) {
    result.sections = sectionNames
  }

  return result
}
