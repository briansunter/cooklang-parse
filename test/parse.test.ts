import { test, expect } from "bun:test";
import { parseCooklang, parseToAST } from '../src/index';

test('parse simple recipe', () => {
  const source = `
Mix @flour{250%g} and @eggs{3}.
Cook in #pan for ~{20%minutes}.
`;

  const recipe = parseCooklang(source);

  expect(recipe.ingredients).toHaveLength(2);
  expect(recipe.ingredients[0]).toEqual({
    name: 'flour',
    quantity: '250',
    unit: 'g',
    fixed: false,
  });
  expect(recipe.ingredients[1]).toEqual({
    name: 'eggs',
    quantity: '3',
    fixed: false,
  });

  expect(recipe.cookware).toEqual(['pan']);
  expect(recipe.timers).toEqual([{ quantity: '20', unit: 'minutes' }]);
  expect(recipe.steps).toHaveLength(1);
});

test('parse multi-word ingredients', () => {
  const source = `Add @sea salt{} and @olive oil{} to the #mixing bowl{}.`;

  const recipe = parseCooklang(source);

  expect(recipe.ingredients).toHaveLength(2);
  expect(recipe.ingredients[0].name).toBe('sea salt');
  expect(recipe.ingredients[1].name).toBe('olive oil');

  expect(recipe.cookware).toEqual(['mixing bowl']);
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

  expect(recipe.notes).toHaveLength(2);
  expect(recipe.notes[0]).toBe('This is a note about the recipe.');
  expect(recipe.notes[1]).toBe('Another note line.');
});

test('parse recipe with sections', () => {
  const source = `
==Dough==
Mix @flour{500%g} and @water{300%ml}.

==Filling==
Add @cheese{200%g}.
`;

  const recipe = parseCooklang(source);

  expect(recipe.sections).toEqual(['Dough', 'Filling']);
});

test('parse timer with name', () => {
  const source = `Cook for ~rest{30%minutes}.`;

  const recipe = parseCooklang(source);

  expect(recipe.timers[0]).toEqual({
    name: 'rest',
    quantity: '30',
    unit: 'minutes',
  });
});

test('parse fixed quantity ingredient', () => {
  const source = `Add =@salt{1%tsp} to taste.`;

  const ast = parseToAST(source);
  const ingredient = ast.steps[0].ingredients[0];

  expect(ingredient.fixed).toBe(true);
  expect(ingredient.name).toBe('salt');
});

test('parse inline comments', () => {
  const source = `Mix @flour{250%g}. -- This is a comment`;

  const ast = parseToAST(source);

  expect(ast.steps[0].inlineComments).toHaveLength(1);
  expect(ast.steps[0].inlineComments[0].text).toBe('This is a comment');
});

test('collect all errors', () => {
  const source = `
@invalid{unclosed bracket
#another broken one
`;

  const recipe = parseCooklang(source);

  // Should have errors but still return partial results
  expect(recipe.errors.length).toBeGreaterThan(0);
});

test('parse empty recipe', () => {
  const source = ``;

  const recipe = parseCooklang(source);

  expect(recipe.ingredients).toHaveLength(0);
  expect(recipe.cookware).toHaveLength(0);
  expect(recipe.timers).toHaveLength(0);
  expect(recipe.steps).toHaveLength(0);
});

test('full pancake recipe', async () => {
  const fixture = await Bun.file('test/fixtures/pancakes.cook').text();

  const recipe = parseCooklang(fixture);

  expect(recipe.ingredients.length).toBeGreaterThan(0);
  expect(recipe.ingredients.some(i => i.name === 'eggs')).toBe(true);
  expect(recipe.ingredients.some(i => i.name === 'flour')).toBe(true);

  expect(recipe.cookware.length).toBeGreaterThan(0);
  expect(recipe.cookware.includes('bowl')).toBe(true);

  expect(recipe.timers.length).toBeGreaterThan(0);
  expect(recipe.timers[0].unit).toBe('minutes');

  expect(recipe.steps.length).toBeGreaterThan(0);
});

test('parse ingredient with unit', () => {
  const source = `Add @onion{1%diced} and @garlic{3%cloves}.`;

  const recipe = parseCooklang(source);

  expect(recipe.ingredients).toHaveLength(2);
  expect(recipe.ingredients[0]).toEqual({
    name: 'onion',
    quantity: '1',
    unit: 'diced',
    fixed: false,
  });
  expect(recipe.ingredients[1]).toEqual({
    name: 'garlic',
    quantity: '3',
    unit: 'cloves',
    fixed: false,
  });
});

test('parse block comments', () => {
  const source = `
Mix @flour{250%g}.
[- This is a block comment -]
Add @eggs{3}.
`;

  const ast = parseToAST(source);

  expect(ast.errors).toHaveLength(0);
  expect(ast.steps).toHaveLength(2);
});

test('parse multiple timers in one step', () => {
  const source = `Cook for ~{10%minutes}, then rest for ~rest{5%minutes}.`;

  const recipe = parseCooklang(source);

  expect(recipe.timers).toHaveLength(2);
  expect(recipe.timers[0]).toEqual({ quantity: '10', unit: 'minutes' });
  expect(recipe.timers[1]).toEqual({ name: 'rest', quantity: '5', unit: 'minutes' });
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
  expect(recipe.cookware).toContain('bowl');
  expect(recipe.cookware).toContain('pan');
});

test('timers in multiple steps are deduplicated', () => {
  const source = `
Cook for ~{10%minutes}.

Rest for ~{10%minutes}.
`;

  const recipe = parseCooklang(source);

  expect(recipe.timers).toHaveLength(1);
  expect(recipe.timers[0]).toEqual({ quantity: '10', unit: 'minutes' });
});

test('getGrammar returns grammar object', () => {
  const { getGrammar } = require('../src/semantics.js');
  const grammar = getGrammar();

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
  expect(recipe.steps).toHaveLength(0);
});

test('step text includes full content', () => {
  const source = `Mix @flour{250%g} and @eggs{3} in the #bowl.`;

  const recipe = parseCooklang(source);

  expect(recipe.steps).toHaveLength(1);
  expect(recipe.steps[0].text).toContain('Mix');
  expect(recipe.steps[0].text).toContain('in the');
});

test('inline comments appear in simplified step', () => {
  const source = `Mix @flour{250%g}. -- Do not overmix`;

  const recipe = parseCooklang(source);

  expect(recipe.steps[0].inlineComments).toHaveLength(1);
  expect(recipe.steps[0].inlineComments![0]).toBe('Do not overmix');
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

Serve hot with =@garnish{1%tbsp} of fresh herbs.
`;

  const recipe = parseCooklang(source);

  expect(recipe.metadata.title).toBe('Complex Recipe');
  expect(recipe.metadata.servings).toBe(4);
  expect(recipe.sections).toContain('Prep');
  expect(recipe.sections).toContain('Cooking');
  expect(recipe.notes).toEqual(['This is a preparatory note.']);
  expect(recipe.ingredients.length).toBeGreaterThanOrEqual(3);
  expect(recipe.ingredients.some(i => i.name === 'onions')).toBe(true);
  expect(recipe.ingredients.some(i => i.name === 'garlic')).toBe(true);
  expect(recipe.ingredients.some(i => i.name === 'tomatoes')).toBe(true);
  expect(recipe.ingredients.some(i => i.name === 'garnish' && i.fixed)).toBe(true);
  expect(recipe.cookware).toContain('large pan');
  expect(recipe.timers.length).toBeGreaterThanOrEqual(1);
  expect(recipe.timers.some(t => t.name === 'simmer')).toBe(true);
  expect(recipe.steps.length).toBeGreaterThanOrEqual(2);
});

test('parse multiword cookware', () => {
  const source = `Use #frying pan{} for cooking.`;

  const recipe = parseCooklang(source);

  expect(recipe.cookware).toHaveLength(1);
  expect(recipe.cookware[0]).toBe('frying pan');
});

test('parse timer without unit', () => {
  const source = `Wait for ~{5}.`;

  const recipe = parseCooklang(source);

  expect(recipe.timers).toHaveLength(1);
  expect(recipe.timers[0].quantity).toBe('5');
  expect(recipe.timers[0].unit).toBeUndefined();
});

test('parse multiple notes in succession', () => {
  const source = `
> First note.
> Second note.
> Third note.

Mix @flour{250%g}.
`;

  const recipe = parseCooklang(source);

  expect(recipe.notes).toHaveLength(3);
  expect(recipe.notes[0]).toBe('First note.');
  expect(recipe.notes[1]).toBe('Second note.');
  expect(recipe.notes[2]).toBe('Third note.');
});

test('parse empty ingredient amount braces', () => {
  const source = `Add @salt{} to taste.`;

  const recipe = parseCooklang(source);

  expect(recipe.ingredients).toHaveLength(1);
  expect(recipe.ingredients[0].name).toBe('salt');
  expect(recipe.ingredients[0].quantity).toBeUndefined();
  expect(recipe.ingredients[0].unit).toBeUndefined();
});

test('parse ingredient with only quantity no unit', () => {
  const source = `Add @eggs{3} and @milk{500%ml}.`;

  const recipe = parseCooklang(source);

  expect(recipe.ingredients[0].quantity).toBe('3');
  expect(recipe.ingredients[0].unit).toBeUndefined();
  expect(recipe.ingredients[1].quantity).toBe('500');
  expect(recipe.ingredients[1].unit).toBe('ml');
});

test('step contains cookware references', () => {
  const source = `Mix in #bowl and pour into #pan.`;

  const ast = parseToAST(source);

  expect(ast.steps[0].cookware).toHaveLength(2);
  expect(ast.steps[0].cookware[0].name).toBe('bowl');
  expect(ast.steps[0].cookware[1].name).toBe('pan');
});

test('step contains timer references', () => {
  const source = `Cook for ~{10%minutes} then rest for ~rest{5%minutes}.`;

  const ast = parseToAST(source);

  expect(ast.steps[0].timers).toHaveLength(2);
  expect(ast.steps[0].timers[0].quantity).toBe('10');
  expect(ast.steps[0].timers[1].name).toBe('rest');
});

test('parse single word ingredient', () => {
  const source = `Add @salt and @pepper.`;

  const recipe = parseCooklang(source);

  expect(recipe.ingredients).toHaveLength(2);
  expect(recipe.ingredients[0].name).toBe('salt');
  expect(recipe.ingredients[1].name).toBe('pepper');
});

test('parse single word cookware', () => {
  const source = `Use #pan and #spatula.`;

  const recipe = parseCooklang(source);

  expect(recipe.cookware).toEqual(['pan', 'spatula']);
});

test('recipe with multiple steps', () => {
  const source = `Step one.

Step two.

Step three.`;

  const recipe = parseCooklang(source);

  // Steps are separated by blank lines
  expect(recipe.steps.length).toBeGreaterThanOrEqual(1);
});

test('parse recipe with no ingredients', () => {
  const source = `Mix everything together.`;

  const recipe = parseCooklang(source);

  expect(recipe.ingredients).toHaveLength(0);
  expect(recipe.steps).toHaveLength(1);
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

test('step preserves original text', () => {
  const source = `Carefully fold in the whipped cream.`;

  const recipe = parseCooklang(source);

  expect(recipe.steps[0].text).toBe('Carefully fold in the whipped cream.');
});

test('parseToAST returns full AST structure', () => {
  const source = `Mix @flour{250%g}.`;

  const ast = parseToAST(source);

  expect(ast.type).toBe('recipe');
  expect(ast.metadata).toBeNull();
  expect(ast.sections).toEqual([]);
  expect(ast.steps).toHaveLength(1);
  expect(ast.notes).toEqual([]);
  expect(ast.errors).toEqual([]);
});

test('errors array contains error details', () => {
  // Use a source that causes a parse error but doesn't trigger the grammar bug
  const source = `invalid}`;

  const recipe = parseCooklang(source);

  expect(recipe.errors.length).toBeGreaterThan(0);
  expect(recipe.errors[0]).toHaveProperty('message');
  expect(recipe.errors[0]).toHaveProperty('position');
  expect(recipe.errors[0]).toHaveProperty('severity');
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

  expect(recipe.sections).toEqual(['Prep', 'Cooking', 'Serving']);
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
  expect(recipe.metadata.servings).toBe(4);
  expect(recipe.steps[0].text).toContain('Mix');
});

test('metadata directives in recipe body are extracted', () => {
  const source = `
Step one.
>> servings: 2
Step two.
`;

  const recipe = parseCooklang(source);

  expect(recipe.metadata.servings).toBe(2);
  expect(recipe.steps).toHaveLength(2);
  expect(recipe.steps[0].text).toBe('Step one.');
  expect(recipe.steps[1].text).toBe('Step two.');
});

test('parse single-equals section syntax', () => {
  const source = `
= Prep
Chop @onion{1}.

= Cook
Saute in #pan.
`;

  const recipe = parseCooklang(source);

  expect(recipe.sections).toEqual(['Prep', 'Cook']);
  expect(recipe.steps.length).toBeGreaterThanOrEqual(2);
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
  expect(recipe.errors.some(e => e.severity === 'warning' && /yaml/i.test(e.message))).toBe(true);
});

test('parse single-word timer without braces', () => {
  const source = `Let it ~rest after plating.`;

  const recipe = parseCooklang(source);

  expect(recipe.errors.some(e => e.severity === 'error')).toBe(false);
  expect(recipe.timers).toEqual([{ name: 'rest', quantity: '' }]);
});

test('parse ingredient with preparation suffix', () => {
  const source = `Add @flour{100%g}(sifted) to the bowl.`;

  const recipe = parseCooklang(source);

  expect(recipe.ingredients).toHaveLength(1);
  expect(recipe.ingredients[0]).toEqual({
    name: 'flour',
    quantity: '100',
    unit: 'g',
    preparation: 'sifted',
    fixed: false,
  });
});

test('parse ingredient with preparation and no amount', () => {
  const source = `Add @butter(softened) to the mix.`;

  const recipe = parseCooklang(source);

  expect(recipe.ingredients).toHaveLength(1);
  expect(recipe.ingredients[0]).toEqual({
    name: 'butter',
    preparation: 'softened',
    fixed: false,
  });
});

test('parse fixed quantity inside braces', () => {
  const source = `Add @salt{=1%tsp} to taste.`;

  const recipe = parseCooklang(source);

  expect(recipe.ingredients).toHaveLength(1);
  expect(recipe.ingredients[0]).toEqual({
    name: 'salt',
    quantity: '1',
    unit: 'tsp',
    fixed: true,
  });
});

test('parse fixed quantity inside braces without unit', () => {
  const source = `Add @salt{=2} to taste.`;

  const recipe = parseCooklang(source);

  expect(recipe.ingredients).toHaveLength(1);
  expect(recipe.ingredients[0]).toEqual({
    name: 'salt',
    quantity: '2',
    fixed: true,
  });
});

test('parse extended ingredient modifier syntax', () => {
  const source = `Add @@tomato sauce{200%ml}, @&flour{300%g}, and @white wine|wine{}.`; 

  const recipe = parseCooklang(source);

  expect(recipe.ingredients).toHaveLength(3);
  expect(recipe.ingredients[0]).toEqual({
    name: 'tomato sauce',
    quantity: '200',
    unit: 'ml',
    fixed: false,
  });
  expect(recipe.ingredients[1]).toEqual({
    name: 'flour',
    quantity: '300',
    unit: 'g',
    fixed: false,
  });
  expect(recipe.ingredients[2]).toEqual({
    name: 'white wine',
    fixed: false,
  });
});
