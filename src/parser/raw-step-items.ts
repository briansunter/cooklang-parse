import type { RecipeStepItem, SourcePosition } from "../types"

const rawStepItemMap = new WeakMap<object, string>()
const stepItemPositionMap = new WeakMap<object, SourcePosition>()

function offsetPosition(position: SourcePosition, charOffset: number): SourcePosition {
  return {
    line: position.line,
    column: position.column + charOffset,
    offset: position.offset + charOffset,
  }
}

export function attachSourceInfo<T extends RecipeStepItem>(
  item: T,
  raw: string,
  position?: SourcePosition,
): T {
  rawStepItemMap.set(item as unknown as object, raw)
  if (position) {
    stepItemPositionMap.set(item as unknown as object, position)
  }
  return item
}

export function getStepItemPosition(item: RecipeStepItem): SourcePosition | undefined {
  return stepItemPositionMap.get(item as unknown as object)
}

export function copyStepItemSourceInfo<T extends RecipeStepItem>(
  from: RecipeStepItem,
  to: T,
  overrides: { raw?: string; position?: SourcePosition } = {},
): T {
  const raw = overrides.raw ?? rawStepItemMap.get(from as unknown as object)
  const position = overrides.position ?? stepItemPositionMap.get(from as unknown as object)

  if (typeof raw === "string") {
    rawStepItemMap.set(to as unknown as object, raw)
  }
  if (position) {
    stepItemPositionMap.set(to as unknown as object, position)
  }
  return to
}

export function createTextItem(
  value: string,
  position?: SourcePosition,
): Extract<RecipeStepItem, { type: "text" }> {
  return attachSourceInfo({ type: "text", value }, value, position)
}

export function sliceTextItem(
  item: Extract<RecipeStepItem, { type: "text" }>,
  start: number,
  end?: number,
): Extract<RecipeStepItem, { type: "text" }> {
  const value = item.value.slice(start, end)
  const position = getStepItemPosition(item)
  return createTextItem(value, position ? offsetPosition(position, start) : undefined)
}

function ingredientModifierPrefix(item: Extract<RecipeStepItem, { type: "ingredient" }>): string {
  return `${item.modifiers.recipe ? "@" : ""}${item.modifiers.reference ? "&" : ""}${
    item.modifiers.hidden ? "-" : ""
  }${item.modifiers.optional ? "?" : ""}${item.modifiers.new ? "+" : ""}`
}

function cookwareModifierPrefix(item: Extract<RecipeStepItem, { type: "cookware" }>): string {
  return `${item.modifiers.reference ? "&" : ""}${item.modifiers.hidden ? "-" : ""}${
    item.modifiers.optional ? "?" : ""
  }${item.modifiers.new ? "+" : ""}`
}

export function serializeStepItemRaw(item: RecipeStepItem): string {
  const raw = rawStepItemMap.get(item as unknown as object)
  if (typeof raw === "string") {
    return raw
  }

  if (item.type === "ingredient") {
    const modifierPart = ingredientModifierPrefix(item)
    const aliasPart = item.alias ? `|${item.alias}` : ""
    const notePart = item.note ? `(${item.note})` : ""
    if (item.quantity === "some" && item.units === "") {
      return `@${modifierPart}${item.name}${aliasPart}${notePart}`
    }
    const fixed = item.fixed ? "=" : ""
    const qty = `${item.quantity}`
    const unit = item.units ? `%${item.units}` : ""
    return `@${modifierPart}${item.name}${aliasPart}{${fixed}${qty}${unit}}${notePart}`
  }

  if (item.type === "cookware") {
    const modifierPart = cookwareModifierPrefix(item)
    const aliasPart = item.alias ? `|${item.alias}` : ""
    const notePart = item.note ? `(${item.note})` : ""
    if (item.quantity === 1) {
      return `#${modifierPart}${item.name}${aliasPart}${notePart}`
    }
    return `#${modifierPart}${item.name}${aliasPart}{${item.quantity}}${notePart}`
  }

  if (item.type === "timer") {
    const name = item.name ?? ""
    if (item.quantity === "" && item.units === "") {
      return `~${name}`
    }
    if (item.units === "") {
      return `~${name}{${item.quantity}}`
    }
    return `~${name}{${item.quantity}%${item.units}}`
  }

  return item.type === "text" ? item.value : ""
}
