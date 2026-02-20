export interface SourcePosition {
  line: number
  column: number
  offset: number
}

export interface ParseError {
  message: string
  shortMessage?: string
  position: SourcePosition
  severity: "error" | "warning"
  help?: string
}

export interface ParseCooklangOptions {
  /**
   * Parser behavior preset:
   * - "canonical": canonical/spec-oriented behavior (extensions off)
   * - "all": cooklang-rs default behavior (extensions on)
   */
  extensions?: "canonical" | "all"
}

export type SectionContent =
  | { type: "step"; items: RecipeStepItem[]; number?: number }
  | { type: "text"; value: string }

export interface RecipeSection {
  name: string | null
  content: SectionContent[]
}

export interface CooklangRecipe {
  metadata: Record<string, unknown>
  sections: RecipeSection[]
  ingredients: RecipeIngredient[]
  cookware: RecipeCookware[]
  timers: RecipeTimer[]
  inlineQuantities: RecipeInlineQuantity[]
  errors: ParseError[]
  warnings: ParseError[]
}

export type RecipeStepItem =
  | { type: "text"; value: string }
  | RecipeIngredient
  | RecipeCookware
  | RecipeTimer
  | { type: "inline_quantity"; index: number }

export type ComponentRelation =
  | { type: "definition"; referencedFrom: number[]; definedInStep: boolean }
  | { type: "reference"; referencesTo: number }

export type IngredientReferenceTarget = "ingredient" | "step" | "section"

export interface IngredientRelation {
  type: "definition" | "reference"
  referencedFrom?: number[]
  definedInStep?: boolean
  referencesTo?: number
  referenceTarget?: IngredientReferenceTarget
}

export interface RecipeModifiers {
  recipe?: boolean // @
  reference?: boolean // &
  hidden?: boolean // -
  optional?: boolean // ?
  new?: boolean // +
}

export interface RecipeIngredient {
  type: "ingredient"
  name: string
  alias?: string
  quantity: number | string
  units: string
  fixed: boolean
  note?: string
  modifiers: RecipeModifiers
  relation: IngredientRelation
}

export interface RecipeCookware {
  type: "cookware"
  name: string
  alias?: string
  quantity: number | string
  units: string
  note?: string
  modifiers: RecipeModifiers
  relation: ComponentRelation
}

export interface RecipeTimer {
  type: "timer"
  name: string
  quantity: number | string
  units: string
}

export interface RecipeInlineQuantity {
  quantity: number | string
  units: string
}
