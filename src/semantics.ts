import * as Ohm from "ohm-js"
import YAML, { YAMLError } from "yaml"
import grammarSource from "../grammars/cooklang.ohm" with { type: "text" }
import type {
  CooklangRecipe,
  ParseError,
  RecipeCookware,
  RecipeIngredient,
  RecipeStepItem,
  RecipeTimer,
  SourcePosition,
} from "./types"

const grammar = Ohm.grammar(grammarSource)

function parseQuantity(qty: string): string | number {
  const trimmed = qty.trim()
  if (!trimmed) return ""
  if (/[a-zA-Z]/.test(trimmed)) return trimmed

  const noSpaces = trimmed.replace(/\s+/g, "")
  const frac = noSpaces.match(/^(\d+)\/(\d+)$/)
  if (frac?.[1] && frac[2]) {
    if (frac[1].startsWith("0") && frac[1].length > 1) return trimmed
    if (+frac[2] !== 0) return +frac[1] / +frac[2]
  }
  const asNum = parseFloat(noSpaces)
  return Number.isNaN(asNum) ? trimmed : asNum
}

function parseAmount(content: string): { quantity: string | number; units: string } {
  const trimmed = content.trim().replace(/^=\s*/, "")
  const lastPercent = trimmed.lastIndexOf("%")
  if (lastPercent !== -1) {
    return {
      quantity: parseQuantity(trimmed.slice(0, lastPercent).trim()),
      units: trimmed.slice(lastPercent + 1).trim(),
    }
  }
  const spaceMatch = trimmed.match(/^(\S+)\s+(\S{3,}.*)$/)
  if (spaceMatch?.[1] && spaceMatch[2]) {
    return {
      quantity: parseQuantity(spaceMatch[1]),
      units: spaceMatch[2].trim(),
    }
  }
  return { quantity: parseQuantity(trimmed), units: "" }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v)
}

function parseYamlFrontmatter(content: string, yamlStartOffset: number): YamlParseResult {
  try {
    const parsed = YAML.parse(content)
    if (parsed == null) return { data: {} }
    if (!isRecord(parsed)) {
      const typeName = Array.isArray(parsed) ? "an array" : `a ${typeof parsed}`
      return {
        data: {},
        warning: `Invalid YAML frontmatter: expected a key/value mapping, got ${typeName}`,
        position: { line: 2, column: 1, offset: yamlStartOffset },
      }
    }
    return { data: parsed }
  } catch (error: unknown) {
    const linePos = error instanceof YAMLError ? error.linePos : undefined
    const errorOffset = linePos?.[0]
      ? computeYamlOffset(content, linePos[0].line, linePos[0].col)
      : 0
    return {
      data: {},
      warning: `Invalid YAML frontmatter: ${error instanceof Error ? error.message : "parse error"}`,
      position: linePos?.[0]
        ? {
            line: linePos[0].line,
            column: linePos[0].col,
            offset: yamlStartOffset + errorOffset,
          }
        : undefined,
    }
  }
}

function computeYamlOffset(content: string, line: number, col: number): number {
  const lineOffset = content
    .split("\n")
    .slice(0, line - 1)
    .reduce((sum, l) => sum + l.length + 1, 0)
  return lineOffset + col - 1
}

const directiveRegex = /^\s*>>\s*([^:]+?)\s*:\s*(.*)\s*$/

function extractMetadataDirectives(source: string): {
  metadata: Record<string, unknown>
  strippedSource: string
  offsetMap: number[]
} {
  const lines = source.split(/\r\n|\n|\r/)
  const metadata: Record<string, unknown> = {}
  const stripped: string[] = []
  const offsetMap: number[] = []
  let componentsMode = false
  let originalOffset = 0
  let strippedOffset = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ""
    const match = line.match(directiveRegex)

    if (!match) {
      const content = componentsMode ? "" : line
      for (let j = 0; j < content.length; j++) {
        offsetMap[strippedOffset + j] = originalOffset + j
      }
      stripped.push(content)
      strippedOffset += content.length + 1 // +1 for newline
      offsetMap[strippedOffset - 1] = originalOffset + line.length // map the newline
    } else {
      const key = (match[1] ?? "").trim()
      const value = (match[2] ?? "").trim()

      try {
        const parsed = value ? YAML.parse(value) : undefined
        metadata[key] = parsed === undefined ? value || null : parsed
      } catch {
        metadata[key] = value
      }
      stripped.push("")
      offsetMap[strippedOffset] = originalOffset + line.length
      strippedOffset += 1 // just the newline

      const lowerKey = key.toLowerCase()
      if (lowerKey === "[mode]" || lowerKey === "[define]") {
        const lower = value.toLowerCase()
        componentsMode = lower === "components" || lower === "ingredients"
      }
    }

    originalOffset += line.length
    if (i < lines.length - 1) {
      const restStart = originalOffset
      if (source[restStart] === "\r" && source[restStart + 1] === "\n") {
        originalOffset += 2
      } else {
        originalOffset += 1
      }
    }
  }

  return { metadata, strippedSource: stripped.join("\n"), offsetMap }
}

function mapOffset(off: number, map: number[]): number {
  if (map.length === 0) return off
  if (off < map.length) return map[off] ?? off
  return (map[map.length - 1] ?? map.length - 1) + (off - map.length + 1)
}

function parseComponent(raw: string): { name: string; amountContent?: string } {
  const trimmed = raw.trim()
  const braceStart = trimmed.endsWith("}") ? trimmed.lastIndexOf("{") : -1
  const rawName = braceStart === -1 ? trimmed : trimmed.slice(0, braceStart).trim()
  const name = rawName.replace(/\|.*/, "").trim()
  if (braceStart === -1) return { name }
  return { name, amountContent: trimmed.slice(braceStart + 1, -1) }
}

function convertIngredient(token: string): RecipeIngredient {
  const trimmed = token.trim()
  const stripped = trimmed.replace(/^=\s*/, "").replace(/^[@&?+-]+/, "")
  const prepMatch = stripped.match(/\(([^)]*)\)$/)
  const preparation = prepMatch?.[1] || undefined
  const body = prepMatch ? stripped.slice(0, prepMatch.index).trimEnd() : stripped
  const { name, amountContent } = parseComponent(body)
  const fixed = trimmed.startsWith("=") || amountContent?.trimStart().startsWith("=") === true
  const content = amountContent?.trim()
  const amt = content ? parseAmount(content) : { quantity: "some", units: "" }
  return { type: "ingredient", name, ...amt, fixed, preparation }
}

function convertCookware(token: string): RecipeCookware {
  const { name, amountContent } = parseComponent(token.trim().replace(/^[#&?+-]+/, ""))
  const rawQty = amountContent?.trim()
  const asNum = rawQty ? parseFloat(rawQty) : NaN
  const quantity: number | string = rawQty ? (Number.isNaN(asNum) ? rawQty : asNum) : 1
  return { type: "cookware", name, quantity, units: "" }
}

function convertTimer(token: string): RecipeTimer {
  const { name, amountContent } = parseComponent(token.trim().replace(/^~/, ""))
  if (!amountContent) return { type: "timer", name, quantity: "", units: "" }
  const { quantity, units } = parseAmount(amountContent)
  return { type: "timer", name, quantity, units }
}

function mergeConsecutiveTexts(items: RecipeStepItem[]): RecipeStepItem[] {
  const result: RecipeStepItem[] = []
  for (const item of items) {
    const prev = result[result.length - 1]
    if (item.type === "text" && prev?.type === "text") {
      result[result.length - 1] = { type: "text", value: `${prev.value} ${item.value}` }
    } else {
      result.push(item)
    }
  }
  return result
}

function collectUnique<T extends RecipeStepItem>(
  steps: RecipeStepItem[][],
  type: string,
  key: (item: T) => string,
): T[] {
  const seen = new Set<string>()
  const result: T[] = []
  for (const item of steps.flat()) {
    if (item.type !== type) continue
    const k = key(item as T)
    if (!seen.has(k)) {
      seen.add(k)
      result.push(item as T)
    }
  }
  return result
}

function isASTNode(n: unknown): n is { type: string; name: string; text: string } {
  return isRecord(n) && typeof n.type === "string"
}

interface YamlParseResult {
  data: Record<string, unknown>
  warning?: string
  position?: SourcePosition
}

interface SemanticResult {
  frontmatter: string | null
  steps: RecipeStepItem[][]
  sections: string[]
  notes: string[]
}

const semantics = grammar.createSemantics()

semantics.addOperation("toAST", {
  Recipe(_metadata, items) {
    const frontmatter: string | null = _metadata.numChildren > 0 ? _metadata.child(0).toAST() : null
    const nodes = items.children.map(c => c.toAST()).filter(Boolean)
    const tagged = nodes.filter(isASTNode)
    return {
      frontmatter,
      steps: nodes.filter(Array.isArray).filter(a => a.length > 0),
      sections: tagged.filter(n => n.type === "section").map(n => n.name),
      notes: tagged.filter(n => n.type === "note").map(n => n.text),
    }
  },

  Metadata(_dash1, yaml, _dash2) {
    return yaml.sourceString
  },

  Section(_child) {
    return { type: "section", name: this.sourceString.replace(/^=+\s*|\s*=+$/g, "").trim() }
  },

  Step(lines) {
    return mergeConsecutiveTexts(lines.children.flatMap(c => c.toAST()))
  },

  StepLine(items, _inlineComment, _newline) {
    return items.children.map(c => c.toAST())
  },

  Text(self) {
    return { type: "text", value: self.sourceString }
  },

  Ingredient(_child) {
    return convertIngredient(this.sourceString)
  },

  Cookware(_child) {
    return convertCookware(this.sourceString)
  },

  Timer(_child) {
    return convertTimer(this.sourceString)
  },

  Note(_gt, noteContents, _newline) {
    return { type: "note", text: noteContents.sourceString.trim() }
  },

  _nonterminal(...children) {
    if (children.length !== 1) return null
    const first = children[0]
    return first ? first.toAST() : null
  },

  _terminal() {
    return null
  },
})

export function parseCooklang(source: string): CooklangRecipe {
  const directives = extractMetadataDirectives(source)
  const matchResult = grammar.match(directives.strippedSource)

  if (matchResult.failed()) {
    const pos = matchResult.getInterval().getLineAndColumn()
    const mappedOffset = mapOffset(pos.offset, directives.offsetMap)
    const shortMsg = (matchResult.shortMessage || "Parse error").replace(
      /^Line \d+, col \d+:\s*/,
      "",
    )
    return {
      metadata: directives.metadata,
      steps: [],
      ingredients: [],
      cookware: [],
      timers: [],
      sections: [],
      notes: [],
      errors: [
        {
          message: shortMsg,
          shortMessage: shortMsg,
          position: { line: pos.lineNum, column: pos.colNum, offset: mappedOffset },
          severity: "error",
        },
      ],
      warnings: [],
    }
  }

  const result: SemanticResult = semantics(matchResult).toAST()
  const yamlStartOffset = result.frontmatter ? source.indexOf("---") + 4 : 0
  const yaml = result.frontmatter ? parseYamlFrontmatter(result.frontmatter, yamlStartOffset) : null
  const warnings: ParseError[] = []
  if (yaml?.warning) {
    warnings.push({
      message: yaml.warning,
      position: yaml.position ?? { line: 1, column: 1, offset: 0 },
      severity: "warning",
    })
  }

  const metadata = { ...yaml?.data, ...directives.metadata }
  const keyFn = (i: { name: string; quantity: string | number; units: string }) =>
    `${i.name}|${i.quantity}|${i.units}`

  return {
    metadata,
    steps: result.steps,
    ingredients: collectUnique<RecipeIngredient>(result.steps, "ingredient", keyFn),
    cookware: collectUnique<RecipeCookware>(result.steps, "cookware", i => i.name),
    timers: collectUnique<RecipeTimer>(result.steps, "timer", keyFn),
    sections: result.sections,
    notes: result.notes,
    errors: [],
    warnings,
  }
}

export { grammar }
