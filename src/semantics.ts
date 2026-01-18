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
 * Parse simple YAML arrays and objects (non-quoted values)
 * Handles: [item1, item2] and {key: value, key2: value2}
 */
function parseSimpleYamlValue(value: string): unknown {
  value = value.trim()

  // Parse array: [item1, item2, item3]
  if (value.startsWith("[") && value.endsWith("]")) {
    const content = value.slice(1, -1).trim()
    if (!content) {
      return []
    }
    // Split by comma, but be careful with nested structures
    const items: string[] = []
    let current = ""
    let depth = 0
    for (const char of content) {
      if (char === "," && depth === 0) {
        items.push(current.trim())
        current = ""
      } else {
        if (char === "[" || char === "{") {
          depth++
        } else if (char === "]" || char === "}") {
          depth--
        }
        current += char
      }
    }
    if (current.trim()) {
      items.push(current.trim())
    }
    return items.map(item => {
      // Try to convert to appropriate type
      const trimmed = item.trim()
      if (trimmed === "true") return true
      if (trimmed === "false") return false
      if (trimmed === "null" || trimmed === "") return null
      if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10)
      if (/^\d+\.\d+$/.test(trimmed)) return parseFloat(trimmed)
      return trimmed
    })
  }

  // Parse object: {key: value, key2: value2}
  if (value.startsWith("{") && value.endsWith("}")) {
    const content = value.slice(1, -1).trim()
    if (!content) {
      return {}
    }
    const obj: Record<string, unknown> = {}
    // Split by comma at top level
    const pairs: string[] = []
    let current = ""
    let depth = 0
    for (const char of content) {
      if (char === "," && depth === 0) {
        pairs.push(current.trim())
        current = ""
      } else {
        if (char === "[" || char === "{") {
          depth++
        } else if (char === "]" || char === "}") {
          depth--
        }
        current += char
      }
    }
    if (current.trim()) {
      pairs.push(current.trim())
    }
    for (const pair of pairs) {
      const colonIndex = pair.indexOf(":")
      if (colonIndex > 0) {
        const key = pair.slice(0, colonIndex).trim()
        const val = pair.slice(colonIndex + 1).trim()
        obj[key] = parseSimpleYamlValue(val)
      }
    }
    return obj
  }

  return value
}

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
    Recipe(_metadata, items) {
      const metadataNode =
        _metadata.numChildren > 0 ? (_metadata.children[0].toAST() as Metadata) : null

      const sectionsList: Section[] = []
      const stepsList: Step[] = []
      const notesList: Note[] = []
      const blockCommentsList: BlockComment[] = []

      // Iterate through RecipeItems and separate by type
      for (const item of items.children) {
        const node = (item as unknown as { toAST(): unknown }).toAST()
        // Skip null values (blank lines)
        if (node && typeof node === "object" && "type" in node) {
          switch ((node as { type: string }).type) {
            case "section":
              sectionsList.push(node as Section)
              break
            case "step":
              stepsList.push(node as Step)
              break
            case "note":
              notesList.push(node as Note)
              break
            case "blockComment":
              blockCommentsList.push(node as BlockComment)
              break
          }
        }
      }

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

            // Try to parse as JSON first (handles quoted arrays/objects)
            if (trimmedValue.startsWith("[") || trimmedValue.startsWith("{")) {
              try {
                data[trimmedKey] = JSON.parse(trimmedValue)
              } catch {
                // If JSON.parse fails, try parsing as simple YAML
                data[trimmedKey] = parseSimpleYamlValue(trimmedValue)
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

    StepLine(items, inlineComment, _newline) {
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

    Ingredient(fixed, _at, name, amount) {
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
      // Extract unit content without the % prefix - TimerUnit is "%" unitContent
      let unitStr: string | undefined
      if (unit.numChildren > 0) {
        const unitSource = unit.sourceString.trim()
        // Remove the leading % to get just the unit content
        unitStr = unitSource.startsWith('%') ? unitSource.slice(1).trim() : unitSource
      }

      return {
        type: "timer" as const,
        position: getPosition((this as unknown as { interval: Ohm.Interval }).interval),
        name: nameStr,
        quantity: quantityStr,
        unit: unitStr,
      } satisfies Timer
    },

    Note(_gt, noteContents, _newline) {
      // noteContent children are individual characters, we need to concatenate them
      const text = noteContents.sourceString.trim()
      return {
        type: "note" as const,
        position: getPosition((this as unknown as { interval: Ohm.Interval }).interval),
        text,
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

    RecipeItem(self) {
      return (self as unknown as { toAST(): unknown }).toAST()
    },

    blankLine(_spaces, _newline) {
      return null
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
 * Validate recipe for common syntax errors
 */
function validateRecipe(recipe: Recipe, source: string): ParseError[] {
  const errors: ParseError[] = []

  // Check for unclosed brackets
  let depth = 0
  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (char === '{') {
      depth++
    } else if (char === '}') {
      depth--
    }
  }
  if (depth > 0) {
    errors.push({
      message: `Unclosed bracket: ${depth} opening bracket(s) not closed`,
      position: { line: 1, column: 1, offset: 0 },
      severity: "error" as const,
    })
  } else if (depth < 0) {
    errors.push({
      message: `Unmatched closing bracket: ${Math.abs(depth)} closing bracket(s) without opening`,
      position: { line: 1, column: 1, offset: 0 },
      severity: "error" as const,
    })
  }

  return errors
}

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
  const recipe = (cst as unknown as { toAST(): Recipe }).toAST()

  // Add validation errors
  const validationErrors = validateRecipe(recipe, source)
  recipe.errors.push(...validationErrors)

  return recipe
}

/**
 * Get the raw Ohm grammar
 */
export function getGrammar(): Ohm.Grammar {
  return grammar
}
