/**
 * Normalizers that map cooklang-parse output and cooklang-rs (json_oracle) output
 * onto a single comparable shape for differential testing.
 *
 * Documented representational equivalences (not behavior differences):
 * - Rust `quantity: null` on an ingredient ≡ ours `{quantity: "some", units: ""}`
 *   (the canonical spec serializes "no amount" as "some").
 * - Rust `quantity: null` on cookware ≡ ours `quantity: 1`.
 * - Rust `quantity: null` on a timer ≡ ours `{quantity: "", units: ""}`.
 * - Rust fraction values are converted to decimal numbers.
 * - Rust `unit: null` ≡ ours `units: ""`.
 */
import type { CooklangRecipe, RecipeStepItem } from "../../src/types"

export interface NormQuantity {
  value: number | string
  unit: string
}

export interface NormComponent {
  name: string
  alias: string | null
  note: string | null
  modifiers: string[]
  quantity: NormQuantity | null
  relation: Record<string, unknown>
}

export interface NormTimer {
  name: string
  quantity: NormQuantity | null
}

export type NormItem =
  | { type: "text"; value: string }
  | { type: "ingredient" | "cookware" | "timer" | "inlineQuantity"; index: number }

export interface NormRecipe {
  fatal: boolean
  metadata: Record<string, unknown>
  sections: Array<{
    name: string | null
    content: Array<
      { type: "step"; number: number; items: NormItem[] } | { type: "text"; value: string }
    >
  }>
  ingredients: NormComponent[]
  cookware: NormComponent[]
  timers: NormTimer[]
  inlineQuantities: NormQuantity[]
  errorCount: number
  warningCount: number
  errors: string[]
  warnings: string[]
}

function round(n: number): number {
  return Math.round(n * 1e9) / 1e9
}

// --- cooklang-rs side -------------------------------------------------------

const RUST_FLAG_NAMES: Record<string, string> = {
  RECIPE: "recipe",
  REF: "ref",
  HIDDEN: "hidden",
  OPT: "opt",
  NEW: "new",
}

function normRustModifiers(mods: unknown): string[] {
  if (typeof mods !== "string" || mods === "") return []
  return mods
    .split("|")
    .map(m => RUST_FLAG_NAMES[m.trim()] ?? m.trim().toLowerCase())
    .sort()
}

function normRustNumber(v: Record<string, unknown>): number {
  if (v.type === "regular") return round(v.value as number)
  // fraction
  const f = v.value as unknown as { whole: number; num: number; den: number }
  if (v.type === "fraction") {
    const frac = v.value as { whole: number; num: number; den: number }
    return round(frac.whole + frac.num / frac.den)
  }
  return round(f as unknown as number)
}

function normRustValue(value: Record<string, unknown>): number | string {
  switch (value.type) {
    case "number":
      return normRustNumber(value.value as Record<string, unknown>)
    case "range": {
      const r = value.value as {
        start: Record<string, unknown>
        end: Record<string, unknown>
      }
      return `${normRustNumber(r.start)}-${normRustNumber(r.end)}`
    }
    case "text":
      return value.value as string
    default:
      return JSON.stringify(value)
  }
}

function normRustQuantity(q: unknown): NormQuantity | null {
  if (q == null) return null
  const qq = q as { unit: string | null; value: Record<string, unknown> }
  return { value: normRustValue(qq.value), unit: qq.unit ?? "" }
}

function normRustRelation(rel: Record<string, unknown>): Record<string, unknown> {
  if (rel.type === "definition") {
    return {
      type: "definition",
      definedInStep: rel.defined_in_step,
      referencedFrom: rel.referenced_from,
    }
  }
  return { type: "reference", referencesTo: rel.references_to }
}

function normRustIngredientRelation(outer: Record<string, unknown>): Record<string, unknown> {
  const inner = normRustRelation(outer.relation as Record<string, unknown>)
  if (inner.type === "reference" && outer.reference_target != null) {
    inner.referenceTarget = outer.reference_target
  }
  return inner
}

export function normalizeRust(raw: {
  recipe: Record<string, unknown> | null
  errors: string[]
  warnings: string[]
}): NormRecipe {
  const base: NormRecipe = {
    fatal: raw.recipe === null,
    metadata: {},
    sections: [],
    ingredients: [],
    cookware: [],
    timers: [],
    inlineQuantities: [],
    errorCount: raw.errors.length,
    warningCount: raw.warnings.length,
    errors: raw.errors,
    warnings: raw.warnings,
  }
  if (raw.recipe === null) return base
  const r = raw.recipe

  base.metadata = ((r.metadata as Record<string, unknown>)?.map ?? {}) as Record<string, unknown>

  base.ingredients = (r.ingredients as Array<Record<string, unknown>>).map(i => ({
    name: i.name as string,
    alias: (i.alias as string | null) ?? null,
    note: (i.note as string | null) ?? null,
    modifiers: normRustModifiers(i.modifiers),
    quantity: normRustQuantity(i.quantity) ?? { value: "some", unit: "" },
    relation: normRustIngredientRelation(i.relation as Record<string, unknown>),
  }))

  base.cookware = (r.cookware as Array<Record<string, unknown>>).map(c => ({
    name: c.name as string,
    alias: (c.alias as string | null) ?? null,
    note: (c.note as string | null) ?? null,
    modifiers: normRustModifiers(c.modifiers),
    quantity: normRustQuantity(c.quantity) ?? { value: 1, unit: "" },
    relation: normRustRelation(c.relation as Record<string, unknown>),
  }))

  base.timers = (r.timers as Array<Record<string, unknown>>).map(t => ({
    name: (t.name as string | null) ?? "",
    quantity: normRustQuantity(t.quantity) ?? { value: "", unit: "" },
  }))

  base.inlineQuantities = (r.inline_quantities as unknown[]).map(
    q => normRustQuantity(q) ?? { value: "", unit: "" },
  )

  base.sections = (r.sections as Array<Record<string, unknown>>).map(s => ({
    name: (s.name as string | null) ?? null,
    content: (s.content as Array<Record<string, unknown>>).map(c => {
      if (c.type === "text") return { type: "text" as const, value: c.value as string }
      const step = c.value as { items: Array<Record<string, unknown>>; number: number }
      return {
        type: "step" as const,
        number: step.number,
        items: step.items.map(it =>
          it.type === "text"
            ? { type: "text" as const, value: it.value as string }
            : {
                type: it.type as "ingredient" | "cookware" | "timer" | "inlineQuantity",
                index: it.index as number,
              },
        ),
      }
    }),
  }))

  return base
}

// --- cooklang-parse side -----------------------------------------------------

const OUR_FLAG_NAMES: Record<string, string> = {
  recipe: "recipe",
  reference: "ref",
  hidden: "hidden",
  optional: "opt",
  new: "new",
}

function normOurModifiers(mods: Record<string, boolean | undefined>): string[] {
  return Object.entries(mods)
    .filter(([, v]) => v === true)
    .map(([k]) => OUR_FLAG_NAMES[k] ?? k)
    .sort()
}

function normOurQuantity(quantity: number | string, units: string): NormQuantity {
  return { value: typeof quantity === "number" ? round(quantity) : quantity, unit: units }
}

function normOurRelation(rel: Record<string, unknown>): Record<string, unknown> {
  if (rel.type === "definition") {
    return {
      type: "definition",
      definedInStep: rel.definedInStep,
      referencedFrom: rel.referencedFrom,
    }
  }
  const out: Record<string, unknown> = { type: "reference", referencesTo: rel.referencesTo }
  if (rel.referenceTarget != null) out.referenceTarget = rel.referenceTarget
  return out
}

export function normalizeOurs(recipe: CooklangRecipe): NormRecipe {
  const isEmpty =
    Object.keys(recipe.metadata).length === 0 &&
    recipe.sections.length === 0 &&
    recipe.ingredients.length === 0 &&
    recipe.cookware.length === 0 &&
    recipe.timers.length === 0
  const fatal = isEmpty && recipe.errors.length > 0

  const norm: NormRecipe = {
    fatal,
    metadata: {},
    sections: [],
    ingredients: [],
    cookware: [],
    timers: [],
    inlineQuantities: [],
    errorCount: recipe.errors.length,
    warningCount: recipe.warnings.length,
    errors: recipe.errors.map(e => e.message),
    warnings: recipe.warnings.map(w => w.message),
  }
  if (fatal) return norm

  norm.metadata = recipe.metadata

  norm.ingredients = recipe.ingredients.map(i => ({
    name: i.name,
    alias: i.alias ?? null,
    note: i.note ?? null,
    modifiers: normOurModifiers(i.modifiers as Record<string, boolean | undefined>),
    quantity: normOurQuantity(i.quantity, i.units),
    relation: normOurRelation(i.relation as unknown as Record<string, unknown>),
  }))

  norm.cookware = recipe.cookware.map(c => ({
    name: c.name,
    alias: c.alias ?? null,
    note: c.note ?? null,
    modifiers: normOurModifiers(c.modifiers as Record<string, boolean | undefined>),
    quantity: normOurQuantity(c.quantity, c.units),
    relation: normOurRelation(c.relation as unknown as Record<string, unknown>),
  }))

  norm.timers = recipe.timers.map(t => ({
    name: t.name,
    quantity: normOurQuantity(t.quantity, t.units),
  }))

  norm.inlineQuantities = recipe.inlineQuantities.map(q =>
    normOurQuantity(q.quantity, q.units),
  )

  const indexOfItem = (item: RecipeStepItem): number => {
    if (item.type === "ingredient") return recipe.ingredients.indexOf(item)
    if (item.type === "cookware") return recipe.cookware.indexOf(item)
    if (item.type === "timer") return recipe.timers.indexOf(item)
    return -1
  }

  norm.sections = recipe.sections.map(s => ({
    name: s.name,
    content: s.content.map(c => {
      if (c.type === "text") return { type: "text" as const, value: c.value }
      return {
        type: "step" as const,
        number: c.number,
        items: c.items.map((it): NormItem => {
          if (it.type === "text") return { type: "text", value: it.value }
          if (it.type === "inline_quantity") return { type: "inlineQuantity", index: it.index }
          return { type: it.type, index: indexOfItem(it) }
        }),
      }
    }),
  }))

  return norm
}

// --- diffing -----------------------------------------------------------------

export function deepDiff(
  a: unknown,
  b: unknown,
  path = "",
  out: string[] = [],
  maxDiffs = 30,
): string[] {
  if (out.length >= maxDiffs) return out
  if (a === b) return out
  if (typeof a !== typeof b || a === null || b === null) {
    out.push(`${path}: ours=${JSON.stringify(a)} rust=${JSON.stringify(b)}`)
    return out
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      out.push(`${path}.length: ours=${a.length} rust=${b.length}`)
    }
    const n = Math.min(a.length, b.length)
    for (let i = 0; i < n; i += 1) deepDiff(a[i], b[i], `${path}[${i}]`, out, maxDiffs)
    return out
  }
  if (typeof a === "object" && typeof b === "object") {
    const keys = new Set([...Object.keys(a), ...Object.keys(b as object)])
    for (const k of keys) {
      deepDiff(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
        path ? `${path}.${k}` : k,
        out,
        maxDiffs,
      )
    }
    return out
  }
  out.push(`${path}: ours=${JSON.stringify(a)} rust=${JSON.stringify(b)}`)
  return out
}
