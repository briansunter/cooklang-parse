import { grammar } from "./src/canonicalSemantics.ts";

// Test just the timerAmount rule
const tests = [
  "{1.5%minutes}",
  "{10%minutes}",
  "{1/2%hour}",
];

for (const test of tests) {
  // Try to match the timerAmount as the full recipe (this won't work, but let's see)
  const match = grammar.match(test);
  console.log(`Test: "${test}"`);
  console.log("  Success:", match.succeeded());
  if (!match.succeeded()) {
    console.log("  Error:", match.shortMessage);
  }
}
