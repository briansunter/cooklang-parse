import { describe, expect, test } from "bun:test"
import { parseCooklang } from "../src/index"
import { getSectionNames, getSteps } from "./canonical-helper"

test("spec parity: comment-only recipe is empty", () => {
  const source = `-- "empty" recipe

   -- with spaces

-- that should actually be empty
    -- and not produce empty steps

[- not even this -]
`

  const recipe = parseCooklang(source)

  expect(getSectionNames(recipe)).toEqual([])
  expect(getSteps(recipe)).toEqual([])
  expect(recipe.errors).toEqual([])
})

test("spec parity: empty section content with only comments", () => {
  const source = `== Section name to force the section ==

-- "empty" recipe

   -- with spaces

-- that should actually be empty
    -- and not produce empty steps

[- not even this -]
`

  const recipe = parseCooklang(source)

  expect(getSectionNames(recipe)).toEqual(["Section name to force the section"])
  expect(getSteps(recipe)).toEqual([])
  expect(recipe.errors).toEqual([])
})

test("spec parity: whitespace line separates steps", () => {
  const source = `a step

another
`

  const recipe = parseCooklang(source)

  expect(getSteps(recipe)).toHaveLength(2)
  const step1Text = getSteps(recipe)[0]
    ?.filter(i => i.type === "text")
    .map(i => (i.type === "text" ? i.value : ""))
    .join("")
  const step2Text = getSteps(recipe)[1]
    ?.filter(i => i.type === "text")
    .map(i => (i.type === "text" ? i.value : ""))
    .join("")
  expect(step1Text).toBe("a step")
  expect(step2Text).toBe("another")
})

test("spec parity: metadata lines split neighboring steps", () => {
  const source = `a step
>> meta: val
another step
= section
`

  const recipe = parseCooklang(source)

  expect(recipe.metadata.meta).toBe("val")
  const stepTexts = getSteps(recipe).map(s =>
    s
      .filter(i => i.type === "text")
      .map(i => (i.type === "text" ? i.value : ""))
      .join(""),
  )
  expect(stepTexts).toEqual(["a step", "another step"])
  expect(getSectionNames(recipe)).toEqual(["section"])
})

test("spec parity: [mode] directives are metadata (components mode is extension-only)", () => {
  const source = `>> [mode]: components
@igr
>> [mode]: steps
= section
step
`

  const recipe = parseCooklang(source)

  // Last [mode] directive wins
  expect(recipe.metadata["[mode]"]).toBe("steps")
  expect(getSectionNames(recipe)).toEqual(["section"])
  // In canonical/grammar-based parsing, [mode]: components doesn't suppress steps
  // (that behavior requires the extension to be enabled)
  const stepTexts = getSteps(recipe).map(s =>
    s
      .filter(i => i.type === "text")
      .map(i => (i.type === "text" ? i.value : ""))
      .join(""),
  )
  expect(stepTexts).toEqual(["", "step"])
})

test("spec parity: valid YAML frontmatter parses", () => {
  const source = `---
title: Test Recipe
tags: [test, recipe]
prep_time: 10 min
---

This is a test recipe with valid YAML frontmatter.

@eggs{2} and @butter{1%tbsp}
`

  const recipe = parseCooklang(source)

  expect(recipe.metadata.title).toBe("Test Recipe")
  expect(recipe.ingredients.map(i => i.name)).toEqual(["eggs", "butter"])
})

test("spec parity: note suffix on ingredient", () => {
  const source = `Add @flour{100%g}(sifted) to bowl.\n`

  const recipe = parseCooklang(source)

  expect(recipe.ingredients[0]?.name).toBe("flour")
  expect(recipe.ingredients[0]?.quantity).toBe(100)
  expect(recipe.ingredients[0]?.units).toBe("g")
  expect(recipe.ingredients[0]?.note).toBe("sifted")
})

test("spec parity: fixed quantity inside braces", () => {
  const source = `Add @salt{=1%tsp} to taste.\n`

  const recipe = parseCooklang(source)

  expect(recipe.ingredients[0]?.name).toBe("salt")
  expect(recipe.ingredients[0]?.quantity).toBe(1)
  expect(recipe.ingredients[0]?.units).toBe("tsp")
  expect(recipe.ingredients[0]?.fixed).toBe(true)
})

test("spec parity: canonical format for fixed quantity", () => {
  const { parseToCanonical } = require("./canonical-helper")
  const result = parseToCanonical("Add @salt{=1%tsp} to taste.\n")

  expect(result.steps[0]).toEqual([
    { type: "text", value: "Add " },
    { type: "ingredient", name: "salt", quantity: 1, units: "tsp" },
    { type: "text", value: " to taste." },
  ])
})

test("spec parity: comment requires space after dashes", () => {
  const source = `text--more text\n`

  const recipe = parseCooklang(source)

  expect(getSteps(recipe)).toHaveLength(1)
  const textContent = getSteps(recipe)[0]
    ?.filter(i => i.type === "text")
    .map(i => (i.type === "text" ? i.value : ""))
    .join("")
  expect(textContent).toContain("text--more text")
})

test("spec parity: invalid YAML frontmatter becomes warning and is ignored", () => {
  const source = `---
title: Recipe: with colon
description: This has: many: colons
tags: [unclosed
---

@flour{2%cups}
`

  const recipe = parseCooklang(source)

  expect(recipe.metadata).toEqual({})
  expect(recipe.ingredients.map(i => i.name)).toEqual(["flour"])
  expect(recipe.warnings.some(e => /yaml/i.test(e.message))).toBe(true)
})

// ---------------------------------------------------------------------------
// cooklang-rs parity regression tests
// ---------------------------------------------------------------------------

describe("cooklang-rs parity", () => {
  test("mixed fraction: 1 1/2", () => {
    const recipe = parseCooklang("@flour{1 1/2%cups}\n")
    expect(recipe.ingredients[0]?.quantity).toBe(1.5)
    expect(recipe.ingredients[0]?.units).toBe("cups")
  })

  test("mixed fraction: 0 1/2", () => {
    const recipe = parseCooklang("@flour{0 1/2%cup}\n")
    expect(recipe.ingredients[0]?.quantity).toBe(0.5)
  })

  test("mixed fraction with spaces around slash: 1 1 / 2", () => {
    const recipe = parseCooklang("@flour{1 1 / 2%cups}\n")
    expect(recipe.ingredients[0]?.quantity).toBe(1.5)
  })

  test("simple fraction with spaces around slash: 1 / 2", () => {
    const recipe = parseCooklang("@flour{1 / 2%cup}\n")
    expect(recipe.ingredients[0]?.quantity).toBe(0.5)
  })

  test("leading-zero mixed fraction stays string", () => {
    const recipe = parseCooklang("@flour{01 1/2%cup}\n")
    expect(recipe.ingredients[0]?.quantity).toBe("01 1/2")
  })

  test("space-separated number is string, not collapsed", () => {
    const recipe = parseCooklang("@flour{1 2}\n")
    expect(recipe.ingredients[0]?.quantity).toBe("1 2")
  })

  test("directive values are strings", () => {
    const recipe = parseCooklang(">> servings: 4\n")
    expect(recipe.metadata.servings).toBe("4")
  })

  test("directive string stays string", () => {
    const recipe = parseCooklang(">> author: Chef\n")
    expect(recipe.metadata.author).toBe("Chef")
  })

  test("inline block comment produces minimal whitespace", () => {
    const recipe = parseCooklang("Add @flour{} [- comment -] and mix\n")
    const step = getSteps(recipe)[0]!
    const texts = step.filter(i => i.type === "text").map(i => (i as { value: string }).value)
    // After stripping [- comment -] (15 chars) → empty string, so grammar sees "Add  and mix"
    // The text after the ingredient should be " " + " and mix" = "  and mix" (2 spaces)
    expect(texts.some(t => t.includes("  and mix"))).toBe(true)
    // Must NOT have the old 15-space gap
    expect(texts.some(t => t.includes("               "))).toBe(false)
  })

  test("multiline block comment preserves line breaks", () => {
    const source = "step one\n\n[- multi\nline\ncomment -]\n\nstep two\n"
    const recipe = parseCooklang(source)
    const steps = getSteps(recipe)
    expect(steps.length).toBeGreaterThanOrEqual(2)
  })
})

// ---------------------------------------------------------------------------
// Directive deprecation & type validation warnings
// ---------------------------------------------------------------------------

describe("directive warnings", () => {
  test(">> servings: 6 produces servings type warning", () => {
    const recipe = parseCooklang(">> servings: 6\n")
    const servingsWarning = recipe.warnings.find(w =>
      w.message.includes("Unsupported value for key"),
    )
    expect(servingsWarning).toBeDefined()
    expect(servingsWarning?.help).toBe("It will be a regular metadata entry")
  })

  test(">> servings: 6 produces deprecated syntax warning with YAML suggestion", () => {
    const recipe = parseCooklang(">> servings: 6\n")
    const deprecatedWarning = recipe.warnings.find(w => w.message.includes("deprecated"))
    expect(deprecatedWarning).toBeDefined()
    expect(deprecatedWarning?.help).toContain("---")
    expect(deprecatedWarning?.help).toContain("servings: '6'")
  })

  test(">> title: Test (no servings) produces only deprecation warning", () => {
    const recipe = parseCooklang(">> title: Test\n")
    expect(recipe.warnings).toHaveLength(1)
    expect(recipe.warnings[0]?.message).toContain("deprecated")
    // No servings type warning
    expect(recipe.warnings.some(w => w.message.includes("Unsupported value for key"))).toBe(false)
  })

  test("YAML frontmatter produces no directive warnings", () => {
    const source = "---\nservings: 6\n---\n\nMix @flour{}\n"
    const recipe = parseCooklang(source)
    const directiveWarnings = recipe.warnings.filter(
      w => w.message.includes("deprecated") || w.message.includes("Unsupported value for key"),
    )
    expect(directiveWarnings).toHaveLength(0)
  })

  test("warning help field contains YAML frontmatter replacement text", () => {
    const recipe = parseCooklang(">> servings: 6\n>> title: My Recipe\n")
    const deprecatedWarning = recipe.warnings.find(w => w.message.includes("deprecated"))
    expect(deprecatedWarning).toBeDefined()
    expect(deprecatedWarning?.help).toContain("---")
    expect(deprecatedWarning?.help).toContain("servings: '6'")
    expect(deprecatedWarning?.help).toContain("title: My Recipe")
  })
})
