import { expect, test } from "bun:test"
import { parseCooklang, parseToAST } from "../src/index"

test("spec parity: comment-only recipe is empty", () => {
  const source = `-- "empty" recipe

   -- with spaces

-- that should actually be empty 
    -- and not produce empty steps   

[- not even this -]
`

  const recipe = parseCooklang(source)

  expect(recipe.sections).toEqual([])
  expect(recipe.steps).toEqual([])
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

  expect(recipe.sections).toEqual(["Section name to force the section"])
  expect(recipe.steps).toEqual([])
  expect(recipe.errors).toEqual([])
})

test("spec parity: whitespace line separates steps", () => {
  const source = `a step
                 
another
`

  const recipe = parseCooklang(source)

  expect(recipe.steps).toHaveLength(2)
  expect(recipe.steps[0]?.text).toBe("a step")
  expect(recipe.steps[1]?.text).toBe("another")
})

test("spec parity: metadata lines split neighboring steps", () => {
  const source = `a step
>> meta: val
another step
= section
`

  const recipe = parseCooklang(source)

  expect(recipe.metadata.meta).toBe("val")
  expect(recipe.steps.map(s => s.text)).toEqual(["a step", "another step"])
  expect(recipe.sections).toEqual(["section"])
})

test("spec parity: [mode] components suppresses steps until switched", () => {
  const source = `>> [mode]: components
@igr
>> [mode]: steps
= section
step
`

  const recipe = parseCooklang(source)

  expect(recipe.metadata["[mode]"]).toBe("steps")
  expect(recipe.sections).toEqual(["section"])
  expect(recipe.steps.map(s => s.text)).toEqual(["step"])
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

test("spec parity: preparation suffix on ingredient", () => {
  const source = `Add @flour{100%g}(sifted) to bowl.\n`

  const ast = parseToAST(source)
  const ingredient = ast.steps[0]!.ingredients[0]!

  expect(ingredient.name).toBe("flour")
  expect(ingredient.quantity).toBe("100")
  expect(ingredient.unit).toBe("g")
  expect(ingredient.preparation).toBe("sifted")
})

test("spec parity: fixed quantity inside braces", () => {
  const source = `Add @salt{=1%tsp} to taste.\n`

  const ast = parseToAST(source)
  const ingredient = ast.steps[0]!.ingredients[0]!

  expect(ingredient.name).toBe("salt")
  expect(ingredient.quantity).toBe("1")
  expect(ingredient.unit).toBe("tsp")
  expect(ingredient.fixed).toBe(true)
})

test("spec parity: canonical format for fixed quantity", () => {
  const { parseToCanonical } = require("../src/canonicalConverter")
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

  expect(recipe.steps).toHaveLength(1)
  expect(recipe.steps[0]!.text).toContain("text--more text")
  expect(recipe.steps[0]!.inlineComments).toHaveLength(0)
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
  expect(recipe.errors.some(e => e.severity === "warning" && /yaml/i.test(e.message))).toBe(true)
})
