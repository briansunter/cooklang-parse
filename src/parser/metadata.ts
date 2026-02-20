import type { ParseError, SourcePosition } from "../types"
import type { DefineMode, DirectiveNode } from "./internal-types"

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v)
}

/** Standard key aliases -> canonical name (from cooklang-rs StdKey::from_str). */
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
 * Returns a type mismatch descriptor when validation fails.
 */
function checkStdEntry(stdKey: string, value: unknown): { expected: string; got: string } | null {
  const t = typeof value

  switch (stdKey) {
    case "servings":
      if (t !== "number") return { expected: "number", got: metaTypeName(value) }
      break

    case "title":
    case "description":
      if (t !== "string") return { expected: "string", got: metaTypeName(value) }
      break

    case "time":
      if (t !== "string" && t !== "number" && !isRecord(value)) {
        return { expected: "string", got: metaTypeName(value) }
      }
      break

    case "prep_time":
    case "cook_time":
      if (t !== "string" && t !== "number") return { expected: "string", got: metaTypeName(value) }
      break

    case "tags":
      if (t !== "string" && !Array.isArray(value)) {
        return { expected: "sequence", got: metaTypeName(value) }
      }
      break

    case "locale":
      if (t !== "string") return { expected: "string", got: metaTypeName(value) }
      break

    case "author":
    case "source":
      if (t !== "string" && !isRecord(value)) {
        return { expected: "mapping", got: metaTypeName(value) }
      }
      break

    // course, difficulty, cuisine, diet, images: no validation
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

/** Validate standard metadata entries and push type-mismatch warnings. */
export function checkStandardMetadata(
  metadata: Record<string, unknown>,
  warnings: ParseError[],
  directives: DirectiveNode[],
): void {
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
        message: `Unsupported value for key: '${key}'`,
        position,
        severity: "warning",
        help: "It will be a regular metadata entry",
      })
    }
  }
}

export function isSpecialDirectiveKey(key: string): boolean {
  const lower = key.toLowerCase()
  return lower === "[mode]" || lower === "[define]" || lower === "[duplicate]"
}

export function applyDirectiveMode(current: DefineMode, key: string, rawValue: string): DefineMode {
  const lowerKey = key.toLowerCase()
  if (lowerKey !== "[mode]" && lowerKey !== "[define]") {
    return current
  }

  const value = rawValue.toLowerCase()
  if (value === "all" || value === "default") return "all"
  if (value === "components" || value === "ingredients") return "components"
  if (value === "steps") return "steps"
  if (value === "text") return "text"
  return current
}

export function createDeprecatedMetadataWarning(directives: DirectiveNode[]): ParseError | null {
  if (directives.length === 0) return null
  const firstDirective = directives[0]
  if (!firstDirective) return null

  const yamlLines = directives.map(dir => {
    const val = dir.rawValue
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

  return {
    message: "The '>>' syntax for metadata is deprecated, use a YAML frontmatter",
    position: firstDirective.position,
    severity: "warning",
    help: suggestion,
  }
}
