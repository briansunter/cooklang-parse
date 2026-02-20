# parseCooklang()

Parse a Cooklang source string into a structured recipe with sections, ordered step items, and numeric quantities.

## Signature

```ts
function parseCooklang(
  source: string,
  options?: { extensions?: "canonical" | "all" }
): CooklangRecipe
```

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `source` | `string` | Cooklang recipe source text |
| `options` | `{ extensions?: "canonical" \| "all" }` | Parser preset (`"canonical"` default, or `"all"` for cooklang-rs default extensions) |

## Returns

A [`CooklangRecipe`](/reference/types#cooklangrecipe) object containing all parsed data.

## Example

```ts
import { parseCooklang } from "cooklang-parse"

const recipe = parseCooklang(`
---
title: Toast
---

Spread @butter{1%tbsp} on @bread{2%slices}.
Toast in #toaster for ~{3%minutes}.
`)

recipe.metadata     // { title: "Toast" }

recipe.ingredients
// [
//   { type: "ingredient", name: "butter", quantity: 1, units: "tbsp", fixed: false, modifiers: {...}, relation: {...} },
//   { type: "ingredient", name: "bread", quantity: 2, units: "slices", fixed: false, modifiers: {...}, relation: {...} }
// ]

recipe.cookware     // [{ type: "cookware", name: "toaster", quantity: 1, units: "", modifiers: {...}, relation: {...} }]
recipe.timers       // [{ type: "timer", name: "", quantity: 3, units: "minutes" }]
recipe.inlineQuantities // [] in canonical mode

// Steps are inside sections:
const step = recipe.sections[0].content[0] // { type: "step", items: [...] }
step.items
// [
//   { type: "text", value: "Spread " },
//   { type: "ingredient", name: "butter", quantity: 1, units: "tbsp", fixed: false, modifiers: {...}, relation: {...} },
//   { type: "text", value: " on " },
//   { type: "ingredient", name: "bread", quantity: 2, units: "slices", fixed: false, modifiers: {...}, relation: {...} },
//   { type: "text", value: ". Toast in " },
//   { type: "cookware", name: "toaster", quantity: 1, units: "", modifiers: {...}, relation: {...} },
//   { type: "text", value: " for " },
//   { type: "timer", name: "", quantity: 3, units: "minutes" },
//   { type: "text", value: "." },
// ]

recipe.errors       // []
```

## Behavior

- **Sections** -- Recipe content is organized into `RecipeSection[]`. Each section has a `name` (null for the default unnamed section) and `content` -- an interleaved array of steps and text (notes).
- **Deduplication** -- Ingredients, cookware, and timers are deduplicated across steps. If the same ingredient with the same quantity appears in multiple steps, it appears once in the top-level arrays.
- **Numeric quantities** -- Quantities are parsed to numbers when possible (`250` not `"250"`, fractions like `1/2` become `0.5`). Non-numeric quantities remain strings.
- **Default values** -- Ingredients without a quantity get `"some"`. Cookware defaults to quantity `1`. The `units` field is always present (empty string `""` if no unit).
- **Step structure** -- Each step is a flat `RecipeStepItem[]` array with text and tokens in document order.
- **Metadata** -- In canonical mode, `>> key: value` lines populate metadata only when no frontmatter exists. With frontmatter, non-special `>>` lines are treated as regular text steps.
- **Extensions preset** -- Use `{ extensions: "all" }` to enable cooklang-rs default parser behavior, including `[mode]/[define]/[duplicate]` handling and inline temperature quantities.
- **Quantity separator** -- Only `%` separates quantity from unit: `@flour{250%g}`. Without `%`, the entire brace content is the quantity: `@water{2 cups}` gives `quantity: "2 cups", units: ""`.
