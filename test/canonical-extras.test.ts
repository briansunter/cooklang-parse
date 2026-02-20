import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { type ExtendedCanonicalResult, parseToExtendedCanonical } from "./canonical-helper"

interface ExtendedCase {
  source: string
  result: ExtendedCanonicalResult
}

interface ExtendedYaml {
  version: number
  tests: Record<string, ExtendedCase>
}

/**
 * Normalize expected results: ensure cookware items always have `units` field.
 */
function normalizeExpectedResult(result: ExtendedCanonicalResult): ExtendedCanonicalResult {
  return {
    ...result,
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

function loadExtendedCases(): Array<[string, ExtendedCase]> {
  const yamlPath = join(import.meta.dir, "fixtures/canonical-extras.yaml")
  const content = readFileSync(yamlPath, "utf-8")
  const parsed = Bun.YAML.parse(content) as ExtendedYaml

  return Object.entries(parsed.tests)
    .map(([key, testCase]) => {
      const name = key.replace(/^test/, "")
      return [
        name,
        { source: testCase.source, result: normalizeExpectedResult(testCase.result) },
      ] as [string, ExtendedCase]
    })
    .sort(([a], [b]) => a.localeCompare(b))
}

const extendedCases = loadExtendedCases()

test("loads canonical-extras fixtures", () => {
  expect(extendedCases.length).toBeGreaterThanOrEqual(17)
})

for (const [name, testCase] of extendedCases) {
  test(`canonical-extras: ${name}`, () => {
    expect(parseToExtendedCanonical(testCase.source)).toEqual(testCase.result)
  })
}
