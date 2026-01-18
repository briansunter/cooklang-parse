# cooklang-parse

> A simple, type-safe [Cooklang](https://cooklang.org) parser built with [Ohm](https://ohmjs.org)

[![npm version](https://badge.fury.io/js/cooklang-parse.svg)](https://www.npmjs.com/package/cooklang-parse)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **Full Cooklang specification support** - Parse ingredients, cookware, timers, metadata, and more
- **Type-safe** - Written in TypeScript with comprehensive type definitions
- **Simple API** - One function to parse recipes into easy-to-use structures
- **Well-tested** - Comprehensive test coverage
- **Source position tracking** - All nodes include position information for error reporting

## Installation

```bash
bun add cooklang-parse
```

## Quick Start

```typescript
import { parseCooklang } from "cooklang-parse";

const recipe = parseCooklang(`
  Mix @flour{250%g} and @eggs{3}
  Cook in #pan for ~{20%minutes}
  Serve with @parsley{1%bunch} for garnish
`);

console.log(recipe.ingredients);
// [
//   { name: 'flour', quantity: '250', unit: 'g', fixed: false },
//   { name: 'eggs', quantity: '3', fixed: false },
//   { name: 'parsley', quantity: '1', unit: 'bunch', fixed: false }
// ]

console.log(recipe.cookware);
// ['pan']

console.log(recipe.timers);
// [{ quantity: '20', unit: 'minutes' }]

console.log(recipe.steps);
// [
//   {
//     text: 'Mix @flour{250%g} and @eggs{3}',
//     ingredients: [...],
//     cookware: [],
//     timers: []
//   },
//   {
//     text: 'Cook in #pan for ~{20%minutes}',
//     ingredients: [],
//     cookware: ['pan'],
//     timers: [{ quantity: '20', unit: 'minutes' }]
//   },
//   ...
// ]
```

## Cooklang Syntax

| Syntax | Description | Example |
|--------|-------------|---------|
| `@name{qty%unit}` | Ingredient with quantity | `@flour{250%g}` |
| `@name` | Ingredient without quantity | `@salt` |
| `{qty%unit}` | Fixed quantity (doesn't scale) | `@water{500%ml}` |
| `#name` | Cookware reference | `#pan` |
| `#multi word{}` | Multi-word cookware | `#cast iron skillet{}` |
| `~{qty%unit}` | Timer | `~{20%minutes}` |
| `~name{qty%unit}` | Named timer | `~resting{30%minutes}` |
| `-- text` | Comment | `-- Be careful here` |
| `[- text -]` | Block comment | `[- Chef's note -]` |
| `> text` | Note | `> Serve hot` |
| `== Section ==` | Section header | `== For the sauce ==` |
| `---` | YAML metadata | Front matter block |

## API

### `parseCooklang(source: string): CooklangRecipe`

Parse Cooklang source and return a simplified model.

**Returns:** `CooklangRecipe`

```typescript
interface CooklangRecipe {
  metadata: Record<string, unknown>
  ingredients: SimplifiedIngredient[]
  cookware: string[]
  timers: SimplifiedTimer[]
  steps: SimplifiedStep[]
  notes: string[]
  sections: string[]
  errors: ParseError[]
}

interface SimplifiedIngredient {
  name: string
  quantity?: string
  unit?: string
  preparation?: string
  fixed: boolean
}

interface SimplifiedTimer {
  name?: string
  quantity: string
  unit?: string
}

interface SimplifiedStep {
  text: string
  ingredients: SimplifiedIngredient[]
  cookware: string[]
  timers: SimplifiedTimer[]
}
```

### Advanced: AST Access

For low-level access to the full AST:

```typescript
import { parseToAST } from "cooklang-parse";

const ast = parseToAST(source);
// Returns Recipe interface with full position information
```

## Example Recipe with Metadata

```typescript
const recipe = parseCooklang(`
---
title: Sourdough Bread
servings: 2
prep_time: 30 minutes
---

== Starter ==
Mix @starter{100%g} and @water{100%g}
Let ferment for ~{8%hours}

== Dough ==
Combine @flour{500%g} and @water{325%g}
Add @starter{200%g} and @salt{10%g}
Knead in #mixing bowl for ~{10%minutes}
`);

console.log(recipe.metadata);
// { title: 'Sourdough Bread', servings: 2, prep_time: '30 minutes' }

console.log(recipe.sections);
// ['Starter', 'Dough']

console.log(recipe.steps.map(s => s.text));
// ['Mix @starter{100%g} and @water{100%g}', 'Let ferment for ~{8%hours}', ...]
```

## Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Lint code
bun run lint

# Format code
bun run format
```

## License

MIT
