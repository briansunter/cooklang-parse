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
