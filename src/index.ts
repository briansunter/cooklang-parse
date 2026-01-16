/**
 * Cooklang Parser - Main API
 *
 * A simple, type-safe Cooklang parser using Ohm
 */

export { parseToAST, getGrammar } from './semantics.js';
export { convertToSimplified } from './converter.js';
export type * from './types.js';

import { parseToAST } from './semantics.js';
import { convertToSimplified } from './converter.js';
import type { CooklangRecipe } from './types.js';

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
  const ast = parseToAST(source);
  return convertToSimplified(ast);
}

export default {
  parseCooklang,
  parseToAST,
};
