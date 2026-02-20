import * as Ohm from "ohm-js"
import grammarSource from "../../grammars/cooklang.ohm" with { type: "text" }
import type { ParseError, RecipeStepItem } from "../types"
import { buildCookware, buildIngredient } from "./component-builders"
import type { DirectiveNode, SemanticItem, SemanticResult } from "./internal-types"
import { parseQuantity } from "./quantity"
import { attachRaw } from "./raw-step-items"
import { mergeConsecutiveTexts } from "./step-processing"

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v)
}

function isASTNode(n: unknown): n is { type: string; name: string; text: string } {
  return isRecord(n) && typeof n.type === "string"
}

const grammar = Ohm.grammar(grammarSource)
const semantics = grammar.createSemantics()

semantics.addOperation("toAST", {
  Recipe(leading, _metadata, items) {
    const frontmatter: string | null = _metadata.numChildren > 0 ? _metadata.child(0).toAST() : null

    const orderedItems: SemanticItem[] = []

    // cooklang-rs frontmatter splitting ignores any pre-frontmatter content.
    if (!frontmatter) {
      for (const child of leading.children) {
        const result = child.toAST()
        if (isRecord(result) && result.type === "directive") {
          orderedItems.push({ kind: "directive", directive: result as unknown as DirectiveNode })
        }
      }
    }

    for (const node of items.children.map(c => c.toAST()).filter(Boolean)) {
      if (isRecord(node) && node.type === "directive") {
        orderedItems.push({ kind: "directive", directive: node as unknown as DirectiveNode })
      } else if (Array.isArray(node) && node.length > 0) {
        orderedItems.push({ kind: "step", items: node })
      } else if (isASTNode(node) && node.type === "section") {
        orderedItems.push({ kind: "section", name: node.name })
      } else if (isASTNode(node) && node.type === "note") {
        orderedItems.push({ kind: "note", text: node.text })
      }
    }

    return { frontmatter, items: orderedItems }
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
    const flattened: RecipeStepItem[] = []
    for (let i = 0; i < lines.children.length; i += 1) {
      if (i > 0) {
        flattened.push({ type: "text", value: " " })
      }
      const lineItems = lines.child(i).toAST()
      if (Array.isArray(lineItems)) {
        flattened.push(...lineItems)
      }
    }
    return mergeConsecutiveTexts(flattened)
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
    return attachRaw(
      buildIngredient(_mods.sourceString, rawName, amount.toAST(), note),
      this.sourceString,
    )
  },

  Ingredient_single(_at, _mods, word, amountOpt, noteOpt) {
    const amt =
      amountOpt.numChildren > 0
        ? amountOpt.child(0).toAST()
        : { quantity: "some", units: "", fixed: false }
    const note: string | undefined = noteOpt.numChildren > 0 ? noteOpt.child(0).toAST() : undefined
    return attachRaw(
      buildIngredient(_mods.sourceString, word.sourceString, amt, note),
      this.sourceString,
    )
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
    return attachRaw(
      buildCookware(_mods.sourceString, rawName, amount.toAST().quantity, note),
      this.sourceString,
    )
  },

  Cookware_single(_hash, _mods, word, amountOpt, noteOpt) {
    const qty = amountOpt.numChildren > 0 ? amountOpt.child(0).toAST().quantity : 1
    const note: string | undefined = noteOpt.numChildren > 0 ? noteOpt.child(0).toAST() : undefined
    return attachRaw(
      buildCookware(_mods.sourceString, word.sourceString, qty, note),
      this.sourceString,
    )
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
    return attachRaw(
      {
        type: "timer",
        name: nameOpt.numChildren > 0 ? nameOpt.child(0).sourceString : "",
        quantity: parseQuantity(qty.sourceString.trim()),
        units: unit.sourceString.trim(),
      },
      this.sourceString,
    )
  },

  Timer_quantityOnly(_tilde, nameOpt, _open, qty, _close) {
    return attachRaw(
      {
        type: "timer",
        name: nameOpt.numChildren > 0 ? nameOpt.child(0).sourceString : "",
        quantity: parseQuantity(qty.sourceString.trim()),
        units: "",
      },
      this.sourceString,
    )
  },

  Timer_word(_tilde, name) {
    return attachRaw(
      {
        type: "timer",
        name: name.sourceString,
        quantity: "",
        units: "",
      },
      this.sourceString,
    )
  },

  Note(_gt, noteContents, _newline) {
    return { type: "note", text: noteContents.sourceString.trim() }
  },

  MetadataDirective(_hspace, _arrows, body, _newline) {
    const directive = body.toAST()
    if (isRecord(directive) && directive.type === "directive") {
      return {
        ...(directive as unknown as DirectiveNode),
        rawLine: this.sourceString.trimEnd(),
      }
    }
    return directive
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

type ParseWithOhmResult = { ok: true; value: SemanticResult } | { ok: false; error: ParseError }

export function parseWithOhm(source: string): ParseWithOhmResult {
  const matchResult = grammar.match(source)

  if (matchResult.failed()) {
    const pos = matchResult.getInterval().getLineAndColumn()
    const shortMsg = (matchResult.shortMessage || "Parse error").replace(
      /^Line \d+, col \d+:\s*/,
      "",
    )

    return {
      ok: false,
      error: {
        message: shortMsg,
        shortMessage: shortMsg,
        position: { line: pos.lineNum, column: pos.colNum, offset: pos.offset },
        severity: "error",
      },
    }
  }

  return { ok: true, value: semantics(matchResult).toAST() }
}

export { grammar }
