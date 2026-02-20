import type {
  ComponentRelation,
  IngredientRelation,
  RecipeCookware,
  RecipeIngredient,
  RecipeModifiers,
} from "../types"

/** Extract name and optional alias from a raw name string containing optional pipe syntax. */
function splitNameAlias(rawName: string): { name: string; alias?: string } {
  const pipeIdx = rawName.indexOf("|")
  const name = pipeIdx === -1 ? rawName : rawName.slice(0, pipeIdx).trim()
  const alias = pipeIdx === -1 ? undefined : rawName.slice(pipeIdx + 1).trim() || undefined
  return { name, alias }
}

function parseModifiers(mods: string): RecipeModifiers {
  const modifiers: RecipeModifiers = {}
  if (mods.includes("@")) modifiers.recipe = true
  if (mods.includes("&")) modifiers.reference = true
  if (mods.includes("-")) modifiers.hidden = true
  if (mods.includes("?")) modifiers.optional = true
  if (mods.includes("+")) modifiers.new = true
  return modifiers
}

/** Build an ingredient from structured grammar data. */
export function buildIngredient(
  mods: string,
  rawName: string,
  amount: { quantity: string | number; units: string; fixed: boolean },
  note: string | undefined,
): RecipeIngredient {
  const { name, alias } = splitNameAlias(rawName)
  const modifiers = parseModifiers(mods)
  const relation: IngredientRelation = modifiers.reference
    ? { type: "reference", referencesTo: -1, referenceTarget: "ingredient" }
    : { type: "definition", referencedFrom: [], definedInStep: true }

  const ingredient: RecipeIngredient = { type: "ingredient", name, modifiers, relation, ...amount }
  if (alias !== undefined) ingredient.alias = alias
  if (note !== undefined) ingredient.note = note
  return ingredient
}

/** Build a cookware item from structured grammar data. */
export function buildCookware(
  mods: string,
  rawName: string,
  quantity: string | number,
  note: string | undefined,
): RecipeCookware {
  const { name, alias } = splitNameAlias(rawName)
  const modifiers = parseModifiers(mods)
  const relation: ComponentRelation = modifiers.reference
    ? { type: "reference", referencesTo: -1 }
    : { type: "definition", referencedFrom: [], definedInStep: true }

  const cookware: RecipeCookware = {
    type: "cookware",
    name,
    quantity,
    units: "",
    modifiers,
    relation,
  }
  if (alias !== undefined) cookware.alias = alias
  if (note !== undefined) cookware.note = note
  return cookware
}
