# cooklang-parse

**Type-Safe Cooklang Parser** -- Parse Cooklang recipes into structured data with a simple, well-tested TypeScript API powered by Ohm.js.

[Get Started](/guide/getting-started) | [API Reference](/reference/) | [View on GitHub](https://github.com/briansunter/cooklang-parse)

## Quick Start

Install with your package manager:

::: code-group

```sh [bun]
bun add cooklang-parse
```

```sh [npm]
npm install cooklang-parse
```

```sh [pnpm]
pnpm add cooklang-parse
```

:::

Parse a recipe:

```ts
import { parseCooklang } from "cooklang-parse"
import type { CooklangRecipe, RecipeStepItem } from "cooklang-parse"

const recipe: CooklangRecipe = parseCooklang(`
Mix @flour{250%g} and @eggs{3} into a bowl.

Cook in #pan{} for ~{20%minutes}.
`)

recipe.ingredients
// [
//   { type: "ingredient", name: "flour", quantity: 250, units: "g", fixed: false },
//   { type: "ingredient", name: "eggs", quantity: 3, units: "", fixed: false }
// ]

recipe.cookware  // [{ type: "cookware", name: "pan", quantity: 1, units: "" }]
recipe.timers    // [{ type: "timer", name: "", quantity: 20, units: "minutes" }]

// Steps are organized into sections
const step = recipe.sections[0].content[0] // { type: "step", items: [...] }
const items: RecipeStepItem[] = step.items
// [
//   { type: "text", value: "Mix " },
//   { type: "ingredient", name: "flour", quantity: 250, units: "g", fixed: false },
//   { type: "text", value: " and " },
//   { type: "ingredient", name: "eggs", quantity: 3, units: "", fixed: false },
//   { type: "text", value: " into a bowl." },
// ]
```

## Features

- **Full Cooklang Support** -- Parses ingredients, cookware, timers, metadata, sections, notes, comments, and all Cooklang syntax including multi-word names and unicode.
- **Sections** -- Recipe content is organized into `RecipeSection[]` with interleaved steps and text (notes), matching the cooklang-rs reference implementation.
- **Ordered Step Items** -- Steps are `RecipeStepItem[]` arrays with text interleaved with typed tokens, so you can render inline ingredient links, timer highlights, etc.
- **Numeric Quantities** -- Quantities are parsed to numbers when possible (`250` not `"250"`, fractions like `1/2` become `0.5`).
- **Type-Safe** -- Complete TypeScript type definitions for every output type: `CooklangRecipe`, `RecipeSection`, `RecipeIngredient`, `RecipeCookware`, `RecipeTimer`, `ParseError`.
- **Spec Compliant** -- 235 tests with canonical and default-parser parity checks against the official cooklang-rs reference implementation.
