import { parseToCanonical } from "./src/canonicalSemantics.ts";

const test = 'Fry for ~{1.5%minutes}\n';
console.log("Test:", test);
console.log("Result:", JSON.stringify(parseToCanonical(test), null, 2));
