import { test, expect } from "bun:test";
import { parseCooklang } from '../src/index';
import { getSteps, getNotes, getSectionNames } from './canonical-helper';

test('parse simple recipe', () => {
  const source = `
Mix @flour{250%g} and @eggs{3}.
Cook in #pan for ~{20%minutes}.
`;

  const recipe = parseCooklang(source);

  expect(recipe.ingredients).toHaveLength(2);
  expect(recipe.ingredients[0]).toEqual({
    type: 'ingredient',
    name: 'flour',
    quantity: 250,
    units: 'g',
    fixed: false,
  });
  expect(recipe.ingredients[1]).toEqual({
    type: 'ingredient',
    name: 'eggs',
    quantity: 3,
    units: '',
    fixed: false,
  });

  expect(recipe.cookware).toEqual([{ type: 'cookware', name: 'pan', quantity: 1, units: '' }]);
  expect(recipe.timers).toEqual([{ type: 'timer', name: '', quantity: 20, units: 'minutes' }]);
  expect(getSteps(recipe)).toHaveLength(1);
});

test('parse multi-word ingredients', () => {
  const source = `Add @sea salt{} and @olive oil{} to the #mixing bowl{}.`;

  const recipe = parseCooklang(source);

  expect(recipe.ingredients).toHaveLength(2);
  expect(recipe.ingredients[0]!.name).toBe('sea salt');
  expect(recipe.ingredients[1]!.name).toBe('olive oil');

  expect(recipe.cookware).toEqual([{ type: 'cookware', name: 'mixing bowl', quantity: 1, units: '' }]);
});

test('parse recipe with metadata', () => {
  const source = `---
title: Easy Pancakes
servings: 4
tags: [breakfast, easy]
---

Mix @flour{250%g} with @milk{500%ml}.
`;

  const recipe = parseCooklang(source);

  expect(recipe.metadata.title).toBe('Easy Pancakes');
  expect(recipe.metadata.servings).toBe(4);
  expect(recipe.metadata.tags).toEqual(['breakfast', 'easy']);
});

test('parse recipe with notes', () => {
  const source = `
> This is a note about the recipe.
> Another note line.

Mix @flour{250%g}.
`;

  const recipe = parseCooklang(source);

  expect(getNotes(recipe)).toHaveLength(2);
  expect(getNotes(recipe)[0]).toBe('This is a note about the recipe.');
  expect(getNotes(recipe)[1]).toBe('Another note line.');
});

test('parse recipe with sections', () => {
  const source = `
==Dough==
Mix @flour{500%g} and @water{300%ml}.

==Filling==
Add @cheese{200%g}.
`;

  const recipe = parseCooklang(source);

  expect(getSectionNames(recipe)).toEqual(['Dough', 'Filling']);
});

test('parse timer with name', () => {
  const source = `Cook for ~rest{30%minutes}.`;

  const recipe = parseCooklang(source);

  expect(recipe.timers[0]).toEqual({
    type: 'timer',
    name: 'rest',
    quantity: 30,
    units: 'minutes',
  });
});

test('parse fixed quantity ingredient', () => {
  const source = `Add @salt{=1%tsp} to taste.`;

  const recipe = parseCooklang(source);

  expect(recipe.ingredients[0]!.fixed).toBe(true);
  expect(recipe.ingredients[0]!.name).toBe('salt');
});

test('parse inline comments are stripped from output', () => {
  const source = `Mix @flour{250%g}. -- This is a comment`;

  const recipe = parseCooklang(source);

  expect(getSteps(recipe)).toHaveLength(1);
  expect(getSteps(recipe)[0]!.every(i => i.type !== 'text' || !i.value.includes('This is a comment'))).toBe(true);
});

test('parse empty recipe', () => {
  const source = ``;

  const recipe = parseCooklang(source);

  expect(recipe.ingredients).toHaveLength(0);
  expect(recipe.cookware).toHaveLength(0);
  expect(recipe.timers).toHaveLength(0);
  expect(getSteps(recipe)).toHaveLength(0);
});

test('full pancake recipe', async () => {
  const fixture = await Bun.file('test/fixtures/pancakes.cook').text();

  const recipe = parseCooklang(fixture);

  expect(recipe.ingredients.length).toBeGreaterThan(0);
  expect(recipe.ingredients.some(i => i.name === 'eggs')).toBe(true);
  expect(recipe.ingredients.some(i => i.name === 'flour')).toBe(true);

  expect(recipe.cookware.length).toBeGreaterThan(0);
  expect(recipe.cookware.some(c => c.name === 'bowl')).toBe(true);

  expect(recipe.timers.length).toBeGreaterThan(0);
  expect(recipe.timers[0]!.units).toBe('minutes');

  expect(getSteps(recipe).length).toBeGreaterThan(0);
});

test('parse ingredient with unit', () => {
  const source = `Add @onion{1%diced} and @garlic{3%cloves}.`;

  const recipe = parseCooklang(source);

  expect(recipe.ingredients).toHaveLength(2);
  expect(recipe.ingredients[0]).toEqual({
    type: 'ingredient',
    name: 'onion',
    quantity: 1,
    units: 'diced',
    fixed: false,
  });
  expect(recipe.ingredients[1]).toEqual({
    type: 'ingredient',
    name: 'garlic',
    quantity: 3,
    units: 'cloves',
    fixed: false,
  });
});

test('parse block comments are transparent', () => {
  const source = `
Mix @flour{250%g}.
[- This is a block comment -]
Add @eggs{3}.
`;

  const recipe = parseCooklang(source);

  expect(recipe.errors).toHaveLength(0);
  // Block comment on its own line becomes blank line (spaces), so still 2 steps
  expect(getSteps(recipe)).toHaveLength(2);
});

test('block comment inline does not split step', () => {
  const source = `Add @flour{250%g} [- block comment -] and mix.\n`;

  const recipe = parseCooklang(source);

  expect(recipe.errors).toHaveLength(0);
  // Block comment within a line is transparent — single step
  expect(getSteps(recipe)).toHaveLength(1);
});

test('parse multiple timers in one step', () => {
  const source = `Cook for ~{10%minutes}, then rest for ~rest{5%minutes}.`;

  const recipe = parseCooklang(source);

  expect(recipe.timers).toHaveLength(2);
  expect(recipe.timers[0]).toEqual({ type: 'timer', name: '', quantity: 10, units: 'minutes' });
  expect(recipe.timers[1]).toEqual({ type: 'timer', name: 'rest', quantity: 5, units: 'minutes' });
});

test('parse metadata with object', () => {
  const source = `---
nutrition: {calories: 300, protein: 15g}
---

Mix @flour{250%g}.`;

  const recipe = parseCooklang(source);

  expect(recipe.metadata.nutrition).toEqual({ calories: 300, protein: '15g' });
});

test('ingredients in multiple steps are deduplicated', () => {
  const source = `
Mix @flour{250%g}.

Add @flour{250%g} and @eggs{3}.
`;

  const recipe = parseCooklang(source);

  expect(recipe.ingredients).toHaveLength(2);
  expect(recipe.ingredients.some(i => i.name === 'flour')).toBe(true);
  expect(recipe.ingredients.some(i => i.name === 'eggs')).toBe(true);
});

test('cookware in multiple steps are deduplicated', () => {
  const source = `
Mix in #bowl.

Pour into #pan and then back into #bowl.
`;

  const recipe = parseCooklang(source);

  expect(recipe.cookware).toHaveLength(2);
  expect(recipe.cookware.some(c => c.name === 'bowl')).toBe(true);
  expect(recipe.cookware.some(c => c.name === 'pan')).toBe(true);
});

test('timers in multiple steps are deduplicated', () => {
  const source = `
Cook for ~{10%minutes}.

Rest for ~{10%minutes}.
`;

  const recipe = parseCooklang(source);

  expect(recipe.timers).toHaveLength(1);
  expect(recipe.timers[0]).toEqual({ type: 'timer', name: '', quantity: 10, units: 'minutes' });
});

test('grammar export is an Ohm grammar object', () => {
  const { grammar } = require('../src/semantics.js');

  expect(grammar).toBeDefined();
  expect(typeof grammar.match).toBe('function');
});

test('recipe without metadata has empty metadata object', () => {
  const source = `Mix @flour{250%g}.`;

  const recipe = parseCooklang(source);

  expect(recipe.metadata).toEqual({});
});

test('recipe with only whitespace returns empty', () => {
  const source = `

   `;

  const recipe = parseCooklang(source);

  expect(recipe.ingredients).toHaveLength(0);
  expect(recipe.cookware).toHaveLength(0);
  expect(getSteps(recipe)).toHaveLength(0);
});

test('step items include full content', () => {
  const source = `Mix @flour{250%g} and @eggs{3} in the #bowl.`;

  const recipe = parseCooklang(source);

  expect(getSteps(recipe)).toHaveLength(1);
  const textItems = getSteps(recipe)[0]!.filter(i => i.type === 'text');
  expect(textItems.some(t => t.type === 'text' && t.value.includes('Mix'))).toBe(true);
  expect(textItems.some(t => t.type === 'text' && t.value.includes('in the'))).toBe(true);
});

test('inline comments are stripped from steps', () => {
  const source = `Mix @flour{250%g}. -- Do not overmix`;

  const recipe = parseCooklang(source);

  expect(getSteps(recipe)).toHaveLength(1);
  // Inline comments are stripped from public output
  const textItems = getSteps(recipe)[0]!.filter(i => i.type === 'text');
  expect(textItems.some(t => t.type === 'text' && t.value.includes('Mix'))).toBe(true);
});

test('metadata with boolean values', () => {
  const source = `---
vegan: true
gluten_free: false
---

Mix @flour{250%g}.`;

  const recipe = parseCooklang(source);

  expect(recipe.metadata.vegan).toBe(true);
  expect(recipe.metadata.gluten_free).toBe(false);
});

test('metadata with null value', () => {
  const source = `---
optional_field: null
---

Mix @flour{250%g}.`;

  const recipe = parseCooklang(source);

  expect(recipe.metadata.optional_field).toBeNull();
});

test('metadata with decimal numbers', () => {
  const source = `---
rating: 4.5
version: 1.0
---

Mix @flour{250%g}.`;

  const recipe = parseCooklang(source);

  expect(recipe.metadata.rating).toBe(4.5);
  expect(recipe.metadata.version).toBe(1.0);
});

test('complex recipe with all features', () => {
  const source = `---
title: Complex Recipe
servings: 4
difficulty: hard
---

> This is a preparatory note.

==Prep==

Dice @onions{2%large} and @garlic{3%cloves}.

==Cooking==

Saute in #large pan{} over medium heat for ~{5%minutes}.

Add @tomatoes{800%g} and simmer for ~simmer{20%minutes}.

[- This is a block comment about the recipe -]

Serve hot with @garnish{=1%tbsp} of fresh herbs.
`;

  const recipe = parseCooklang(source);

  expect(recipe.metadata.title).toBe('Complex Recipe');
  expect(recipe.metadata.servings).toBe(4);
  expect(getSectionNames(recipe)).toContain('Prep');
  expect(getSectionNames(recipe)).toContain('Cooking');
  expect(getNotes(recipe)).toEqual(['This is a preparatory note.']);
  expect(recipe.ingredients.length).toBeGreaterThanOrEqual(3);
  expect(recipe.ingredients.some(i => i.name === 'onions')).toBe(true);
  expect(recipe.ingredients.some(i => i.name === 'garlic')).toBe(true);
  expect(recipe.ingredients.some(i => i.name === 'tomatoes')).toBe(true);
  expect(recipe.ingredients.some(i => i.name === 'garnish' && i.fixed)).toBe(true);
  expect(recipe.cookware.some(c => c.name === 'large pan')).toBe(true);
  expect(recipe.timers.length).toBeGreaterThanOrEqual(1);
  expect(recipe.timers.some(t => t.name === 'simmer')).toBe(true);
  expect(getSteps(recipe).length).toBeGreaterThanOrEqual(2);
});

test('parse multiword cookware', () => {
  const source = `Use #frying pan{} for cooking.`;

  const recipe = parseCooklang(source);

  expect(recipe.cookware).toHaveLength(1);
  expect(recipe.cookware[0]!.name).toBe('frying pan');
});

test('parse timer without unit', () => {
  const source = `Wait for ~{5}.`;

  const recipe = parseCooklang(source);

  expect(recipe.timers).toHaveLength(1);
  expect(recipe.timers[0]!.quantity).toBe(5);
  expect(recipe.timers[0]!.units).toBe('');
});

test('parse multiple notes in succession', () => {
  const source = `
> First note.
> Second note.
> Third note.

Mix @flour{250%g}.
`;

  const recipe = parseCooklang(source);

  expect(getNotes(recipe)).toHaveLength(3);
  expect(getNotes(recipe)[0]).toBe('First note.');
  expect(getNotes(recipe)[1]).toBe('Second note.');
  expect(getNotes(recipe)[2]).toBe('Third note.');
});

test('parse empty ingredient amount braces', () => {
  const source = `Add @salt{} to taste.`;

  const recipe = parseCooklang(source);

  expect(recipe.ingredients).toHaveLength(1);
  expect(recipe.ingredients[0]!.name).toBe('salt');
  expect(recipe.ingredients[0]!.quantity).toBe('some');
  expect(recipe.ingredients[0]!.units).toBe('');
});

test('parse ingredient with only quantity no unit', () => {
  const source = `Add @eggs{3} and @milk{500%ml}.`;

  const recipe = parseCooklang(source);

  expect(recipe.ingredients[0]!.quantity).toBe(3);
  expect(recipe.ingredients[0]!.units).toBe('');
  expect(recipe.ingredients[1]!.quantity).toBe(500);
  expect(recipe.ingredients[1]!.units).toBe('ml');
});

test('step contains cookware references', () => {
  const source = `Mix in #bowl and pour into #pan.`;

  const recipe = parseCooklang(source);

  expect(recipe.cookware).toHaveLength(2);
  expect(recipe.cookware[0]!.name).toBe('bowl');
  expect(recipe.cookware[1]!.name).toBe('pan');
});

test('step contains timer references', () => {
  const source = `Cook for ~{10%minutes} then rest for ~rest{5%minutes}.`;

  const recipe = parseCooklang(source);

  expect(recipe.timers).toHaveLength(2);
  expect(recipe.timers[0]!.quantity).toBe(10);
  expect(recipe.timers[1]!.name).toBe('rest');
});

test('parse single word ingredient', () => {
  const source = `Add @salt and @pepper.`;

  const recipe = parseCooklang(source);

  expect(recipe.ingredients).toHaveLength(2);
  expect(recipe.ingredients[0]!.name).toBe('salt');
  expect(recipe.ingredients[1]!.name).toBe('pepper');
});

test('parse single word cookware', () => {
  const source = `Use #pan and #spatula.`;

  const recipe = parseCooklang(source);

  expect(recipe.cookware.map(c => c.name)).toEqual(['pan', 'spatula']);
});

test('recipe with multiple steps', () => {
  const source = `Step one.

Step two.

Step three.`;

  const recipe = parseCooklang(source);

  // Steps are separated by blank lines
  expect(getSteps(recipe).length).toBeGreaterThanOrEqual(1);
});

test('parse recipe with no ingredients', () => {
  const source = `Mix everything together.`;

  const recipe = parseCooklang(source);

  expect(recipe.ingredients).toHaveLength(0);
  expect(getSteps(recipe)).toHaveLength(1);
});

test('parse recipe with no cookware', () => {
  const source = `Add @salt{1%tsp}.`;

  const recipe = parseCooklang(source);

  expect(recipe.cookware).toHaveLength(0);
});

test('parse recipe with no timers', () => {
  const source = `Mix @flour{250%g} and @water{100%ml}.`;

  const recipe = parseCooklang(source);

  expect(recipe.timers).toHaveLength(0);
});

test('step preserves original text in items', () => {
  const source = `Carefully fold in the whipped cream.`;

  const recipe = parseCooklang(source);

  expect(getSteps(recipe)[0]).toEqual([
    { type: 'text', value: 'Carefully fold in the whipped cream.' },
  ]);
});

test('parse recipe with multiple sections', () => {
  const source = `
==Prep==
Chop vegetables.

==Cooking==
Cook the meal.

==Serving==
Plate and serve.
`;

  const recipe = parseCooklang(source);

  expect(getSectionNames(recipe)).toEqual(['Prep', 'Cooking', 'Serving']);
});

test('parse metadata with complex arrays', () => {
  const source = `---
dietary: [vegan, gluten-free, dairy-free]
---

Mix @flour{250%g}.`;

  const recipe = parseCooklang(source);

  expect(recipe.metadata.dietary).toEqual(['vegan', 'gluten-free', 'dairy-free']);
});

test('parse ingredient quantity variations', () => {
  const source = `
Add @sugar{1/2%cup}.
Add @water{0.5%cup}.
Add @salt{1%tsp}.
`;

  const recipe = parseCooklang(source);

  expect(recipe.ingredients).toHaveLength(3);
});

test('parse timer variations', () => {
  const source = `
Cook for ~{10%minutes}.
Bake for ~baking{30%minutes}.
Rest for ~{5}.
`;

  const recipe = parseCooklang(source);

  expect(recipe.timers.length).toBeGreaterThanOrEqual(2);
});

test('parse metadata directives with >> syntax', () => {
  const source = `
>> title: Pancakes
>> servings: 4
Mix @flour{250%g}.
`;

  const recipe = parseCooklang(source);

  expect(recipe.metadata.title).toBe('Pancakes');
  expect(recipe.metadata.servings).toBe("4");
  const textItems = getSteps(recipe)[0]!.filter(i => i.type === 'text');
  expect(textItems.some(t => t.type === 'text' && t.value.includes('Mix'))).toBe(true);
});

test('metadata directives in recipe body are extracted', () => {
  const source = `
Step one.
>> servings: 2
Step two.
`;

  const recipe = parseCooklang(source);

  expect(recipe.metadata.servings).toBe("2");
  expect(getSteps(recipe)).toHaveLength(2);
  const step1Text = getSteps(recipe)[0]!.filter(i => i.type === 'text').map(i => i.type === 'text' ? i.value : '').join('');
  const step2Text = getSteps(recipe)[1]!.filter(i => i.type === 'text').map(i => i.type === 'text' ? i.value : '').join('');
  expect(step1Text).toBe('Step one.');
  expect(step2Text).toBe('Step two.');
});

test('parse single-equals section syntax', () => {
  const source = `
= Prep
Chop @onion{1}.

= Cook
Saute in #pan.
`;

  const recipe = parseCooklang(source);

  expect(getSectionNames(recipe)).toEqual(['Prep', 'Cook']);
  expect(getSteps(recipe).length).toBeGreaterThanOrEqual(2);
});

test('invalid YAML frontmatter becomes warning and is ignored', () => {
  const source = `---
title: Test Recipe
tags: [test
invalid yaml here
---

@eggs{2} and @butter{1%tbsp}
`;

  const recipe = parseCooklang(source);

  expect(recipe.metadata).toEqual({});
  expect(recipe.ingredients.map(i => i.name)).toEqual(['eggs', 'butter']);
  expect(recipe.warnings.some(e => /yaml/i.test(e.message))).toBe(true);
});

test('parse single-word timer without braces', () => {
  const source = `Let it ~rest after plating.`;

  const recipe = parseCooklang(source);

  expect(recipe.errors.some(e => e.severity === 'error')).toBe(false);
  expect(recipe.timers).toEqual([{ type: 'timer', name: 'rest', quantity: '', units: '' }]);
});

test('parse ingredient with note suffix', () => {
  const source = `Add @flour{100%g}(sifted) to the bowl.`;

  const recipe = parseCooklang(source);

  expect(recipe.ingredients).toHaveLength(1);
  expect(recipe.ingredients[0]).toEqual({
    type: 'ingredient',
    name: 'flour',
    quantity: 100,
    units: 'g',
    note: 'sifted',
    fixed: false,
  });
});

test('parse cookware with note', () => {
  const source = `Heat in #pan(large) until hot.`;

  const recipe = parseCooklang(source);

  expect(recipe.cookware).toHaveLength(1);
  expect(recipe.cookware[0]).toEqual({
    type: 'cookware',
    name: 'pan',
    quantity: 1,
    units: '',
    note: 'large',
  });
});

test('parse ingredient with note and no amount', () => {
  const source = `Add @butter(softened) to the mix.`;

  const recipe = parseCooklang(source);

  expect(recipe.ingredients).toHaveLength(1);
  expect(recipe.ingredients[0]).toEqual({
    type: 'ingredient',
    name: 'butter',
    quantity: 'some',
    units: '',
    note: 'softened',
    fixed: false,
  });
});

test('parse fixed quantity inside braces', () => {
  const source = `Add @salt{=1%tsp} to taste.`;

  const recipe = parseCooklang(source);

  expect(recipe.ingredients).toHaveLength(1);
  expect(recipe.ingredients[0]).toEqual({
    type: 'ingredient',
    name: 'salt',
    quantity: 1,
    units: 'tsp',
    fixed: true,
  });
});

test('parse fixed quantity inside braces without unit', () => {
  const source = `Add @salt{=2} to taste.`;

  const recipe = parseCooklang(source);

  expect(recipe.ingredients).toHaveLength(1);
  expect(recipe.ingredients[0]).toEqual({
    type: 'ingredient',
    name: 'salt',
    quantity: 2,
    units: '',
    fixed: true,
  });
});

test('parse extended ingredient modifier syntax', () => {
  const source = `Add @@tomato sauce{200%ml}, @&flour{300%g}, and @white wine|wine{}.`;

  const recipe = parseCooklang(source);

  expect(recipe.ingredients).toHaveLength(3);
  expect(recipe.ingredients[0]).toEqual({
    type: 'ingredient',
    name: 'tomato sauce',
    quantity: 200,
    units: 'ml',
    fixed: false,
  });
  expect(recipe.ingredients[1]).toEqual({
    type: 'ingredient',
    name: 'flour',
    quantity: 300,
    units: 'g',
    fixed: false,
  });
  expect(recipe.ingredients[2]).toEqual({
    type: 'ingredient',
    name: 'white wine',
    alias: 'wine',
    quantity: 'some',
    units: '',
    fixed: false,
  });
});

test('grammar parse error returns error', () => {
  const recipe = parseCooklang('=');

  expect(recipe.errors).toHaveLength(1);
  expect(recipe.errors[0]!.severity).toBe('error');
  expect(getSteps(recipe)).toHaveLength(0);
});

test('directives with frontmatter: only [mode]/[define] extracted', () => {
  const source = `---
title: Pancakes
---
>> author: Chef
Mix @flour{250%g}.
`;

  const recipe = parseCooklang(source);

  expect(recipe.metadata.title).toBe('Pancakes');
  // Non-special directives are stripped but not added to metadata when frontmatter exists
  expect(recipe.metadata.author).toBeUndefined();
});

test('non-object YAML frontmatter produces warning', () => {
  const source = `---
just a plain string
---
Mix @flour{250%g}.
`;

  const recipe = parseCooklang(source);

  expect(recipe.metadata).toEqual({});
  expect(recipe.warnings.some(e => /expected a key/i.test(e.message))).toBe(true);
});

test('array YAML frontmatter produces warning', () => {
  const source = `---
- item1
- item2
---
Mix @flour{250%g}.
`;

  const recipe = parseCooklang(source);

  expect(recipe.metadata).toEqual({});
  expect(recipe.warnings.some(e => /expected a key/i.test(e.message))).toBe(true);
});

test('malformed YAML in directive value falls back to string', () => {
  const source = `>> tags: [unclosed
Mix @flour{250%g}.
`;

  const recipe = parseCooklang(source);

  expect(recipe.metadata.tags).toBe('[unclosed');
  expect(getSteps(recipe)).toHaveLength(1);
});

test('amount without percent separator keeps everything as quantity', () => {
  const source = `Add @flour{2 cups}.`;

  const recipe = parseCooklang(source);

  expect(recipe.ingredients).toHaveLength(1);
  expect(recipe.ingredients[0]!.name).toBe('flour');
  // Without %, entire content is quantity (matching cooklang-rs canonical behavior)
  expect(recipe.ingredients[0]!.quantity).toBe("2 cups");
  expect(recipe.ingredients[0]!.units).toBe('');
});

test('multi-word amount without percent stays as quantity string', () => {
  const source = `Add @flour{some amount}.`;

  const recipe = parseCooklang(source);

  expect(recipe.ingredients).toHaveLength(1);
  expect(recipe.ingredients[0]!.name).toBe('flour');
  expect(recipe.ingredients[0]!.quantity).toBe('some amount');
  expect(recipe.ingredients[0]!.units).toBe('');
});

// --- Error handling tests ---

test('parse error uses shortMessage without verbose formatting', () => {
  const recipe = parseCooklang('=');

  expect(recipe.errors).toHaveLength(1);
  const err = recipe.errors[0]!;
  expect(err.severity).toBe('error');
  expect(err.shortMessage).toBeDefined();
  // shortMessage should not contain position prefix or ASCII art
  expect(err.shortMessage ?? '').not.toMatch(/^Line \d+/);
  expect(err.shortMessage ?? '').not.toContain('|');
  // message should be the clean short message
  expect(err.message).toBe(err.shortMessage!);
});

test('parse error offset is correct with directives', () => {
  const source = `>> title: Pancakes
>> servings: 4
=`;

  const recipe = parseCooklang(source);

  expect(recipe.errors).toHaveLength(1);
  const err = recipe.errors[0]!;
  expect(err.severity).toBe('error');
  // Offset should point into the original source near the `=` (not 0 or 2)
  expect(err.position.offset).toBeGreaterThanOrEqual(source.lastIndexOf('='));
  expect(err.position.offset).toBeLessThanOrEqual(source.length);
});

test('YAML error has non-zero offset based on actual position in source', () => {
  const source = `---
title: Test Recipe
tags: [test
invalid yaml here
---

@eggs{2} and @butter{1%tbsp}
`;

  const recipe = parseCooklang(source);

  expect(recipe.warnings.some(e => /yaml/i.test(e.message))).toBe(true);
  const yamlWarning = recipe.warnings.find(e => /yaml/i.test(e.message))!;
  // Offset should be > 0 since the error is inside the YAML block, not at the start of the file
  expect(yamlWarning.position.offset).toBeGreaterThan(0);
});

test('non-object YAML frontmatter reports what type was found', () => {
  const source = `---
- item1
- item2
---
Mix @flour{250%g}.
`;

  const recipe = parseCooklang(source);

  const warning = recipe.warnings[0]!;
  expect(warning.message).toContain('got an array');
});

test('string YAML frontmatter reports what type was found', () => {
  const source = `---
just a plain string
---
Mix @flour{250%g}.
`;

  const recipe = parseCooklang(source);

  const warning = recipe.warnings[0]!;
  expect(warning.message).toContain('got a string');
});

test('parse error reports correct line number on later lines', () => {
  const source = `Mix @flour{250%g}.
Add @eggs{3}.
=`;
  const recipe = parseCooklang(source);

  expect(recipe.errors).toHaveLength(1);
  const err = recipe.errors[0]!;
  expect(err.position.line).toBe(3);
});

test('YAML error line points to the source line with the problem', () => {
  const source = `---
title: Test
tags: [broken
---
@eggs{2}`;
  const recipe = parseCooklang(source);

  const w = recipe.warnings.find(e => /yaml/i.test(e.message))!;
  expect(w).toBeDefined();
  // Error should point at or before the closing ---, not past it
  expect(w.position.line).toBeLessThanOrEqual(4);
  expect(w.position.line).toBeGreaterThanOrEqual(3);
});

test('braces in text do not produce false warnings', () => {
  const source = `Add @flour{250%g} and @eggs{3}.`;

  const recipe = parseCooklang(source);

  expect(recipe.errors).toHaveLength(0);
  expect(recipe.warnings).toHaveLength(0);
});
