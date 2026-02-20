# Types

All types are exported from `cooklang-parse` and available for import:

```ts
import type {
  CooklangRecipe,
  RecipeSection,
  SectionContent,
  RecipeStepItem,
  RecipeIngredient,
  RecipeCookware,
  RecipeTimer,
  RecipeInlineQuantity,
  RecipeModifiers,
  IngredientRelation,
  ComponentRelation,
  IngredientReferenceTarget,
  ParseCooklangOptions,
  ParseError,
  SourcePosition,
} from "cooklang-parse"
```

## CooklangRecipe

The top-level result returned by `parseCooklang()`.

```ts
interface CooklangRecipe {
  metadata: Record<string, unknown>  // YAML front matter or >> directives
  sections: RecipeSection[]          // Sections with interleaved steps and notes
  ingredients: RecipeIngredient[]    // Deduplicated across all steps
  cookware: RecipeCookware[]         // Deduplicated across all steps
  timers: RecipeTimer[]              // Deduplicated across all steps
  inlineQuantities: RecipeInlineQuantity[] // Inline temperature quantities (extensions: "all")
  errors: ParseError[]               // Parse errors
  warnings: ParseError[]             // Parse warnings (e.g. invalid YAML)
}
```

## RecipeSection

A named or unnamed section of the recipe containing interleaved steps and text blocks.

```ts
interface RecipeSection {
  name: string | null       // null for the default unnamed section
  content: SectionContent[]
}
```

## SectionContent

A discriminated union for items inside a section.

```ts
type SectionContent =
  | { type: "step"; items: RecipeStepItem[]; number?: number }
  | { type: "text"; value: string }           // Notes (> lines)
```

## RecipeStepItem

A union type representing one element in a step. Steps are `RecipeStepItem[]` arrays where text and typed tokens alternate in document order.

```ts
type RecipeStepItem =
  | { type: "text"; value: string }
  | RecipeIngredient
  | RecipeCookware
  | RecipeTimer
  | { type: "inline_quantity"; index: number }
```

## RecipeIngredient

```ts
interface RecipeIngredient {
  type: "ingredient"
  name: string                 // e.g. "flour", "olive oil"
  alias?: string               // from @name|alias{} syntax
  quantity: number | string    // Numeric when possible, "some" if omitted
  units: string                // e.g. "g", "tbsp", "" if none (only % separator)
  fixed: boolean               // true if quantity doesn't scale ({=qty})
  note?: string                // e.g. "sifted", "chopped" from (note) suffix
  modifiers: RecipeModifiers   // e.g. @, &, -, ?, +
  relation: IngredientRelation // Tracks definitions and component references
}
```

## RecipeCookware

```ts
interface RecipeCookware {
  type: "cookware"
  name: string                 // e.g. "pan", "mixing bowl"
  alias?: string               // from #name|alias{} syntax
  quantity: number | string    // Defaults to 1
  units: string                // Always ""
  note?: string                // from #name(note) suffix
  modifiers: RecipeModifiers   // e.g. @, &, -, ?, +
  relation: ComponentRelation  // Tracks definitions and component references
}
```

## RecipeModifiers

Cooklang components support single-character modifiers positioned immediately after the token marker, e.g. `@@name`, `@?name`.

```ts
interface RecipeModifiers {
  recipe?: boolean   // @ (Another recipe)
  reference?: boolean // & (Reference to previous definition)
  hidden?: boolean   // - (Hidden component)
  optional?: boolean // ? (Optional component)
  new?: boolean      // + (Force new component definition)
}
```

## IngredientRelation & ComponentRelation

Cooklang keeps track of definitions and references (`&` modifier) so that you know where an ingredient first appeared. Definitions are mapped step-by-step from their initial occurrence to each subsequent re-use reference. 

```ts
type ComponentRelation =
  | { type: "definition"; referencedFrom: number[]; definedInStep: boolean }
  | { type: "reference"; referencesTo: number }

type IngredientReferenceTarget = "ingredient" | "step" | "section"

interface IngredientRelation {
  type: "definition" | "reference"
  referencedFrom?: number[]
  definedInStep?: boolean
  referencesTo?: number
  referenceTarget?: IngredientReferenceTarget // Currently "ingredient"
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

## RecipeInlineQuantity

```ts
interface RecipeInlineQuantity {
  quantity: number | string
  units: string
}
```

## ParseCooklangOptions

```ts
interface ParseCooklangOptions {
  extensions?: "canonical" | "all" // default: "canonical"
}
```

## ParseError

```ts
interface ParseError {
  message: string
  shortMessage?: string
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
