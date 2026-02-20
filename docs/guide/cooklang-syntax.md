# Cooklang Syntax

Cooklang is a markup language for writing recipes as plain text. A few special characters turn ordinary text into structured data.

## Ingredients `@`

Use `@` to mark an ingredient. Add `{quantity%unit}` for amounts. Only `%` separates quantity from unit.

```txt
Add @salt and @pepper.                    // no amount
Add @eggs{3}.                             // quantity only
Add @flour{250%g}.                        // quantity + unit
Add @olive oil{2%tbsp}.                   // multi-word name (no braces needed)
Add @sea salt{} to taste.                 // multi-word with empty braces
```

### Parsed Output

| Input | Name | Quantity | Unit |
|-------|------|----------|------|
| `@salt` | salt | "some" | "" |
| `@eggs{3}` | eggs | 3 | "" |
| `@flour{250%g}` | flour | 250 | g |
| `@olive oil{2%tbsp}` | olive oil | 2 | tbsp |

### Fixed Quantities

Use `=` inside the braces to mark a quantity that should not scale with servings:

```txt
Add @salt{=1%tsp} to taste.
```

### Note Suffix

Add notes in parentheses after the ingredient:

```txt
Add @flour{100%g}(sifted) to the bowl.
Add @butter(softened) to the mix.
```

### Aliases

Use `|` to define a display alias (the part before `|` is the canonical name):

```txt
Add @white wine|wine{100%ml} to deglaze.
```

## Cookware `#`

Use `#` to mark cookware. Multi-word names need `{}` at the end.

```txt
Mix in a #bowl.
Heat in a #non-stick pan{}.
Use a #large mixing bowl{}.
```

Cookware can also have notes in parentheses:

```txt
Heat in #pan(large).
```

## Timers `~`

Use `~` to mark timers. The amount goes in `{quantity%unit}`.

```txt
Cook for ~{20%minutes}.
Let ~rest{5%minutes}.
Simmer for ~{1%hour}.
```

A timer can also be a bare word without braces:

```txt
Let it ~rest after plating.
```

## Metadata

### YAML Front Matter

Wrap YAML in `---` fences at the start of the recipe:

```txt
---
title: Chocolate Cake
servings: 8
tags: [dessert, chocolate]
prep_time: 20 min
cook_time: 35 min
---

Mix @flour{300%g} with @cocoa powder{50%g}.
```

### Directives

Use `>> key: value` anywhere in the recipe (when no frontmatter is present):

```txt
>> title: Chocolate Cake
>> servings: 8

Mix @flour{300%g} with @cocoa powder{50%g}.
```

::: warning
When YAML frontmatter (`---`) is present, non-special `>> key: value` lines are treated as regular step text. In `{ extensions: "all" }`, special directives like `[mode]` and `[define]` still apply as configuration.
:::

## Sections

Divide recipes into sections with `==` or `=`:

```txt
== Prep ==
Dice @onion{1} and mince @garlic{3%cloves}.

== Cooking ==
Heat #pan over medium heat.

= Serving
Plate and garnish.
```

## Comments

```txt
-- This is a line comment (note the space after --)

Mix @flour{250%g}. -- This is an inline comment

[- This is a block comment
   that spans multiple lines -]
```

::: warning
Comments require a space after `--`. The text `text--more` is **not** a comment - it's regular text. This avoids conflicts with YAML `---` front matter fences.
:::

## Notes

Lines starting with `>` are recipe notes:

```txt
> This recipe works best with room-temperature eggs.
> You can substitute almond milk for regular milk.

Mix @flour{250%g} with @milk{300%ml}.
```

## Unicode Support

Ingredient and cookware names support accented characters, Cyrillic, and emoji:

```txt
Add @creme fraiche{2%tbsp}.
Add @muka{500%g}.
Stir in @butter{50%g}.
```
