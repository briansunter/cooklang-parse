import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { type CanonicalResult, parseToCanonical } from "./canonical-helper"

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

interface CanonicalYaml {
  version: number
  tests: Record<string, CanonicalCase>
}

function loadCanonicalCases(): Array<[string, CanonicalCase]> {
  const yamlPath = join(import.meta.dir, "fixtures/canonical.yaml")
  const content = readFileSync(yamlPath, "utf-8")
  const parsed = Bun.YAML.parse(content) as CanonicalYaml

  return Object.entries(parsed.tests)
    .map(([key, testCase]) => {
      const name = key.replace(/^test/, "")
      return [
        name,
        { source: testCase.source, result: normalizeExpectedResult(testCase.result) },
      ] as [string, CanonicalCase]
    })
    .sort(([a], [b]) => a.localeCompare(b))
}

const canonicalCases = loadCanonicalCases()

test("loads canonical spec fixtures", () => {
  expect(canonicalCases.length).toBeGreaterThan(55)
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
    steps: [
      [
        { type: "text", value: "Add " },
        { type: "ingredient", name: "flour", quantity: 250, units: "g" },
        { type: "text", value: "." },
      ],
    ],
    metadata: { title: "Pancakes" },
  })
})

test("leading metadata directives restricted with frontmatter", () => {
  const source = `>> servings: 4\n---\ntitle: Pancakes\n---\nAdd @flour{250%g}.\n`
  const result = parseToCanonical(source)

  // Non-special directives are stripped but not added to metadata when frontmatter exists
  expect(result.metadata).toEqual({
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

test("canonical: amount without percent keeps everything as quantity", () => {
  const result = parseToCanonical("Add @flour{2 tablespoons}.\n")

  // Without %, entire content is quantity (cooklang-rs canonical: only % separates qty/unit)
  expect(result.steps[0]).toEqual([
    { type: "text", value: "Add " },
    { type: "ingredient", name: "flour", quantity: "2 tablespoons", units: "" },
    { type: "text", value: "." },
  ])
})
