# Supported Syntax Features

Complete table of Cooklang syntax features supported by cooklang-parse.

## Feature Support Matrix

| Feature | Syntax | Supported | Example |
|---------|--------|:---------:|---------|
| **Ingredients** | | | |
| Single-word ingredient | `@name` | :white_check_mark: | `@salt` |
| Ingredient with quantity | `@name{qty}` | :white_check_mark: | `@eggs{3}` |
| Ingredient with quantity + unit | `@name{qty%unit}` | :white_check_mark: | `@flour{250%g}` |
| Multi-word ingredient | `@multi word name{}` | :white_check_mark: | `@olive oil{2%tbsp}` |
| Multi-word (no braces) | `@multi word{qty%unit}` | :white_check_mark: | `@sea salt{1%tsp}` |
| Empty braces | `@name{}` | :white_check_mark: | `@salt{}` |
| Fixed quantity (prefix) | `=@name{qty%unit}` | :white_check_mark: | `=@salt{1%pinch}` |
| Fixed quantity (in braces) | `@name{=qty%unit}` | :white_check_mark: | `@salt{=1%tsp}` |
| Preparation suffix | `@name{qty%unit}(prep)` | :white_check_mark: | `@flour{100%g}(sifted)` |
| Preparation (no amount) | `@name(prep)` | :white_check_mark: | `@butter(softened)` |
| Alias syntax | `@display\|canonical{}` | :white_check_mark: | `@white wine\|wine{100%ml}` |
| Modifier `@` (reference) | `@@name` | :white_check_mark: | `@@tomato sauce{200%ml}` |
| Modifier `&` (hidden) | `@&name` | :white_check_mark: | `@&flour{300%g}` |
| Modifier `?` (optional) | `@?name` | :white_check_mark: | `@?garnish` |
| Modifier `+` (added) | `@+name` | :white_check_mark: | `@+extra cheese{}` |
| Modifier `-` (removed) | `@-name` | :white_check_mark: | `@-onion` |
| Fraction quantity | `@name{1/2%cup}` | :white_check_mark: | `@sugar{1/2%cup}` |
| Decimal quantity | `@name{0.5%cup}` | :white_check_mark: | `@water{0.5%cup}` |
| Space-separated amount | `@name{qty unit}` | :white_check_mark: | `@flour{2 cups}` |
| Unicode names | `@crème fraîche{}` | :white_check_mark: | `@crème fraîche{2%tbsp}` |
| **Cookware** | | | |
| Single-word cookware | `#name` | :white_check_mark: | `#pan` |
| Multi-word cookware | `#multi word name{}` | :white_check_mark: | `#mixing bowl{}` |
| Cookware with quantity | `#name{qty}` | :white_check_mark: | `#pan{2}` |
| Cookware modifiers | `#&name`, `#?name` | :white_check_mark: | `#?blender` |
| **Timers** | | | |
| Anonymous timer | `~{qty%unit}` | :white_check_mark: | `~{20%minutes}` |
| Named timer | `~name{qty%unit}` | :white_check_mark: | `~rest{5%minutes}` |
| Timer without unit | `~{qty}` | :white_check_mark: | `~{5}` |
| Bare word timer | `~name` | :white_check_mark: | `~rest` |
| **Metadata** | | | |
| YAML front matter | `---` fences | :white_check_mark: | See [syntax guide](/guide/cooklang-syntax#yaml-front-matter) |
| Metadata directives | `>> key: value` | :white_check_mark: | `>> servings: 4` |
| Combined metadata | Both in same recipe | :white_check_mark: | Front matter + directives |
| Nested YAML values | Objects, arrays | :white_check_mark: | `tags: [a, b]` |
| `[mode]` directive | `>> [mode]: components` | :white_check_mark: | Component-only sections |
| `[define]` directive | `>> [define]: ingredients` | :white_check_mark: | Define ingredient lists |
| **Structure** | | | |
| Double-equals section | `== Name ==` | :white_check_mark: | `== Prep ==` |
| Single-equals section | `= Name` | :white_check_mark: | `= Cooking` |
| Multi-line steps | Adjacent lines | :white_check_mark: | Lines joined with spaces |
| Step separation | Blank lines | :white_check_mark: | Blank line = new step |
| **Comments** | | | |
| Inline comment | `-- text` | :white_check_mark: | `Mix well. -- stir gently` |
| Full-line comment | `-- text` (on own line) | :white_check_mark: | `-- This is a note to self` |
| Block comment | `[- text -]` | :white_check_mark: | `[- removed section -]` |
| **Notes** | | | |
| Note line | `> text` | :white_check_mark: | `> Serve immediately.` |
| Multiple notes | Multiple `>` lines | :white_check_mark: | Each parsed separately |
| **Text** | | | |
| `@` in plain text | `@` not followed by word | :white_check_mark: | `Use @ symbol` |
| `#` in plain text | `#` not followed by word | :white_check_mark: | `Item # here` |
| `--` without space | Not a comment | :white_check_mark: | `well--done` |
| Unicode text | Accented, Cyrillic, emoji | :white_check_mark: | Full unicode support |

## Spec Compliance

cooklang-parse is verified against **57 canonical test cases** from the official [cooklang-rs](https://github.com/cooklang/cooklang-rs) reference implementation, achieving exact byte-level parity on all cases.
