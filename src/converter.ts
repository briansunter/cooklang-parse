/**
 * Convert AST to simplified model
 */

import type {
  CooklangRecipe,
  Recipe,
  SimplifiedIngredient,
  SimplifiedStep,
  SimplifiedTimer,
} from "./types"

/**
 * Convert an AST step to a simplified step
 */
function simplifyStep(step: {
  text: string
  ingredients: {
    name: string
    quantity?: string
    unit?: string
    preparation?: string
    fixed: boolean
  }[]
  cookware: { name: string }[]
  timers: { name?: string; quantity: string; unit?: string }[]
  inlineComments: { text: string }[]
}): SimplifiedStep {
  return {
    text: step.text,
    ingredients: step.ingredients.map(i => ({
      name: i.name,
      quantity: i.quantity,
      unit: i.unit,
      preparation: i.preparation,
      fixed: i.fixed,
    })),
    cookware: step.cookware.map(c => c.name),
    timers: step.timers.map(t => ({
      name: t.name,
      quantity: t.quantity,
      unit: t.unit,
    })),
    inlineComments: step.inlineComments.map(c => c.text),
  }
}

/**
 * Get unique ingredients from all steps
 */
function getUniqueIngredients(recipe: Recipe): SimplifiedIngredient[] {
  const seen = new Set<string>()
  const result: SimplifiedIngredient[] = []

  for (const step of recipe.steps) {
    for (const i of step.ingredients) {
      const key = `${i.name}|${i.quantity ?? ""}|${i.unit ?? ""}`
      if (!seen.has(key)) {
        seen.add(key)
        result.push({
          name: i.name,
          quantity: i.quantity,
          unit: i.unit,
          preparation: i.preparation,
          fixed: i.fixed,
        })
      }
    }
  }

  return result
}

/**
 * Get unique cookware from all steps
 */
function getUniqueCookware(recipe: Recipe): string[] {
  const seen = new Set<string>()

  for (const step of recipe.steps) {
    for (const c of step.cookware) {
      seen.add(c.name)
    }
  }

  return Array.from(seen)
}

/**
 * Get unique timers from all steps
 */
function getUniqueTimers(recipe: Recipe): SimplifiedTimer[] {
  const seen = new Set<string>()
  const result: SimplifiedTimer[] = []

  for (const step of recipe.steps) {
    for (const t of step.timers) {
      const key = `${t.name ?? ""}|${t.quantity}|${t.unit ?? ""}`
      if (!seen.has(key)) {
        seen.add(key)
        result.push({
          name: t.name,
          quantity: t.quantity,
          unit: t.unit,
        })
      }
    }
  }

  return result
}

/**
 * Convert AST to simplified recipe model
 */
export function convertToSimplified(recipe: Recipe): CooklangRecipe {
  return {
    metadata: recipe.metadata?.data || {},
    ingredients: getUniqueIngredients(recipe),
    cookware: getUniqueCookware(recipe),
    timers: getUniqueTimers(recipe),
    steps: recipe.steps.map(simplifyStep),
    notes: recipe.notes.map(n => n.text),
    sections: recipe.sections.map(s => s.name),
    errors: recipe.errors,
  }
}
