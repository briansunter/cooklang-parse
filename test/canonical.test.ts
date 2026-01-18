/**
 * Canonical tests for Cooklang parser
 */

import { test, expect } from 'bun:test';
import { parseToCanonical } from '../src/canonicalSemantics';

// Test cases from the canonical spec
const testCases: Record<string, { source: string; result: { steps: unknown[][]; metadata: Record<string, string> } }> = {
  testBasicDirection: {
    source: 'Add a bit of chilli\n',
    result: {
      steps: [[{ type: 'text', value: 'Add a bit of chilli' }]],
      metadata: {},
    },
  },

  testComments: {
    source: '-- testing comments\n',
    result: {
      steps: [],
      metadata: {},
    },
  },

  testCommentsWithIngredients: {
    source: '-- testing comments\n@thyme{2%sprigs}\n',
    result: {
      steps: [[
        { type: 'ingredient', name: 'thyme', quantity: 2, units: 'sprigs' },
      ]],
      metadata: {},
    },
  },

  testCommentsAfterIngredients: {
    source: '@thyme{2%sprigs} -- testing comments\n  and some text\n',
    result: {
      steps: [[
        { type: 'ingredient', name: 'thyme', quantity: 2, units: 'sprigs' },
        { type: 'text', value: '  and some text' },
      ]],
      metadata: {},
    },
  },

  testDirectionsWithDegrees: {
    source: 'Heat oven up to 200°C\n',
    result: {
      steps: [[{ type: 'text', value: 'Heat oven up to 200°C' }]],
      metadata: {},
    },
  },

  testDirectionsWithNumbers: {
    source: 'Heat 5L of water\n',
    result: {
      steps: [[{ type: 'text', value: 'Heat 5L of water' }]],
      metadata: {},
    },
  },

  testDirectionWithIngredient: {
    source: 'Add @chilli{3%items}, @ginger{10%g} and @milk{1%l}.\n',
    result: {
      steps: [[
        { type: 'text', value: 'Add ' },
        { type: 'ingredient', name: 'chilli', quantity: 3, units: 'items' },
        { type: 'text', value: ', ' },
        { type: 'ingredient', name: 'ginger', quantity: 10, units: 'g' },
        { type: 'text', value: ' and ' },
        { type: 'ingredient', name: 'milk', quantity: 1, units: 'l' },
        { type: 'text', value: '.' },
      ]],
      metadata: {},
    },
  },

  testEquipmentOneWord: {
    source: 'Simmer in #pan for some time\n',
    result: {
      steps: [[
        { type: 'text', value: 'Simmer in ' },
        { type: 'cookware', name: 'pan', quantity: 1, units: '' },
        { type: 'text', value: ' for some time' },
      ]],
      metadata: {},
    },
  },

  testEquipmentQuantity: {
    source: '#frying pan{2}\n',
    result: {
      steps: [[
        { type: 'cookware', name: 'frying pan', quantity: 2, units: '' },
      ]],
      metadata: {},
    },
  },

  testEquipmentQuantityOneWord: {
    source: '#frying pan{three}\n',
    result: {
      steps: [[
        { type: 'cookware', name: 'frying pan', quantity: 'three', units: '' },
      ]],
      metadata: {},
    },
  },

  testFractions: {
    source: '@milk{1/2%cup}\n',
    result: {
      steps: [[
        { type: 'ingredient', name: 'milk', quantity: 0.5, units: 'cup' },
      ]],
      metadata: {},
    },
  },

  testFractionsWithSpaces: {
    source: '@milk{1 / 2 %cup}\n',
    result: {
      steps: [[
        { type: 'ingredient', name: 'milk', quantity: 0.5, units: 'cup' },
      ]],
      metadata: {},
    },
  },

  testFractionsLike: {
    source: '@milk{01/2%cup}\n',
    result: {
      steps: [[
        { type: 'ingredient', name: 'milk', quantity: '01/2', units: 'cup' },
      ]],
      metadata: {},
    },
  },

  testIngredientExplicitUnits: {
    source: '@chilli{3%items}\n',
    result: {
      steps: [[
        { type: 'ingredient', name: 'chilli', quantity: 3, units: 'items' },
      ]],
      metadata: {},
    },
  },

  testIngredientExplicitUnitsWithSpaces: {
    source: '@chilli{ 3 % items }\n',
    result: {
      steps: [[
        { type: 'ingredient', name: 'chilli', quantity: 3, units: 'items' },
      ]],
      metadata: {},
    },
  },

  testIngredientImplicitUnits: {
    source: '@chilli{3}\n',
    result: {
      steps: [[
        { type: 'ingredient', name: 'chilli', quantity: 3, units: '' },
      ]],
      metadata: {},
    },
  },

  testIngredientNoUnits: {
    source: '@chilli\n',
    result: {
      steps: [[
        { type: 'ingredient', name: 'chilli', quantity: 'some', units: '' },
      ]],
      metadata: {},
    },
  },

  testIngredientWithNumbers: {
    source: '@tipo 00 flour{250%g}\n',
    result: {
      steps: [[
        { type: 'ingredient', name: 'tipo 00 flour', quantity: 250, units: 'g' },
      ]],
      metadata: {},
    },
  },

  testIngredientWithoutStopper: {
    source: '@chilli cut into pieces\n',
    result: {
      steps: [[
        { type: 'ingredient', name: 'chilli', quantity: 'some', units: '' },
        { type: 'text', value: ' cut into pieces' },
      ]],
      metadata: {},
    },
  },

  testMetadata: {
    source: '---\nsourced: babooshka\n---\n',
    result: {
      steps: [],
      metadata: { sourced: 'babooshka' },
    },
  },

  testMultiLineDirections: {
    source: 'Add a bit of chilli\n\nAdd a bit of hummus\n',
    result: {
      steps: [
        [{ type: 'text', value: 'Add a bit of chilli' }],
        [{ type: 'text', value: 'Add a bit of hummus' }],
      ],
      metadata: {},
    },
  },

  testMultiWordIngredient: {
    source: '@hot chilli{3}\n',
    result: {
      steps: [[
        { type: 'ingredient', name: 'hot chilli', quantity: 3, units: '' },
      ]],
      metadata: {},
    },
  },

  testMultiWordIngredientNoAmount: {
    source: '@hot chilli{}\n',
    result: {
      steps: [[
        { type: 'ingredient', name: 'hot chilli', quantity: 'some', units: '' },
      ]],
      metadata: {},
    },
  },

  testQuantityAsText: {
    source: '@thyme{few%sprigs}\n',
    result: {
      steps: [[
        { type: 'ingredient', name: 'thyme', quantity: 'few', units: 'sprigs' },
      ]],
      metadata: {},
    },
  },

  testTimerDecimal: {
    source: 'Fry for ~{1.5%minutes}\n',
    result: {
      steps: [[
        { type: 'text', value: 'Fry for ' },
        { type: 'timer', quantity: 1.5, units: 'minutes', name: '' },
      ]],
      metadata: {},
    },
  },

  testTimerFractional: {
    source: 'Fry for ~{1/2%hour}\n',
    result: {
      steps: [[
        { type: 'text', value: 'Fry for ' },
        { type: 'timer', quantity: 0.5, units: 'hour', name: '' },
      ]],
      metadata: {},
    },
  },

  testTimerInteger: {
    source: 'Fry for ~{10%minutes}\n',
    result: {
      steps: [[
        { type: 'text', value: 'Fry for ' },
        { type: 'timer', quantity: 10, units: 'minutes', name: '' },
      ]],
      metadata: {},
    },
  },

  testTimerWithName: {
    source: 'Fry for ~potato{42%minutes}\n',
    result: {
      steps: [[
        { type: 'text', value: 'Fry for ' },
        { type: 'timer', quantity: 42, units: 'minutes', name: 'potato' },
      ]],
      metadata: {},
    },
  },

  testSingleWordTimer: {
    source: 'Let it ~rest after plating\n',
    result: {
      steps: [[
        { type: 'text', value: 'Let it ' },
        { type: 'timer', quantity: '', units: '', name: 'rest' },
        { type: 'text', value: ' after plating' },
      ]],
      metadata: {},
    },
  },

  testSingleWordTimerWithPunctuation: {
    source: 'Let it ~rest, then serve\n',
    result: {
      steps: [[
        { type: 'text', value: 'Let it ' },
        { type: 'timer', quantity: '', units: '', name: 'rest' },
        { type: 'text', value: ', then serve' },
      ]],
      metadata: {},
    },
  },

  testSingleWordIngredientWithPunctuation: {
    source: 'Add some @chilli, then serve\n',
    result: {
      steps: [[
        { type: 'text', value: 'Add some ' },
        { type: 'ingredient', quantity: 'some', units: '', name: 'chilli' },
        { type: 'text', value: ', then serve' },
      ]],
      metadata: {},
    },
  },

  testSingleWordCookwareWithPunctuation: {
    source: 'Place in #pot, then boil\n',
    result: {
      steps: [[
        { type: 'text', value: 'Place in ' },
        { type: 'cookware', quantity: 1, units: '', name: 'pot' },
        { type: 'text', value: ', then boil' },
      ]],
      metadata: {},
    },
  },
};

// Run all test cases
for (const [name, testCase] of Object.entries(testCases)) {
  test(name, () => {
    const result = parseToCanonical(testCase.source);
    expect(result).toEqual(testCase.result);
  });
}

// Additional edge case tests
test('testMetadataBreak - metadata in middle should be text', () => {
  const source = 'hello ---\nsourced: babooshka\n---\n';
  const result = parseToCanonical(source);
  expect(result).toEqual({
    steps: [[
      { type: 'text', value: 'hello ---\nsourced: babooshka\n---' },
    ]],
    metadata: {},
  });
});

test('testMetadataMultiwordKey', () => {
  const source = '---\ncooking time: 30 mins\n---\n';
  const result = parseToCanonical(source);
  expect(result).toEqual({
    steps: [],
    metadata: { 'cooking time': '30 mins' },
  });
});

test('testMetadataMultiwordKeyWithSpaces', () => {
  const source = '---\ncooking time    :30 mins\n---\n';
  const result = parseToCanonical(source);
  expect(result).toEqual({
    steps: [],
    metadata: { 'cooking time': '30 mins' },
  });
});

test('testMultipleLines metadata', () => {
  const source = '---\nPrep Time: 15 minutes\nCook Time: 30 minutes\n---\n';
  const result = parseToCanonical(source);
  expect(result).toEqual({
    steps: [],
    metadata: {
      'Prep Time': '15 minutes',
      'Cook Time': '30 minutes',
    },
  });
});

test('testServings with pipe', () => {
  const source = '---\nservings: 1|2|3\n---\n';
  const result = parseToCanonical(source);
  expect(result).toEqual({
    steps: [],
    metadata: { servings: '1|2|3' },
  });
});

test('testSlashInText', () => {
  const source = 'Preheat the oven to 200℃/Fan 180°C.\n';
  const result = parseToCanonical(source);
  expect(result).toEqual({
    steps: [[
      { type: 'text', value: 'Preheat the oven to 200℃/Fan 180°C.' },
    ]],
    metadata: {},
  });
});

test('testFractionsInDirections', () => {
  const source = 'knife cut about every 1/2 inches\n';
  const result = parseToCanonical(source);
  expect(result).toEqual({
    steps: [[
      { type: 'text', value: 'knife cut about every 1/2 inches' },
    ]],
    metadata: {},
  });
});

test('testIngredientNoUnitsNotOnlyString', () => {
  const source = '@5peppers\n';
  const result = parseToCanonical(source);
  expect(result).toEqual({
    steps: [[
      { type: 'ingredient', name: '5peppers', quantity: 'some', units: '' },
    ]],
    metadata: {},
  });
});

test('testMutipleIngredientsWithoutStopper', () => {
  const source = '@chilli cut into pieces and @garlic\n';
  const result = parseToCanonical(source);
  expect(result).toEqual({
    steps: [[
      { type: 'ingredient', name: 'chilli', quantity: 'some', units: '' },
      { type: 'text', value: ' cut into pieces and ' },
      { type: 'ingredient', name: 'garlic', quantity: 'some', units: '' },
    ]],
    metadata: {},
  });
});

test('testEquipmentMultipleWords', () => {
  const source: string = 'Fry in #frying pan{}\n';
  const result = parseToCanonical(source);
  expect(result).toEqual({
    steps: [[
      { type: 'text', value: 'Fry in ' },
      { type: 'cookware', name: 'frying pan', quantity: 1, units: '' },
    ]],
    metadata: {},
  });
});

test('testEquipmentMultipleWordsWithSpaces', () => {
  const source = 'Fry in #frying pan{ }\n';
  const result = parseToCanonical(source);
  expect(result).toEqual({
    steps: [[
      { type: 'text', value: 'Fry in ' },
      { type: 'cookware', name: 'frying pan', quantity: 1, units: '' },
    ]],
    metadata: {},
  });
});

test('testEquipmentMultipleWordsWithLeadingNumber', () => {
  const source = 'Fry in #7-inch nonstick frying pan{ }\n';
  const result = parseToCanonical(source);
  expect(result).toEqual({
    steps: [[
      { type: 'text', value: 'Fry in ' },
      { type: 'cookware', name: '7-inch nonstick frying pan', quantity: 1, units: '' },
    ]],
    metadata: {},
  });
});

test('testEquipmentQuantityMultipleWords', () => {
  const source = '#frying pan{two small}\n';
  const result = parseToCanonical(source);
  expect(result).toEqual({
    steps: [[
      { type: 'cookware', name: 'frying pan', quantity: 'two small', units: '' },
    ]],
    metadata: {},
  });
});

test('testIngredientMultipleWordsWithLeadingNumber', () => {
  const source = 'Top with @1000 island dressing{ }\n';
  const result = parseToCanonical(source);
  expect(result).toEqual({
    steps: [[
      { type: 'text', value: 'Top with ' },
      { type: 'ingredient', name: '1000 island dressing', quantity: 'some', units: '' },
    ]],
    metadata: {},
  });
});

test('testIngredientWithEmoji', () => {
  const source = 'Add some @🧂\n';
  const result = parseToCanonical(source);
  expect(result).toEqual({
    steps: [[
      { type: 'text', value: 'Add some ' },
      { type: 'ingredient', name: '🧂', quantity: 'some', units: '' },
    ]],
    metadata: {},
  });
});

test('testQuantityDigitalString', () => {
  const source = '@water{7 k }\n';
  const result = parseToCanonical(source);
  expect(result).toEqual({
    steps: [[
      { type: 'ingredient', name: 'water', quantity: '7 k', units: '' },
    ]],
    metadata: {},
  });
});

// Unicode whitespace/punctuation tests
test('testTimerWithUnicodeWhitespace', () => {
  const source = 'Let it ~rest\u2009then serve\n';
  const result = parseToCanonical(source);
  expect(result).toEqual({
    steps: [[
      { type: 'text', value: 'Let it ' },
      { type: 'timer', quantity: '', units: '', name: 'rest' },
      { type: 'text', value: '\u2009then serve' },
    ]],
    metadata: {},
  });
});

test('testIngredientWithUnicodeWhitespace', () => {
  const source = 'Add @chilli\u2009then bake\n';
  const result = parseToCanonical(source);
  expect(result).toEqual({
    steps: [[
      { type: 'text', value: 'Add ' },
      { type: 'ingredient', quantity: 'some', units: '', name: 'chilli' },
      { type: 'text', value: '\u2009then bake' },
    ]],
    metadata: {},
  });
});

test('testCookwareWithUnicodeWhitespace', () => {
  const source = 'Add to #pot\u2009then boil\n';
  const result = parseToCanonical(source);
  expect(result).toEqual({
    steps: [[
      { type: 'text', value: 'Add to ' },
      { type: 'cookware', quantity: 1, units: '', name: 'pot' },
      { type: 'text', value: '\u2009then boil' },
    ]],
    metadata: {},
  });
});

test('testSingleWordTimerWithUnicodePunctuation', () => {
  const source: string = 'Let it ~rest\u2E2C then serve\n';
  const result = parseToCanonical(source);
  expect(result).toEqual({
    steps: [[
      { type: 'text', value: 'Let it ' },
      { type: 'timer', quantity: '', units: '', name: 'rest' },
      { type: 'text', value: '\u2E2C then serve' },
    ]],
    metadata: {},
  });
});

test('testSingleWordIngredientWithUnicodePunctuation', () => {
  const source = 'Add @chilli\u2E2C then bake\n';
  const result = parseToCanonical(source);
  expect(result).toEqual({
    steps: [[
      { type: 'text', value: 'Add ' },
      { type: 'ingredient', quantity: 'some', units: '', name: 'chilli' },
      { type: 'text', value: '\u2E2C then bake' },
    ]],
    metadata: {},
  });
});

test('testSingleWordCookwareWithUnicodePunctuation', () => {
  const source = 'Place in #pot\u2E2C then boil\n';
  const result = parseToCanonical(source);
  expect(result).toEqual({
    steps: [[
      { type: 'text', value: 'Place in ' },
      { type: 'cookware', quantity: 1, units: '', name: 'pot' },
      { type: 'text', value: '\u2E2C then boil' },
    ]],
    metadata: {},
  });
});

// Invalid cases - should be treated as text
test('testInvalidMultiWordTimer', () => {
  const source = 'It is ~ {5}\n';
  const result = parseToCanonical(source);
  expect(result).toEqual({
    steps: [[
      { type: 'text', value: 'It is ~ {5}' },
    ]],
    metadata: {},
  });
});

test('testInvalidSingleWordTimer', () => {
  const source = 'It is ~ 5\n';
  const result = parseToCanonical(source);
  expect(result).toEqual({
    steps: [[
      { type: 'text', value: 'It is ~ 5' },
    ]],
    metadata: {},
  });
});

test('testInvalidMultiWordIngredient', () => {
  const source = 'Message @ example{}\n';
  const result = parseToCanonical(source);
  expect(result).toEqual({
    steps: [[
      { type: 'text', value: 'Message @ example{}' },
    ]],
    metadata: {},
  });
});

test('testInvalidSingleWordIngredient', () => {
  const source = 'Message me @ example\n';
  const result = parseToCanonical(source);
  expect(result).toEqual({
    steps: [[
      { type: 'text', value: 'Message me @ example' },
    ]],
    metadata: {},
  });
});

test('testInvalidMultiWordCookware', () => {
  const source = 'Recipe # 10{}\n';
  const result = parseToCanonical(source);
  expect(result).toEqual({
    steps: [[
      { type: 'text', value: 'Recipe # 10{}' },
    ]],
    metadata: {},
  });
});

test('testInvalidSingleWordCookware', () => {
  const source = 'Recipe # 5\n';
  const result = parseToCanonical(source);
  expect(result).toEqual({
    steps: [[
      { type: 'text', value: 'Recipe # 5' },
    ]],
    metadata: {},
  });
});

// Additional tests to achieve 100% coverage

// Test parseQuantity with space-separated quantity and units (3+ chars)
test('testIngredientWithSpaceSeparatedQuantity', () => {
  const source = '@flour{250 grams}\n';
  const result = parseToCanonical(source);
  expect(result).toEqual({
    steps: [[
      { type: 'ingredient', name: 'flour', quantity: 250, units: 'grams' },
    ]],
    metadata: {},
  });
});

// Test ingredient with complex units (space-separated, 3+ chars)
test('testIngredientWithLongUnits', () => {
  const source = '@water{2 liters}\n';
  const result = parseToCanonical(source);
  expect(result).toEqual({
    steps: [[
      { type: 'ingredient', name: 'water', quantity: 2, units: 'liters' },
    ]],
    metadata: {},
  });
});

// Test cookware with numeric quantity (to cover parseCookwareAmount numeric path)
test('testCookwareWithNumericQuantity', () => {
  const source = '#pan{2}\n';
  const result = parseToCanonical(source);
  expect(result).toEqual({
    steps: [[
      { type: 'cookware', name: 'pan', quantity: 2, units: '' },
    ]],
    metadata: {},
  });
});

// Test metadata with only key (no colon)
test('testMetadataWithOnlyKey', () => {
  const source = '---\njustakey\n---\n';
  const result = parseToCanonical(source);
  expect(result.metadata).toEqual({});
});

// Test metadata with empty value after colon (filtered out)
test('testMetadataWithEmptyValue', () => {
  const source = '---\ntitle:\n---\n';
  const result = parseToCanonical(source);
  expect(result.metadata).toEqual({});
});

// Test empty line with metadata marker edge case
test('testEmptyLineAfterMetadata', () => {
  const source = '---\ntitle: Test\n---\n\n@flour{250%g}\n';
  const result = parseToCanonical(source);
  expect(result.metadata).toEqual({ title: 'Test' });
  expect(result.steps).toHaveLength(1);
});
