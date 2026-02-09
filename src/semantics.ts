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

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v)
}

function isASTNode(n: unknown): n is { type: string; name: string; text: string } {
  return isRecord(n) && typeof n.type === "string"
}

// ---------------------------------------------------------------------------
// Quantity & amount parsing
// ---------------------------------------------------------------------------

/** Parse a quantity string into a number (including fractions) or keep as string. */
function parseQuantity(raw: string): string | number {
  const qty = raw.trim()
  if (!qty) return ""
  if (/[a-zA-Z]/.test(qty)) return qty

  const compact = qty.replace(/\s+/g, "")
  const frac = compact.match(/^(\d+)\/(\d+)$/)
  if (frac?.[1] && frac[2]) {
    // Preserve leading-zero fractions like "01/2" as strings
    if (frac[1].startsWith("0") && frac[1].length > 1) return qty
    if (+frac[2] !== 0) return +frac[1] / +frac[2]
  }
  const num = parseFloat(compact)
  return Number.isNaN(num) ? qty : num
}

/**
 * Split an amount string into quantity and units.
 * Formats: "qty%unit", "qty unit" (unit >= 3 chars), or bare quantity.
 * A leading `=` (fixed indicator) is stripped.
 */
function parseAmount(raw: string): { quantity: string | number; units: string } {
  const amount = raw.trim().replace(/^=\s*/, "")

  // "%" is the canonical qty/unit separator
  const pctIdx = amount.lastIndexOf("%")
  if (pctIdx !== -1) {
    return {
      quantity: parseQuantity(amount.slice(0, pctIdx).trim()),
      units: amount.slice(pctIdx + 1).trim(),
    }
  }

  // Space separator: "100 grams" (unit must be >= 3 chars to avoid "1 ½" splits)
  const spaceMatch = amount.match(/^(\S+)\s+(\S{3,}.*)$/)
  if (spaceMatch?.[1] && spaceMatch[2]) {
    return {
      quantity: parseQuantity(spaceMatch[1]),
      units: spaceMatch[2].trim(),
    }
  }

  return { quantity: parseQuantity(amount), units: "" }
}

// ---------------------------------------------------------------------------
// Component parsing (ingredients, cookware, timers)
// ---------------------------------------------------------------------------

/** Extract name and optional brace-delimited amount from a component token. */
function parseComponent(raw: string): { name: string; amountContent?: string } {
  const trimmed = raw.trim()
  const braceStart = trimmed.endsWith("}") ? trimmed.lastIndexOf("{") : -1
  const rawName = braceStart === -1 ? trimmed : trimmed.slice(0, braceStart).trim()
  const name = rawName.replace(/\|.*/, "").trim() // strip pipe alias
  if (braceStart === -1) return { name }
  return { name, amountContent: trimmed.slice(braceStart + 1, -1) }
}

function convertIngredient(token: string): RecipeIngredient {
  const trimmed = token.trim()
  const stripped = trimmed.replace(/^=\s*/, "").replace(/^[@&?+-]+/, "")

  // Extract trailing (preparation)
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
  const num = rawQty ? parseFloat(rawQty) : NaN
  const quantity: number | string = rawQty ? (Number.isNaN(num) ? rawQty : num) : 1
  return { type: "cookware", name, quantity, units: "" }
}

function convertTimer(token: string): RecipeTimer {
  const { name, amountContent } = parseComponent(token.trim().replace(/^~/, ""))
  if (!amountContent) return { type: "timer", name, quantity: "", units: "" }
  const { quantity, units } = parseAmount(amountContent)
  return { type: "timer", name, quantity, units }
}

// ---------------------------------------------------------------------------
// YAML frontmatter
// ---------------------------------------------------------------------------

interface YamlParseResult {
  data: Record<string, unknown>
  warning?: string
  position?: SourcePosition
}

function computeYamlOffset(content: string, line: number, col: number): number {
  const linesAbove = content.split("\n").slice(0, line - 1)
  return linesAbove.reduce((sum, l) => sum + l.length + 1, 0) + col - 1
}

/** Lenient line-by-line `key: value` parser for frontmatter that isn't valid YAML. */
function parseFrontmatterLines(content: string): Record<string, string> | null {
  const data: Record<string, string> = {}
  for (const line of content.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const colonIdx = trimmed.indexOf(":")
    if (colonIdx <= 0) return null
    const key = trimmed.slice(0, colonIdx).trim()
    const value = trimmed.slice(colonIdx + 1).trim()
    if (!key) return null
    data[key] = value
  }
  return Object.keys(data).length > 0 ? data : null
}

function parseYamlFrontmatter(content: string, yamlStartOffset: number): YamlParseResult {
  try {
    const parsed = YAML.parse(content)
    if (parsed == null) {
      const fallback = parseFrontmatterLines(content)
      if (fallback) return { data: fallback }
      return { data: {} }
    }
    if (!isRecord(parsed)) {
      const fallback = parseFrontmatterLines(content)
      if (fallback) return { data: fallback }
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

// ---------------------------------------------------------------------------
// Metadata directives (>> key: value)
// ---------------------------------------------------------------------------

const directiveRegex = /^\s*>>\s*([^:]+?)\s*:\s*(.*)\s*$/

/**
 * Strip `>> key: value` directive lines from source before grammar matching.
 * Returns directive metadata, stripped source, and an offset map that
 * translates positions in stripped source back to the original.
 */
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

    if (match) {
      // Directive line — extract key/value, emit empty line to preserve line count
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
      strippedOffset += 1

      // [mode]/[define] directives switch to components-only mode
      const lowerKey = key.toLowerCase()
      if (lowerKey === "[mode]" || lowerKey === "[define]") {
        const lower = value.toLowerCase()
        componentsMode = lower === "components" || lower === "ingredients"
      }
    } else {
      // Regular line — copy through (blank if in components mode)
      const content = componentsMode ? "" : line
      for (let j = 0; j < content.length; j++) {
        offsetMap[strippedOffset + j] = originalOffset + j
      }
      stripped.push(content)
      strippedOffset += content.length + 1 // +1 for newline
      offsetMap[strippedOffset - 1] = originalOffset + line.length
    }

    // Advance past the line content + its newline separator
    originalOffset += line.length
    if (i < lines.length - 1) {
      originalOffset += source[originalOffset] === "\r" && source[originalOffset + 1] === "\n" ? 2 : 1
    }
  }

  return { metadata, strippedSource: stripped.join("\n"), offsetMap }
}

/** Map an offset in stripped source back to the original source. */
function mapOffset(off: number, map: number[]): number {
  if (map.length === 0) return off
  if (off < map.length) return map[off] ?? off
  return (map[map.length - 1] ?? map.length - 1) + (off - map.length + 1)
}

// ---------------------------------------------------------------------------
// Step utilities
// ---------------------------------------------------------------------------

/** Merge adjacent text items into single items (e.g. across soft line breaks). */
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

/** Collect unique items of a given type across all steps. */
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

// ---------------------------------------------------------------------------
// Ohm semantic actions
// ---------------------------------------------------------------------------

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
    return children[0]?.toAST() ?? null
  },

  _terminal() {
    return null
  },
})

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

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
