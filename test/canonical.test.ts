import { expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { parseToCanonical, type CanonicalResult } from "../src/canonicalConverter"

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
        if (item.type === "cookware" && !("units" in item)) {
          return { ...item, units: "" }
        }
        return item
      }),
    ),
  }
}

function loadCanonicalCases(): Array<[string, CanonicalCase]> {
  const canonicalCasesPath = join(process.cwd(), "../cooklang-rs/tests/canonical_cases/mod.rs")

  if (!existsSync(canonicalCasesPath)) {
    throw new Error(`Missing canonical fixtures: ${canonicalCasesPath}`)
  }

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
