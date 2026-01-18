/**
 * Convert AST to canonical Cooklang format
 */

import type { Recipe, Step } from "./types.js"

// Canonical format types
interface CanonicalTextItem {
  type: "text"
  value: string
}

interface CanonicalIngredient {
  type: "ingredient"
  name: string
  quantity: string | number
  units: string
}

interface CanonicalCookware {
  type: "cookware"
  name: string
  quantity: number | string
}

interface CanonicalTimer {
  type: "timer"
  quantity: string | number
  units: string
  name: string
}

type CanonicalStepItem =
  | CanonicalTextItem
  | CanonicalIngredient
  | CanonicalCookware
  | CanonicalTimer

interface CanonicalRecipe {
  steps: CanonicalStepItem[][]
  metadata: Record<string, string>
}

/**
 * Check if a character is a word character
 */
function _isWordChar(char: string): boolean {
  return /[a-zA-Z0-9\u00C0-\u00FF]/.test(char)
}

/**
 * Check if a character is punctuation
 */
function _isPunctuation(char: string): boolean {
  return /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/.test(char)
}

/**
 * Parse quantity string and convert to number if it's a fraction or decimal
 */
function parseQuantity(qtyParam: string): string | number {
  const qty = qtyParam.trim()

  // Check for fraction
  if (qty.includes("/")) {
    const parts = qty.split("/")
    if (parts.length === 2) {
      const num = parseFloat(parts[0])
      const den = parseFloat(parts[1])
      if (!Number.isNaN(num) && !Number.isNaN(den) && den !== 0) {
        return num / den
      }
    }
    return qty // Return as-is if not a simple fraction
  }

  // Check for decimal
  const asNum = parseFloat(qty)
  if (!Number.isNaN(asNum)) {
    return asNum
  }

  return qty
}

/**
 * Parse ingredients from text (for ingredients without {})
 */
function extractInlineIngredient(
  text: string,
  startPos: number,
): { ingredient: CanonicalIngredient; endPos: number } | null {
  // Look for @ symbol followed by ingredient name
  const atPos = text.indexOf("@", startPos)
  if (atPos === -1) return null

  let pos = atPos + 1

  // Extract the ingredient name
  let name = ""
  while (pos < text.length) {
    const char = text[pos]

    // Stop at whitespace, punctuation, or special cooklang chars
    if (char === "#" || char === "~" || char === "@" || char === "{") {
      break
    }

    // Stop at whitespace or certain punctuation
    if (/\s/.test(char)) {
      break
    }

    name += char
    pos++
  }

  // If we found a name, create the ingredient
  if (name.length > 0) {
    return {
      ingredient: {
        type: "ingredient",
        name: name.trim(),
        quantity: "some",
        units: "",
      },
      endPos: pos,
    }
  }

  return null
}

/**
 * Convert an AST step to canonical format
 */
function convertStepToCanonical(step: Step): CanonicalStepItem[] {
  const items: CanonicalStepItem[] = []
  const source = step.text
  const _pos = 0

  // Sort ingredients, cookware, timers by position
  const allItems: Array<{
    type: string
    start: number
    data: CanonicalIngredient | CanonicalCookware | CanonicalTimer
  }> = []

  for (const ing of step.ingredients) {
    allItems.push({
      type: "ingredient",
      start: ing.position.offset,
      data: {
        type: "ingredient",
        name: ing.name,
        quantity: ing.quantity ? parseQuantity(ing.quantity) : "some",
        units: ing.unit || "",
      },
    })
  }

  for (const cw of step.cookware) {
    allItems.push({
      type: "cookware",
      start: cw.position.offset,
      data: {
        type: "cookware",
        name: cw.name,
        quantity: 1,
      },
    })
  }

  for (const timer of step.timers) {
    allItems.push({
      type: "timer",
      start: timer.position.offset,
      data: {
        type: "timer",
        quantity: timer.quantity ? parseQuantity(timer.quantity) : "",
        units: timer.unit || "",
        name: timer.name || "",
      },
    })
  }

  // Sort by position
  allItems.sort((a, b) => a.start - b.start)

  // Build the items array
  let lastIndex = 0
  for (const item of allItems) {
    // Add text before this item
    if (item.start > lastIndex) {
      const textSegment = source.slice(lastIndex, item.start)
      if (textSegment) {
        items.push({
          type: "text",
          value: textSegment,
        })
      }
    }

    // Add the item
    items.push(item.data)

    // Move past the item
    // Need to find the end of the item in source
    const itemInSource = source.indexOf(getItemSource(item.data), item.start)
    if (itemInSource !== -1) {
      lastIndex = itemInSource + getItemSource(item.data).length
    }
  }

  // Add remaining text
  if (lastIndex < source.length) {
    const remainingText = source.slice(lastIndex)
    if (remainingText) {
      // Check for inline ingredients without {}
      let searchPos = 0
      let found = false
      while (!found && searchPos < remainingText.length) {
        const result = extractInlineIngredient(remainingText, searchPos)
        if (result) {
          // Add text before the ingredient
          if (result.endPos > searchPos) {
            items.push({
              type: "text",
              value: remainingText.slice(searchPos, result.endPos),
            })
          }
          // Add the ingredient
          items.push(result.ingredient)
          searchPos = result.endPos
          found = true
        } else {
          searchPos++
        }
      }

      if (!found) {
        items.push({
          type: "text",
          value: remainingText,
        })
      }
    }
  }

  return items
}

function getItemSource(item: CanonicalIngredient | CanonicalCookware | CanonicalTimer): string {
  if (item.type === "ingredient") {
    return `@${item.name}`
  } else if (item.type === "cookware") {
    return `#${item.name}`
  } else if (item.type === "timer") {
    return `~${item.name}{${item.quantity}${item.units ? `%${item.units}` : ""}}`
  }
  return ""
}

/**
 * Convert AST to canonical recipe format
 */
export function convertToCanonical(ast: Recipe): CanonicalRecipe {
  const steps: CanonicalStepItem[][] = []
  const metadata: Record<string, string> = {}

  // Convert metadata
  if (ast.metadata) {
    for (const [key, value] of Object.entries(ast.metadata.data)) {
      if (value !== null && value !== undefined) {
        metadata[key] = String(value)
      }
    }
  }

  // Convert steps
  for (const step of ast.steps) {
    // Filter out comments and notes
    const canonicalItems = convertStepToCanonical(step)
    if (canonicalItems.length > 0) {
      steps.push(canonicalItems)
    }
  }

  return {
    steps,
    metadata,
  }
}

/**
 * Parse Cooklang source and return canonical format
 */
export function parseToCanonical(source: string): CanonicalRecipe {
  // Import the parser
  const { parseToAST } = require("./semantics.js")
  const ast = parseToAST(source)
  return convertToCanonical(ast)
}
