/**
 * Differential-test corpus: canonical fixtures + targeted edge cases.
 * Every entry is parsed by both cooklang-parse and the cooklang-rs oracle
 * in both modes (canonical / default-with-extensions).
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import YAML from "yaml"

export interface CorpusCase {
  id: string
  src: string
}

const FIXTURES_DIR = join(import.meta.dir, "../../test/fixtures")

function loadFixtureSources(file: string, prefix: string): CorpusCase[] {
  const doc = YAML.parse(readFileSync(join(FIXTURES_DIR, file), "utf8")) as {
    tests: Record<string, { source: string }>
  }
  return Object.entries(doc.tests).map(([name, t]) => ({
    id: `${prefix}:${name}`,
    src: t.source,
  }))
}

const EDGE_CASES: Record<string, string> = {
  // sections
  "section-single": "= Prep\nChop @onion{1}.\n",
  "section-double": "== Prep ==\nChop @onion{1}.\n",
  "section-double-no-trailing": "== Prep\nChop @onion{1}.\n",
  "section-triple": "=== Prep ===\nChop @onion{1}.\n",
  "section-no-spaces": "==Prep==\nChop @onion{1}.\n",
  "section-empty-name": "==\nStep here.\n",
  "section-equals-in-text": "Mix a = b and @salt{}.\n",
  // timers
  "timer-word": "Wait ~rest now.\n",
  "timer-empty-braces": "Wait ~{} now.\n",
  "timer-quantity-only": "Wait ~{5} now.\n",
  "timer-with-unit": "Wait ~{5%minutes} now.\n",
  "timer-named": "Cook ~oven{25%minutes}.\n",
  "timer-unclosed": "Wait ~{5 minutes now.\n",
  "timer-fraction": "Wait ~{1/2%hour}.\n",
  "timer-tilde-alone": "Approx ~ 5 minutes.\n",
  // ingredients
  "ing-no-amount": "Add @salt now.\n",
  "ing-multiword": "Add @sea salt{} now.\n",
  "ing-qty-unit": "Add @flour{2%cups}.\n",
  "ing-fraction": "Add @flour{1/2}.\n",
  "ing-mixed-fraction": "Add @flour{1 1/2%cups}.\n",
  "ing-space-separated": "Add @flour{2 cups}.\n",
  "ing-empty-unit": "Add @flour{2%}.\n",
  "ing-empty-braces": "Add @flour{}.\n",
  "ing-note": "Add @flour{100%g}(sifted).\n",
  "ing-note-no-amount": "Add @flour{}(sifted).\n",
  "ing-alias": "Add @white wine|wine{} now.\n",
  "ing-fixed": "Add @salt{=1%tsp}.\n",
  "ing-range": "Add @water{2-3%cups}.\n",
  "ing-decimal": "Add @milk{1.5%l}.\n",
  "ing-text-qty": "Add @milk{a splash}.\n",
  "ing-leading-zero": "Add @flour{01}.\n",
  "ing-at-alone": "Email me @ home with @salt{}.\n",
  "ing-unicode": "Add @сахар{} and @🧂{}.\n",
  // modifiers
  "mod-optional": "Add @?nuts{} on top.\n",
  "mod-hidden": "Use @-salt{}.\n",
  "mod-new": "Add @+flour{}.\n",
  "mod-recipe": "Make @@sauce{}.\n",
  "mod-ref-with-def": "Add @flour{2%cups}. Mix the @&flour{} in.\n",
  "mod-ref-without-def": "Mix the @&flour{} in.\n",
  "mod-combined": "Add @&?butter{} if you like.\n",
  // cookware
  "cook-no-braces": "Use #pan now.\n",
  "cook-empty-braces": "Use #pan{} now.\n",
  "cook-multiword": "Use #big pot{} now.\n",
  "cook-quantity": "Use #pan{2}.\n",
  "cook-fraction": "Use #pan{1/2}.\n",
  "cook-text-quantity": "Use #pan{two}.\n",
  "cook-percent": "Use #pan{2%lids}.\n",
  "cook-note": "Use #pan(large) now.\n",
  "cook-note-braces": "Use #pan{}(large) now.\n",
  "cook-ref": "Use #pot{}. Stir in the #&pot{}.\n",
  // comments
  "comment-line": "-- a comment\nA step.\n",
  "comment-inline": "A step -- with comment\n",
  "comment-no-space": "--not a comment\n",
  "comment-block-inline": "A [- hidden -] step.\n",
  "comment-block-own-line": "A step.\n[- hidden -]\nNext line.\n",
  "comment-block-multiline": "A step [- spans\nlines -] continues.\n",
  // notes
  "note-basic": "> a note\nA step.\n",
  "note-consecutive": "> first\n> second\nA step.\n",
  "directive-no-colon": ">> just some text\n",
  // directives & metadata
  "directive-basic": ">> source: example\nA step.\n",
  "directive-servings": ">> servings: 4\nA step.\n",
  "directive-after-frontmatter": "---\ntitle: X\n---\n>> source: example\nA step.\n",
  "mode-components": ">> [mode]: components\n@flour{2%cups}\n>> [mode]: all\nUse the flour.\n",
  "mode-steps": ">> [mode]: steps\nMix @flour{} and @water{}.\n",
  "mode-text": ">> [mode]: text\nThis @ingredient{} is ignored.\n",
  "duplicate-ref": ">> [duplicate]: ref\nAdd @salt{1%tsp}. More @salt{}.\n",
  "duplicate-new": ">> [duplicate]: new\nAdd @salt{1%tsp}. More @salt{}.\n",
  // frontmatter
  "frontmatter-basic": "---\ntitle: Test\nservings: 4\n---\nA step with @salt{}.\n",
  "frontmatter-leading-blanks": "\n\n---\ntitle: Hi\n---\nMix @a{}.\n",
  "frontmatter-mid-document": "Mix the @flour{} well.\n---\ntitle: Oops\n---\nBake it.\n",
  "frontmatter-unclosed": "---\ntitle: X\nMix @a{}.\n",
  "frontmatter-invalid-yaml": "---\ntitle: [unclosed\n---\nA step.\n",
  "frontmatter-scalar": "---\njust text\n---\nA step.\n",
  // inline quantities (extension)
  "inline-temp-c": "Preheat to 180C.\n",
  "inline-temp-f": "Preheat to 350F.\n",
  "inline-temp-degrees": "Preheat to 180°C and 350°F.\n",
  "inline-temp-negative": "Freeze at -18C.\n",
  "inline-time": "Rest for 5 minutes.\n",
  "inline-weight": "About 1.5 kg total.\n",
  // steps & structure
  "step-multiline": "Mix @flour{}\nand @water{}.\n",
  "step-paragraphs": "First step.\n\nSecond step.\n",
  "step-numbering-sections": "Step one.\n\n== Sec ==\n\nStep one again.\n",
  "spaced-marker-ing": "Add @ flour {2%g} now.\n",
  "spaced-marker-cook": "Use # pan {} now.\n",
  "spaced-marker-timer": "Wait ~ {5%minutes} now.\n",
  "empty-input": "",
  "whitespace-only": "  \n\t\n",
  "hash-alone": "Press # hard.\n",
  "punctuation-name-end": "Add @salt.\n",
}

export function loadCorpus(): CorpusCase[] {
  return [
    ...loadFixtureSources("canonical.yaml", "canonical"),
    ...loadFixtureSources("canonical-extras.yaml", "extras"),
    ...Object.entries(EDGE_CASES).map(([id, src]) => ({ id: `edge:${id}`, src })),
  ]
}
