# Getting Started

## Installation

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

```sh [yarn]
yarn add cooklang-parse
```

:::

## Parse Your First Recipe

The main entry point is `parseCooklang`. It takes a Cooklang string and returns a `CooklangRecipe`.

```ts
import { parseCooklang } from "cooklang-parse"
import type { CooklangRecipe } from "cooklang-parse"

const recipe: CooklangRecipe = parseCooklang(`
Mix @flour{250%g} and @eggs{3}.
Cook in #pan for ~{20%minutes}.
`)
```

The result contains everything extracted from the recipe:

```ts
recipe.ingredients
// [
//   { type: "ingredient", name: "flour", quantity: 250, units: "g", fixed: false },
//   { type: "ingredient", name: "eggs", quantity: 3, units: "", fixed: false }
// ]

recipe.cookware    // [{ type: "cookware", name: "pan", quantity: 1, units: "" }]
recipe.timers      // [{ type: "timer", name: "", quantity: 20, units: "minutes" }]
```

### Ordered Step Items

Each step is a `RecipeStepItem[]` -- a flat array of text and typed tokens in document order. This lets you render rich step text with inline ingredient links, timer highlights, etc.

```ts
import type { RecipeStepItem } from "cooklang-parse"

const step: RecipeStepItem[] = recipe.steps[0]
// [
//   { type: "text", value: "Mix " },
//   { type: "ingredient", name: "flour", quantity: 250, units: "g", fixed: false },
//   { type: "text", value: " and " },
//   { type: "ingredient", name: "eggs", quantity: 3, units: "", fixed: false },
//   { type: "text", value: ". Cook in " },
//   { type: "cookware", name: "pan", quantity: 1, units: "" },
//   { type: "text", value: " for " },
//   { type: "timer", name: "", quantity: 20, units: "minutes" },
//   { type: "text", value: "." },
// ]
```

### Rendering Steps

Use the `RecipeStepItem` union type to switch on `type` and render each token:

```ts
import type { RecipeStepItem } from "cooklang-parse"

function renderStep(step: RecipeStepItem[]): string {
  return step.map(item => {
    switch (item.type) {
      case "text":
        return item.value
      case "ingredient":
        return `<strong>${item.name}</strong>`
      case "cookware":
        return `<em>${item.name}</em>`
      case "timer":
        return `<time>${item.quantity} ${item.units}</time>`
    }
  }).join("")
}
```

## Key Types

All types are exported and available for import:

```ts
import type {
  CooklangRecipe,     // Top-level result from parseCooklang()
  RecipeStepItem,     // Union: text | ingredient | cookware | timer
  RecipeIngredient,   // { name, quantity, units, fixed, preparation? }
  RecipeCookware,     // { name, quantity, units }
  RecipeTimer,        // { name, quantity, units }
  ParseError,         // { message, position, severity }
} from "cooklang-parse"
```

See the full [Types reference](/reference/types) for details on each type.

## Add Metadata

Recipes can include YAML front matter or directive-style metadata:

::: code-group

```txt [YAML Front Matter]
---
title: Easy Pancakes
servings: 4
tags: [breakfast, quick]
---

Mix @flour{250%g} with @milk{300%ml}.
```

```txt [Directives]
>> title: Easy Pancakes
>> servings: 4

Mix @flour{250%g} with @milk{300%ml}.
```

:::

Both styles are parsed into `recipe.metadata`:

```ts
recipe.metadata.title    // "Easy Pancakes"
recipe.metadata.servings // 4
```

## Organize with Sections

Use `==Section Name==` to divide a recipe into logical parts:

```txt
== Dough ==
Mix @flour{500%g} and @water{300%ml}.
Knead for ~{10%minutes}.

== Filling ==
Combine @ricotta{250%g} and @spinach{200%g}.

== Assembly ==
Fill the dough and bake in #oven for ~{25%minutes}.
```

```ts
recipe.sections // ["Dough", "Filling", "Assembly"]
```

## Next Steps

- Learn the full [Cooklang Syntax](/guide/cooklang-syntax)
- See all supported [Syntax Features](/guide/syntax-features)
- Check the [API Reference](/reference/) for all functions and types
