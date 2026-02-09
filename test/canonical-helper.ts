import { parseCooklang } from "../src/index"

export type CanonicalStepItem =
  | { type: "text"; value: string }
  | { type: "ingredient"; name: string; quantity: string | number; units: string }
  | { type: "cookware"; name: string; quantity: string | number; units: string }
  | { type: "timer"; name: string; quantity: string | number; units: string }

export interface CanonicalResult {
  metadata: Record<string, string>
  steps: CanonicalStepItem[][]
}

const directiveRegex = /^\s*>>\s*([^:]+?)\s*:\s*(.*)\s*$/

function sortKeys<T>(obj: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)))
}

export function parseToCanonical(source: string): CanonicalResult {
  const lines = source.split(/\r\n|\n|\r/)
  const directives: Record<string, string> = {}
  let directiveCount = 0

  for (const line of lines) {
    const match = line.match(directiveRegex)
    if (!match) break
    const key = match[1]?.trim()
    const value = match[2]
    if (!key || value === undefined) break
    directives[key] = value.trim()
    directiveCount++
  }

  const body = directiveCount > 0 ? lines.slice(directiveCount).join("\n") : source
  const recipe = parseCooklang(body)

  const frontmatterMeta = Object.fromEntries(
    Object.entries(recipe.metadata).map(([k, v]) => [k, String(v)]),
  )
  const metadata = sortKeys({ ...frontmatterMeta, ...sortKeys(directives) })

  const steps: CanonicalStepItem[][] = recipe.steps.map(step =>
    step.map((item): CanonicalStepItem => {
      if (item.type === "ingredient") {
        return { type: "ingredient", name: item.name, quantity: item.quantity, units: item.units }
      }
      return item
    }),
  )

  return { metadata, steps }
}
