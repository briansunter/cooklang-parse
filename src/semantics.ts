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

  // Mixed fraction: "1 1/2", "2 3/4"
  const mixed = qty.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/)
  if (mixed) {
    const whole = mixed[1] ?? ""
    const mNum = mixed[2] ?? ""
    const mDen = mixed[3] ?? ""
    if (whole.startsWith("0") && whole.length > 1) return qty
    if (mNum.startsWith("0") && mNum.length > 1) return qty
    if (+mDen !== 0) return +whole + +mNum / +mDen
  }

  // Simple fraction: "1/2", "3/4"
  const frac = qty.match(/^(\d+)\s*\/\s*(\d+)$/)
  if (frac?.[1] && frac[2]) {
    if (frac[1].startsWith("0") && frac[1].length > 1) return qty
    if (+frac[2] !== 0) return +frac[1] / +frac[2]
  }

  const num = Number(qty)
  return Number.isNaN(num) ? qty : num
}

// ---------------------------------------------------------------------------
// Component builders
// ---------------------------------------------------------------------------

/** Extract name and optional alias from a raw name string containing optional pipe syntax. */
function splitNameAlias(rawName: string): { name: string; alias?: string } {
  const pipeIdx = rawName.indexOf("|")
  const name = pipeIdx === -1 ? rawName : rawName.slice(0, pipeIdx).trim()
  const alias = pipeIdx === -1 ? undefined : rawName.slice(pipeIdx + 1).trim() || undefined
  return { name, alias }
}

/** Build an ingredient from structured grammar data. */
function buildIngredient(
  rawName: string,
  amount: { quantity: string | number; units: string; fixed: boolean },
  note: string | undefined,
): RecipeIngredient {
  const { name, alias } = splitNameAlias(rawName)
  return { type: "ingredient", name, alias, ...amount, note }
}

/** Build a cookware item from structured grammar data. */
function buildCookware(
  rawName: string,
  quantity: string | number,
  note: string | undefined,
): RecipeCookware {
  const { name, alias } = splitNameAlias(rawName)
  return { type: "cookware", name, alias, quantity, units: "", note }
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

/** Strip block comments [- ... -] from source, preserving only newlines. */
function stripBlockComments(source: string): string {
  return source.replace(/\[-[\s\S]*?-\]/g, match => {
    return match.replace(/[^\n]/g, "")
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
  position: SourcePosition
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

  Section_double(_eq1, name, _eq2) {
    return { type: "section", name: name.sourceString.trim() }
  },

  Section_single(_eq, name) {
    return { type: "section", name: name.sourceString.trim() }
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

  Ingredient_multi(_at, _mods, firstWord, _spacesIter, moreWordsIter, amount, noteOpt) {
    const rawName = [firstWord, ...moreWordsIter.children].map(w => w.sourceString).join(" ")
    const note: string | undefined = noteOpt.numChildren > 0 ? noteOpt.child(0).toAST() : undefined
    return buildIngredient(rawName, amount.toAST(), note)
  },

  Ingredient_single(_at, _mods, word, amountOpt, noteOpt) {
    const amt =
      amountOpt.numChildren > 0
        ? amountOpt.child(0).toAST()
        : { quantity: "some", units: "", fixed: false }
    const note: string | undefined = noteOpt.numChildren > 0 ? noteOpt.child(0).toAST() : undefined
    return buildIngredient(word.sourceString, amt, note)
  },

  ingredientAmount_withUnit(_open, fixedOpt, qty, _pct, unit, _close) {
    return {
      quantity: parseQuantity(qty.sourceString.trim()),
      units: unit.sourceString.trim(),
      fixed: fixedOpt.numChildren > 0,
    }
  },

  ingredientAmount_quantityOnly(_open, fixedOpt, qty, _close) {
    return {
      quantity: parseQuantity(qty.sourceString.trim()),
      units: "",
      fixed: fixedOpt.numChildren > 0,
    }
  },

  ingredientAmount_empty(_open, _hspace1, fixedOpt, _hspace2, _close) {
    return { quantity: "some", units: "", fixed: fixedOpt.numChildren > 0 }
  },

  ingredientNote(_open, content, _close) {
    return content.sourceString
  },

  Cookware_multi(_hash, _mods, firstWord, _spacesIter, moreWordsIter, amount, noteOpt) {
    const rawName = [firstWord, ...moreWordsIter.children].map(w => w.sourceString).join(" ")
    const note: string | undefined = noteOpt.numChildren > 0 ? noteOpt.child(0).toAST() : undefined
    return buildCookware(rawName, amount.toAST().quantity, note)
  },

  Cookware_single(_hash, _mods, word, amountOpt, noteOpt) {
    const qty = amountOpt.numChildren > 0 ? amountOpt.child(0).toAST().quantity : 1
    const note: string | undefined = noteOpt.numChildren > 0 ? noteOpt.child(0).toAST() : undefined
    return buildCookware(word.sourceString, qty, note)
  },

  cookwareAmount_empty(_open, _hspace, _close) {
    return { quantity: 1 }
  },

  cookwareAmount_withQuantity(_open, qty, _close) {
    const raw = qty.sourceString.trim()
    const n = Number.parseFloat(raw)
    return { quantity: Number.isNaN(n) ? raw : n }
  },

  cookwareNote(_open, content, _close) {
    return content.sourceString
  },

  Timer_withUnit(_tilde, nameOpt, _open, qty, _pct, unit, _close) {
    return {
      type: "timer",
      name: nameOpt.numChildren > 0 ? nameOpt.child(0).sourceString : "",
      quantity: parseQuantity(qty.sourceString.trim()),
      units: unit.sourceString.trim(),
    }
  },

  Timer_quantityOnly(_tilde, nameOpt, _open, qty, _close) {
    return {
      type: "timer",
      name: nameOpt.numChildren > 0 ? nameOpt.child(0).sourceString : "",
      quantity: parseQuantity(qty.sourceString.trim()),
      units: "",
    }
  },

  Timer_word(_tilde, name) {
    return { type: "timer", name: name.sourceString, quantity: "", units: "" }
  },

  Note(_gt, noteContents, _newline) {
    return { type: "note", text: noteContents.sourceString.trim() }
  },

  MetadataDirective(_hspace, _arrows, body, _newline) {
    return body.toAST()
  },

  directiveBody(_hspace1, key, _hspace2, _colon, value) {
    const pos = this.source.getLineAndColumn()
    return {
      type: "directive",
      key: key.sourceString.trim(),
      rawValue: value.sourceString.trim(),
      position: { line: pos.lineNum, column: pos.colNum, offset: pos.offset },
    }
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
// Standard metadata key validation (matching cooklang-rs check_std_entry)
// ---------------------------------------------------------------------------

/** Standard key aliases → canonical name (from cooklang-rs StdKey::from_str) */
const STD_KEY_ALIASES: Record<string, string> = {
  introduction: "description",
  tag: "tags",
  serves: "servings",
  yield: "servings",
  category: "course",
  "time required": "time",
  duration: "time",
  "prep time": "prep_time",
  "cook time": "cook_time",
  image: "images",
  picture: "images",
  pictures: "images",
}

/** Resolve a metadata key to its canonical standard key name, or null if not standard. */
function resolveStdKey(key: string): string | null {
  const lower = key.toLowerCase()
  const alias = STD_KEY_ALIASES[lower]
  if (alias) return alias
  const stdKeys = [
    "title",
    "description",
    "tags",
    "author",
    "source",
    "servings",
    "course",
    "time",
    "prep_time",
    "cook_time",
    "difficulty",
    "cuisine",
    "diet",
    "images",
    "locale",
  ]
  return stdKeys.includes(lower) ? lower : null
}

/**
 * Check a standard metadata key/value pair, matching cooklang-rs `check_std_entry`.
 * Returns an error message string if validation fails, null if it passes.
 *
 * Acceptance rules (from cooklang-rs metadata.rs):
 *   servings           → number only (as_u32)
 *   title, description → string only (as_str)
 *   time               → string | number | mapping {prep,cook} (value_as_time)
 *   prep_time,cook_time→ string | number (value_as_minutes accepts time strings)
 *   tags               → string (comma-sep) | sequence (value_as_tags)
 *   locale             → string with ISO 639 pattern (value_as_locale)
 *   author, source     → string | mapping {name,url} (as_name_and_url)
 *   course, difficulty, cuisine, diet, images → no validation
 */
function checkStdEntry(stdKey: string, value: unknown): { expected: string; got: string } | null {
  const t = typeof value

  switch (stdKey) {
    case "servings":
      // cooklang-rs: value.as_u32() — only numbers
      if (t !== "number") return { expected: "number", got: metaTypeName(value) }
      break

    case "title":
    case "description":
      // cooklang-rs: value.as_str() — only strings
      if (t !== "string") return { expected: "string", got: metaTypeName(value) }
      break

    case "time":
      // cooklang-rs: value_as_time → string | number | mapping {prep,cook}
      if (t !== "string" && t !== "number" && !isRecord(value))
        return { expected: "string", got: metaTypeName(value) }
      break

    case "prep_time":
    case "cook_time":
      // cooklang-rs: value_as_minutes → string | number
      if (t !== "string" && t !== "number") return { expected: "string", got: metaTypeName(value) }
      break

    case "tags":
      // cooklang-rs: value_as_tags → string | sequence
      if (t !== "string" && !Array.isArray(value))
        return { expected: "sequence", got: metaTypeName(value) }
      break

    case "locale":
      // cooklang-rs: value_as_locale → string with pattern check
      if (t !== "string") return { expected: "string", got: metaTypeName(value) }
      break

    case "author":
    case "source":
      // cooklang-rs: as_name_and_url → string | mapping
      if (t !== "string" && !isRecord(value))
        return { expected: "mapping", got: metaTypeName(value) }
      break

    // course, difficulty, cuisine, diet, images — no validation
    default:
      break
  }

  return null
}

/** Map a JS value to cooklang-rs MetaType name (snake_case). */
function metaTypeName(value: unknown): string {
  if (value === null || value === undefined) return "null"
  if (typeof value === "boolean") return "bool"
  if (typeof value === "number") return "number"
  if (typeof value === "string") return "string"
  if (Array.isArray(value)) return "sequence"
  if (typeof value === "object") return "mapping"
  return "unknown"
}

/**
 * Validate standard metadata entries and push type-mismatch warnings.
 * Matches cooklang-rs behavior: `check_std_entry` is called for each key,
 * producing warnings like "Unsupported value for key: 'servings'" with
 * hint "It will be a regular metadata entry".
 */
function checkStandardMetadata(
  metadata: Record<string, unknown>,
  warnings: ParseError[],
  directives: DirectiveNode[],
): void {
  // Build a position lookup from directives
  const directivePositions = new Map<string, SourcePosition>()
  for (const dir of directives) {
    if (!directivePositions.has(dir.key)) {
      directivePositions.set(dir.key, dir.position)
    }
  }

  for (const [key, value] of Object.entries(metadata)) {
    const stdKey = resolveStdKey(key)
    if (!stdKey) continue

    const err = checkStdEntry(stdKey, value)
    if (err) {
      const position = directivePositions.get(key) ?? { line: 1, column: 1, offset: 0 }
      warnings.push({
        message: `Unsupported value for key '${key}': expected ${err.expected === "number" ? "a number" : err.expected}, got ${err.got === "number" ? "a number" : `a ${err.got}`}`,
        position,
        severity: "warning",
        help: "It will be stored as a regular metadata entry",
      })
    }
  }
}

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
      directiveMetadata[dir.key] = dir.rawValue || ""
    }
  }
  const metadata = { ...(yaml?.data ?? {}), ...directiveMetadata }

  // Validate standard metadata keys (matching cooklang-rs check_std_entry)
  checkStandardMetadata(metadata, warnings, result.directives)

  // Generate deprecated >> syntax warning
  const firstDirective = result.directives[0]
  if (firstDirective) {
    const yamlLines = result.directives.map(dir => {
      const val = dir.rawValue
      // Quote values that YAML would parse as non-string (numbers, booleans, null, etc.)
      const needsQuote =
        val === "" ||
        val === "true" ||
        val === "false" ||
        val === "null" ||
        val === "~" ||
        /^-?\d+(\.\d+)?$/.test(val)
      return `${dir.key}: ${needsQuote ? `'${val}'` : val}`
    })
    const suggestion = `---\n${yamlLines.join("\n")}\n---`
    warnings.push({
      message: "The '>>' syntax for metadata is deprecated. Use YAML frontmatter instead.",
      position: firstDirective.position,
      severity: "warning",
      help: suggestion,
    })
  }

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
