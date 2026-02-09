import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { parseToCanonical, type CanonicalResult } from "./canonical-helper"

interface CanonicalCase {
  source: string
  result: CanonicalResult
}

/**
 * Normalize expected results: ensure cookware items always have `units` field.
 * Some older Rust fixtures omit `units` on cookware; newer ones include it.
 */
function normalizeExpectedResult(result: CanonicalResult): CanonicalResult {
  return {
    metadata: result.metadata,
    steps: result.steps.map(step =>
      step.map(item => {
        if (item.type === "cookware") {
          return { ...item, units: item.units || "" }
        }
        return item
      }),
    ),
  }
}

function loadCanonicalCases(): Array<[string, CanonicalCase]> {
  const canonicalCasesPath = join(import.meta.dir, "fixtures/canonical_cases.rs")
  const source = readFileSync(canonicalCasesPath, "utf-8")
  const cases: Array<[string, CanonicalCase]> = []

  const caseRegex = /#\[test_case\(r#"\n([\s\S]*?)"#\n;\s*"([^"]+)"\)\]/g
  let match: RegExpExecArray | null

  while ((match = caseRegex.exec(source)) !== null) {
    const yaml = match[1]
    const name = match[2]

    if (!yaml || !name) {
      continue
    }

    const parsed = Bun.YAML.parse(yaml) as CanonicalCase
    cases.push([
      name,
      {
        source: parsed.source,
        result: normalizeExpectedResult(parsed.result),
      },
    ])
  }

  return cases.sort(([a], [b]) => a.localeCompare(b))
}

const canonicalCases = loadCanonicalCases()

test("loads canonical spec fixtures", () => {
  expect(canonicalCases.length).toBeGreaterThan(50)
})

for (const [name, testCase] of canonicalCases) {
  test(`canonical parity: ${name}`, () => {
    expect(parseToCanonical(testCase.source)).toEqual(testCase.result)
  })
}

test("legacy frontmatter metadata remains supported", () => {
  const source = `---\ntitle: Pancakes\n---\nAdd @flour{250%g}.\n`
  const result = parseToCanonical(source)

  expect(result).toEqual({
    steps: [[
      { type: "text", value: "Add " },
      { type: "ingredient", name: "flour", quantity: 250, units: "g" },
      { type: "text", value: "." },
    ]],
    metadata: { title: "Pancakes" },
  })
})

test("leading metadata directives merge with frontmatter metadata", () => {
  const source = `>> servings: 4\n---\ntitle: Pancakes\n---\nAdd @flour{250%g}.\n`
  const result = parseToCanonical(source)

  expect(result.metadata).toEqual({
    servings: "4",
    title: "Pancakes",
  })
})

test("canonical: non-ASCII quantity preserved as string", () => {
  const result = parseToCanonical("Add @item{大さじ%杯}.\n")

  expect(result.steps[0]).toEqual([
    { type: "text", value: "Add " },
    { type: "ingredient", name: "item", quantity: "大さじ", units: "杯" },
    { type: "text", value: "." },
  ])
})

test("canonical: space-separated amount without percent", () => {
  const result = parseToCanonical("Add @flour{2 tablespoons}.\n")

  expect(result.steps[0]).toEqual([
    { type: "text", value: "Add " },
    { type: "ingredient", name: "flour", quantity: 2, units: "tablespoons" },
    { type: "text", value: "." },
  ])
})
