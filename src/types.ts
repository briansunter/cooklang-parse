/**
 * Shared type definitions for Cooklang parser
 */

/**
 * Source position in the original text
 */
export interface SourcePosition {
  line: number
  column: number
  offset: number
}

/**
 * Base interface for all AST nodes
 */
export interface ASTNode {
  type: string
  position: SourcePosition
}

/**
 * Parse error with location information
 */
export interface ParseError {
  message: string
  position: SourcePosition
  severity: "error" | "warning"
}

/**
 * Recipe - the root AST node
 */
export interface Recipe extends ASTNode {
  type: "recipe"
  metadata: Metadata | null
  sections: Section[]
  steps: Step[]
  notes: Note[]
  errors: ParseError[]
}

/**
 * YAML front matter metadata
 */
export interface Metadata extends ASTNode {
  type: "metadata"
  content: string
  data: Record<string, unknown>
}

/**
 * Recipe section (e.g., ==Dough==)
 */
export interface Section extends ASTNode {
  type: "section"
  name: string
}

/**
 * Text fragment within a step's ordered items
 */
export interface TextItem {
  type: "text"
  value: string
}

/**
 * Ordered item within a step (text interleaved with tokens)
 */
export type StepItem = TextItem | Ingredient | Cookware | Timer

/**
 * A cooking step (paragraph of text)
 */
export interface Step extends ASTNode {
  type: "step"
  text: string
  items: StepItem[]
  ingredients: Ingredient[]
  cookware: Cookware[]
  timers: Timer[]
  inlineComments: Comment[]
}

/**
 * Ingredient reference (@name{quantity%unit})
 */
export interface Ingredient extends ASTNode {
  type: "ingredient"
  name: string
  quantity?: string
  unit?: string
  preparation?: string
  fixed: boolean // If true, quantity doesn't scale with servings
  rawAmount?: string // Raw content inside {} for canonical conversion
}

/**
 * Cookware reference (#name or #multi word{})
 */
export interface Cookware extends ASTNode {
  type: "cookware"
  name: string
  quantity?: string
}

/**
 * Timer reference (~{quantity%unit} or ~name{quantity%unit})
 */
export interface Timer extends ASTNode {
  type: "timer"
  name?: string
  quantity: string
  unit?: string
  rawAmount?: string // Raw content inside {} for canonical conversion
}

/**
 * Single-line comment (-- comment)
 */
export interface Comment extends ASTNode {
  type: "comment"
  text: string
}

/**
 * Note line (> note text)
 */
export interface Note extends ASTNode {
  type: "note"
  text: string
}

/**
 * Simplified recipe model for easy consumption
 */
export interface CooklangRecipe {
  /** Parsed metadata as key-value pairs */
  metadata: Record<string, unknown>

  /** All ingredients with quantities */
  ingredients: SimplifiedIngredient[]

  /** All cookware items */
  cookware: string[]

  /** All timers */
  timers: SimplifiedTimer[]

  /** Recipe steps with embedded items */
  steps: SimplifiedStep[]

  /** Note lines */
  notes: string[]

  /** Named sections */
  sections: string[]

  /** Parsing errors (if any) */
  errors: ParseError[]
}

/**
 * Simplified ingredient for easy use
 */
export interface SimplifiedIngredient {
  name: string
  quantity?: string
  unit?: string
  preparation?: string
  fixed: boolean
}

/**
 * Simplified timer for easy use
 */
export interface SimplifiedTimer {
  name?: string
  quantity: string
  unit?: string
}

/**
 * Simplified step for easy use
 */
export interface SimplifiedStep {
  text: string
  ingredients: SimplifiedIngredient[]
  cookware: string[]
  timers: SimplifiedTimer[]
  inlineComments: string[]
}
