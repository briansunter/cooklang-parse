export interface SourcePosition {
  line: number
  column: number
  offset: number
}

export interface ASTNode {
  type: string
  position: SourcePosition
}

export interface ParseError {
  message: string
  position: SourcePosition
  severity: "error" | "warning"
}

export interface Recipe extends ASTNode {
  type: "recipe"
  metadata: Metadata | null
  sections: Section[]
  steps: Step[]
  notes: Note[]
  errors: ParseError[]
}

export interface Metadata extends ASTNode {
  type: "metadata"
  content: string
  data: Record<string, unknown>
}

export interface Section extends ASTNode {
  type: "section"
  name: string
}

export interface TextItem {
  type: "text"
  value: string
}

/** Ordered item within a step (text interleaved with tokens) */
export type StepItem = TextItem | Ingredient | Cookware | Timer

export interface Step extends ASTNode {
  type: "step"
  text: string
  items: StepItem[]
  ingredients: Ingredient[]
  cookware: Cookware[]
  timers: Timer[]
  inlineComments: Comment[]
}

/** Ingredient reference (@name{quantity%unit}) */
export interface Ingredient extends ASTNode {
  type: "ingredient"
  name: string
  quantity?: string
  unit?: string
  preparation?: string
  fixed: boolean // If true, quantity doesn't scale with servings
  rawAmount?: string // Raw content inside {} for canonical conversion
}

/** Cookware reference (#name or #multi word{}) */
export interface Cookware extends ASTNode {
  type: "cookware"
  name: string
  quantity?: string
}

/** Timer reference (~{quantity%unit} or ~name{quantity%unit}) */
export interface Timer extends ASTNode {
  type: "timer"
  name?: string
  quantity: string
  unit?: string
  rawAmount?: string // Raw content inside {} for canonical conversion
}

/** Single-line comment (-- comment) */
export interface Comment extends ASTNode {
  type: "comment"
  text: string
}

/** Note line (> note text) */
export interface Note extends ASTNode {
  type: "note"
  text: string
}

export interface CooklangRecipe {
  metadata: Record<string, unknown>
  ingredients: SimplifiedIngredient[]
  cookware: string[]
  timers: SimplifiedTimer[]
  steps: SimplifiedStep[]
  notes: string[]
  sections: string[]
  errors: ParseError[]
}

export interface SimplifiedIngredient {
  name: string
  quantity?: string
  unit?: string
  preparation?: string
  fixed: boolean
}

export interface SimplifiedTimer {
  name?: string
  quantity: string
  unit?: string
}

export interface SimplifiedStep {
  text: string
  ingredients: SimplifiedIngredient[]
  cookware: string[]
  timers: SimplifiedTimer[]
  inlineComments: string[]
}
