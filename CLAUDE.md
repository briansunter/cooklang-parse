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
```

Use Bun exclusively (not Node.js, npm, yarn, or pnpm).

## Architecture

A Cooklang recipe parser that converts Cooklang markup into structured data. Uses [Ohm.js](https://ohmjs.org) for PEG-based grammar parsing.

### Single parsing pipeline

```
grammars/cooklang.ohm  →  src/semantics.ts  →  CooklangRecipe
     (grammar)            (parse + convert)      (src/types.ts)
```

- `grammars/cooklang.ohm` — Ohm PEG grammar defining Cooklang syntax
- `src/semantics.ts` — Ohm semantic actions (`toAST` operation) and all conversion logic (ingredients, cookware, timers, metadata, YAML frontmatter). This is the core file — grammar matching, token parsing, and output construction all happen here. Exports `parseCooklang()` and `grammar`.
- `src/types.ts` — TypeScript types for the output (`CooklangRecipe`, `RecipeIngredient`, `RecipeCookware`, `RecipeTimer`, etc.)
- `src/index.ts` — Re-exports from `semantics.ts`
- `test/canonical-helper.ts` — `parseToCanonical()` wrapper that adapts `parseCooklang` output to the canonical test format (handles directive extraction separately for canonical parity)

### How parsing works

1. `extractMetadataDirectives()` strips `>> key: value` lines from source before Ohm matching
2. `grammar.match()` parses the stripped source against `cooklang.ohm`
3. `semantics(matchResult).toAST()` walks the CST producing steps, sections, notes, and frontmatter YAML
4. Helper functions (`convertIngredient`, `convertCookware`, `convertTimer`) parse raw `sourceString` from Ohm nodes — the grammar captures token boundaries, TypeScript extracts quantities/units/names
5. `parseYamlFrontmatter()` parses `---` blocks, then metadata is merged: YAML frontmatter + directives (directives win on conflict)
6. `collectUnique()` deduplicates ingredients/cookware/timers across all steps

### Cooklang syntax quick reference

- `@name{qty%unit}` — ingredients (`%` separates quantity from unit)
- `#name{}` — cookware (braces required for multi-word names)
- `~name{qty%unit}` — timers
- `-- comment` (note: requires space after `--`), `[- block comment -]`
- `> note`, `== Section ==`
- `>> key: value` — metadata directives
- `---` YAML front matter blocks
- `=@name{qty}` or `@name{=qty}` — fixed quantities
- `@name{}(preparation)` — ingredient with preparation
- `@name|alias{}` — pipe alias syntax in names

### Test structure

- `test/parse.test.ts` — Main parser tests for the public API
- `test/canonical.test.ts` — Canonical format tests loaded from vendored Rust reference fixtures at `test/fixtures/canonical_cases.rs`
- `test/spec-parity.test.ts` — Targeted tests ensuring behavior matches the official Cooklang spec
- `test/syntax-features-audit.test.ts` — Comprehensive syntax feature coverage audit

### Key design details

- Token parsing happens in TypeScript helpers (`convertIngredient`, `convertCookware`, `convertTimer`), not in the grammar. The grammar only captures boundaries.
- `componentWordChar = wordChar | "|"` allows pipe alias syntax in component names.
- `wordChar` includes emoji ranges and unicode Latin/Cyrillic, matching the canonical spec.
- The `Text` grammar rule uses negative lookahead to stop before `@`+wordChar, `#`+wordChar, `~`+wordChar/`{`, `"-- "`, `"[-"`, and `=`+`@`.
- `StepLine` has negative lookahead for section start (`==` or `= ` not followed by `@`).
- Multi-line steps within the same paragraph are joined with spaces (soft line breaks), not newlines.
- Biome config: double quotes, no semicolons, 2-space indent, 100-char line width, trailing commas. Lints both `src/` and `test/`.
