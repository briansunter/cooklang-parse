import type { RecipeStepItem, SourcePosition } from "../types"

export interface ExtensionState {
  modes: boolean
  inlineQuantities: boolean
}

export type DefineMode = "all" | "components" | "steps" | "text"

export interface DirectiveNode {
  type: "directive"
  key: string
  rawValue: string
  rawLine: string
  position: SourcePosition
}

export type SemanticItem =
  | { kind: "step"; items: RecipeStepItem[] }
  | { kind: "section"; name: string }
  | { kind: "note"; text: string }
  | { kind: "directive"; directive: DirectiveNode }

export interface SemanticResult {
  frontmatter: string | null
  items: SemanticItem[]
}
