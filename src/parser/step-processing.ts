import type { ParseError, RecipeInlineQuantity, RecipeStepItem } from "../types"
import type { DefineMode } from "./internal-types"
import { parseQuantity } from "./quantity"

/** Merge adjacent text items into single items (e.g. across soft line breaks). */
export function mergeConsecutiveTexts(items: RecipeStepItem[]): RecipeStepItem[] {
  const result: RecipeStepItem[] = []
  for (const item of items) {
    const prev = result[result.length - 1]
    if (item.type === "text" && prev?.type === "text") {
      result[result.length - 1] = { type: "text", value: `${prev.value}${item.value}` }
    } else {
      result.push(item)
    }
  }
  return result
}

/** Collect unique items of a given type across parsed step items. */
export function collectUniqueFromSteps<T extends RecipeStepItem>(
  allSteps: RecipeStepItem[][],
  type: RecipeStepItem["type"],
  key: (item: T) => string,
): T[] {
  const seen = new Set<string>()
  const result: T[] = []
  for (const step of allSteps) {
    for (const item of step) {
      if (item.type !== type) continue
      const k = key(item as T)
      if (!seen.has(k)) {
        seen.add(k)
        result.push(item as T)
      }
    }
  }
  return result
}

function isAsciiDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9"
}

function isWhitespaceChar(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r"
}

function isInlineQuantityUnit(unit: string): boolean {
  // Keep this permissive but avoid punctuation-heavy false positives.
  return /^[°º]?[A-Za-z°º℃]+$/u.test(unit)
}

function parseInlineQuantitiesInText(
  text: string,
  inlineQuantities: RecipeInlineQuantity[],
): RecipeStepItem[] {
  const items: RecipeStepItem[] = []
  let cursor = 0
  let i = 0

  while (i < text.length) {
    let digitOffset = -1
    for (let j = i; j < text.length; j += 1) {
      if (isAsciiDigit(text[j] ?? "")) {
        digitOffset = j
        break
      }
    }
    if (digitOffset === -1) break
    i = digitOffset

    let beforeEnd = i
    let negative = false
    if (i > 0 && text[i - 1] === "-") {
      beforeEnd = i - 1
      negative = true
    }

    const word1Start = i
    while (i < text.length && !isWhitespaceChar(text[i] ?? "")) i += 1
    if (i <= word1Start) break
    const word1 = text.slice(word1Start, i)

    let splitIndex = -1
    for (let k = 0; k < word1.length; k += 1) {
      const ch = word1[k] ?? ""
      if (!isAsciiDigit(ch) && ch !== "." && !isWhitespaceChar(ch)) {
        splitIndex = k
        break
      }
    }

    let rawNumber = ""
    let rawUnit = ""
    if (splitIndex >= 0) {
      rawNumber = word1.slice(0, splitIndex)
      rawUnit = word1.slice(splitIndex)
    } else {
      while (i < text.length && isWhitespaceChar(text[i] ?? "")) i += 1
      const word2Start = i
      while (i < text.length && !isWhitespaceChar(text[i] ?? "")) i += 1
      if (i <= word2Start) {
        continue
      }
      rawNumber = word1
      rawUnit = text.slice(word2Start, i)
    }

    rawNumber = rawNumber.trim()
    rawUnit = rawUnit.trim()
    if (!rawNumber || !rawUnit) continue

    const parsedNumber = Number(rawNumber)
    if (!Number.isFinite(parsedNumber)) continue
    if (!isInlineQuantityUnit(rawUnit)) continue

    if (beforeEnd > cursor) {
      items.push({ type: "text", value: text.slice(cursor, beforeEnd) })
    }

    inlineQuantities.push({
      quantity: negative ? -parsedNumber : parsedNumber,
      units: rawUnit,
    })
    items.push({ type: "inline_quantity", index: inlineQuantities.length - 1 })
    cursor = i
  }

  if (cursor < text.length) {
    items.push({ type: "text", value: text.slice(cursor) })
  }

  return items
}

export function applyInlineQuantityExtraction(
  stepItems: RecipeStepItem[],
  inlineQuantities: RecipeInlineQuantity[],
  enabled: boolean,
): RecipeStepItem[] {
  if (!enabled) return stepItems
  const result: RecipeStepItem[] = []
  for (const item of stepItems) {
    if (item.type === "text") {
      result.push(...parseInlineQuantitiesInText(item.value, inlineQuantities))
    } else {
      result.push(item)
    }
  }
  return result
}

function splitAdvancedUnit(
  quantity: string | number,
  units: string,
): { quantity: string | number; units: string } {
  if (units !== "" || typeof quantity !== "string") {
    return { quantity, units }
  }

  const trimmed = quantity.trim()
  const match = trimmed.match(/^(.+?)\s+(.+)$/)
  if (!match) {
    return { quantity, units }
  }

  const rawQuantity = match[1]?.trim() ?? ""
  const rawUnit = match[2]?.trim() ?? ""
  const parsedQuantity = parseQuantity(rawQuantity)
  if (typeof parsedQuantity !== "number" || !rawUnit) {
    return { quantity, units }
  }

  return { quantity: parsedQuantity, units: rawUnit }
}

export function applyAdvancedUnits(
  stepItems: RecipeStepItem[],
  enabled: boolean,
): RecipeStepItem[] {
  if (!enabled) return stepItems
  return stepItems.map(item => {
    if (item.type !== "ingredient" && item.type !== "timer") {
      return item
    }
    const next = splitAdvancedUnit(item.quantity, item.units)
    if (next.quantity === item.quantity && next.units === item.units) {
      return item
    }
    return {
      ...item,
      quantity: next.quantity,
      units: next.units,
    }
  })
}

export function applyAliasMode(
  stepItems: RecipeStepItem[],
  aliasEnabled: boolean,
): RecipeStepItem[] {
  if (aliasEnabled) return stepItems
  return stepItems.map(item => {
    if (item.type === "ingredient" && item.alias) {
      return {
        ...item,
        name: `${item.name}|${item.alias}`,
        alias: undefined,
      }
    }
    if (item.type === "cookware" && item.alias) {
      return {
        ...item,
        name: `${item.name}|${item.alias}`,
        alias: undefined,
      }
    }
    return item
  })
}

export function splitInvalidMarkerTextItems(stepItems: RecipeStepItem[]): RecipeStepItem[] {
  const out: RecipeStepItem[] = []

  for (const item of stepItems) {
    if (item.type !== "text") {
      out.push(item)
      continue
    }

    const value = item.value
    const segments: string[] = []
    let cursor = 0

    while (cursor < value.length) {
      let markerStart = -1
      for (let i = cursor; i < value.length; i += 1) {
        const ch = value[i]
        const next = value[i + 1]
        const isMarker = ch === "@" || ch === "#" || ch === "~"
        if (isMarker && (next === " " || next === "\t")) {
          markerStart = i
          break
        }
      }

      if (markerStart === -1) {
        segments.push(value.slice(cursor))
        break
      }

      if (markerStart > cursor) {
        segments.push(value.slice(cursor, markerStart))
      }

      let markerEnd = value.length
      for (let i = markerStart + 1; i < value.length; i += 1) {
        const ch = value[i]
        if (ch === "@" || ch === "#" || ch === "~") {
          markerEnd = i
          break
        }
      }
      segments.push(value.slice(markerStart, markerEnd))
      cursor = markerEnd
    }

    if (segments.length <= 1) {
      out.push(item)
      continue
    }

    out.push(
      ...segments.filter(Boolean).map(segment => ({ type: "text" as const, value: segment })),
    )
  }

  return out
}

export function warnTimerMissingUnit(stepItems: RecipeStepItem[], warnings: ParseError[]): void {
  for (const item of stepItems) {
    if (item.type !== "timer") continue
    if (item.units !== "" || item.quantity === "") continue
    warnings.push({
      message: "Invalid timer quantity: missing unit",
      position: { line: 1, column: 1, offset: 0 },
      severity: "warning",
      help: "A timer needs a unit to know the duration",
    })
  }
}

export function warnUnnecessaryScalingLock(
  stepItems: RecipeStepItem[],
  warnings: ParseError[],
): void {
  for (const item of stepItems) {
    if (item.type !== "ingredient" || !item.fixed) continue
    warnings.push({
      message: "Unnecessary scaling lock modifier",
      position: { line: 1, column: 1, offset: 0 },
      severity: "warning",
    })
  }
}

export function checkStepsModeReferences(
  stepItems: RecipeStepItem[],
  defineMode: DefineMode,
  knownIngredients: Set<string>,
  knownCookware: Set<string>,
  errors: ParseError[],
): void {
  for (const item of stepItems) {
    if (item.type === "ingredient") {
      const key = item.name.toLowerCase()
      if (defineMode === "steps" && !knownIngredients.has(key)) {
        errors.push({
          message: `Reference not found: ${item.name}`,
          shortMessage: `Reference not found: ${item.name}`,
          position: { line: 1, column: 1, offset: 0 },
          severity: "error",
        })
      }
      knownIngredients.add(key)
    } else if (item.type === "cookware") {
      const key = item.name.toLowerCase()
      if (defineMode === "steps" && !knownCookware.has(key)) {
        errors.push({
          message: `Reference not found: ${item.name}`,
          shortMessage: `Reference not found: ${item.name}`,
          position: { line: 1, column: 1, offset: 0 },
          severity: "error",
        })
      }
      knownCookware.add(key)
    }
  }
}
