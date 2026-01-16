/**
 * Convert AST to simplified model
 */

import type {
  Recipe,
  Ingredient,
  Cookware,
  Timer,
  Step,
  CooklangRecipe,
  SimplifiedIngredient,
  SimplifiedTimer,
  SimplifiedStep,
} from './types.js';

/**
 * Convert an AST ingredient to a simplified ingredient
 */
function simplifyIngredient(ingredient: Ingredient): SimplifiedIngredient {
  return {
    name: ingredient.name,
    quantity: ingredient.quantity,
    unit: ingredient.unit,
    preparation: ingredient.preparation,
    fixed: ingredient.fixed,
  };
}

/**
 * Convert an AST timer to a simplified timer
 */
function simplifyTimer(timer: Timer): SimplifiedTimer {
  return {
    name: timer.name,
    quantity: timer.quantity,
    unit: timer.unit,
  };
}

/**
 * Convert an AST step to a simplified step
 */
function simplifyStep(step: Step): SimplifiedStep {
  return {
    text: step.text,
    ingredients: step.ingredients.map(simplifyIngredient),
    cookware: step.cookware.map(c => c.name),
    timers: step.timers.map(simplifyTimer),
  };
}

/**
 * Get unique ingredients from all steps
 */
function getUniqueIngredients(recipe: Recipe): SimplifiedIngredient[] {
  const ingredientMap = new Map<string, SimplifiedIngredient>();

  for (const step of recipe.steps) {
    for (const ingredient of step.ingredients) {
      const key = `${ingredient.name}|${ingredient.quantity || ''}|${ingredient.unit || ''}`;
      if (!ingredientMap.has(key)) {
        ingredientMap.set(key, simplifyIngredient(ingredient));
      }
    }
  }

  return Array.from(ingredientMap.values());
}

/**
 * Get unique cookware from all steps
 */
function getUniqueCookware(recipe: Recipe): string[] {
  const cookwareSet = new Set<string>();

  for (const step of recipe.steps) {
    for (const cookware of step.cookware) {
      cookwareSet.add(cookware.name);
    }
  }

  return Array.from(cookwareSet);
}

/**
 * Get unique timers from all steps
 */
function getUniqueTimers(recipe: Recipe): SimplifiedTimer[] {
  const timerMap = new Map<string, SimplifiedTimer>();

  for (const step of recipe.steps) {
    for (const timer of step.timers) {
      const key = `${timer.name || ''}|${timer.quantity}|${timer.unit || ''}`;
      if (!timerMap.has(key)) {
        timerMap.set(key, simplifyTimer(timer));
      }
    }
  }

  return Array.from(timerMap.values());
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
  };
}
