import { parseToCanonical } from './src/canonicalSemantics.ts';
import { grammar } from './src/canonicalSemantics';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const source = 'hello ---\nsourced: babooshka\n---\n';
console.log('Source:', JSON.stringify(source));

// Check how Ohm parses this
const matchResult = grammar.match(source);
console.log('\nOhm match succeeded:', matchResult.succeeded());
if (!matchResult.succeeded()) {
  console.log('Match error:', matchResult.message);
} else {
  // Get the CST
  const cst = matchResult;
  console.log('\nCST (truncated):', cst.toString().slice(0, 500));

  // Manually trace through the parsing
  console.log('\nParsing trace:');
  console.log('Line 1: "hello ---"');
  console.log('Line 2: "sourced: babooshka"');
  console.log('Line 3: "---"');
}

const result = parseToCanonical(source);
console.log('\nResult:', JSON.stringify(result, null, 2));
console.log('\nNumber of steps:', result.steps.length);
console.log('Step 0 items:', result.steps[0]?.length);
