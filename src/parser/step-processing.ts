import type { ParseError, RecipeInlineQuantity, RecipeStepItem, SourcePosition } from "../types"
import type { DefineMode, DuplicateMode } from "./internal-types"
import { parseWithOhm } from "./ohm-ast"
import { parseQuantity } from "./quantity"
import {
  attachSourceInfo,
  copyStepItemSourceInfo,
  createTextItem,
  getStepItemPosition,
  offsetPosition,
  sliceTextItem,
} from "./raw-step-items"

type TextStepItem = Extract<RecipeStepItem, { type: "text" }>
type ParsedComponent = Exclude<RecipeStepItem, { type: "text" } | { type: "inline_quantity" }>

export const DEFAULT_POSITION: SourcePosition = { line: 1, column: 1, offset: 0 }

function itemPosition(item: RecipeStepItem): SourcePosition {
  return getStepItemPosition(item) ?? DEFAULT_POSITION
}

/** Merge adjacent text items into single items (e.g. across soft line breaks). */
export function mergeConsecutiveTexts(items: RecipeStepItem[]): RecipeStepItem[] {
  const result: RecipeStepItem[] = []
  for (const item of items) {
    const prev = result[result.length - 1]
    if (item.type === "text" && prev?.type === "text") {
      result[result.length - 1] = createTextItem(prev.value + item.value, itemPosition(prev))
    } else {
      result.push(item)
    }
  }
  return result
}

/** Collect unique items of a given type across parsed step items. */
export function collectUniqueFromSteps<K extends RecipeStepItem["type"]>(
  allSteps: RecipeStepItem[][],
  type: K,
  key: (item: Extract<RecipeStepItem, { type: K }>) => string,
): Extract<RecipeStepItem, { type: K }>[] {
  const seen = new Set<string>()
  const result: Extract<RecipeStepItem, { type: K }>[] = []
  for (const step of allSteps) {
    for (const item of step) {
      if (item.type !== type) continue
      const k = key(item as Extract<RecipeStepItem, { type: K }>)
      if (!seen.has(k)) {
        seen.add(k)
        result.push(item as Extract<RecipeStepItem, { type: K }>)
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

function isTemperatureUnit(unit: string): boolean {
  return /^(?:[CFK]|°C|°F|ºC|ºF|℃)$/u.test(unit)
}

function trimTrailingUnitPunctuation(rawUnit: string): { unit: string; punctuationLength: number } {
  const trimmedUnit = rawUnit.replace(/[.,;:!?)]*$/u, "")
  return {
    unit: trimmedUnit,
    punctuationLength: rawUnit.length - trimmedUnit.length,
  }
}

function parseInlineQuantitiesInText(
  item: TextStepItem,
  inlineQuantities: RecipeInlineQuantity[],
): RecipeStepItem[] {
  const items: RecipeStepItem[] = []
  const text = item.value
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
    const { unit: parsedUnit, punctuationLength } = trimTrailingUnitPunctuation(rawUnit)
    if (!Number.isFinite(parsedNumber)) continue
    if (!isTemperatureUnit(parsedUnit)) continue

    if (beforeEnd > cursor) {
      items.push(sliceTextItem(item, cursor, beforeEnd))
    }

    inlineQuantities.push({
      quantity: negative ? -parsedNumber : parsedNumber,
      units: parsedUnit,
    })
    const position = getStepItemPosition(item)
    items.push(
      attachSourceInfo(
        { type: "inline_quantity", index: inlineQuantities.length - 1 },
        text.slice(negative ? beforeEnd : word1Start, i - punctuationLength),
        position ? offsetPosition(position, negative ? beforeEnd : word1Start) : undefined,
      ),
    )
    cursor = i - punctuationLength
  }

  if (cursor < text.length) {
    items.push(sliceTextItem(item, cursor))
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
      result.push(...parseInlineQuantitiesInText(item, inlineQuantities))
    } else {
      result.push(item)
    }
  }
  return result
}

function findClosingBrace(text: string, openIndex: number): number {
  for (let i = openIndex + 1; i < text.length; i += 1) {
    if (text[i] === "}") return i
  }
  return -1
}

function parseSpacedComponentToken(
  normalized: string,
  raw: string,
  position?: SourcePosition,
): ParsedComponent | null {
  const parsed = parseWithOhm(`${normalized}\n`)
  if (!parsed.ok) return null

  const first = parsed.value.items[0]
  if (first?.kind !== "step" || first.items.length !== 1) return null

  const token = first.items[0]
  if (!token || token.type === "text" || token.type === "inline_quantity") return null

  return attachSourceInfo(token, raw, position)
}

function parseSpacedMarkersInText(item: TextStepItem): RecipeStepItem[] {
  const result: RecipeStepItem[] = []
  const text = item.value
  const basePosition = getStepItemPosition(item)
  let cursor = 0

  while (cursor < text.length) {
    let markerIndex = -1
    for (let i = cursor; i < text.length - 1; i += 1) {
      const ch = text[i]
      const next = text[i + 1]
      if ((ch === "@" || ch === "#" || ch === "~") && (next === " " || next === "\t")) {
        markerIndex = i
        break
      }
    }

    if (markerIndex === -1) {
      result.push(sliceTextItem(item, cursor))
      break
    }

    let tokenEnd = -1
    let normalized = ""
    const marker = text[markerIndex] ?? ""
    let contentStart = markerIndex + 1
    while (
      contentStart < text.length &&
      (text[contentStart] === " " || text[contentStart] === "\t")
    ) {
      contentStart += 1
    }

    if (marker === "~") {
      if (text[contentStart] === "{") {
        const closeBrace = findClosingBrace(text, contentStart)
        if (closeBrace !== -1) {
          tokenEnd = closeBrace + 1
          normalized = `~${text.slice(contentStart, tokenEnd)}`
        }
      }
    } else {
      const openBrace = text.indexOf("{", contentStart)
      if (openBrace !== -1 && text.slice(contentStart, openBrace).trim() !== "") {
        const closeBrace = findClosingBrace(text, openBrace)
        if (closeBrace !== -1) {
          tokenEnd = closeBrace + 1
          if (text[tokenEnd] === "(") {
            const closeNote = text.indexOf(")", tokenEnd + 1)
            if (closeNote === -1) {
              tokenEnd = -1
            } else {
              tokenEnd = closeNote + 1
            }
          }

          if (tokenEnd !== -1) {
            normalized = `${marker}${text.slice(contentStart, tokenEnd)}`
          }
        }
      }
    }

    if (tokenEnd === -1 || !normalized) {
      result.push(sliceTextItem(item, cursor, markerIndex + 1))
      cursor = markerIndex + 1
      continue
    }

    const raw = text.slice(markerIndex, tokenEnd)
    const parsed = parseSpacedComponentToken(
      normalized,
      raw,
      basePosition ? offsetPosition(basePosition, markerIndex) : undefined,
    )

    if (!parsed) {
      result.push(sliceTextItem(item, cursor, markerIndex + 1))
      cursor = markerIndex + 1
      continue
    }

    if (markerIndex > cursor) {
      result.push(sliceTextItem(item, cursor, markerIndex))
    }

    result.push(parsed)
    cursor = tokenEnd
  }

  return result
}

export function applySpacedMarkerParsing(stepItems: RecipeStepItem[]): RecipeStepItem[] {
  const result: RecipeStepItem[] = []
  for (const item of stepItems) {
    if (item.type === "text") {
      result.push(...parseSpacedMarkersInText(item))
    } else {
      result.push(item)
    }
  }
  return result
}

export function removeBlockCommentPlaceholders(
  stepItems: RecipeStepItem[],
  commentRanges: Array<{ start: number; end: number }>,
): RecipeStepItem[] {
  if (commentRanges.length === 0) return stepItems

  const result: RecipeStepItem[] = []

  for (const item of stepItems) {
    if (item.type !== "text") {
      result.push(item)
      continue
    }

    const position = getStepItemPosition(item)
    if (!position) {
      result.push(item)
      continue
    }

    const itemStart = position.offset
    const itemEnd = itemStart + item.value.length
    const relevantRanges = commentRanges.filter(
      range => range.end > itemStart && range.start < itemEnd,
    )

    if (relevantRanges.length === 0) {
      result.push(item)
      continue
    }

    let cursor = 0
    for (const range of relevantRanges) {
      const sliceStart = Math.max(range.start - itemStart, 0)
      const sliceEnd = Math.min(range.end - itemStart, item.value.length)

      if (sliceStart > cursor) {
        result.push(sliceTextItem(item, cursor, sliceStart))
      }
      cursor = Math.max(cursor, sliceEnd)
    }

    if (cursor < item.value.length) {
      result.push(sliceTextItem(item, cursor))
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
    return copyStepItemSourceInfo(item, {
      ...item,
      quantity: next.quantity,
      units: next.units,
    })
  })
}

export function applyAliasMode(
  stepItems: RecipeStepItem[],
  aliasEnabled: boolean,
): RecipeStepItem[] {
  if (aliasEnabled) return stepItems
  return stepItems.map(item => {
    if (item.type === "ingredient" && item.alias) {
      return copyStepItemSourceInfo(item, {
        ...item,
        name: `${item.name}|${item.alias}`,
        alias: undefined,
      })
    }
    if (item.type === "cookware" && item.alias) {
      return copyStepItemSourceInfo(item, {
        ...item,
        name: `${item.name}|${item.alias}`,
        alias: undefined,
      })
    }
    return item
  })
}

export function applyDuplicateReferenceMode(
  stepItems: RecipeStepItem[],
  duplicateMode: DuplicateMode,
  knownIngredientDefinitions: Set<string>,
): RecipeStepItem[] {
  return stepItems.map(item => {
    if (item.type !== "ingredient") {
      return item
    }

    const key = item.name.toLowerCase()
    const shouldImplicitlyReference =
      duplicateMode === "reference" &&
      item.relation.type !== "reference" &&
      !item.modifiers.new &&
      !item.modifiers.recipe &&
      knownIngredientDefinitions.has(key)

    if (item.relation.type !== "reference" && (item.modifiers.new || !shouldImplicitlyReference)) {
      knownIngredientDefinitions.add(key)
    }

    if (!shouldImplicitlyReference) {
      return item
    }

    return copyStepItemSourceInfo(item, {
      ...item,
      relation: { type: "reference", referencesTo: -1, referenceTarget: "ingredient" },
    })
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
    const ranges: Array<{ start: number; end: number }> = []
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
        ranges.push({ start: cursor, end: value.length })
        break
      }

      if (markerStart > cursor) {
        ranges.push({ start: cursor, end: markerStart })
      }

      let markerEnd = value.length
      for (let i = markerStart + 1; i < value.length; i += 1) {
        const ch = value[i]
        if (ch === "@" || ch === "#" || ch === "~") {
          markerEnd = i
          break
        }
      }
      ranges.push({ start: markerStart, end: markerEnd })
      cursor = markerEnd
    }

    if (ranges.length <= 1) {
      out.push(item)
      continue
    }

    out.push(...ranges.map(range => sliceTextItem(item, range.start, range.end)).filter(Boolean))
  }

  return out
}

export function warnTimerMissingUnit(stepItems: RecipeStepItem[], warnings: ParseError[]): void {
  for (const item of stepItems) {
    if (item.type !== "timer") continue
    if (item.units !== "" || item.quantity === "") continue
    warnings.push({
      message: "Invalid timer quantity: missing unit",
      position: itemPosition(item),
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
      position: itemPosition(item),
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
      if (defineMode === "steps" && !item.modifiers.new && !knownIngredients.has(key)) {
        errors.push({
          message: `Reference not found: ${item.name}`,
          shortMessage: `Reference not found: ${item.name}`,
          position: itemPosition(item),
          severity: "error",
        })
      }
      knownIngredients.add(key)
    } else if (item.type === "cookware") {
      const key = item.name.toLowerCase()
      if (defineMode === "steps" && !item.modifiers.new && !knownCookware.has(key)) {
        errors.push({
          message: `Reference not found: ${item.name}`,
          shortMessage: `Reference not found: ${item.name}`,
          position: itemPosition(item),
          severity: "error",
        })
      }
      knownCookware.add(key)
    }
  }
}
