# API Reference

## Exports

| Export | Type | Description |
|--------|------|-------------|
| [`parseCooklang()`](/reference/parse-cooklang) | `(source: string) => CooklangRecipe` | Parse a Cooklang string into a structured recipe |
| `grammar` | `Ohm.Grammar` | The raw Ohm grammar object for advanced use |

## Types

All types are re-exported and available for import:

```ts
import type {
  CooklangRecipe,
  RecipeStepItem,
  RecipeIngredient,
  RecipeCookware,
  RecipeTimer,
  ParseError,
  SourcePosition,
} from "cooklang-parse"
```

See the full [Types](/reference/types) reference.

## Quick Example

```ts
import { parseCooklang } from "cooklang-parse"

const recipe = parseCooklang(`Add @flour{250%g} to #bowl.`)

recipe.ingredients  // [{ type: "ingredient", name: "flour", quantity: 250, units: "g", fixed: false }]
recipe.cookware     // [{ type: "cookware", name: "bowl", quantity: 1, units: "" }]
recipe.steps[0]     // [{ type: "text", value: "Add " }, { type: "ingredient", ... }, ...]
```
