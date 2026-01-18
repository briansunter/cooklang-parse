/**
 * Ohm semantics for Cooklang grammar
 * Defines how to convert the parse tree into our AST
 */

// Load the grammar
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import * as Ohm from "ohm-js"
import type {
  BlockComment,
  Comment,
  Cookware,
  Ingredient,
  Metadata,
  Note,
  ParseError,
  Recipe,
  Section,
  SourcePosition,
  Step,
  Timer,
} from "./types.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const grammarFile = readFileSync(join(__dirname, "../grammars/cooklang.ohm"), "utf-8")
const grammar = Ohm.grammar(grammarFile)

/**
 * Get source position - simplified version
 */
function getPosition(_interval: Ohm.Interval): SourcePosition {
  // TODO: Implement proper line/column tracking
  return {
    line: 1,
    column: 1,
    offset: 0,
  }
}

/**
 * Create semantic actions for AST building
 */
function createSemantics() {
  const semantics = grammar.createSemantics()

  semantics.addOperation("toAST", {
    Recipe(_metadata, sections, steps, notes, _blockComments) {
      const metadataNode =
        _metadata.numChildren > 0 ? (_metadata.children[0].toAST() as Metadata) : null

      const sectionsList = sections.children.map((s: unknown) =>
        (s as { toAST(): Section }).toAST(),
      )
      const stepsList = steps.children.map((s: unknown) => (s as { toAST(): Step }).toAST())
      const notesList = notes.children.map((n: unknown) => (n as { toAST(): Note }).toAST())

      return {
        type: "recipe" as const,
        position: getPosition((this as unknown as { interval: Ohm.Interval }).interval),
        metadata: metadataNode,
        sections: sectionsList,
        steps: stepsList,
        notes: notesList,
        errors: [],
      } satisfies Recipe
    },

    Metadata(_dash1, yaml, _dash2) {
      const content = yaml.sourceString
      const data: Record<string, unknown> = {}

      try {
        const lines = content.trim().split("\n")
        for (const line of lines) {
          const match = line.match(/^([^:]+):\s*(.*)$/)
          if (match) {
            const [, key, value] = match
            const trimmedKey = key.trim()
            const trimmedValue = value.trim()

            if (trimmedValue.startsWith("[") || trimmedValue.startsWith("{")) {
              try {
                data[trimmedKey] = JSON.parse(trimmedValue)
              } catch {
                data[trimmedKey] = trimmedValue
              }
            } else if (trimmedValue === "true") {
              data[trimmedKey] = true
            } else if (trimmedValue === "false") {
              data[trimmedKey] = false
            } else if (trimmedValue === "" || trimmedValue === "null") {
              data[trimmedKey] = null
            } else if (/^\d+$/.test(trimmedValue)) {
              data[trimmedKey] = parseInt(trimmedValue, 10)
            } else if (/^\d+\.\d+$/.test(trimmedValue)) {
              data[trimmedKey] = parseFloat(trimmedValue)
            } else {
              data[trimmedKey] = trimmedValue
            }
          }
        }
      } catch {
        // YAML parsing failed
      }

      return {
        type: "metadata" as const,
        position: getPosition((this as unknown as { interval: Ohm.Interval }).interval),
        content,
        data,
      } satisfies Metadata
    },

    Section(_eq1, name, _eq2) {
      const nameStr = name.sourceString.trim()
      return {
        type: "section" as const,
        position: getPosition((this as unknown as { interval: Ohm.Interval }).interval),
        name: nameStr,
      } satisfies Section
    },

    Step(lines) {
      const stepLines = lines.children.map((line: unknown) =>
        (
          line as {
            toAST(): {
              text: string
              ingredients: Ingredient[]
              cookware: Cookware[]
              timers: Timer[]
              inlineComments: Comment[]
            }
          }
        ).toAST(),
      )
      const allIngredients: Ingredient[] = []
      const allCookware: Cookware[] = []
      const allTimers: Timer[] = []
      const allComments: Comment[] = []

      let fullText = ""

      for (const line of stepLines) {
        fullText += `${line.text}\n`
        allIngredients.push(...line.ingredients)
        allCookware.push(...line.cookware)
        allTimers.push(...line.timers)
        allComments.push(...line.inlineComments)
      }

      return {
        type: "step" as const,
        position: getPosition((this as unknown as { interval: Ohm.Interval }).interval),
        text: fullText.trim(),
        ingredients: allIngredients,
        cookware: allCookware,
        timers: allTimers,
        inlineComments: allComments,
      } satisfies Step
    },

    StepLine(items, inlineComment) {
      const stepItems = items.children
        .map((c: unknown) => (c as unknown as { toAST?: () => unknown }).toAST?.())
        .filter((c): c is NonNullable<typeof c> => c !== null && c !== undefined)

      const ingredients: Ingredient[] = []
      const cookware: Cookware[] = []
      const timers: Timer[] = []
      const inlineComments: Comment[] = []

      for (const item of stepItems) {
        if ((item as { type: string }).type === "ingredient") {
          ingredients.push(item as Ingredient)
        } else if ((item as { type: string }).type === "cookware") {
          cookware.push(item as Cookware)
        } else if ((item as { type: string }).type === "timer") {
          timers.push(item as Timer)
        } else if ((item as { type: string }).type === "comment") {
          inlineComments.push(item as Comment)
        }
      }

      if (inlineComment.numChildren > 0) {
        inlineComments.push((inlineComment.children[0] as unknown as { toAST(): Comment }).toAST())
      }

      // Use the full source string for the text
      const text = (this as unknown as { sourceString: string }).sourceString

      return { text, ingredients, cookware, timers, inlineComments }
    },

    StepItem(self) {
      return (self as unknown as { toAST(): unknown }).toAST()
    },

    Text(self) {
      return {
        type: "text" as const,
        value: self.sourceString,
      }
    },

    Ingredient(_at, fixed, name, amount) {
      const isFixed = fixed.numChildren > 0

      // Extract name from the name node
      let nameStr = ""
      const nameSource = name.sourceString
      if (nameSource.endsWith("{}")) {
        // Multi-word ingredient
        nameStr = nameSource.slice(0, -2).trim()
      } else {
        // Single word ingredient
        nameStr = nameSource.trim()
      }

      // Extract amount details
      let quantity: string | undefined
      let unit: string | undefined
      let preparation: string | undefined

      if (amount.numChildren > 0) {
        const amountSource = amount.sourceString // e.g., "{250%g}" or "{250%g chopped}"
        // Remove the braces
        const content = amountSource.slice(1, -1).trim()

        // Try to parse quantity%unit preparation format
        const unitMatch = content.match(/^(\d+(?:\.\d+)?)\s*%\s*(\S+)(?:\s+(.+))?$/)
        if (unitMatch) {
          quantity = unitMatch[1]
          unit = unitMatch[2]
          preparation = unitMatch[3]
        } else {
          // No unit format, just check if there's a preparation
          const parts = content.split(/\s+/)
          if (parts.length >= 1 && parts[0]) {
            quantity = parts[0]
          }
          if (parts.length >= 3) {
            unit = parts[1]
            preparation = parts.slice(2).join(" ")
          } else if (parts.length === 2) {
            // Could be unit or preparation
            unit = parts[1]
          }
        }
      }

      return {
        type: "ingredient" as const,
        position: getPosition((this as unknown as { interval: Ohm.Interval }).interval),
        name: nameStr,
        quantity,
        unit,
        preparation,
        fixed: isFixed,
      } satisfies Ingredient
    },

    Cookware(_hash, name) {
      const nameSource = name.sourceString
      let nameStr = ""

      if (nameSource.endsWith("{}")) {
        // Multi-word cookware
        nameStr = nameSource.slice(0, -2).trim()
      } else {
        // Single word cookware
        nameStr = nameSource.trim()
      }

      return {
        type: "cookware" as const,
        position: getPosition((this as unknown as { interval: Ohm.Interval }).interval),
        name: nameStr,
      } satisfies Cookware
    },

    Timer(_tilde, name, _lbrace, quantity, unit, _rbrace) {
      const nameStr = name.numChildren > 0 ? name.sourceString.trim() : undefined
      const quantityStr = quantity.sourceString.trim()
      const unitStr = unit.numChildren > 0 ? unit.sourceString.trim() : undefined

      return {
        type: "timer" as const,
        position: getPosition((this as unknown as { interval: Ohm.Interval }).interval),
        name: nameStr,
        quantity: quantityStr,
        unit: unitStr,
      } satisfies Timer
    },

    Note(_gt, text, _newline) {
      return {
        type: "note" as const,
        position: getPosition((this as unknown as { interval: Ohm.Interval }).interval),
        text: text.sourceString.trim(),
      } satisfies Note
    },

    InlineComment(_dash, text) {
      return {
        type: "comment" as const,
        position: getPosition((this as unknown as { interval: Ohm.Interval }).interval),
        text: text.sourceString.trim(),
      } satisfies Comment
    },

    BlockComment(_start, text, _end) {
      return {
        type: "blockComment" as const,
        position: getPosition((this as unknown as { interval: Ohm.Interval }).interval),
        text: text.sourceString.trim(),
      } satisfies BlockComment
    },

    _terminal() {
      return null
    },
  })

  return semantics
}

// Create the semantics instance
const semantics = createSemantics()

/**
 * Parse Cooklang source and return AST
 */
export function parseToAST(source: string): Recipe {
  const matchResult = grammar.match(source)

  if (!matchResult.succeeded()) {
    const errors: ParseError[] = []
    const mr = matchResult as unknown as { message?: string; shortMessage?: string }
    errors.push({
      message: mr.message || mr.shortMessage || "Parse error",
      position: { line: 1, column: 1, offset: 0 },
      severity: "error" as const,
    })

    return {
      type: "recipe",
      position: { line: 1, column: 1, offset: 0 },
      metadata: null,
      sections: [],
      steps: [],
      notes: [],
      errors,
    }
  }

  const cst = semantics(matchResult)
  return (cst as unknown as { toAST(): Recipe }).toAST()
}

/**
 * Get the raw Ohm grammar
 */
export function getGrammar(): Ohm.Grammar {
  return grammar
}
