---
title: Playground
aside: false
---

# Cooklang Playground

Try out Cooklang syntax in real-time. Type your recipe on the left and see the parsed result on the right.

<script setup>
import PlaygroundWrapper from './.vitepress/components/PlaygroundWrapper.vue'
</script>

<PlaygroundWrapper />

## Quick Reference

| Syntax | Description | Example |
|--------|-------------|---------|
| `@ingredient{amount%unit}` | Ingredient with quantity | `@flour{2%cups}` |
| `@ingredient{}` | Ingredient without quantity | `@salt{}` |
| `#cookware{}` | Cookware item | `#pan{}` |
| `~timer{duration%unit}` | Timer | `~baking{30%minutes}` |
| `>> key: value` | Metadata directive | `>> servings: 4` |
| `== Section ==` | Section header | `== Prep ==` |
| `> note` | Note/comment | `> Preheat the oven` |
| `-- comment` | Line comment | `-- This is a comment` |

## Example Recipe

```cooklang
>> title: Pancakes
>> servings: 4

== Prep ==

Mix @flour{2%cups}, @sugar{2%tbsp}, @baking powder{2%tsp}, and @salt{1/2%tsp} in a #large bowl{}.

In another bowl, whisk @eggs{2} and @milk{1.5%cups}.

== Cooking ==

Pour batter onto a #hot griddle{}.

Cook for ~first side{2%minutes}, flip, and cook for ~second side{1%minute}.

> Serve warm with maple syrup!
```
