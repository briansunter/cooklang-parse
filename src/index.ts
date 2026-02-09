/**
 * Cooklang Parser - Main API
 *
 * A simple, type-safe Cooklang parser using Ohm
 */

export { convertToCanonical, parseToCanonical } from "./canonicalConverter"
export { convertToSimplified } from "./converter"
export { grammar, parseToAST } from "./semantics"
export type * from "./types"

import { convertToSimplified } from "./converter"
import { parseToAST } from "./semantics"
import type { CooklangRecipe } from "./types"

/**
 * Parse Cooklang source and return simplified model
 *
 * This is the main entry point for parsing Cooklang recipes.
 * Returns a simplified model with easy-to-use data structures.
 *
 * @param source - Cooklang recipe source code
 * @returns Parsed recipe with ingredients, cookware, timers, steps, etc.
 *
 * @example
 * ```ts
 * const recipe = parseCooklang(`
 *   Mix @flour{250%g} and @eggs{3}
 *   Cook in #pan for ~{20%minutes}
 * `);
 *
 * console.log(recipe.ingredients);
 * // [{ name: 'flour', quantity: '250', unit: 'g', fixed: false },
 * //  { name: 'eggs', quantity: '3', fixed: false }]
 *
 * console.log(recipe.cookware);
 * // ['pan']
 *
 * console.log(recipe.timers);
 * // [{ quantity: '20', unit: 'minutes' }]
 * ```
 */
export function parseCooklang(source: string): CooklangRecipe {
  const ast = parseToAST(source)
  return convertToSimplified(ast)
}
