# cooklang-parse

> A simple, type-safe [Cooklang](https://cooklang.org) parser built with [Ohm.js](https://ohmjs.org)

[![npm version](https://img.shields.io/npm/v/cooklang-parse)](https://www.npmjs.com/package/cooklang-parse)
[![CI](https://github.com/briansunter/cooklang-parse/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/briansunter/cooklang-parse/actions/workflows/ci.yml)
[![coverage](https://img.shields.io/badge/coverage-99%25-brightgreen)](https://github.com/briansunter/cooklang-parse)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- Full Cooklang spec support including ingredients, cookware, timers, metadata, sections, notes, and YAML frontmatter
- Written in TypeScript with exported type definitions
- Single function API with extension presets — `parseCooklang(source, options?)`
- 235 tests with parity coverage against [cooklang-rs](https://github.com/cooklang/cooklang-rs) canonical and default parser behaviors
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
recipe.inlineQuantities // [] in canonical mode
recipe.errors      // [] (parse errors and warnings)

// Steps are organized into sections:
recipe.sections[0].name    // null (default unnamed section)
recipe.sections[0].content // array of { type: "step", items: [...] } and { type: "text", value: "..." }

// Each step contains ordered text + inline component tokens:
const step = recipe.sections[0].content[0] // { type: "step", items: [...] }
step.items
// [
//   { type: "text", value: "Preheat " },
//   { type: "cookware", name: "oven", quantity: 1, units: "" },
//   { type: "text", value: " to 180C." }
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
| `@name{=qty%unit}` | Fixed quantity (won't scale) | `@salt{=1%tsp}` |
| `@name{qty}(note)` | Ingredient with note | `@flour{100%g}(sifted)` |
| `#name(note)` | Cookware with note | `#pan(large)` |
| `@name\|alias{}` | Pipe alias syntax | `@ground beef\|beef{}` |

## API

### `parseCooklang(source: string, options?: ParseCooklangOptions): CooklangRecipe`

Parses a Cooklang source string into a structured recipe object.

```typescript
interface ParseCooklangOptions {
  extensions?: "canonical" | "all" // default: "canonical"
}
```

- `"canonical"`: canonical/spec behavior (extensions off)
- `"all"`: cooklang-rs default behavior (modes + inline temperature quantities)

```typescript
interface CooklangRecipe {
  metadata: Record<string, unknown>
  sections: RecipeSection[]        // Sections with interleaved steps and notes
  ingredients: RecipeIngredient[]  // Deduplicated across all steps
  cookware: RecipeCookware[]       // Deduplicated across all steps
  timers: RecipeTimer[]            // Deduplicated across all steps
  inlineQuantities: Array<{ quantity: number | string; units: string }>
  errors: ParseError[]
  warnings: ParseError[]
}

interface RecipeSection {
  name: string | null              // null for the default unnamed section
  content: SectionContent[]
}

type SectionContent =
  | { type: "step"; items: RecipeStepItem[]; number?: number }
  | { type: "text"; value: string }          // Notes (> lines)
```

**`sections`** contains all recipe content. Each section has a `name` (null for the default section) and `content` — an interleaved array of steps and text (notes). Steps contain ordered `RecipeStepItem[]` arrays with text and typed tokens in document order.

**`ingredients`**, **`cookware`**, and **`timers`** are deduplicated across all steps.

### Types

```typescript
type RecipeStepItem =
  | { type: "text"; value: string }
  | RecipeIngredient
  | RecipeCookware
  | RecipeTimer

interface RecipeIngredient {
  type: "ingredient"
  name: string
  alias?: string            // from @name|alias{} syntax
  quantity: number | string
  units: string             // only % separator: @name{qty%unit}
  fixed: boolean
  note?: string             // from @name{}(note) syntax
}

interface RecipeCookware {
  type: "cookware"
  name: string
  alias?: string
  quantity: number | string
  units: string             // always ""
  note?: string             // from #name(note) syntax
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
servings: 2
---

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

recipe.sections.map(s => s.name)
// [null, "Starter", "Dough"]

recipe.ingredients.map(i => `${i.quantity} ${i.units} ${i.name}`.trim())
// ["100 g starter", "100 g water", "500 g flour", ...]
```

> **Note:** With YAML frontmatter (`---`), non-special `>> key: value` lines are treated as regular step text (matching [cooklang-rs](https://github.com/cooklang/cooklang-rs)). In `{ extensions: "all" }`, `[mode]/[define]/[duplicate]` directives still apply as configuration.

## Development

```bash
bun install          # Install dependencies
bun test             # Run all 235 tests
bun run build        # Bundle + emit declarations
bun run typecheck    # Type-check without emitting
bun run lint         # Lint with Biome
```

## License

[MIT](LICENSE)
