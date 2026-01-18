import { parseToCanonical } from './src/canonicalSemantics.ts';

const source = 'hello ---\nsourced: babooshka\n---\n';
console.log('Source:', JSON.stringify(source));
console.log('Source chars:', Array.from(source).map(c => `${c} (U+${c.codePointAt(0).toString(16).padStart(4, '0')})`));

const result = parseToCanonical(source);
console.log('Result:', JSON.stringify(result, null, 2));
