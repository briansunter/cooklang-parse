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

export interface CooklangRecipe {
  metadata: Record<string, unknown>
  steps: RecipeStepItem[][]
  ingredients: RecipeIngredient[]
  cookware: RecipeCookware[]
  timers: RecipeTimer[]
  sections: string[]
  notes: string[]
  errors: ParseError[]
}

export type RecipeStepItem =
  | { type: "text"; value: string }
  | RecipeIngredient
  | RecipeCookware
  | RecipeTimer

export interface RecipeIngredient {
  type: "ingredient"
  name: string
  quantity: number | string
  units: string
  fixed: boolean
  preparation?: string
}

export interface RecipeCookware {
  type: "cookware"
  name: string
  quantity: number | string
  units: string
}

export interface RecipeTimer {
  type: "timer"
  name: string
  quantity: number | string
  units: string
}
