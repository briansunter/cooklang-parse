/**
 * Differential parity runner: parses every corpus case with cooklang-parse and
 * the cooklang-rs json_oracle (both modes) and diffs the normalized results.
 *
 * Usage:
 *   bun scripts/parity.ts                 # run everything, print mismatches
 *   bun scripts/parity.ts --case edge:timer-unclosed
 *   bun scripts/parity.ts --messages      # also diff error/warning message text
 *
 * Build the oracle first:
 *   cd ../cooklang-rs && cargo build --example json_oracle
 */
import { existsSync } from "node:fs"
import { join } from "node:path"
import { parseCooklang } from "../src/index"
import { type CorpusCase, loadCorpus } from "./parity/corpus"
import { deepDiff, type NormRecipe, normalizeOurs, normalizeRust } from "./parity/normalize"

const ORACLE =
  process.env.COOKLANG_RS_ORACLE ??
  join(import.meta.dir, "../../cooklang-rs/target/debug/examples/json_oracle")

const MODES = ["canonical", "default"] as const
type Mode = (typeof MODES)[number]

interface OracleResult {
  id: string
  recipe: Record<string, unknown> | null
  errors: string[]
  warnings: string[]
}

async function runOracle(cases: CorpusCase[]): Promise<Map<string, OracleResult>> {
  const lines = cases
    .flatMap(c => MODES.map(mode => ({ id: `${c.id}::${mode}`, mode, src: c.src })))
    .map(r => JSON.stringify(r))
    .join("\n")

  const proc = Bun.spawn([ORACLE], { stdin: "pipe", stdout: "pipe", stderr: "pipe" })
  proc.stdin.write(lines)
  proc.stdin.end()
  const out = await new Response(proc.stdout).text()
  const errText = await new Response(proc.stderr).text()
  if ((await proc.exited) !== 0) {
    throw new Error(`oracle failed: ${errText}`)
  }

  const results = new Map<string, OracleResult>()
  for (const line of out.split("\n")) {
    if (!line.trim()) continue
    const parsed = JSON.parse(line) as OracleResult
    results.set(parsed.id, parsed)
  }
  return results
}

/**
 * Structural view: everything that defines the parsed recipe plus whether the
 * parse was fatal and how many errors it produced (errors gate validity).
 * Warning counts and all diagnostic message text are compared separately, since
 * exact diagnostic wording is the least load-bearing part of parser behavior.
 */
function structuralView(norm: NormRecipe): Omit<NormRecipe, "errors" | "warnings" | "warningCount"> {
  const { errors: _e, warnings: _w, warningCount: _wc, ...rest } = norm
  return rest
}

async function main() {
  const args = process.argv.slice(2)
  const caseFilter = args.includes("--case") ? args[args.indexOf("--case") + 1] : null
  const compareMessages = args.includes("--messages")

  if (!existsSync(ORACLE)) {
    console.error(`Oracle binary not found at ${ORACLE}`)
    console.error("Build it with: cd ../cooklang-rs && cargo build --example json_oracle")
    process.exit(2)
  }

  let corpus = loadCorpus()
  if (caseFilter) corpus = corpus.filter(c => c.id === caseFilter || c.id.includes(caseFilter))
  if (corpus.length === 0) {
    console.error("No corpus cases matched")
    process.exit(2)
  }

  const oracleResults = await runOracle(corpus)

  let pass = 0
  let fail = 0
  let warnMismatch = 0
  const failures: string[] = []
  const warnNotes: string[] = []

  for (const c of corpus) {
    for (const mode of MODES) {
      const rustRaw = oracleResults.get(`${c.id}::${mode}`)
      if (!rustRaw) {
        failures.push(`${c.id} [${mode}]: oracle produced no result`)
        fail += 1
        continue
      }

      const ours = parseCooklang(c.src, { extensions: mode === "canonical" ? "canonical" : "all" })
      const normOurs = normalizeOurs(ours)
      const normRust = normalizeRust(rustRaw)

      const a = compareMessages ? normOurs : structuralView(normOurs)
      const b = compareMessages ? normRust : structuralView(normRust)
      const diffs = deepDiff(a, b)

      if (normOurs.warningCount !== normRust.warningCount) {
        warnMismatch += 1
        warnNotes.push(
          `~ ${c.id} [${mode}] warnings ours=${normOurs.warningCount} rust=${normRust.warningCount}` +
            ` ours=${JSON.stringify(normOurs.warnings)} rust=${JSON.stringify(normRust.warnings)}`,
        )
      }

      if (diffs.length === 0) {
        pass += 1
        continue
      }

      fail += 1
      failures.push(
        [
          `--- ${c.id} [${mode}] ---`,
          `source: ${JSON.stringify(c.src)}`,
          ...diffs.map(d => `  ${d}`),
          `  ours errors: ${JSON.stringify(normOurs.errors)} warnings: ${JSON.stringify(normOurs.warnings)}`,
          `  rust errors: ${JSON.stringify(normRust.errors)} warnings: ${JSON.stringify(normRust.warnings)}`,
        ].join("\n"),
      )
    }
  }

  for (const f of failures) console.log(f)
  if (process.argv.includes("--warnings")) {
    console.log("\n# warning-count mismatches (informational):")
    for (const w of warnNotes) console.log(w)
  }
  console.log(
    `\nparity: ${pass} structural pass, ${fail} structural fail` +
      ` (${corpus.length} cases x ${MODES.length} modes); ${warnMismatch} warning-count mismatches`,
  )
  process.exit(fail > 0 ? 1 : 0)
}

await main()
