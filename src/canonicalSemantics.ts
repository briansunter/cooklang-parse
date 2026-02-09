/**
 * Ohm semantics for Cooklang canonical format
 */

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import * as Ohm from "ohm-js"
import { safeGetSourceString, safeToCanonical } from "./cstTypes.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const grammarFile = readFileSync(join(__dirname, "../grammars/cooklang-canonical.ohm"), "utf-8")
const grammar = Ohm.grammar(grammarFile)

type CanonicalValue = string | number

interface CanonicalTextItem {
  type: "text"
  value: string
}

interface CanonicalIngredientItem {
  type: "ingredient"
  name: string
  quantity: CanonicalValue
  units: string
}

interface CanonicalCookwareItem {
  type: "cookware"
  name: string
  quantity: CanonicalValue
  units: string
}

interface CanonicalTimerItem {
  type: "timer"
  name: string
  quantity: CanonicalValue
  units: string
}

export type CanonicalStepItem =
  | CanonicalTextItem
  | CanonicalIngredientItem
  | CanonicalCookwareItem
  | CanonicalTimerItem

export interface CanonicalResult {
  metadata: Record<string, string>
  steps: CanonicalStepItem[][]
}

/**
 * Parse quantity string - convert fractions to numbers
 */
function parseQuantity(qty: string): string | number {
  const trimmedQty = qty.trim()
  if (!trimmedQty) return ""

  // Check if it's a pure number (with optional spaces for fractions like "1 / 2")
  // If it contains letters, return it as a string
  if (/[a-zA-Z]/.test(trimmedQty)) {
    return trimmedQty // Contains letters, keep as string
  }

  // Remove spaces from quantity (e.g., "1 / 2" -> "1/2")
  const qtyNoSpaces = trimmedQty.replace(/\s+/g, "")

  // Check for fraction like "1/2" but NOT "01/2" (leading zero means keep as string)
  const fractionMatch = qtyNoSpaces.match(/^(\d+)\/(\d+)$/)
  if (fractionMatch) {
    const numStr = fractionMatch[1]
    const denStr = fractionMatch[2]

    if (!numStr || !denStr) {
      return trimmedQty
    }

    // If the fraction has a leading zero (like "01/2"), keep it as a string
    if (numStr.startsWith("0") && numStr.length > 1) {
      return trimmedQty
    }

    const num = parseFloat(numStr)
    const den = parseFloat(denStr)
    if (!Number.isNaN(num) && !Number.isNaN(den) && den !== 0) {
      return num / den
    }
  }

  // Check for decimal
  const asNum = parseFloat(qtyNoSpaces)
  if (!Number.isNaN(asNum)) {
    return asNum
  }

  return trimmedQty
}

/**
 * Parse amount content (e.g., "3%items" or "250% g" or "1 / 2 %cup")
 */
function parseAmount(content: string): { quantity: string | number; units: string } {
  let trimmedContent = content.trim()

  // Strip leading '=' (fixed quantity marker)
  if (trimmedContent.startsWith("=")) {
    trimmedContent = trimmedContent.slice(1).trimStart()
  }

  // Try quantity%units format - handle spaces in quantity
  // First, try to find the last % sign to separate quantity from units
  const lastPercentIndex = trimmedContent.lastIndexOf("%")
  if (lastPercentIndex !== -1) {
    const qtyStr = trimmedContent.slice(0, lastPercentIndex).trim()
    const unitsStr = trimmedContent.slice(lastPercentIndex + 1).trim()
    return {
      quantity: parseQuantity(qtyStr),
      units: unitsStr,
    }
  }

  // Check if there's a number followed by text (space-separated)
  // But only split if the units part is more than 1-2 characters (to avoid splitting "7 k")
  const spaceMatch = trimmedContent.match(/^(\S+)\s+(\S{3,}.*)$/)
  if (spaceMatch) {
    const qtyStr = spaceMatch[1]
    const unitsStr = spaceMatch[2]

    if (!qtyStr || !unitsStr) {
      return {
        quantity: parseQuantity(trimmedContent),
        units: "",
      }
    }

    return {
      quantity: parseQuantity(qtyStr),
      units: unitsStr.trim(),
    }
  }

  // Just a quantity, no units
  return {
    quantity: parseQuantity(trimmedContent),
    units: "",
  }
}

/**
 * Parse cookware quantity
 */
function parseCookwareAmount(content: string): number | string {
  const trimmedContent = content.trim()
  const asNum = parseFloat(trimmedContent)
  if (!Number.isNaN(asNum)) {
    return asNum
  }
  return trimmedContent
}

/**
 * Merge consecutive text items with spaces between them (soft breaks).
 * In Cooklang, lines within a step are joined by soft breaks (spaces),
 * matching the reference spec behavior.
 */
function mergeConsecutiveTexts(items: unknown[]): unknown[] {
  const result: unknown[] = []
  let currentText = ""
  let lastItemWasText = false

  for (const item of items) {
    if (
      typeof item === "object" &&
      item !== null &&
      "type" in item &&
      (item as { type: string }).type === "text"
    ) {
      const textItem = item as { type: string; value: string }
      if (lastItemWasText) {
        currentText += " "
      }
      currentText += textItem.value
      lastItemWasText = true
    } else {
      if (currentText) {
        result.push({ type: "text", value: currentText })
        currentText = ""
        lastItemWasText = false
      }
      result.push(item)
      lastItemWasText = false
    }
  }

  if (currentText) {
    result.push({ type: "text", value: currentText })
  }

  return result
}

function buildCanonicalRecipe(
  rawLines: unknown,
  metadata: Record<string, string>,
): CanonicalResult {
  const lines = Array.isArray(rawLines) ? rawLines : []
  const steps: CanonicalStepItem[][] = []
  let currentStep: unknown[] = []

  for (const lineResult of lines) {
    if (lineResult === "blank") {
      if (currentStep.length > 0) {
        steps.push(mergeConsecutiveTexts(currentStep) as CanonicalStepItem[])
        currentStep = []
      }
      continue
    }

    if (Array.isArray(lineResult)) {
      currentStep.push(...lineResult)
    }
  }

  if (currentStep.length > 0) {
    steps.push(mergeConsecutiveTexts(currentStep) as CanonicalStepItem[])
  }

  return { metadata, steps }
}

function parseCanonicalMetadataLine(line: string): [key: string, value: string] | null {
  const trimmedStart = line.trimStart()
  if (!trimmedStart.startsWith(">>")) {
    return null
  }

  const content = trimmedStart.slice(2)
  const separatorIdx = content.indexOf(":")
  if (separatorIdx === -1) {
    return null
  }

  const key = content.slice(0, separatorIdx).trim()
  if (!key) {
    return null
  }

  const value = content.slice(separatorIdx + 1).trim()
  return [key, value]
}

function extractLeadingMetadataDirectives(source: string): {
  metadata: Record<string, string>
  body: string
} {
  const lines = source.split(/\r\n|\n|\r/)
  const metadata: Record<string, string> = {}
  let metadataLineCount = 0

  for (const line of lines) {
    const parsed = parseCanonicalMetadataLine(line)
    if (!parsed) {
      break
    }
    const [key, value] = parsed
    metadata[key] = value
    metadataLineCount++
  }

  if (metadataLineCount === 0) {
    return { metadata: {}, body: source }
  }

  // Sort metadata keys alphabetically to match Rust's BTreeMap serialization order
  const sortedMetadata: Record<string, string> = {}
  for (const key of Object.keys(metadata).sort()) {
    sortedMetadata[key] = metadata[key] as string
  }

  return {
    metadata: sortedMetadata,
    body: lines.slice(metadataLineCount).join("\n"),
  }
}

/**
 * Create semantic actions
 */
function createSemantics() {
  const semantics = grammar.createSemantics()

  semantics.addOperation("toCanonical", {
    recipe(self) {
      return safeToCanonical(self)
    },

    recipeWithMetadata(metadata, _restOfRecipe) {
      const md = safeToCanonical(metadata) as Record<string, string>
      return buildCanonicalRecipe(safeToCanonical(_restOfRecipe), md)
    },

    recipeWithoutMetadata(_restOfRecipe) {
      return buildCanonicalRecipe(safeToCanonical(_restOfRecipe), {})
    },

    nonCommentLines(self, _end) {
      // Return array of line results, filtering out nulls from end node
      return self.children
        .map(c => safeToCanonical(c))
        .filter((x): x is NonNullable<typeof x> => x !== null && x !== undefined)
    },

    line(self) {
      return safeToCanonical(self)
    },

    blankLine(_spaces, _lookahead, _nl) {
      return "blank"
    },

    comment(_dash, _space, _content, _nl) {
      return "comment"
    },

    stepLine(content, _nl) {
      const rawResult = safeToCanonical(content)
      const result = Array.isArray(rawResult) ? rawResult : []
      // If the content is empty and the source line is just ---, preserve it as text
      if (result.length === 0) {
        // Get the full source line from self (in the semantic action context)
        // We need to check if this is a metadata marker line that should be preserved
        // The parent line node has the source string
        const lineSource = safeGetSourceString(this)
        const trimmedLine = lineSource.trim()
        if (trimmedLine === "---") {
          return [{ type: "text", value: "---" }]
        }
      }
      return result
    },

    _iter(...children) {
      // For iteration rules (like `item*`), we want the array of results
      // But Ohm passes us the raw CST nodes, so we need to transform them
      const results = children
        .map(c => safeToCanonical(c))
        .filter((x): x is NonNullable<typeof x> => x !== null && x !== undefined)

      return results
    },

    item(self) {
      return safeToCanonical(self)
    },

    text(self) {
      return {
        type: "text",
        value: self.sourceString,
      }
    },

    comment_inline(_dash, _content) {
      // Inline comments are filtered out
      return null
    },

    // The text rule now has multiple alternatives - Ohm will call the appropriate one
    // We don't need separate handlers since they all return the same structure

    ingredient(_at, name, amount, _preparation) {
      const nameStr = name.sourceString.trim()
      const amountStr = amount.numChildren > 0 ? amount.sourceString : ""

      if (!amountStr) {
        return {
          name: nameStr,
          quantity: "some" as CanonicalValue,
          type: "ingredient",
          units: "",
        }
      }

      const content = amountStr.slice(1, -1).trim()

      // Check if the amount is empty (just {})
      if (!content) {
        return {
          name: nameStr,
          quantity: "some" as CanonicalValue,
          type: "ingredient",
          units: "",
        }
      }

      const parsed = parseAmount(content)

      return {
        name: nameStr,
        quantity: parsed.quantity,
        type: "ingredient",
        units: parsed.units,
      }
    },

    cookware(_hash, name, amount) {
      const nameStr = name.sourceString.trim()
      const amountStr = amount.numChildren > 0 ? amount.sourceString : ""

      if (!amountStr) {
        return {
          name: nameStr,
          quantity: 1 as CanonicalValue,
          type: "cookware",
          units: "",
        }
      }

      const content = amountStr.slice(1, -1).trim()

      // Check if the amount is empty (just {})
      if (!content) {
        return {
          name: nameStr,
          quantity: 1 as CanonicalValue,
          type: "cookware",
          units: "",
        }
      }

      return {
        name: nameStr,
        quantity: parseCookwareAmount(content) as CanonicalValue,
        type: "cookware",
        units: "",
      }
    },

    timer(_tilde, timerPart) {
      // timerPart is either timerWithName or unnamedTimer
      const result = safeToCanonical(timerPart)
      return result
    },

    timerWithName(_lookahead, name, amount) {
      const nameStr = name.sourceString.trim()
      const amountStr = amount.numChildren > 0 ? amount.sourceString : ""

      if (!amountStr) {
        return {
          name: nameStr,
          quantity: "" as CanonicalValue,
          type: "timer",
          units: "",
        }
      }

      const content = amountStr.slice(1, -1)
      const parsed = parseAmount(content)

      return {
        name: nameStr,
        quantity: parsed.quantity,
        type: "timer",
        units: parsed.units,
      }
    },

    unnamedTimer(_lookahead, amount) {
      const amountStr = amount.sourceString
      const content = amountStr.slice(1, -1)
      const parsed = parseAmount(content)

      return {
        name: "",
        quantity: parsed.quantity,
        type: "timer",
        units: parsed.units,
      }
    },

    // timerName is no longer used - parsing is done in the timer semantic action

    startMetadata(_dash1, content, _dash2, _nl) {
      const text = content.sourceString
      const data: Record<string, string> = {}

      const lines = text.trim().split("\n")
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue

        const colonIdx = trimmed.indexOf(":")
        if (colonIdx === -1) continue

        const key = trimmed.slice(0, colonIdx).trim()
        const value = trimmed.slice(colonIdx + 1).trim()

        if (key && value) {
          data[key] = value
        }
      }

      return data
    },

    _terminal() {
      return null
    },
  })

  return semantics
}

const semantics = createSemantics()

/**
 * Parse Cooklang source to canonical format
 */
export function parseToCanonical(source: string): CanonicalResult {
  const extracted = extractLeadingMetadataDirectives(source)
  const matchResult = grammar.match(extracted.body)

  if (!matchResult.succeeded()) {
    // Extract error information from Ohm's matchResult
    const errorInfo = matchResult
    const msg =
      (errorInfo as { message?: string }).message ??
      (errorInfo as { shortMessage?: string }).shortMessage ??
      "Unknown error"
    throw new Error(`Parse error: ${msg}`)
  }

  const cst = semantics(matchResult)
  const result = safeToCanonical(cst)

  if (
    typeof result !== "object" ||
    result === null ||
    !("steps" in result) ||
    !("metadata" in result) ||
    !Array.isArray(result.steps)
  ) {
    return {
      metadata: extracted.metadata,
      steps: [],
    }
  }

  const parsed = result as CanonicalResult
  const mergedMetadata = {
    ...parsed.metadata,
    ...extracted.metadata,
  }
  // Sort metadata keys alphabetically to match Rust's BTreeMap serialization order
  const sortedMetadata: Record<string, string> = {}
  for (const key of Object.keys(mergedMetadata).sort()) {
    sortedMetadata[key] = mergedMetadata[key] as string
  }
  return {
    metadata: sortedMetadata,
    steps: parsed.steps,
  }
}

export { grammar }
