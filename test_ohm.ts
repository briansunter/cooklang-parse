import { grammar } from "./src/canonicalSemantics.ts";

const tests = [
  "~{1.5%minutes}",
  "~potato{5%minutes}",
  "~potato",
  "~",
];

for (const test of tests) {
  const match = grammar.match(test);
  console.log(`Test: "${test}"`);
  console.log("  Success:", match.succeeded());
  if (!match.succeeded()) {
    console.log("  Error:", match.shortMessage);
  }
  console.log("");
}
