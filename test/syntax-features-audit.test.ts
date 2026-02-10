/**
 * Audit: Verify every feature listed in docs/guide/syntax-features.md
 * is actually supported by the parseCooklang API.
 */
import { describe, expect, it } from "bun:test"
import { parseCooklang } from "../src/index"
import { getSteps, getNotes, getSectionNames } from "./canonical-helper"

function noErrors(input: string) {
  const r = parseCooklang(input)
  if (r.errors.length > 0) {
    throw new Error(`Parse errors for "${input}": ${JSON.stringify(r.errors)}`)
  }
  return r
}

function at<T>(arr: T[], i: number): T {
  const v = arr[i]
  if (v === undefined) throw new Error(`Expected element at index ${i}`)
  return v
}

describe("Syntax Features Audit (docs/guide/syntax-features.md)", () => {
  // === INGREDIENTS ===
  describe("Ingredients", () => {
    it("Single-word ingredient: @salt", () => {
      const r = noErrors("Add @salt to taste")
      expect(r.ingredients).toHaveLength(1)
      expect(at(r.ingredients, 0).name).toBe("salt")
    })

    it("Ingredient with quantity: @eggs{3}", () => {
      const r = noErrors("Add @eggs{3}")
      expect(at(r.ingredients, 0).name).toBe("eggs")
      expect(at(r.ingredients, 0).quantity).toBe(3)
      expect(at(r.ingredients, 0).units).toBe("")
    })

    it("Ingredient with quantity + unit: @flour{250%g}", () => {
      const r = noErrors("Add @flour{250%g}")
      expect(at(r.ingredients, 0).name).toBe("flour")
      expect(at(r.ingredients, 0).quantity).toBe(250)
      expect(at(r.ingredients, 0).units).toBe("g")
    })

    it("Multi-word ingredient: @olive oil{2%tbsp}", () => {
      const r = noErrors("Add @olive oil{2%tbsp}")
      expect(at(r.ingredients, 0).name).toBe("olive oil")
      expect(at(r.ingredients, 0).quantity).toBe(2)
      expect(at(r.ingredients, 0).units).toBe("tbsp")
    })

    it("Multi-word (no braces): @sea salt{1%tsp}", () => {
      const r = noErrors("Add @sea salt{1%tsp}")
      expect(at(r.ingredients, 0).name).toBe("sea salt")
      expect(at(r.ingredients, 0).quantity).toBe(1)
      expect(at(r.ingredients, 0).units).toBe("tsp")
    })

    it("Empty braces: @salt{}", () => {
      const r = noErrors("Add @salt{}")
      expect(at(r.ingredients, 0).name).toBe("salt")
      expect(at(r.ingredients, 0).quantity).toBe("some")
    })

    it("Fixed quantity (in braces only): @salt{=1%pinch}", () => {
      const r = noErrors("Add @salt{=1%pinch}")
      expect(at(r.ingredients, 0).name).toBe("salt")
      expect(at(r.ingredients, 0).quantity).toBe(1)
      expect(at(r.ingredients, 0).units).toBe("pinch")
      expect(at(r.ingredients, 0).fixed).toBe(true)
    })

    it("Fixed quantity (in braces): @salt{=1%tsp}", () => {
      const r = noErrors("Add @salt{=1%tsp}")
      expect(at(r.ingredients, 0).name).toBe("salt")
      expect(at(r.ingredients, 0).quantity).toBe(1)
      expect(at(r.ingredients, 0).units).toBe("tsp")
      expect(at(r.ingredients, 0).fixed).toBe(true)
    })

    it("Note suffix: @flour{100%g}(sifted)", () => {
      const r = noErrors("Add @flour{100%g}(sifted)")
      expect(at(r.ingredients, 0).name).toBe("flour")
      expect(at(r.ingredients, 0).quantity).toBe(100)
      expect(at(r.ingredients, 0).units).toBe("g")
      expect(at(r.ingredients, 0).note).toBe("sifted")
    })

    it("Note (no amount): @butter(softened)", () => {
      const r = noErrors("Add @butter(softened)")
      expect(at(r.ingredients, 0).name).toBe("butter")
      expect(at(r.ingredients, 0).note).toBe("softened")
    })

    it("Alias syntax: @white wine|wine{100%ml}", () => {
      const r = noErrors("Add @white wine|wine{100%ml}")
      expect(at(r.ingredients, 0).name).toBe("white wine")
      expect(at(r.ingredients, 0).quantity).toBe(100)
      expect(at(r.ingredients, 0).units).toBe("ml")
    })

    it("Modifier @ (reference): @@tomato sauce{200%ml}", () => {
      const r = noErrors("Add @@tomato sauce{200%ml}")
      expect(at(r.ingredients, 0).name).toBe("tomato sauce")
      expect(at(r.ingredients, 0).quantity).toBe(200)
      expect(at(r.ingredients, 0).units).toBe("ml")
    })

    it("Modifier & (hidden): @&flour{300%g}", () => {
      const r = noErrors("Mix @&flour{300%g}")
      expect(at(r.ingredients, 0).name).toBe("flour")
      expect(at(r.ingredients, 0).quantity).toBe(300)
      expect(at(r.ingredients, 0).units).toBe("g")
    })

    it("Modifier ? (optional): @?garnish", () => {
      const r = noErrors("Top with @?garnish")
      expect(at(r.ingredients, 0).name).toBe("garnish")
    })

    it("Modifier + (added): @+extra cheese{}", () => {
      const r = noErrors("Add @+extra cheese{}")
      expect(at(r.ingredients, 0).name).toBe("extra cheese")
    })

    it("Modifier - (removed): @-onion", () => {
      const r = noErrors("Remove @-onion")
      expect(at(r.ingredients, 0).name).toBe("onion")
    })

    it("Fraction quantity: @sugar{1/2%cup}", () => {
      const r = noErrors("Add @sugar{1/2%cup}")
      expect(at(r.ingredients, 0).name).toBe("sugar")
      expect(at(r.ingredients, 0).quantity).toBe(0.5)
      expect(at(r.ingredients, 0).units).toBe("cup")
    })

    it("Decimal quantity: @water{0.5%cup}", () => {
      const r = noErrors("Add @water{0.5%cup}")
      expect(at(r.ingredients, 0).name).toBe("water")
      expect(at(r.ingredients, 0).quantity).toBe(0.5)
      expect(at(r.ingredients, 0).units).toBe("cup")
    })

    it("Amount without %: @flour{2 cups} keeps as quantity string", () => {
      const r = noErrors("Add @flour{2 cups}")
      expect(at(r.ingredients, 0).name).toBe("flour")
      // Without %, entire content is quantity (cooklang-rs canonical: only % separates qty/unit)
      expect(at(r.ingredients, 0).quantity).toBe("2 cups")
      expect(at(r.ingredients, 0).units).toBe("")
    })

    it("Unicode names: @crème fraîche{2%tbsp}", () => {
      const r = noErrors("Add @crème fraîche{2%tbsp}")
      expect(at(r.ingredients, 0).name).toBe("crème fraîche")
      expect(at(r.ingredients, 0).quantity).toBe(2)
      expect(at(r.ingredients, 0).units).toBe("tbsp")
    })
  })

  // === COOKWARE ===
  describe("Cookware", () => {
    it("Single-word cookware: #pan", () => {
      const r = noErrors("Heat a #pan")
      expect(r.cookware).toHaveLength(1)
      expect(at(r.cookware, 0).name).toBe("pan")
    })

    it("Multi-word cookware: #mixing bowl{}", () => {
      const r = noErrors("Use a #mixing bowl{}")
      expect(at(r.cookware, 0).name).toBe("mixing bowl")
    })

    it("Cookware with quantity: #pan{2}", () => {
      const r = noErrors("Use #pan{2}")
      expect(at(r.cookware, 0).name).toBe("pan")
      expect(at(r.cookware, 0).quantity).toBe(2)
    })

    it("Cookware modifier & (hidden): #&pan", () => {
      const r = noErrors("Use a #&pan")
      expect(at(r.cookware, 0).name).toBe("pan")
    })

    it("Cookware modifier ? (optional): #?blender", () => {
      const r = noErrors("Use a #?blender")
      expect(at(r.cookware, 0).name).toBe("blender")
    })
  })

  // === TIMERS ===
  describe("Timers", () => {
    it("Anonymous timer: ~{20%minutes}", () => {
      const r = noErrors("Cook for ~{20%minutes}")
      expect(r.timers).toHaveLength(1)
      expect(at(r.timers, 0).name).toBe("")
      expect(at(r.timers, 0).quantity).toBe(20)
      expect(at(r.timers, 0).units).toBe("minutes")
    })

    it("Named timer: ~rest{5%minutes}", () => {
      const r = noErrors("Let ~rest{5%minutes}")
      expect(at(r.timers, 0).name).toBe("rest")
      expect(at(r.timers, 0).quantity).toBe(5)
      expect(at(r.timers, 0).units).toBe("minutes")
    })

    it("Timer without unit: ~{5}", () => {
      const r = noErrors("Wait ~{5}")
      expect(at(r.timers, 0).quantity).toBe(5)
      expect(at(r.timers, 0).units).toBe("")
    })

    it("Bare word timer: ~rest", () => {
      const r = noErrors("Let it ~rest")
      expect(at(r.timers, 0).name).toBe("rest")
    })
  })

  // === METADATA ===
  describe("Metadata", () => {
    it("YAML front matter", () => {
      const r = noErrors("---\ntitle: My Recipe\nservings: 4\n---\nDo something")
      expect(r.metadata.title).toBe("My Recipe")
      expect(r.metadata.servings).toBe(4)
    })

    it("Metadata directives: >> key: value", () => {
      const r = noErrors(">> servings: 4\nDo something")
      expect(r.metadata.servings).toBe("4")
    })

    it("Combined metadata: front matter restricts directives", () => {
      // Non-special directives become step text when frontmatter exists
      const r = noErrors("---\ntitle: Recipe\n---\n>> servings: 4\nDo something")
      expect(r.metadata.title).toBe("Recipe")
      expect(r.metadata.servings).toBeUndefined()
    })

    it("Nested YAML values: objects, arrays", () => {
      const r = noErrors("---\ntags: [breakfast, easy]\nauthor:\n  name: Chef\n---\nDo something")
      expect(r.metadata.tags).toEqual(["breakfast", "easy"])
      expect((r.metadata.author as { name: string }).name).toBe("Chef")
    })

    it("[mode] directive: >> [mode]: components", () => {
      const r = noErrors(">> [mode]: components\n@flour{500%g}\n@sugar{100%g}")
      expect(r.metadata["[mode]"]).toBe("components")
    })

    it("[define] directive: >> [define]: ingredients", () => {
      const r = noErrors(">> [define]: ingredients\n@flour{500%g}\n@sugar{100%g}")
      expect(r.metadata["[define]"]).toBe("ingredients")
    })
  })

  // === STRUCTURE ===
  describe("Structure", () => {
    it("Double-equals section: == Prep ==", () => {
      const r = noErrors("== Prep ==\nDo something")
      expect(getSectionNames(r)).toContain("Prep")
    })

    it("Single-equals section: = Cooking", () => {
      const r = noErrors("= Cooking\nDo something")
      expect(getSectionNames(r)).toContain("Cooking")
    })

    it("Multi-line steps: adjacent lines joined with spaces", () => {
      const r = noErrors("Line one\nLine two")
      expect(getSteps(r)).toHaveLength(1)
      // Lines joined into single step
      const text = at(getSteps(r), 0).filter(i => i.type === "text").map(i => i.value).join(" ")
      expect(text).toContain("Line one")
      expect(text).toContain("Line two")
    })

    it("Step separation: blank lines = new step", () => {
      const r = noErrors("Step one\n\nStep two")
      expect(getSteps(r)).toHaveLength(2)
    })
  })

  // === COMMENTS ===
  describe("Comments", () => {
    it("Inline comment: -- text (after step content)", () => {
      const r = noErrors("Mix well. -- stir gently")
      expect(getSteps(r)).toHaveLength(1)
      const text = at(getSteps(r), 0).filter(i => i.type === "text").map(i => i.value).join("")
      expect(text).toContain("Mix well.")
      expect(text).not.toContain("stir gently")
    })

    it("Full-line comment: -- text (on own line)", () => {
      const r = noErrors("-- This is a note to self\nDo something")
      // Comment should not appear in steps text
      const allText = getSteps(r).flat().filter(i => i.type === "text").map(i => i.value).join(" ")
      expect(allText).not.toContain("note to self")
    })

    it("Block comment: [- text -]", () => {
      const r = noErrors("[- removed section -]\nDo something")
      const allText = getSteps(r).flat().filter(i => i.type === "text").map(i => i.value).join(" ")
      expect(allText).not.toContain("removed section")
    })
  })

  // === NOTES ===
  describe("Notes", () => {
    it("Note line: > text", () => {
      const r = noErrors("> Serve immediately.")
      expect(getNotes(r)).toContain("Serve immediately.")
    })

    it("Multiple notes: each parsed separately", () => {
      const r = noErrors("> Note one\n> Note two")
      expect(getNotes(r)).toHaveLength(2)
      expect(getNotes(r)).toContain("Note one")
      expect(getNotes(r)).toContain("Note two")
    })
  })

  // === TEXT ===
  describe("Text edge cases", () => {
    it("@ in plain text: @ not followed by word char", () => {
      const r = noErrors("Use @ symbol here")
      expect(r.ingredients).toHaveLength(0)
      const text = at(getSteps(r), 0).filter(i => i.type === "text").map(i => i.value).join("")
      expect(text).toContain("@")
    })

    it("# in plain text: # not followed by word char", () => {
      const r = noErrors("Item # is special")
      expect(r.cookware).toHaveLength(0)
      const text = at(getSteps(r), 0).filter(i => i.type === "text").map(i => i.value).join("")
      expect(text).toContain("#")
    })

    it("-- without space: not a comment", () => {
      const r = noErrors("well--done steak")
      const text = at(getSteps(r), 0).filter(i => i.type === "text").map(i => i.value).join(" ")
      expect(text).toContain("well--done")
    })

    it("Unicode text: accented, Cyrillic, emoji", () => {
      const r = noErrors("Приготовить @муку{200%г}")
      expect(at(r.ingredients, 0).name).toBe("муку")
      expect(at(r.ingredients, 0).quantity).toBe(200)
      expect(at(r.ingredients, 0).units).toBe("г")
    })
  })
})
