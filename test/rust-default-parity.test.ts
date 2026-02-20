import { describe, expect, test } from "bun:test"
import { parseCooklang } from "../src/index"
import { getSectionNames, getSteps } from "./canonical-helper"

describe("cooklang-rs default parity (extensions: all)", () => {
  test("step numbers increment per section and ignore text blocks", () => {
    const source = `> text

first

second
== sect ==
first again
`

    const recipe = parseCooklang(source, { extensions: "all" })
    const numbers = recipe.sections.map(section =>
      section.content.map(content => (content.type === "step" ? content.number : null)),
    )
    expect(numbers).toEqual([[null, 1, 2], [1]])
  })

  test("components mode suppresses step blocks but keeps component definitions", () => {
    const source = `>> [mode]: components
@igr
>> [mode]: steps
= section
step
`

    const recipe = parseCooklang(source, { extensions: "all" })

    expect(recipe.metadata).toEqual({})
    expect(recipe.warnings).toEqual([])
    expect(getSectionNames(recipe)).toEqual(["section"])
    expect(getSteps(recipe)).toHaveLength(1)
    const stepText = getSteps(recipe)[0]
      ?.filter(i => i.type === "text")
      .map(i => (i.type === "text" ? i.value : ""))
      .join("")
    expect(stepText).toBe("step")
    expect(recipe.ingredients.map(i => i.name)).toEqual(["igr"])
  })

  test("frontmatter keeps non-special directives as plain text lines", () => {
    const source = `---
title: Pancakes
---
>> author: Chef
Mix @flour{250%g}.
`

    const recipe = parseCooklang(source, { extensions: "all" })

    expect(recipe.metadata).toEqual({ title: "Pancakes" })
    expect(getSteps(recipe)).toHaveLength(2)
    const firstStepText = getSteps(recipe)[0]
      ?.filter(i => i.type === "text")
      .map(i => (i.type === "text" ? i.value : ""))
      .join("")
    expect(firstStepText).toBe(">> author: Chef")
  })

  test("special mode directives still apply with frontmatter", () => {
    const source = `---
title: T
---
>> [mode]: components
@igr
`

    const recipe = parseCooklang(source, { extensions: "all" })

    expect(recipe.metadata).toEqual({ title: "T" })
    expect(getSteps(recipe)).toEqual([])
    expect(recipe.ingredients.map(i => i.name)).toEqual(["igr"])
  })

  test("content before first frontmatter fence is ignored", () => {
    const source = `>> servings: 4
---
title: Recipe
---
Add @flour{250%g}.
`

    const recipe = parseCooklang(source, { extensions: "all" })

    expect(recipe.metadata).toEqual({ title: "Recipe" })
    expect(getSteps(recipe)).toHaveLength(1)
    const onlyStepText = getSteps(recipe)[0]
      ?.filter(i => i.type === "text")
      .map(i => (i.type === "text" ? i.value : ""))
      .join("")
    expect(onlyStepText).toBe("Add .")
  })

  test("inline temperatures are extracted from text", () => {
    const recipe = parseCooklang("text 2ºC more text 150 F end text\n", { extensions: "all" })
    const step = getSteps(recipe)[0]!

    expect(recipe.inlineQuantities).toEqual([
      { quantity: 2, units: "ºC" },
      { quantity: 150, units: "F" },
    ])

    expect(step).toEqual([
      { type: "text", value: "text " },
      { type: "inline_quantity", index: 0 },
      { type: "text", value: " more text " },
      { type: "inline_quantity", index: 1 },
      { type: "text", value: " end text" },
    ])
  })

  test("timer without unit emits warning", () => {
    const recipe = parseCooklang("Cook for ~{30}\n", { extensions: "all" })
    expect(
      recipe.warnings.some(w => w.message.includes("Invalid timer quantity: missing unit")),
    ).toBe(true)
  })

  test("timer without quantity is a parse error in all mode", () => {
    const recipe = parseCooklang("Let it ~rest after plating\n", { extensions: "all" })
    expect(recipe.errors).toHaveLength(1)
    expect(recipe.errors[0]?.message).toContain("Invalid timer: missing quantity")
    expect(recipe.sections).toEqual([])
    expect(recipe.timers).toEqual([])
  })

  test("advanced units parse quantity+unit without percent separator", () => {
    const recipe = parseCooklang("@water{7 k}\n", { extensions: "all" })
    expect(recipe.ingredients).toEqual([
      {
        type: "ingredient",
        name: "water",
        quantity: 7,
        units: "k",
        fixed: false,
        modifiers: {},
        relation: { type: "definition", referencedFrom: [], definedInStep: true },
      },
    ])
  })

  test("spaced component markers with braces are parsed like rust parser", () => {
    const recipe = parseCooklang("It is ~ {5}\nMessage @ example{}\nRecipe # 10{}\n", {
      extensions: "all",
    })
    const steps = getSteps(recipe)
    expect(steps).toHaveLength(1)
    expect(steps[0]).toEqual([
      { type: "text", value: "It is " },
      { type: "timer", name: "", quantity: 5, units: "" },
      { type: "text", value: " Message " },
      {
        type: "ingredient",
        name: "example",
        quantity: "some",
        units: "",
        fixed: false,
        modifiers: {},
        relation: { type: "definition", referencedFrom: [], definedInStep: true },
      },
      { type: "text", value: " Recipe " },
      {
        type: "cookware",
        name: "10",
        quantity: 1,
        units: "",
        modifiers: {},
        relation: { type: "definition", referencedFrom: [], definedInStep: true },
      },
    ])
  })
})
