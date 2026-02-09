# How It Works

cooklang-parse is built on [Ohm.js](https://ohmjs.org), a parsing framework for JavaScript and TypeScript. This page explains the parser architecture for contributors and anyone curious about the internals.

## Architecture Overview

The parser follows a single clean pipeline:

```
Source Text
    |
    v
[1] Pre-processing (extract >> directives)
    |
    v
[2] Ohm Grammar (PEG parsing -> parse tree)
    |
    v
[3] Semantic Actions (parse tree -> CooklangRecipe)
    |- Parse quantities to numbers (fractions, decimals)
    |- Split amounts on % into quantity + units
    |- Merge consecutive text items (multi-line steps)
    |- Deduplicate ingredients, cookware, timers
```

Everything happens in a single file (`src/semantics.ts`). There is no separate converter or AST layer -- the Ohm semantic actions directly produce `CooklangRecipe` output.

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
Recipe = Metadata? RecipeItem*

RecipeItem = Section | Note | BlockComment | CommentLine | blankLine | Step

Step = StepLine+

StepItem = Ingredient | Cookware | Timer | Text
```

A recipe is an optional metadata block followed by zero or more items. Items can be sections, notes, comments, blank lines, or steps. Steps are one or more lines, each containing ingredients, cookware, timers, or plain text.

### Key Grammar Decisions

**Text uses negative lookahead.** The `Text` rule matches any character that isn't the start of a special token:

```
Text = (~("@" &ingredientStartChar | "#" &cookwareStartChar | "~" &wordChar | ...) any)+
```

This means `@` alone isn't special -- it only starts an ingredient when followed by a word character. Regular `@` in text is preserved as-is.

**Comments need a space.** `"-- "` (with space) starts a comment, but `"--"` (without space) is plain text. This prevents `---` YAML front matter fences from being parsed as comments.

**Word characters include unicode.** The `wordChar` rule supports Latin extended, Cyrillic, and emoji characters:

```
wordChar = letter | digit | "_" | "-" | emoji | otherWordChar
```

## Semantic Actions

After Ohm produces a parse tree, semantic actions transform each node. These are defined in `src/semantics.ts`:

```ts
Ingredient(_child) {
  return convertIngredient(src(this))
}
```

The semantic action receives the matched grammar elements. The `convertIngredient` helper does the actual work of extracting name, quantity, unit, and preparation from the matched text.

### Token Parsing in TypeScript

A deliberate design choice: the grammar captures **token boundaries** (where an ingredient starts and ends), but the **content parsing** (splitting `{250%g}` into quantity `250` and unit `g`) happens in TypeScript helper functions. This keeps the grammar simple and makes the parsing logic easy to test independently.

Key helpers in `src/semantics.ts`:

| Function | Purpose |
|----------|---------|
| `parseQuantity()` | Parse numeric strings, fractions (`1/2` -> `0.5`), decimals |
| `parseAmount()` | Split `qty%unit` or `qty unit` into quantity + units |
| `convertIngredient()` | Extract name, amount, fixed flag, preparation from `@token` |
| `convertCookware()` | Extract name and quantity from `#token` |
| `convertTimer()` | Extract name, quantity, units from `~token` |
| `mergeConsecutiveTexts()` | Join adjacent text items (multi-line steps) |
| `collectUnique()` | Deduplicate items across steps |

## The `parseCooklang` Function

The exported `parseCooklang()` function orchestrates the full pipeline:

1. **Extract directives** -- `>> key: value` lines are pulled out before grammar parsing
2. **Grammar match** -- Ohm parses the stripped source against `cooklang.ohm`
3. **Semantic evaluation** -- The `toAST` operation walks the parse tree, producing steps, sections, and notes
4. **YAML front matter** -- If present, parsed and merged with directive metadata
5. **Deduplication** -- Ingredients, cookware, and timers are collected and deduplicated across all steps
6. **Return** -- A single `CooklangRecipe` object with all parsed data

## File Map

| File | Purpose |
|------|---------|
| `grammars/cooklang.ohm` | PEG grammar definition |
| `src/semantics.ts` | Ohm semantic actions, token parsing helpers, and `parseCooklang()` |
| `src/types.ts` | TypeScript type definitions |
| `src/index.ts` | Public API exports |
