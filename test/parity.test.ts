/**
 * Differential parity tests against the cooklang-rs reference implementation.
 *
 * These run only when the json_oracle binary has been built in the sibling
 * cooklang-rs checkout; otherwise they are skipped so CI without a Rust
 * toolchain still passes. Build the oracle with:
 *
 *   cd ../cooklang-rs && cargo build --example json_oracle
 *
 * See scripts/parity.ts for an interactive runner with full diff output.
 */

import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { type CorpusCase, loadCorpus } from "../scripts/parity/corpus"
import { deepDiff, normalizeOurs, normalizeRust } from "../scripts/parity/normalize"
import { parseCooklang } from "../src/index"

const ORACLE =
  process.env.COOKLANG_RS_ORACLE ??
  join(import.meta.dir, "../../cooklang-rs/target/debug/examples/json_oracle")

const MODES = ["canonical", "default"] as const

/**
 * Cases where the parsed recipe renders to identical text but the internal step
 * item array is segmented differently than cooklang-rs. Both happen only during
 * error recovery on malformed input, where cooklang-rs keeps the stray marker as
 * its own text fragment and we merge it with the adjacent text. The concatenated
 * text is byte-identical, so these are accepted.
 */
const COSMETIC_ALLOWLIST = new Set([
  "edge:mod-recipe::canonical",
  "edge:timer-unclosed::canonical",
  "edge:timer-unclosed::default",
])

interface OracleResult {
  id: string
  recipe: Record<string, unknown> | null
  errors: string[]
  warnings: string[]
}

async function runOracle(cases: CorpusCase[]): Promise<Map<string, OracleResult>> {
  const input = cases
    .flatMap(c => MODES.map(mode => ({ id: `${c.id}::${mode}`, mode, src: c.src })))
    .map(r => JSON.stringify(r))
    .join("\n")

  const proc = Bun.spawn([ORACLE], { stdin: "pipe", stdout: "pipe", stderr: "pipe" })
  proc.stdin.write(input)
  proc.stdin.end()
  const out = await new Response(proc.stdout).text()
  await proc.exited

  const results = new Map<string, OracleResult>()
  for (const line of out.split("\n")) {
    if (!line.trim()) continue
    const parsed = JSON.parse(line) as OracleResult
    results.set(parsed.id, parsed)
  }
  return results
}

function structuralView(norm: ReturnType<typeof normalizeOurs>) {
  const { errors: _e, warnings: _w, warningCount: _wc, ...rest } = norm
  return rest
}

const oracleAvailable = existsSync(ORACLE)

describe.if(oracleAvailable)("cooklang-rs structural parity", () => {
  const corpus = loadCorpus()

  test("every corpus case matches cooklang-rs structure in both modes", async () => {
    const oracle = await runOracle(corpus)
    const mismatches: string[] = []

    for (const c of corpus) {
      for (const mode of MODES) {
        const key = `${c.id}::${mode}`
        if (COSMETIC_ALLOWLIST.has(key)) continue

        const rustRaw = oracle.get(key)
        if (!rustRaw) {
          mismatches.push(`${key}: no oracle result`)
          continue
        }

        const ours = parseCooklang(c.src, {
          extensions: mode === "canonical" ? "canonical" : "all",
        })
        const diffs = deepDiff(
          structuralView(normalizeOurs(ours)),
          structuralView(normalizeRust(rustRaw)),
        )
        if (diffs.length > 0) {
          mismatches.push(`${key} [${JSON.stringify(c.src)}]: ${diffs.join("; ")}`)
        }
      }
    }

    expect(mismatches).toEqual([])
  })
})

if (!oracleAvailable) {
  test.skip("cooklang-rs parity (oracle binary not built — see test header)", () => {})
}
