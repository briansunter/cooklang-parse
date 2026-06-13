# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun install          # Install dependencies
bun test             # Run all tests
bun test test/parse.test.ts           # Run a single test file
bun test --grep "parse simple recipe" # Run tests matching a pattern
bun run build        # Build: bun bundle + tsc declarations
bun run typecheck    # Type-check without emitting
bun run lint         # Lint with Biome (src/ and test/)
bun run lint:fix     # Lint and auto-fix
bun run format       # Format with Biome
bun run check        # Biome check (lint + format)
bun scripts/parity.ts                 # Differential test vs cooklang-rs (see below)
bun scripts/parity.ts --case <id>     # Run one corpus case; --warnings shows warn diffs
```

Use Bun exclusively (not Node.js, npm, yarn, or pnpm).

### Parity with cooklang-rs

Behavior is verified against the reference Rust implementation in the sibling
`../cooklang-rs` checkout. A small `examples/json_oracle.rs` (added there,
untracked) emits `{recipe, errors, warnings}` JSON for each input. Build it once:

```bash
cd ../cooklang-rs && cargo build --example json_oracle
```

Then `bun scripts/parity.ts` parses a corpus (canonical fixtures + edge cases in
`scripts/parity/corpus.ts`) with both parsers in both modes and diffs the
normalized output (`scripts/parity/normalize.ts`). `test/parity.test.ts` runs the
same check as part of `bun test`, skipping automatically when the oracle binary
is absent. Three corpus cases differ only in text-fragment segmentation during
error recovery (identical rendered text) and are allowlisted there. Inline-unit
recognition is generated from the oracle into `src/parser/inline-units.ts`.

## Architecture

A Cooklang recipe parser that converts Cooklang markup into structured data. Uses [Ohm.js](https://ohmjs.org) for PEG-based grammar parsing.

### Single parsing pipeline

```
grammars/cooklang.ohm  →  src/parser/ohm-ast.ts  →  src/parse-cooklang.ts  →  CooklangRecipe
     (grammar)              (ohm semantic layer)      (manual post-process)      (src/types.ts)
```

- `grammars/cooklang.ohm` — Ohm PEG grammar defining Cooklang syntax
- `src/parser/ohm-ast.ts` — Ohm grammar binding and semantic actions (`toAST`) that convert CST into an ordered intermediate semantic result (steps, sections, notes, directives, frontmatter).
- `src/parse-cooklang.ts` — Manual parser pipeline and orchestration: preprocessing, extensions, frontmatter parsing, metadata assembly, step transformations, dedupe, warnings/errors.
- `src/semantics.ts` — Backward-compatible facade that re-exports `parseCooklang()` and `grammar`.
- `src/types.ts` — TypeScript types for the output (`CooklangRecipe`, `RecipeIngredient`, `RecipeCookware`, `RecipeTimer`, etc.)
- `src/index.ts` — Public API exports
- `test/canonical-helper.ts` — `parseToCanonical()` wrapper that adapts `parseCooklang` output to the canonical test format; also exports `getSteps()`, `getNotes()`, `getSectionNames()` helpers

### How parsing works

1. `stripBlockComments()` removes `[- ... -]` block comments (replaced with spaces preserving offsets)
2. `parseWithOhm()` runs `grammar.match()` and `toAST()` to produce an ordered semantic result
3. Ohm-layer helpers (`buildIngredient`, `buildCookware`, `parseQuantity`) normalize core token payloads
4. `parseYamlFrontmatter()` parses `---` blocks, then metadata is assembled from YAML + directives (per mode/frontmatter rules)
5. Manual step transforms run (`applyAdvancedUnits`, `applyAliasMode`, `applyInlineQuantityExtraction`, mode checks)
6. `collectUniqueFromSteps()` deduplicates ingredients/cookware/timers across all steps

### Cooklang syntax quick reference

- `@name{qty%unit}` — ingredients (`%` separates quantity from unit)
- `#name{}` — cookware (braces required for multi-word names)
- `~name{qty%unit}` — timers (a timer with no quantity is a fatal error: in
  extended mode always, in canonical mode only when it also has no name)
- `--comment` (no space required, matching the cooklang-rs lexer; `--` starts a
  comment anywhere, even mid-word), `[- block comment -]`
- `> note`, `== Section ==`, `=== Name ===` / `= Name` (one or more `=`, optional
  trailing `=` run; the line must otherwise be empty). A bare `=` is an empty section.
- `>> key: value` — metadata directives
- `---` YAML front matter blocks
- `@name{=qty}` — fixed quantities (only inside braces)
- `@name{}(note)` — ingredient with note; `#name(note)` — cookware with note
- `@name|alias{}` — pipe alias syntax in names

### Test structure

- `test/parse.test.ts` — Main parser tests for the public API
- `test/canonical.test.ts` — Canonical format tests loaded from official spec YAML at `test/fixtures/canonical.yaml`
- `test/spec-parity.test.ts` — Targeted tests ensuring behavior matches the official Cooklang spec
- `test/syntax-features-audit.test.ts` — Comprehensive syntax feature coverage audit

### Key design details

- Token parsing happens in TypeScript helpers (`buildIngredient`, `buildCookware`, `parseQuantity`), not in the grammar. The grammar only captures boundaries.
- `componentWordChar = wordChar | "|"` allows pipe alias syntax in component names.
- `wordChar` includes emoji ranges and unicode Latin/Cyrillic, matching the canonical spec.
- The `Text` grammar rule uses negative lookahead to stop before `@`+ingredientStartChar, `#`+cookwareStartChar, `~`+wordChar/`{`, and `"--"`.
- `StepItem` has a `markerChar` recovery fallback: a `@`/`#`/`~` that does not form a valid component is emitted as literal text instead of failing the whole parse, matching cooklang-rs's backtracking.
- Cookware amounts use the same `qty%unit` grammar as ingredients (`#pan{1/2}` → `0.5`, `#pan{2%lids}` → qty `2` units `lids`).
- A text block (`> ...`) is multiline: it absorbs following non-blank lines (until a blank line, section, or directive) as literal text — components inside are not parsed.
- Inline-quantity extraction (extended mode) matches the bundled cooklang-rs unit set in `src/parser/inline-units.ts`, case-sensitively, with no punctuation trimming (`180C.` is not a unit). Regenerate the set from the oracle if cooklang-rs's units change.
- `%` is the only qty/unit separator in amounts (matching cooklang-rs canonical). No space-separated heuristic.
- When frontmatter exists, `>>` directives are parsed but NOT added to metadata (matching cooklang-rs).
- `StepLine` has negative lookahead for section start (`==` or `= ` not followed by `@`).
- Multi-line steps within the same paragraph are joined with spaces (soft line breaks), not newlines.
- Biome config: double quotes, no semicolons, 2-space indent, 100-char line width, trailing commas. Lints both `src/` and `test/`.
