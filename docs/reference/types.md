# Types

All types are exported from `cooklang-parse` and available for import:

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

## CooklangRecipe

The top-level result returned by `parseCooklang()`.

```ts
interface CooklangRecipe {
  metadata: Record<string, unknown>  // YAML front matter + >> directives
  steps: RecipeStepItem[][]          // Ordered text + tokens per step
  ingredients: RecipeIngredient[]    // Deduplicated across all steps
  cookware: RecipeCookware[]         // Deduplicated across all steps
  timers: RecipeTimer[]              // Deduplicated across all steps
  sections: string[]                 // Section names from == headers
  notes: string[]                    // Lines starting with >
  errors: ParseError[]               // Parse errors and warnings
}
```

## RecipeStepItem

A union type representing one element in a step. Steps are `RecipeStepItem[]` arrays where text and typed tokens alternate in document order.

```ts
type RecipeStepItem =
  | { type: "text"; value: string }
  | RecipeIngredient
  | RecipeCookware
  | RecipeTimer
```

## RecipeIngredient

```ts
interface RecipeIngredient {
  type: "ingredient"
  name: string                 // e.g. "flour", "olive oil"
  quantity: number | string    // Numeric when possible, "some" if omitted
  units: string                // e.g. "g", "tbsp", "" if none
  fixed: boolean               // true if quantity doesn't scale (=@ or {=qty})
  preparation?: string         // e.g. "sifted", "chopped"
}
```

## RecipeCookware

```ts
interface RecipeCookware {
  type: "cookware"
  name: string                 // e.g. "pan", "mixing bowl"
  quantity: number | string    // Defaults to 1
  units: string                // Always ""
}
```

## RecipeTimer

```ts
interface RecipeTimer {
  type: "timer"
  name: string                 // "" if unnamed (~{qty%unit})
  quantity: number | string    // e.g. 20, "several"
  units: string                // e.g. "minutes", "hours"
}
```

## ParseError

```ts
interface ParseError {
  message: string
  position: SourcePosition
  severity: "error" | "warning"
}
```

## SourcePosition

```ts
interface SourcePosition {
  line: number
  column: number
  offset: number
}
```
