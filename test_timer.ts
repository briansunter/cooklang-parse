import { grammar } from "./src/canonicalSemantics.ts";

const test1 = "~{1.5%minutes}";
const match1 = grammar.match(test1);
console.log("Test:", test1);
console.log("Match succeeded:", match1.succeeded());
if (!match1.succeeded()) {
  console.log("Error:", match1.message);
}
