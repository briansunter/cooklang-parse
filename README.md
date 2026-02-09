# cooklang-parse

> A simple, type-safe [Cooklang](https://cooklang.org) parser built with [Ohm.js](https://ohmjs.org)

[![npm version](https://img.shields.io/npm/v/cooklang-parse)](https://www.npmjs.com/package/cooklang-parse)
[![CI](https://github.com/briansunter/cooklang-parse/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/briansunter/cooklang-parse/actions/workflows/ci.yml)
[![coverage](https://img.shields.io/badge/coverage-99%25-brightgreen)](https://github.com/briansunter/cooklang-parse)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- Full Cooklang spec support including ingredients, cookware, timers, metadata, sections, notes, and YAML frontmatter
- Written in TypeScript with exported type definitions
- Single function API — `parseCooklang(source)` returns a structured recipe
- 188 tests with canonical parity against the [Rust reference implementation](https://github.com/cooklang/cooklang-rs)
- Source position tracking and parse error reporting

## Installation

```bash
npm install cooklang-parse
# or
bun add cooklang-parse
```

## Quick Start

```typescript
import { parseCooklang } from "cooklang-parse"

const recipe = parseCooklang(`
>> servings: 4

Preheat #oven to 180C.
Mix @flour{250%g} and @eggs{3} in a #bowl{}.
Bake for ~{20%minutes}.
`)

recipe.metadata    // { servings: 4 }
recipe.ingredients // [{ type: "ingredient", name: "flour", quantity: 250, units: "g", fixed: false }, ...]
recipe.cookware    // [{ type: "cookware", name: "oven", quantity: 1, units: "" }, ...]
recipe.timers      // [{ type: "timer", name: "", quantity: 20, units: "minutes" }]
recipe.errors      // [] (parse errors and warnings)

// Each step is an array of text and inline component tokens:
recipe.steps[0]
// [
//   { type: "text", value: "Preheat " },
//   { type: "cookware", name: "oven", quantity: 1, units: "" },
//   { type: "text", value: " to 180C." }
// ]

recipe.steps[1]
// [
//   { type: "text", value: "Mix " },
//   { type: "ingredient", name: "flour", quantity: 250, units: "g", fixed: false },
//   { type: "text", value: " and " },
//   { type: "ingredient", name: "eggs", quantity: 3, units: "", fixed: false },
//   { type: "text", value: " in a " },
//   { type: "cookware", name: "bowl", quantity: 1, units: "" },
//   { type: "text", value: "." }
// ]

recipe.steps[2]
// [
//   { type: "text", value: "Bake for " },
//   { type: "timer", name: "", quantity: 20, units: "minutes" },
//   { type: "text", value: "." }
// ]
```

## Cooklang Syntax

| Syntax | Description | Example |
|--------|-------------|---------|
| `@name{qty%unit}` | Ingredient with quantity and unit | `@flour{250%g}` |
| `@name{qty}` | Ingredient with quantity only | `@eggs{3}` |
| `@name` | Ingredient (implicit "some") | `@salt` |
| `@name{}` | Multi-word ingredient | `@olive oil{}` |
| `#name{}` | Cookware | `#cast iron skillet{}` |
| `~name{qty%unit}` | Named timer | `~resting{30%minutes}` |
| `~{qty%unit}` | Anonymous timer | `~{20%minutes}` |
| `-- comment` | Inline comment (space required after `--`) | `-- note to self` |
| `[- text -]` | Block comment | `[- Chef's tip -]` |
| `> text` | Note | `> Serve immediately` |
| `== Title ==` | Section header | `== For the sauce ==` |
| `>> key: value` | Metadata directive | `>> servings: 4` |
| `---` | YAML frontmatter block | See below |
| `=@name{qty}` | Fixed quantity (won't scale) | `=@salt{1%tsp}` |
| `@name{=qty}` | Fixed quantity (alternate) | `@salt{=1%tsp}` |
| `@name{}(prep)` | Ingredient with preparation | `@flour{100%g}(sifted)` |
| `@name\|alias{}` | Pipe alias syntax | `@ground beef\|beef{}` |

## API

### `parseCooklang(source: string): CooklangRecipe`

Parses a Cooklang source string into a structured recipe object.

```typescript
interface CooklangRecipe {
  metadata: Record<string, unknown>
  steps: RecipeStepItem[][]
  ingredients: RecipeIngredient[]
  cookware: RecipeCookware[]
  timers: RecipeTimer[]
  sections: string[]
  notes: string[]
  errors: ParseError[]
}
```

**`steps`** is an array of steps, where each step is an array of items:

```typescript
type RecipeStepItem =
  | { type: "text"; value: string }
  | RecipeIngredient
  | RecipeCookware
  | RecipeTimer
```

**`ingredients`**, **`cookware`**, and **`timers`** are deduplicated across all steps.

### Types

```typescript
interface RecipeIngredient {
  type: "ingredient"
  name: string
  quantity: number | string
  units: string
  fixed: boolean
  preparation?: string
}

interface RecipeCookware {
  type: "cookware"
  name: string
  quantity: number | string
  units: string
}

interface RecipeTimer {
  type: "timer"
  name: string
  quantity: number | string
  units: string
}

interface ParseError {
  message: string
  shortMessage?: string
  position: { line: number; column: number; offset: number }
  severity: "error" | "warning"
}
```

### Grammar Access

The underlying Ohm.js grammar is exported for advanced use cases:

```typescript
import { grammar } from "cooklang-parse"

const match = grammar.match(source)
```

## Example: Recipe with Frontmatter and Sections

```typescript
const recipe = parseCooklang(`
---
title: Sourdough Bread
source: My grandmother
---

>> servings: 2

== Starter ==
Mix @starter{100%g} with @water{100%g}
Let ferment for ~{8%hours}

== Dough ==
Combine @flour{500%g} and @water{325%g}
Add @starter{200%g} and @salt{10%g}
Knead in #mixing bowl{} for ~kneading{10%minutes}
`)

recipe.metadata
// { title: "Sourdough Bread", source: "My grandmother", servings: 2 }

recipe.sections
// ["Starter", "Dough"]

recipe.ingredients.map(i => `${i.quantity} ${i.units} ${i.name}`.trim())
// ["100 g starter", "100 g water", "500 g flour", ...]
```

## Development

```bash
bun install          # Install dependencies
bun test             # Run all 188 tests
bun run build        # Bundle + emit declarations
bun run typecheck    # Type-check without emitting
bun run lint         # Lint with Biome
```

## License

[MIT](LICENSE)
