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

// Steps are ordered arrays -- text interleaved with typed tokens
const step: RecipeStepItem[] = recipe.steps[0]
// [
//   { type: "text", value: "Mix " },
//   { type: "ingredient", name: "flour", quantity: 250, units: "g", fixed: false },
//   { type: "text", value: " and " },
//   { type: "ingredient", name: "eggs", quantity: 3, units: "", fixed: false },
//   { type: "text", value: " into a bowl. Cook in " },
//   { type: "cookware", name: "pan", quantity: 1, units: "" },
//   { type: "text", value: " for " },
//   { type: "timer", name: "", quantity: 20, units: "minutes" },
//   { type: "text", value: "." },
// ]
```

## Features

- **Full Cooklang Support** -- Parses ingredients, cookware, timers, metadata, sections, notes, comments, and all Cooklang syntax including multi-word names and unicode.
- **Ordered Step Items** -- Steps are `RecipeStepItem[]` arrays with text interleaved with typed tokens, so you can render inline ingredient links, timer highlights, etc.
- **Numeric Quantities** -- Quantities are parsed to numbers when possible (`250` not `"250"`, fractions like `1/2` become `0.5`).
- **Type-Safe** -- Complete TypeScript type definitions for every output type: `CooklangRecipe`, `RecipeIngredient`, `RecipeCookware`, `RecipeTimer`, `ParseError`.
- **Spec Compliant** -- 57+ canonical test cases verified against the official cooklang-rs reference implementation. 134 tests with 99.94% line coverage.
