# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun install          # Install dependencies
bun test             # Run all tests
bun test test/parse.test.ts           # Run a single test file
bun test --grep "parse simple recipe" # Run tests matching a pattern
bun run lint         # Lint with Biome (src/ only)
bun run lint:fix     # Lint and auto-fix
bun run format       # Format with Biome
bun run check        # Biome check (lint + format)
```

Use Bun exclusively (not Node.js, npm, yarn, or pnpm).

## Architecture

This is a Cooklang recipe parser that converts Cooklang markup into structured data. It uses [Ohm.js](https://ohmjs.org) for PEG-based grammar parsing.

### Two parallel parsing pipelines

1. **Main parser** (`parseCooklang` / `parseToAST`): Produces a rich AST with position tracking, then converts to a simplified model. Used by consumers of the library.
   - Grammar: `grammars/cooklang.ohm`
   - Semantics: `src/semantics.ts` (Ohm semantic actions -> AST nodes defined in `src/types.ts`)
   - Converter: `src/converter.ts` (AST -> simplified `CooklangRecipe`)
   - Entry: `src/index.ts`

2. **Canonical parser** (`parseToCanonical`): Produces a flat canonical format matching the official spec's test output. Used for parity testing against the reference test fixtures.
   - Grammar: `grammars/cooklang-canonical.ohm`
   - Semantics: `src/canonicalSemantics.ts`
   - CST helpers: `src/cstTypes.ts`

### How parsing works

Both pipelines follow the same pattern:
1. Extract `>> key: value` metadata directives from source (pre-processing step before Ohm)
2. Match the remaining source against the Ohm grammar
3. Walk the CST via Ohm semantic actions (`toAST` or `toCanonical` operations)
4. Parse YAML front matter (`---` blocks) after grammar matching
5. Merge directive metadata with front matter metadata

### Cooklang syntax tokens

- `@name{qty%unit}` - ingredients, `#name{}` - cookware, `~name{qty%unit}` - timers
- `-- comment`, `[- block comment -]`, `> note`, `== Section ==`
- `>> key: value` - metadata directives (extracted before grammar parsing)
- `---` YAML front matter blocks

### Test structure

- `test/parse.test.ts` - Main parser tests for the simplified API
- `test/canonical.test.ts` - Canonical format tests loaded from reference fixtures at `../cooklang-rs/tests/canonical_cases/mod.rs`
- `test/spec-parity.test.ts` - Targeted tests ensuring behavior matches the official Cooklang spec

### Key design details

- Token parsing (ingredients, cookware, timers) is done by helper functions in `src/semantics.ts` that parse the raw `sourceString` from Ohm nodes, not by the grammar rules themselves. The grammar captures the token boundaries; the TypeScript code extracts quantities, units, and names.
- The `%` character separates quantity from unit inside amount braces: `{250%g}`.
- Source positions are currently stubbed (`stubPosition`) - not yet fully implemented.
- Biome is configured for double quotes, no semicolons, 2-space indent, 100-char line width.
