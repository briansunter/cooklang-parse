# How It Works

cooklang-parse is built on [Ohm.js](https://ohmjs.org), a parsing framework for JavaScript and TypeScript. This page explains the parser architecture for contributors and anyone curious about the internals.

## Architecture Overview

The parser follows a single clean pipeline:

```
Source Text
    |
    v
[1] Pre-processing (strip [- block comments -])
    |
    v
[2] Ohm Grammar (PEG parsing -> parse tree)
    |- Matches ingredients, cookware, timers, text
    |- Matches >> directives and --- frontmatter
    |- Matches sections, notes, comments
    |
    v
[3] Semantic Actions (parse tree -> ordered semantic AST)
    |- Build typed step items, sections, notes, directives
    |- Preserve raw component tokens for later modes/text rendering
    |- Normalize base quantities (fractions, decimals)
    |
    v
[4] Manual Post-Processing (semantic AST -> CooklangRecipe)
    |- Parse YAML frontmatter, merge metadata modes/directives
    |- Apply extension transforms (advanced units, aliases, inline quantities)
    |- Run mode checks and validation warnings/errors
    |- Deduplicate ingredients, cookware, timers
```

The parser is intentionally split into two layers:
- **Ohm layer** (`src/parser/ohm-ast.ts`) handles grammar matching and CST -> ordered semantic AST conversion.
- **Manual layer** (`src/parse-cooklang.ts` + helpers in `src/parser/`) handles frontmatter, metadata rules, extension behavior, validations, and final recipe assembly.

## What is Ohm.js?

[Ohm](https://ohmjs.org) is a library for building parsers using **Parsing Expression Grammars (PEGs)**. Unlike regex-based parsers, Ohm:

- Defines grammar rules in a clean, readable syntax separate from code
- Automatically builds a parse tree (CST) from matched input
- Lets you attach **semantic actions** to transform the tree into any output format
- Provides helpful error messages when input doesn't match

### Why Ohm over regex?

Cooklang has nested structures (ingredients inside steps, amounts inside braces) that are difficult to parse correctly with regex. Ohm handles this naturally:

```
Ingredient
  = "@" ingredientWord ingredientAmount?

ingredientAmount
  = "{" (~"}" any)* "}"
```

This grammar rule reads: "An ingredient starts with `@`, followed by a word, optionally followed by `{...}`". Ohm takes care of matching the braces, handling edge cases, and building the parse tree.

## The Grammar

The complete grammar is defined in `grammars/cooklang.ohm`. Here's the high-level structure:

```
Recipe = (MetadataDirective | blankLine)* Metadata? RecipeItem*

RecipeItem = Section | MetadataDirective | Note | CommentLine | blankLine | Step

Step = StepLine+

StepItem = Ingredient | Cookware | Timer | Text
```

A recipe starts with optional leading directives, an optional YAML metadata block, then zero or more items. Items can be sections, directives, notes, comments, blank lines, or steps. Steps are one or more lines, each containing ingredients, cookware, timers, or plain text.

### Key Grammar Decisions

**Text uses negative lookahead.** The `Text` rule matches any character that isn't the start of a special token:

```
Text = (~("@" &ingredientStartChar | "#" &cookwareStartChar | "~" &wordChar | ...) any)+
```

This means `@` alone isn't special -- it only starts an ingredient when followed by a word character. Regular `@` in text is preserved as-is.

**Comments need a space.** `"-- "` (with space) starts a comment, but `"--"` (without space) is plain text. This prevents `---` YAML front matter fences from being parsed as comments.

**Directives are in-grammar.** The `MetadataDirective` rule matches `>> key: value` lines directly in the grammar (not pre-processed). `StepLine` has a `~MetadataDirective` negative lookahead to prevent multi-line steps from consuming directive lines.

**Word characters include unicode.** The `wordChar` rule supports Latin extended, Cyrillic, and emoji characters:

```
wordChar = letter | digit | "_" | "-" | emoji | otherWordChar
```

## Semantic Actions

After Ohm produces a parse tree, semantic actions transform each node. These are defined in `src/parser/ohm-ast.ts`:

```ts
Ingredient_multi(...) {
  return attachRaw(buildIngredient(rawName, amount, note), this.sourceString)
}
```

The semantic action receives matched grammar elements and constructs typed step items directly, while preserving raw text for fallback/text modes.

### Token Parsing in TypeScript

A deliberate design choice: the grammar captures **token boundaries** (where an ingredient starts and ends), but the **content parsing and behavior rules** happen in TypeScript helpers. This keeps the grammar simple and makes behavior easier to test independently.

Key helpers by layer:

| Function | Purpose |
|----------|---------|
| `buildIngredient()` | Build normalized ingredient items from grammar captures |
| `buildCookware()` | Build normalized cookware items from grammar captures |
| `parseQuantity()` | Parse numeric strings, fractions (`1/2` -> `0.5`), decimals |
| `parseYamlFrontmatter()` | Parse and validate YAML frontmatter with fallback parsing |
| `applyAdvancedUnits()` | Split `"7 k"` into quantity + unit in `extensions: "all"` |
| `applyInlineQuantityExtraction()` | Extract inline quantities from text in `extensions: "all"` |
| `checkStandardMetadata()` | Validate standard metadata key types (cooklang-rs parity) |
| `collectUniqueFromSteps()` | Deduplicate items across all section steps |

## The `parseCooklang` Function

The exported `parseCooklang()` function orchestrates the full pipeline:

1. **Strip block comments** -- `[- ... -]` block comments are replaced with spaces (preserving offsets)
2. **Grammar match + semantic AST** -- Ohm parses source and `toAST` builds ordered semantic items
3. **YAML front matter** -- If present, parsed with the `yaml` library
4. **Metadata assembly** -- Frontmatter data merged with old-style directives when applicable (in canonical mode, directives only populate metadata when no frontmatter; with frontmatter they are treated as regular text lines unless they are special mode directives in `extensions: "all"`).
5. **Step transformations** -- Extension behavior and validation passes run on step items
6. **Section building** -- Ordered semantic items are assembled into `RecipeSection[]` with interleaved steps and notes; empty implicit sections are filtered out
7. **Deduplication** -- Ingredients, cookware, and timers are collected and deduplicated across all sections
8. **Return** -- A single `CooklangRecipe` object with all parsed data

## File Map

| File | Purpose |
|------|---------|
| `grammars/cooklang.ohm` | PEG grammar definition |
| `src/parser/ohm-ast.ts` | Ohm grammar binding and semantic actions (`toAST`) |
| `src/parse-cooklang.ts` | Manual pipeline orchestration and final assembly |
| `src/parser/*.ts` | Focused helpers for metadata, frontmatter, transforms, and utilities |
| `src/semantics.ts` | Backward-compatible re-export facade |
| `src/types.ts` | TypeScript type definitions |
| `src/index.ts` | Public API exports |
