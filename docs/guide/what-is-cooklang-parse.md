# What is cooklang-parse?

**cooklang-parse** is a TypeScript parser for the [Cooklang](https://cooklang.org) recipe markup language. It takes plain-text recipes written in Cooklang syntax and transforms them into structured data you can use in your applications.

## Why Cooklang?

Cooklang is a markup language designed specifically for writing recipes. Instead of storing recipes in a database or a complex format, you write them as plain text with a few special characters:

```
Mix @flour{250%g} and @eggs{3} in a #bowl.
Cook in #pan for ~{20%minutes}.
```

The `@` marks ingredients, `#` marks cookware, and `~` marks timers. That's the core of it.

## Why this parser?

- **Simple API** - One function call to parse a recipe into structured data with ordered step items
- **Ordered items** - Steps contain text interleaved with typed tokens, so you can render rich step text with inline links
- **Numeric quantities** - Quantities are parsed to numbers when possible (`250` not `"250"`, `1/2` becomes `0.5`)
- **Spec-compliant** - Verified against the official reference implementation with 57+ canonical test cases
- **Type-safe** - Full TypeScript types for every piece of parsed data
- **Zero config** - Works out of the box with Bun, Node.js, or any bundler

## Quick Example

```ts
import { parseCooklang } from "cooklang-parse"

const recipe = parseCooklang(`
---
title: Scrambled Eggs
servings: 2
---

Crack @eggs{4} into a #bowl and whisk.
Melt @butter{1%tbsp} in a #non-stick pan{} over medium heat.
Pour in eggs and stir for ~{3%minutes}.
`)

console.log(recipe.metadata.title)  // "Scrambled Eggs"
console.log(recipe.ingredients)
// [
//   { type: "ingredient", name: "eggs", quantity: 4, units: "", fixed: false },
//   { type: "ingredient", name: "butter", quantity: 1, units: "tbsp", fixed: false }
// ]
console.log(recipe.cookware)
// [
//   { type: "cookware", name: "bowl", quantity: 1, units: "" },
//   { type: "cookware", name: "non-stick pan", quantity: 1, units: "" }
// ]
console.log(recipe.timers)
// [{ type: "timer", name: "", quantity: 3, units: "minutes" }]

// Steps are ordered arrays — render rich text with inline ingredient links
recipe.steps[0]
// [
//   { type: "text", value: "Crack " },
//   { type: "ingredient", name: "eggs", quantity: 4, units: "", fixed: false },
//   { type: "text", value: " into a " },
//   { type: "cookware", name: "bowl", quantity: 1, units: "" },
//   { type: "text", value: " and whisk." },
// ]
```
