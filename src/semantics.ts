import * as Ohm from "ohm-js"
import YAML, { YAMLError } from "yaml"
import grammarSource from "../grammars/cooklang.ohm" with { type: "text" }
import type {
  CooklangRecipe,
  ParseError,
  RecipeCookware,
  RecipeIngredient,
  RecipeSection,
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
 * Only `%` is the qty/unit separator (matching cooklang-rs canonical behavior).
 * A leading `=` (fixed indicator) is stripped.
 */
function parseAmount(raw: string): { quantity: string | number; units: string } {
  const amount = raw.trim().replace(/^=\s*/, "")

  // "%" is the only qty/unit separator (cooklang-rs canonical mode)
  const pctIdx = amount.lastIndexOf("%")
  if (pctIdx !== -1) {
    return {
      quantity: parseQuantity(amount.slice(0, pctIdx).trim()),
      units: amount.slice(pctIdx + 1).trim(),
    }
  }

  return { quantity: parseQuantity(amount), units: "" }
}

// ---------------------------------------------------------------------------
// Component parsing (ingredients, cookware, timers)
// ---------------------------------------------------------------------------

/** Extract name, optional alias, and optional brace-delimited amount from a component token. */
function parseComponent(raw: string): { name: string; alias?: string; amountContent?: string } {
  const trimmed = raw.trim()
  const braceStart = trimmed.endsWith("}") ? trimmed.lastIndexOf("{") : -1
  const rawName = braceStart === -1 ? trimmed : trimmed.slice(0, braceStart).trim()
  const pipeIdx = rawName.indexOf("|")
  const name = pipeIdx === -1 ? rawName : rawName.slice(0, pipeIdx).trim()
  const alias = pipeIdx === -1 ? undefined : rawName.slice(pipeIdx + 1).trim() || undefined
  if (braceStart === -1) return { name, alias }
  return { name, alias, amountContent: trimmed.slice(braceStart + 1, -1) }
}

function convertIngredient(token: string): RecipeIngredient {
  const trimmed = token.trim()
  const stripped = trimmed.replace(/^[@&?+-]+/, "")

  // Extract trailing (note)
  const noteMatch = stripped.match(/\(([^)]*)\)$/)
  const note = noteMatch?.[1] || undefined
  const body = noteMatch ? stripped.slice(0, noteMatch.index).trimEnd() : stripped

  const { name, alias, amountContent } = parseComponent(body)
  const fixed = amountContent?.trimStart().startsWith("=") === true
  const content = amountContent?.trim()
  const amt = content ? parseAmount(content) : { quantity: "some", units: "" }
  return { type: "ingredient", name, alias, ...amt, fixed, note }
}

function convertCookware(token: string): RecipeCookware {
  const stripped = token.trim().replace(/^[#&?+-]+/, "")
  // Extract trailing (note)
  const noteMatch = stripped.match(/\(([^)]*)\)$/)
  const note = noteMatch?.[1] || undefined
  const bodyStr = noteMatch ? stripped.slice(0, noteMatch.index).trimEnd() : stripped

  const { name, alias, amountContent } = parseComponent(bodyStr)
  const rawQty = amountContent?.trim()
  const num = rawQty ? parseFloat(rawQty) : NaN
  const quantity: number | string = rawQty ? (Number.isNaN(num) ? rawQty : num) : 1
  return { type: "cookware", name, alias, quantity, units: "", note }
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
// Block comment stripping
// ---------------------------------------------------------------------------

/** Strip block comments [- ... -] from source, replacing with spaces to preserve offsets. */
function stripBlockComments(source: string): string {
  return source.replace(/\[-[\s\S]*?-\]/g, match => {
    // Replace each character with a space, but preserve newlines
    return match.replace(/[^\n]/g, " ")
  })
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

/** Collect unique items of a given type across all sections. */
function collectUnique<T extends RecipeStepItem>(
  sections: RecipeSection[],
  type: string,
  key: (item: T) => string,
): T[] {
  const seen = new Set<string>()
  const result: T[] = []
  for (const section of sections) {
    for (const content of section.content) {
      if (content.type !== "step") continue
      for (const item of content.items) {
        if (item.type !== type) continue
        const k = key(item as T)
        if (!seen.has(k)) {
          seen.add(k)
          result.push(item as T)
        }
      }
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Ohm semantic actions
// ---------------------------------------------------------------------------

interface DirectiveNode {
  type: "directive"
  key: string
  rawValue: string
}

type SemanticItem =
  | { kind: "step"; items: RecipeStepItem[] }
  | { kind: "section"; name: string }
  | { kind: "note"; text: string }

interface SemanticResult {
  frontmatter: string | null
  directives: DirectiveNode[]
  items: SemanticItem[]
}

const semantics = grammar.createSemantics()

semantics.addOperation("toAST", {
  Recipe(leading, _metadata, items) {
    const frontmatter: string | null = _metadata.numChildren > 0 ? _metadata.child(0).toAST() : null

    // Collect directives from both leading section and body
    const directives: DirectiveNode[] = []
    for (const child of leading.children) {
      const result = child.toAST()
      if (isRecord(result) && result.type === "directive") {
        directives.push(result as unknown as DirectiveNode)
      }
    }

    const orderedItems: SemanticItem[] = []
    for (const node of items.children.map(c => c.toAST()).filter(Boolean)) {
      if (isRecord(node) && node.type === "directive") {
        directives.push(node as unknown as DirectiveNode)
      } else if (Array.isArray(node) && node.length > 0) {
        orderedItems.push({ kind: "step", items: node })
      } else if (isASTNode(node) && node.type === "section") {
        orderedItems.push({ kind: "section", name: node.name })
      } else if (isASTNode(node) && node.type === "note") {
        orderedItems.push({ kind: "note", text: node.text })
      }
    }

    return { frontmatter, directives, items: orderedItems }
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

  MetadataDirective(_hspace, _arrows, body, _newline) {
    return body.toAST()
  },

  directiveBody(_hspace1, key, _hspace2, _colon, value) {
    return { type: "directive", key: key.sourceString.trim(), rawValue: value.sourceString.trim() }
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
  // Only pre-processing: strip block comments
  const withoutBlockComments = stripBlockComments(source)
  const matchResult = grammar.match(withoutBlockComments)

  if (matchResult.failed()) {
    const pos = matchResult.getInterval().getLineAndColumn()
    const shortMsg = (matchResult.shortMessage || "Parse error").replace(
      /^Line \d+, col \d+:\s*/,
      "",
    )
    return {
      metadata: {},
      sections: [],
      ingredients: [],
      cookware: [],
      timers: [],
      errors: [
        {
          message: shortMsg,
          shortMessage: shortMsg,
          position: { line: pos.lineNum, column: pos.colNum, offset: pos.offset },
          severity: "error",
        },
      ],
      warnings: [],
    }
  }

  const result: SemanticResult = semantics(matchResult).toAST()

  // Parse frontmatter YAML if present
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

  // Build metadata: frontmatter + directives (only when no frontmatter)
  const directiveMetadata: Record<string, unknown> = {}
  if (!result.frontmatter) {
    for (const dir of result.directives) {
      try {
        const parsed = dir.rawValue ? YAML.parse(dir.rawValue) : undefined
        directiveMetadata[dir.key] = parsed === undefined ? dir.rawValue || null : parsed
      } catch {
        directiveMetadata[dir.key] = dir.rawValue
      }
    }
  }
  const metadata = { ...(yaml?.data ?? {}), ...directiveMetadata }

  // Build sections from ordered semantic items
  const allSections: RecipeSection[] = []
  let currentSection: RecipeSection = { name: null, content: [] }
  allSections.push(currentSection)

  for (const item of result.items) {
    if (item.kind === "section") {
      currentSection = { name: item.name, content: [] }
      allSections.push(currentSection)
    } else if (item.kind === "step") {
      currentSection.content.push({ type: "step", items: item.items })
    } else if (item.kind === "note") {
      currentSection.content.push({ type: "text", value: item.text })
    }
  }

  // Filter out empty implicit (unnamed) sections to match cooklang-rs behavior
  const sections = allSections.filter(s => s.name !== null || s.content.length > 0)

  const keyFn = (i: { name: string; quantity: string | number; units: string }) =>
    `${i.name}|${i.quantity}|${i.units}`

  return {
    metadata,
    sections,
    ingredients: collectUnique<RecipeIngredient>(sections, "ingredient", keyFn),
    cookware: collectUnique<RecipeCookware>(sections, "cookware", i => i.name),
    timers: collectUnique<RecipeTimer>(sections, "timer", keyFn),
    errors: [],
    warnings,
  }
}

export { grammar }
