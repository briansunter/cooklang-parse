/**
 * Ohm semantics for Cooklang grammar
 * Defines how to convert the parse tree into our AST
 */

import * as Ohm from "ohm-js"
import YAML from "yaml"
import grammarSource from "../grammars/cooklang.ohm" with { type: "text" }
import type {
  Comment,
  Cookware,
  Ingredient,
  Metadata,
  Note,
  Recipe,
  Section,
  SourcePosition,
  Step,
  StepItem,
  TextItem,
  Timer,
} from "./types"

const grammar = Ohm.grammar(grammarSource)

function parseMetadataValue(value: string): unknown {
  const trimmed = value.trim()
  if (!trimmed) return null
  try {
    const parsed = YAML.parse(trimmed)
    return parsed === undefined ? trimmed : parsed
  } catch {
    return trimmed
  }
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
    if (parsed == null) return { data: {} }

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
  const lines = source.split(/\r\n|\n|\r/)
  const metadata: Record<string, unknown> = {}
  const stripped: string[] = []
  const content: string[] = []
  let componentsMode = false

  for (const line of lines) {
    const match = line.match(/^\s*>>\s*([^:]+?)\s*:\s*(.*)\s*$/)
    if (!match) {
      stripped.push(componentsMode ? "" : line)
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
      const lower = value.trim().toLowerCase()
      componentsMode = lower === "components" || lower === "ingredients"
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
  if (!trimmed) return {}

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
  if (!trimmed.endsWith("}")) return { namePart: trimmed }

  const amountStart = trimmed.lastIndexOf("{")
  if (amountStart === -1) return { namePart: trimmed }

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
  rawAmount?: string
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

  let preparation: string | undefined
  const prepMatch = raw.match(/\(([^)]*)\)$/)
  if (prepMatch) {
    preparation = prepMatch[1] || undefined
    raw = raw.slice(0, prepMatch.index).trimEnd()
  }

  const { namePart, amountContent } = splitNameAndAmount(raw)
  const name = normalizeComponentName(namePart)

  let fixedContent = amountContent
  if (fixedContent?.trimStart().startsWith("=")) {
    fixed = true
    fixedContent = fixedContent.trimStart().slice(1)
  }

  const amount = fixedContent !== undefined ? parseTokenAmount(fixedContent) : {}

  return {
    name,
    fixed,
    quantity: amount.quantity,
    unit: amount.unit,
    preparation: preparation ?? amount.preparation,
    rawAmount: amountContent,
  }
}

function parseCookwareToken(token: string): { name: string; quantity?: string } {
  let raw = token.trim()
  if (raw.startsWith("#")) {
    raw = raw.slice(1)
  }

  raw = raw.replace(/^[&?+-]+/, "")
  const { namePart, amountContent } = splitNameAndAmount(raw)
  return {
    name: normalizeComponentName(namePart),
    quantity: amountContent?.trim() || undefined,
  }
}

function parseTimerToken(token: string): {
  name?: string
  quantity: string
  unit?: string
  rawAmount?: string
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
    rawAmount: amountContent,
  }
}

const stubPosition: SourcePosition = { line: 1, column: 1, offset: 0 }

function getSource(ctx: unknown): string {
  return (ctx as { sourceString: string }).sourceString
}

function ingredientFromSource(ctx: unknown): Ingredient {
  const parsed = parseIngredientToken(getSource(ctx))
  return {
    type: "ingredient",
    position: stubPosition,
    name: parsed.name,
    quantity: parsed.quantity,
    unit: parsed.unit,
    preparation: parsed.preparation,
    fixed: parsed.fixed,
    rawAmount: parsed.rawAmount,
  }
}

function cookwareFromSource(ctx: unknown): Cookware {
  const parsed = parseCookwareToken(getSource(ctx))
  return {
    type: "cookware",
    position: stubPosition,
    name: parsed.name,
    quantity: parsed.quantity,
  }
}

interface OhmNode {
  toAST(): unknown
}

function callToAST(node: unknown): unknown {
  return (node as OhmNode).toAST()
}

function createSemantics() {
  const semantics = grammar.createSemantics()

  semantics.addOperation("toAST", {
    Recipe(_metadata, items) {
      const firstChild = _metadata.numChildren > 0 ? _metadata.children[0] : null
      const metadataNode = firstChild ? (callToAST(firstChild) as Metadata) : null

      const sectionsList: Section[] = []
      const stepsList: Step[] = []
      const notesList: Note[] = []

      for (const item of items.children) {
        const node = callToAST(item) as { type: string } | null
        if (!node) continue
        switch (node.type) {
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

      return {
        type: "recipe",
        position: stubPosition,
        metadata: metadataNode,
        sections: sectionsList,
        steps: stepsList,
        notes: notesList,
        errors: [],
      } as Recipe
    },

    Metadata(_dash1, yaml, _dash2) {
      return {
        type: "metadata",
        position: stubPosition,
        content: yaml.sourceString,
        data: {},
      } as Metadata
    },

    Section_double(_eq1, name, _eq2) {
      return { type: "section", position: stubPosition, name: name.sourceString.trim() } as Section
    },

    Section_single(_eq, name) {
      return { type: "section", position: stubPosition, name: name.sourceString.trim() } as Section
    },

    Step(lines) {
      const stepLines = lines.children.map(
        (line: unknown) =>
          callToAST(line) as {
            text: string
            items: StepItem[]
            ingredients: Ingredient[]
            cookware: Cookware[]
            timers: Timer[]
            inlineComments: Comment[]
          },
      )

      const allItems: StepItem[] = []
      const allIngredients: Ingredient[] = []
      const allCookware: Cookware[] = []
      const allTimers: Timer[] = []
      const allComments: Comment[] = []
      let fullText = ""

      for (const line of stepLines) {
        fullText += `${line.text}\n`
        allItems.push(...line.items)
        allIngredients.push(...line.ingredients)
        allCookware.push(...line.cookware)
        allTimers.push(...line.timers)
        allComments.push(...line.inlineComments)
      }

      return {
        type: "step",
        position: stubPosition,
        text: fullText.trim(),
        items: allItems,
        ingredients: allIngredients,
        cookware: allCookware,
        timers: allTimers,
        inlineComments: allComments,
      } as Step
    },

    StepLine(items, inlineComment, _newline) {
      const stepItems = items.children
        .map((c: unknown) => (c as { toAST?: () => unknown }).toAST?.())
        .filter((c): c is NonNullable<typeof c> => c != null)

      const orderedItems: StepItem[] = []
      const ingredients: Ingredient[] = []
      const cookware: Cookware[] = []
      const timers: Timer[] = []
      const inlineComments: Comment[] = []

      for (const item of stepItems) {
        const typed = item as { type: string }
        switch (typed.type) {
          case "ingredient":
            ingredients.push(item as Ingredient)
            orderedItems.push(item as Ingredient)
            break
          case "cookware":
            cookware.push(item as Cookware)
            orderedItems.push(item as Cookware)
            break
          case "timer":
            timers.push(item as Timer)
            orderedItems.push(item as Timer)
            break
          case "text":
            orderedItems.push(item as TextItem)
            break
          case "comment":
            inlineComments.push(item as Comment)
            break
        }
      }

      if (inlineComment.numChildren > 0) {
        inlineComments.push(callToAST(inlineComment.children[0]) as Comment)
      }

      return {
        text: getSource(this),
        items: orderedItems,
        ingredients,
        cookware,
        timers,
        inlineComments,
      }
    },

    StepItem(self) {
      return callToAST(self)
    },

    Text(self) {
      return { type: "text", value: self.sourceString }
    },

    Ingredient_multi(_fixed, _at, _mods, _nameFirst, _space, _nameRest, _amount, _prep) {
      return ingredientFromSource(this)
    },

    Ingredient_single(_fixed, _at, _mods, _name, _amount, _prep) {
      return ingredientFromSource(this)
    },

    Cookware_multi(_hash, _mods, _nameFirst, _space, _nameRest, _amount) {
      return cookwareFromSource(this)
    },

    Cookware_single(_hash, _mods, _name, _amount) {
      return cookwareFromSource(this)
    },

    Timer_withAmount(_tilde, _name, _lbrace, _quantity, _unit, _rbrace) {
      const parsed = parseTimerToken(getSource(this))
      return {
        type: "timer",
        position: stubPosition,
        name: parsed.name,
        quantity: parsed.quantity,
        unit: parsed.unit,
        rawAmount: parsed.rawAmount,
      } as Timer
    },

    Timer_word(_tilde, name) {
      return {
        type: "timer",
        position: stubPosition,
        name: name.sourceString.trim(),
        quantity: "",
        unit: undefined,
      } as Timer
    },

    Note(_gt, noteContents, _newline) {
      return {
        type: "note",
        position: stubPosition,
        text: noteContents.sourceString.trim(),
      } as Note
    },

    InlineComment(_dash, text) {
      return { type: "comment", position: stubPosition, text: text.sourceString.trim() } as Comment
    },

    BlockComment(_start, _text, _end) {
      return null
    },

    RecipeItem(self) {
      return callToAST(self)
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

const semantics = createSemantics()

/**
 * Parse Cooklang source and return AST
 */
export function parseToAST(source: string): Recipe {
  const directiveMetadata = extractMetadataDirectives(source)
  const directiveEntries = Object.keys(directiveMetadata.metadata)
  const directiveNode: Metadata | null =
    directiveEntries.length > 0
      ? {
          type: "metadata",
          position: stubPosition,
          content: directiveMetadata.content,
          data: directiveMetadata.metadata,
        }
      : null

  const matchResult = grammar.match(directiveMetadata.strippedSource)

  if (!matchResult.succeeded()) {
    const mr = matchResult as unknown as { message?: string; shortMessage?: string }
    return {
      type: "recipe",
      position: stubPosition,
      metadata: directiveNode,
      sections: [],
      steps: [],
      notes: [],
      errors: [
        {
          message: mr.message || mr.shortMessage || "Parse error",
          position: stubPosition,
          severity: "error",
        },
      ],
    }
  }

  const cst = semantics(matchResult)
  const recipe = (cst as OhmNode).toAST() as Recipe

  if (recipe.metadata) {
    const parsedFrontmatter = parseYamlFrontmatter(recipe.metadata.content)
    recipe.metadata = { ...recipe.metadata, data: parsedFrontmatter.data }

    if (parsedFrontmatter.warning) {
      recipe.errors.push({
        message: parsedFrontmatter.warning,
        position: stubPosition,
        severity: "warning",
      })
    }
  }

  if (directiveNode) {
    if (recipe.metadata) {
      recipe.metadata = {
        ...recipe.metadata,
        content: [recipe.metadata.content, directiveNode.content]
          .filter(part => part.length > 0)
          .join("\n"),
        data: { ...recipe.metadata.data, ...directiveNode.data },
      }
    } else {
      recipe.metadata = directiveNode
    }
  }

  return recipe
}

/**
 * Get the raw Ohm grammar
 */
export function getGrammar(): Ohm.Grammar {
  return grammar
}
