/**
 * Shared type definitions for Cooklang parser
 */

/**
 * Source position in the original text
 */
export interface SourcePosition {
  line: number;
  column: number;
  offset: number;
}

/**
 * Base interface for all AST nodes
 */
export interface ASTNode {
  type: string;
  position: SourcePosition;
}

/**
 * Parse error with location information
 */
export interface ParseError {
  message: string;
  position: SourcePosition;
  severity: 'error' | 'warning';
}

/**
 * Recipe - the root AST node
 */
export interface Recipe extends ASTNode {
  type: 'recipe';
  metadata: Metadata | null;
  sections: Section[];
  steps: Step[];
  notes: Note[];
  errors: ParseError[];
}

/**
 * YAML front matter metadata
 */
export interface Metadata extends ASTNode {
  type: 'metadata';
  content: string;
  data: Record<string, any>;
}

/**
 * Recipe section (e.g., ==Dough==)
 */
export interface Section extends ASTNode {
  type: 'section';
  name: string;
}

/**
 * A cooking step (paragraph of text)
 */
export interface Step extends ASTNode {
  type: 'step';
  text: string;
  ingredients: Ingredient[];
  cookware: Cookware[];
  timers: Timer[];
  inlineComments: Comment[];
}

/**
 * Ingredient reference (@name{quantity%unit})
 */
export interface Ingredient extends ASTNode {
  type: 'ingredient';
  name: string;
  quantity?: string;
  unit?: string;
  preparation?: string;
  fixed: boolean; // If true, quantity doesn't scale with servings
}

/**
 * Cookware reference (#name or #multi word{})
 */
export interface Cookware extends ASTNode {
  type: 'cookware';
  name: string;
}

/**
 * Timer reference (~{quantity%unit} or ~name{quantity%unit})
 */
export interface Timer extends ASTNode {
  type: 'timer';
  name?: string;
  quantity: string;
  unit?: string;
}

/**
 * Single-line comment (-- comment)
 */
export interface Comment extends ASTNode {
  type: 'comment';
  text: string;
}

/**
 * Block comment ([- comment -])
 */
export interface BlockComment extends ASTNode {
  type: 'blockComment';
  text: string;
}

/**
 * Note line (> note text)
 */
export interface Note extends ASTNode {
  type: 'note';
  text: string;
}

/**
 * Simplified recipe model for easy consumption
 */
export interface CooklangRecipe {
  /** Parsed metadata as key-value pairs */
  metadata: Record<string, any>;

  /** All ingredients with quantities */
  ingredients: SimplifiedIngredient[];

  /** All cookware items */
  cookware: string[];

  /** All timers */
  timers: SimplifiedTimer[];

  /** Recipe steps with embedded items */
  steps: SimplifiedStep[];

  /** Note lines */
  notes: string[];

  /** Named sections */
  sections: string[];

  /** Parsing errors (if any) */
  errors: ParseError[];
}

/**
 * Simplified ingredient for easy use
 */
export interface SimplifiedIngredient {
  name: string;
  quantity?: string;
  unit?: string;
  preparation?: string;
  fixed: boolean;
}

/**
 * Simplified timer for easy use
 */
export interface SimplifiedTimer {
  name?: string;
  quantity: string;
  unit?: string;
}

/**
 * Simplified step for easy use
 */
export interface SimplifiedStep {
  text: string;
  ingredients: SimplifiedIngredient[];
  cookware: string[];
  timers: SimplifiedTimer[];
}
