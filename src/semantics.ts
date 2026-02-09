/**
 * Ohm semantics for Cooklang grammar
 * Defines how to convert the parse tree into our AST
 */

// Load the grammar
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import * as Ohm from "ohm-js"
import YAML from "yaml"
import type {
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
function parseSimpleYamlValue(input: string): unknown {
  const value = input.trim()

  // Parse array: [item1, item2, item3] or object: {key: value}
  if (
    (value.startsWith("[") && value.endsWith("]")) ||
    (value.startsWith("{") && value.endsWith("}"))
  ) {
    const isArray = value.startsWith("[")
    const content = value.slice(1, -1).trim()

    if (!content) {
      return isArray ? [] : {}
    }

    // Split by comma at top level (respecting nested brackets)
    const parts: string[] = []
    let current = ""
    let depth = 0
    for (const char of content) {
      if (char === "," && depth === 0) {
        parts.push(current.trim())
        current = ""
      } else {
        if (char === "[" || char === "{") depth++
        if (char === "]" || char === "}") depth--
        current += char
      }
    }
    if (current.trim()) {
      parts.push(current.trim())
    }

    if (isArray) {
      return parts.map(item => parseScalar(item.trim()))
    }

    // Parse object
    const obj: Record<string, unknown> = {}
    for (const pair of parts) {
      const colonIndex = pair.indexOf(":")
      if (colonIndex > 0) {
        const key = pair.slice(0, colonIndex).trim()
        const val = pair.slice(colonIndex + 1).trim()
        obj[key] = parseSimpleYamlValue(val)
      }
    }
    return obj
  }

  return parseScalar(value)
}

/**
 * Parse a scalar value to appropriate type
 */
function parseScalar(value: string): unknown {
  if (value === "true") return true
  if (value === "false") return false
  if (value === "null" || value === "") return null
  if (/^\d+$/.test(value)) return parseInt(value, 10)
  if (/^\d+\.\d+$/.test(value)) return parseFloat(value)
  return value
}

function parseMetadataValue(value: string): unknown {
  const trimmedValue = value.trim()

  if (trimmedValue.startsWith("[") || trimmedValue.startsWith("{")) {
    try {
      return JSON.parse(trimmedValue)
    } catch {
      return parseSimpleYamlValue(trimmedValue)
    }
  }

  return parseScalar(trimmedValue)
}

function parseYamlFrontmatter(content: string): {
  data: Record<string, unknown>
  warning?: string
} {
  try {
    const doc = YAML.parseDocument(content)

    if (doc.errors.length > 0) {
      return {
        data: {},
        warning: `Invalid YAML frontmatter: ${doc.errors[0]?.message ?? "parse error"}`,
      }
    }

    const parsed = doc.toJS()
    if (parsed === null || parsed === undefined) {
      return { data: {} }
    }

    if (typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        data: {},
        warning: "Invalid YAML frontmatter: expected a key/value mapping",
      }
    }

    return { data: parsed as Record<string, unknown> }
  } catch (error) {
    return {
      data: {},
      warning: `Invalid YAML frontmatter: ${
        error instanceof Error ? error.message : "parse error"
      }`,
    }
  }
}

function extractMetadataDirectives(source: string): {
  metadata: Record<string, unknown>
  strippedSource: string
  content: string
} {
  type ParseMode = "default" | "components" | "steps" | "text"

  const normalizeMode = (value: string): ParseMode => {
    const lower = value.trim().toLowerCase()
    if (lower === "components" || lower === "ingredients") return "components"
    if (lower === "steps") return "steps"
    if (lower === "text") return "text"
    return "default"
  }

  const lines = source.split(/\r\n|\n|\r/)
  const metadata: Record<string, unknown> = {}
  const stripped: string[] = []
  const content: string[] = []
  let mode: ParseMode = "default"

  for (const line of lines) {
    const match = line.match(/^\s*>>\s*([^:]+?)\s*:\s*(.*)\s*$/)
    if (!match) {
      if (mode === "components") {
        stripped.push("")
        continue
      }
      stripped.push(line)
      continue
    }

    const key = match[1]?.trim()
    const value = match[2]
    if (!key || value === undefined) {
      stripped.push(line)
      continue
    }

    metadata[key] = parseMetadataValue(value)
    content.push(line)
    stripped.push("")

    const lowerKey = key.toLowerCase()
    if (lowerKey === "[mode]" || lowerKey === "[define]") {
      mode = normalizeMode(value)
    }
  }

  return {
    metadata,
    strippedSource: stripped.join("\n"),
    content: content.join("\n"),
  }
}

function isLikelyNumericQuantity(value: string): boolean {
  return /^-?\d+(?:\.\d+)?(?:\/\d+)?(?:-\d+(?:\.\d+)?(?:\/\d+)?)?$/.test(value.trim())
}

function parseTokenAmount(content: string): {
  quantity?: string
  unit?: string
  preparation?: string
} {
  const trimmed = content.trim()
  if (!trimmed) {
    return {}
  }

  const percentIdx = trimmed.indexOf("%")
  if (percentIdx !== -1) {
    const quantity = trimmed.slice(0, percentIdx).trim()
    const right = trimmed.slice(percentIdx + 1).trim()
    const rightParts = right.length > 0 ? right.split(/\s+/) : []
    return {
      quantity: quantity.length > 0 ? quantity : undefined,
      unit: rightParts[0],
      preparation: rightParts.length > 1 ? rightParts.slice(1).join(" ") : undefined,
    }
  }

  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) {
    return { quantity: parts[0] }
  }

  const first = parts[0]
  if (first && isLikelyNumericQuantity(first)) {
    return {
      quantity: first,
      unit: parts[1],
      preparation: parts.length > 2 ? parts.slice(2).join(" ") : undefined,
    }
  }

  return { quantity: trimmed }
}

function splitNameAndAmount(raw: string): {
  namePart: string
  amountContent?: string
} {
  const trimmed = raw.trim()
  if (!trimmed.endsWith("}")) {
    return { namePart: trimmed }
  }

  const amountStart = trimmed.lastIndexOf("{")
  if (amountStart === -1) {
    return { namePart: trimmed }
  }

  return {
    namePart: trimmed.slice(0, amountStart).trim(),
    amountContent: trimmed.slice(amountStart + 1, -1),
  }
}

function normalizeComponentName(namePart: string): string {
  let name = namePart.trim()

  if (name.endsWith("{}")) {
    name = name.slice(0, -2).trim()
  }

  const aliasIdx = name.indexOf("|")
  if (aliasIdx !== -1) {
    name = name.slice(0, aliasIdx).trim()
  }

  if (name.startsWith("(")) {
    const close = name.indexOf(")")
    if (close !== -1) {
      name = name.slice(close + 1).trim()
    }
  }

  while (name.startsWith("&")) {
    name = name.slice(1).trim()
  }

  return name
}

function parseIngredientToken(token: string): {
  name: string
  quantity?: string
  unit?: string
  preparation?: string
  fixed: boolean
} {
  let raw = token.trim()
  let fixed = false

  if (raw.startsWith("=")) {
    fixed = true
    raw = raw.slice(1).trimStart()
  }

  if (raw.startsWith("@")) {
    raw = raw.slice(1)
  }

  raw = raw.replace(/^[@&?+-]+/, "")

  // Extract trailing (preparation) suffix
  let preparation: string | undefined
  const prepMatch = raw.match(/\(([^)]*)\)$/)
  if (prepMatch) {
    preparation = prepMatch[1] || undefined
    raw = raw.slice(0, prepMatch.index).trimEnd()
  }

  const { namePart, amountContent } = splitNameAndAmount(raw)
  const name = normalizeComponentName(namePart)

  // Check for fixed quantity marker inside braces: {=qty%unit}
  let fixedContent = amountContent
  if (fixedContent?.trimStart().startsWith("=")) {
    fixed = true
    fixedContent = fixedContent.trimStart().slice(1)
  }

  const amount = fixedContent !== undefined ? parseTokenAmount(fixedContent) : {}

  // Merge preparation: explicit (prep) suffix takes precedence over amount-parsed preparation
  const finalPreparation = preparation ?? amount.preparation

  return {
    name,
    fixed,
    quantity: amount.quantity,
    unit: amount.unit,
    preparation: finalPreparation,
  }
}

function parseCookwareToken(token: string): { name: string } {
  let raw = token.trim()
  if (raw.startsWith("#")) {
    raw = raw.slice(1)
  }

  raw = raw.replace(/^[&?+-]+/, "")
  const { namePart } = splitNameAndAmount(raw)
  return { name: normalizeComponentName(namePart) }
}

function parseTimerToken(token: string): {
  name?: string
  quantity: string
  unit?: string
} {
  const trimmed = token.trim()
  const withoutPrefix = trimmed.startsWith("~") ? trimmed.slice(1) : trimmed
  const { namePart, amountContent } = splitNameAndAmount(withoutPrefix)

  const parsedName = namePart.trim()
  if (amountContent === undefined) {
    return {
      name: parsedName.length > 0 ? parsedName : undefined,
      quantity: "",
      unit: undefined,
    }
  }

  const amount = parseTokenAmount(amountContent)
  return {
    name: parsedName.length > 0 ? parsedName : undefined,
    quantity: amount.quantity ?? "",
    unit: amount.unit,
  }
}

/**
 * Stub position - proper line/column tracking not yet implemented
 */
const stubPosition: SourcePosition = { line: 1, column: 1, offset: 0 }

/**
 * Create semantic actions for AST building
 */
function createSemantics() {
  const semantics = grammar.createSemantics()

  semantics.addOperation("toAST", {
    Recipe(_metadata, items) {
      const firstChild = _metadata.numChildren > 0 ? _metadata.children[0] : null
      const metadataNode = firstChild ? (firstChild.toAST() as Metadata) : null

      const sectionsList: Section[] = []
      const stepsList: Step[] = []
      const notesList: Note[] = []

      for (const item of items.children) {
        const node = (item as unknown as { toAST(): unknown }).toAST()
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
          }
        }
      }

      return {
        type: "recipe" as const,
        position: stubPosition,
        metadata: metadataNode,
        sections: sectionsList,
        steps: stepsList,
        notes: notesList,
        errors: [],
      } satisfies Recipe
    },

    Metadata(_dash1, yaml, _dash2) {
      const content = yaml.sourceString

      return {
        type: "metadata" as const,
        position: stubPosition,
        content,
        data: {},
      } satisfies Metadata
    },

    Section_double(_eq1, name, _eq2) {
      const nameStr = name.sourceString.trim()
      return {
        type: "section" as const,
        position: stubPosition,
        name: nameStr,
      } satisfies Section
    },

    Section_single(_eq, name) {
      const nameStr = name.sourceString.trim()
      return {
        type: "section" as const,
        position: stubPosition,
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
        position: stubPosition,
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

    Ingredient_multi(_fixed, _at, _mods, _nameFirst, _space, _nameRest, _amount, _prep) {
      const parsed = parseIngredientToken(
        (this as unknown as { sourceString: string }).sourceString,
      )

      return {
        type: "ingredient" as const,
        position: stubPosition,
        name: parsed.name,
        quantity: parsed.quantity,
        unit: parsed.unit,
        preparation: parsed.preparation,
        fixed: parsed.fixed,
      } satisfies Ingredient
    },

    Ingredient_single(_fixed, _at, _mods, _name, _amount, _prep) {
      const parsed = parseIngredientToken(
        (this as unknown as { sourceString: string }).sourceString,
      )

      return {
        type: "ingredient" as const,
        position: stubPosition,
        name: parsed.name,
        quantity: parsed.quantity,
        unit: parsed.unit,
        preparation: parsed.preparation,
        fixed: parsed.fixed,
      } satisfies Ingredient
    },

    Cookware_multi(_hash, _mods, _nameFirst, _space, _nameRest, _amount) {
      const parsed = parseCookwareToken((this as unknown as { sourceString: string }).sourceString)

      return {
        type: "cookware" as const,
        position: stubPosition,
        name: parsed.name,
      } satisfies Cookware
    },

    Cookware_single(_hash, _mods, _name, _amount) {
      const parsed = parseCookwareToken((this as unknown as { sourceString: string }).sourceString)

      return {
        type: "cookware" as const,
        position: stubPosition,
        name: parsed.name,
      } satisfies Cookware
    },

    Timer_withAmount(_tilde, _name, _lbrace, _quantity, _unit, _rbrace) {
      const parsed = parseTimerToken((this as unknown as { sourceString: string }).sourceString)

      return {
        type: "timer" as const,
        position: stubPosition,
        name: parsed.name,
        quantity: parsed.quantity,
        unit: parsed.unit,
      } satisfies Timer
    },

    Timer_word(_tilde, name) {
      return {
        type: "timer" as const,
        position: stubPosition,
        name: name.sourceString.trim(),
        quantity: "",
        unit: undefined,
      } satisfies Timer
    },

    Note(_gt, noteContents, _newline) {
      // noteContent children are individual characters, we need to concatenate them
      const text = noteContents.sourceString.trim()
      return {
        type: "note" as const,
        position: stubPosition,
        text,
      } satisfies Note
    },

    InlineComment(_dash, text) {
      return {
        type: "comment" as const,
        position: stubPosition,
        text: text.sourceString.trim(),
      } satisfies Comment
    },

    BlockComment(_start, _text, _end) {
      return null
    },

    RecipeItem(self) {
      return (self as unknown as { toAST(): unknown }).toAST()
    },

    CommentLine(_spaces, _comment, _newline) {
      return null
    },

    blankLine(_spaces, _newline) {
      return null
    },

    spaceOnly(_spaces, _end) {
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
    if (char === "{") {
      depth++
    } else if (char === "}") {
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

  for (const step of recipe.steps) {
    for (const timer of step.timers) {
      if (timer.quantity.trim().length > 0 && !timer.unit) {
        errors.push({
          message: "Invalid timer quantity: missing unit",
          position: timer.position,
          severity: "warning",
        })
      }
    }
  }

  return errors
}

/**
 * Parse Cooklang source and return AST
 */
export function parseToAST(source: string): Recipe {
  const directiveMetadata = extractMetadataDirectives(source)
  const directiveMetadataEntries = Object.keys(directiveMetadata.metadata)
  const directiveMetadataNode =
    directiveMetadataEntries.length > 0
      ? ({
          type: "metadata" as const,
          position: stubPosition,
          content: directiveMetadata.content,
          data: directiveMetadata.metadata,
        } satisfies Metadata)
      : null

  const matchResult = grammar.match(directiveMetadata.strippedSource)

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
      metadata: directiveMetadataNode,
      sections: [],
      steps: [],
      notes: [],
      errors,
    }
  }

  const cst = semantics(matchResult)
  const recipe = (cst as unknown as { toAST(): Recipe }).toAST()

  if (recipe.metadata) {
    const parsedFrontmatter = parseYamlFrontmatter(recipe.metadata.content)
    recipe.metadata = {
      ...recipe.metadata,
      data: parsedFrontmatter.data,
    }

    if (parsedFrontmatter.warning) {
      recipe.errors.push({
        message: parsedFrontmatter.warning,
        position: { line: 1, column: 1, offset: 0 },
        severity: "warning",
      })
    }
  }

  if (directiveMetadataNode) {
    if (recipe.metadata) {
      recipe.metadata = {
        ...recipe.metadata,
        content: [recipe.metadata.content, directiveMetadataNode.content]
          .filter(part => part.length > 0)
          .join("\n"),
        data: {
          ...recipe.metadata.data,
          ...directiveMetadataNode.data,
        },
      }
    } else {
      recipe.metadata = directiveMetadataNode
    }
  }

  // Add validation errors
  const validationErrors = validateRecipe(recipe, directiveMetadata.strippedSource)
  recipe.errors.push(...validationErrors)

  return recipe
}

/**
 * Get the raw Ohm grammar
 */
export function getGrammar(): Ohm.Grammar {
  return grammar
}
