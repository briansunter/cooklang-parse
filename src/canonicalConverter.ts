/**
 * Convert AST to canonical format matching the official Cooklang spec test output.
 * Replaces the old canonical grammar + canonical semantics pipeline.
 */

import { parseToAST } from "./semantics.js"
import type { Recipe, StepItem } from "./types.js"

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

  if (/[a-zA-Z]/.test(trimmedQty)) {
    return trimmedQty
  }

  const qtyNoSpaces = trimmedQty.replace(/\s+/g, "")

  const fractionMatch = qtyNoSpaces.match(/^(\d+)\/(\d+)$/)
  if (fractionMatch) {
    const numStr = fractionMatch[1]
    const denStr = fractionMatch[2]

    if (!numStr || !denStr) {
      return trimmedQty
    }

    if (numStr.startsWith("0") && numStr.length > 1) {
      return trimmedQty
    }

    const num = parseFloat(numStr)
    const den = parseFloat(denStr)
    if (!Number.isNaN(num) && !Number.isNaN(den) && den !== 0) {
      return num / den
    }
  }

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

  if (trimmedContent.startsWith("=")) {
    trimmedContent = trimmedContent.slice(1).trimStart()
  }

  const lastPercentIndex = trimmedContent.lastIndexOf("%")
  if (lastPercentIndex !== -1) {
    const qtyStr = trimmedContent.slice(0, lastPercentIndex).trim()
    const unitsStr = trimmedContent.slice(lastPercentIndex + 1).trim()
    return {
      quantity: parseQuantity(qtyStr),
      units: unitsStr,
    }
  }

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
 */
function mergeConsecutiveTexts(items: CanonicalStepItem[]): CanonicalStepItem[] {
  const result: CanonicalStepItem[] = []
  let currentText = ""
  let lastItemWasText = false

  for (const item of items) {
    if (item.type === "text") {
      if (lastItemWasText) {
        currentText += " "
      }
      currentText += item.value
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

/**
 * Convert a single AST StepItem to canonical format
 */
function convertItem(item: StepItem): CanonicalStepItem | null {
  switch (item.type) {
    case "text":
      return { type: "text", value: item.value }

    case "ingredient": {
      if (item.rawAmount === undefined || item.rawAmount === null) {
        return {
          name: item.name,
          quantity: "some" as CanonicalValue,
          type: "ingredient",
          units: "",
        }
      }

      const content = item.rawAmount.trim()
      if (!content) {
        return {
          name: item.name,
          quantity: "some" as CanonicalValue,
          type: "ingredient",
          units: "",
        }
      }

      const parsed = parseAmount(content)
      return {
        name: item.name,
        quantity: parsed.quantity,
        type: "ingredient",
        units: parsed.units,
      }
    }

    case "cookware": {
      if (!item.quantity) {
        return {
          name: item.name,
          quantity: 1 as CanonicalValue,
          type: "cookware",
          units: "",
        }
      }

      return {
        name: item.name,
        quantity: parseCookwareAmount(item.quantity),
        type: "cookware",
        units: "",
      }
    }

    case "timer": {
      if (item.rawAmount === undefined || item.rawAmount === null) {
        return {
          name: item.name ?? "",
          quantity: "" as CanonicalValue,
          type: "timer",
          units: "",
        }
      }

      const parsed = parseAmount(item.rawAmount)
      return {
        name: item.name ?? "",
        quantity: parsed.quantity,
        type: "timer",
        units: parsed.units,
      }
    }
  }
}

/**
 * Convert AST recipe to canonical format
 */
export function convertToCanonical(
  ast: Recipe,
  directiveMetadata: Record<string, string>,
): CanonicalResult {
  // Merge frontmatter metadata with directive metadata (all as strings)
  const frontmatterMeta: Record<string, string> = {}
  if (ast.metadata?.data) {
    for (const [key, value] of Object.entries(ast.metadata.data)) {
      // Only include frontmatter keys (not directive metadata which gets merged separately)
      frontmatterMeta[key] = String(value)
    }
  }

  const mergedMetadata = { ...frontmatterMeta, ...directiveMetadata }

  // Sort keys alphabetically (Rust BTreeMap order)
  const sortedMetadata: Record<string, string> = {}
  for (const key of Object.keys(mergedMetadata).sort()) {
    sortedMetadata[key] = mergedMetadata[key] as string
  }

  // Convert steps
  const steps: CanonicalStepItem[][] = []
  for (const step of ast.steps) {
    // Convert each step's ordered items to canonical format
    // Multi-line steps need items from each line treated separately for soft-break merging
    const canonicalItems: CanonicalStepItem[] = []

    for (const item of step.items) {
      const converted = convertItem(item)
      if (converted) {
        canonicalItems.push(converted)
      }
    }

    if (canonicalItems.length > 0) {
      steps.push(mergeConsecutiveTexts(canonicalItems))
    }
  }

  return { metadata: sortedMetadata, steps }
}

/**
 * Extract leading >> key: value metadata directives as raw strings.
 * Only extracts directives from the top of the file, stopping at the first non-directive line.
 * This matches the Rust reference behavior where directives precede recipe content.
 */
function extractLeadingDirectives(source: string): {
  metadata: Record<string, string>
  body: string
} {
  const lines = source.split(/\r\n|\n|\r/)
  const metadata: Record<string, string> = {}
  let directiveCount = 0

  for (const line of lines) {
    const match = line.match(/^\s*>>\s*([^:]+?)\s*:\s*(.*)\s*$/)
    if (!match) break

    const key = match[1]?.trim()
    const value = match[2]
    if (!key || value === undefined) break

    metadata[key] = value.trim()
    directiveCount++
  }

  if (directiveCount === 0) {
    return { metadata: {}, body: source }
  }

  // Sort keys alphabetically (Rust BTreeMap order)
  const sortedMetadata: Record<string, string> = {}
  for (const key of Object.keys(metadata).sort()) {
    sortedMetadata[key] = metadata[key] as string
  }

  return {
    metadata: sortedMetadata,
    body: lines.slice(directiveCount).join("\n"),
  }
}

/**
 * Parse Cooklang source directly to canonical format.
 * Extracts leading directives separately, then parses the body with the main parser.
 */
export function parseToCanonical(source: string): CanonicalResult {
  // Extract leading directives as raw strings (canonical format needs string values)
  const { metadata: directives, body } = extractLeadingDirectives(source)

  // Parse the body (without leading directives) through the main AST pipeline
  const ast = parseToAST(body)

  // Build directive metadata for the canonical converter
  // The AST may also have frontmatter metadata that needs to be merged
  return convertToCanonical(ast, directives)
}
