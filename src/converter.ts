import type {
  CooklangRecipe,
  Recipe,
  SimplifiedIngredient,
  SimplifiedStep,
  SimplifiedTimer,
  Step,
} from "./types"

function simplifyStep(step: Step): SimplifiedStep {
  return {
    text: step.text,
    ingredients: step.ingredients.map(({ name, quantity, unit, preparation, fixed }) => ({
      name,
      quantity,
      unit,
      preparation,
      fixed,
    })),
    cookware: step.cookware.map(c => c.name),
    timers: step.timers.map(({ name, quantity, unit }) => ({ name, quantity, unit })),
    inlineComments: step.inlineComments.map(c => c.text),
  }
}

function getUniqueIngredients(recipe: Recipe): SimplifiedIngredient[] {
  const seen = new Set<string>()
  const result: SimplifiedIngredient[] = []
  for (const step of recipe.steps) {
    for (const { name, quantity, unit, preparation, fixed } of step.ingredients) {
      const key = `${name}|${quantity ?? ""}|${unit ?? ""}`
      if (!seen.has(key)) {
        seen.add(key)
        result.push({ name, quantity, unit, preparation, fixed })
      }
    }
  }
  return result
}

function getUniqueCookware(recipe: Recipe): string[] {
  return [...new Set(recipe.steps.flatMap(s => s.cookware.map(c => c.name)))]
}

function getUniqueTimers(recipe: Recipe): SimplifiedTimer[] {
  const seen = new Set<string>()
  const result: SimplifiedTimer[] = []
  for (const step of recipe.steps) {
    for (const { name, quantity, unit } of step.timers) {
      const key = `${name ?? ""}|${quantity}|${unit ?? ""}`
      if (!seen.has(key)) {
        seen.add(key)
        result.push({ name, quantity, unit })
      }
    }
  }
  return result
}

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
