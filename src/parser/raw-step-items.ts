import type { RecipeStepItem } from "../types"

const rawStepItemMap = new WeakMap<object, string>()

export function attachRaw<T extends RecipeStepItem>(item: T, raw: string): T {
  rawStepItemMap.set(item as unknown as object, raw)
  return item
}

export function serializeStepItemRaw(item: RecipeStepItem): string {
  const raw = rawStepItemMap.get(item as unknown as object)
  if (typeof raw === "string") {
    return raw
  }

  if (item.type === "ingredient") {
    const aliasPart = item.alias ? `|${item.alias}` : ""
    const notePart = item.note ? `(${item.note})` : ""
    if (item.quantity === "some" && item.units === "") {
      return `@${item.name}${aliasPart}${notePart}`
    }
    const fixed = item.fixed ? "=" : ""
    const qty = `${item.quantity}`
    const unit = item.units ? `%${item.units}` : ""
    return `@${item.name}${aliasPart}{${fixed}${qty}${unit}}${notePart}`
  }

  if (item.type === "cookware") {
    const aliasPart = item.alias ? `|${item.alias}` : ""
    const notePart = item.note ? `(${item.note})` : ""
    if (item.quantity === 1) {
      return `#${item.name}${aliasPart}${notePart}`
    }
    return `#${item.name}${aliasPart}{${item.quantity}}${notePart}`
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
