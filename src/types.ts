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
}

export type SectionContent =
  | { type: "step"; items: RecipeStepItem[] }
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
  errors: ParseError[]
  warnings: ParseError[]
}

export type RecipeStepItem =
  | { type: "text"; value: string }
  | RecipeIngredient
  | RecipeCookware
  | RecipeTimer

export interface RecipeIngredient {
  type: "ingredient"
  name: string
  alias?: string
  quantity: number | string
  units: string
  fixed: boolean
  note?: string
}

export interface RecipeCookware {
  type: "cookware"
  name: string
  alias?: string
  quantity: number | string
  units: string
  note?: string
}

export interface RecipeTimer {
  type: "timer"
  name: string
  quantity: number | string
  units: string
}
