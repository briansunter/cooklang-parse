/**
 * Convert AST to canonical format matching the official Cooklang spec test output.
 */

import { parseToAST } from "./semantics"
import type { Recipe, StepItem } from "./types"

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

function sortKeys<T>(obj: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)))
}

function parseQuantity(qty: string): string | number {
  const trimmedQty = qty.trim()
  if (!trimmedQty) return ""
  if (/[a-zA-Z]/.test(trimmedQty)) return trimmedQty

  const qtyNoSpaces = trimmedQty.replace(/\s+/g, "")

  const fractionMatch = qtyNoSpaces.match(/^(\d+)\/(\d+)$/)
  if (fractionMatch?.[1] && fractionMatch[2]) {
    if (fractionMatch[1].startsWith("0") && fractionMatch[1].length > 1) return trimmedQty
    const num = parseFloat(fractionMatch[1])
    const den = parseFloat(fractionMatch[2])
    if (!Number.isNaN(num) && !Number.isNaN(den) && den !== 0) return num / den
  }

  const asNum = parseFloat(qtyNoSpaces)
  if (!Number.isNaN(asNum)) return asNum

  return trimmedQty
}

function parseAmount(content: string): { quantity: string | number; units: string } {
  let trimmed = content.trim()
  if (trimmed.startsWith("=")) {
    trimmed = trimmed.slice(1).trimStart()
  }

  const lastPercent = trimmed.lastIndexOf("%")
  if (lastPercent !== -1) {
    return {
      quantity: parseQuantity(trimmed.slice(0, lastPercent).trim()),
      units: trimmed.slice(lastPercent + 1).trim(),
    }
  }

  const spaceMatch = trimmed.match(/^(\S+)\s+(\S{3,}.*)$/)
  if (spaceMatch?.[1] && spaceMatch[2]) {
    return {
      quantity: parseQuantity(spaceMatch[1]),
      units: spaceMatch[2].trim(),
    }
  }

  return { quantity: parseQuantity(trimmed), units: "" }
}

function mergeConsecutiveTexts(items: CanonicalStepItem[]): CanonicalStepItem[] {
  const result: CanonicalStepItem[] = []
  let currentText = ""
  let lastWasText = false

  for (const item of items) {
    if (item.type === "text") {
      if (lastWasText) currentText += " "
      currentText += item.value
      lastWasText = true
    } else {
      if (currentText) {
        result.push({ type: "text", value: currentText })
        currentText = ""
      }
      result.push(item)
      lastWasText = false
    }
  }

  if (currentText) {
    result.push({ type: "text", value: currentText })
  }

  return result
}

function convertItem(item: StepItem): CanonicalStepItem | null {
  switch (item.type) {
    case "text":
      return { type: "text", value: item.value }

    case "ingredient": {
      const content = item.rawAmount?.trim()
      if (!content) return { type: "ingredient", name: item.name, quantity: "some", units: "" }
      const parsed = parseAmount(content)
      return { type: "ingredient", name: item.name, quantity: parsed.quantity, units: parsed.units }
    }

    case "cookware": {
      let quantity: CanonicalValue = 1
      if (item.quantity) {
        const asNum = parseFloat(item.quantity.trim())
        quantity = Number.isNaN(asNum) ? item.quantity.trim() : asNum
      }
      return { type: "cookware", name: item.name, quantity, units: "" }
    }

    case "timer": {
      if (item.rawAmount == null)
        return { type: "timer", name: item.name ?? "", quantity: "", units: "" }
      const parsed = parseAmount(item.rawAmount)
      return {
        type: "timer",
        name: item.name ?? "",
        quantity: parsed.quantity,
        units: parsed.units,
      }
    }
  }
}

export function convertToCanonical(
  ast: Recipe,
  directiveMetadata: Record<string, string>,
): CanonicalResult {
  const frontmatterMeta: Record<string, string> = {}
  if (ast.metadata?.data) {
    for (const [key, value] of Object.entries(ast.metadata.data)) {
      frontmatterMeta[key] = String(value)
    }
  }

  const metadata = sortKeys({ ...frontmatterMeta, ...directiveMetadata })

  const steps: CanonicalStepItem[][] = []
  for (const step of ast.steps) {
    const canonicalItems: CanonicalStepItem[] = []
    for (const item of step.items) {
      const converted = convertItem(item)
      if (converted) canonicalItems.push(converted)
    }
    if (canonicalItems.length > 0) {
      steps.push(mergeConsecutiveTexts(canonicalItems))
    }
  }

  return { metadata, steps }
}

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

  if (directiveCount === 0) return { metadata: {}, body: source }

  return {
    metadata: sortKeys(metadata),
    body: lines.slice(directiveCount).join("\n"),
  }
}

export function parseToCanonical(source: string): CanonicalResult {
  const { metadata: directives, body } = extractLeadingDirectives(source)
  const ast = parseToAST(body)
  return convertToCanonical(ast, directives)
}
