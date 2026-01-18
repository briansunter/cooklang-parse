import { grammar } from './src/canonicalSemantics.ts';

const source = 'hello ---\nsourced: babooshka\n---\n';
console.log('Source:', JSON.stringify(source));

// Check how Ohm parses this
const matchResult = grammar.match(source);
if (matchResult.succeeded()) {
  const semantics = grammar.createSemantics();

  // Add debug operation
  semantics.addOperation('debug', {
    recipe(self, _lines) {
      console.log('\n=== Recipe ===');
      const lines = (_lines as unknown as { debug(): unknown[] }).debug();
      console.log('Lines:', lines);
      return lines;
    },

    recipeWithMetadata(metadata, _restOfRecipe) {
      console.log('\n=== RecipeWithMetadata ===');
      return [];
    },

    recipeWithoutMetadata(_restOfRecipe) {
      console.log('\n=== RecipeWithoutMetadata ===');
      const lines = (_restOfRecipe as unknown as { debug(): unknown[] }).debug();
      console.log('Number of lines:', lines.length);
      lines.forEach((line, i) => {
        console.log(`Line ${i}:`, JSON.stringify(line));
      });
      return [];
    },

    nonCommentLines(self, _end) {
      const results = self.children.map((c: unknown) =>
        (c as unknown as { debug(): unknown }).debug()
      ).filter((x): x is NonNullable<typeof x> => x !== null && x !== undefined);
      return results;
    },

    line(self) {
      return (self as unknown as { debug(): unknown }).debug();
    },

    blankLine(_spaces, _lookahead, _nl) {
      console.log('  -> blankLine');
      return 'blank';
    },

    comment(_dash, _content, _nl) {
      console.log('  -> comment');
      return 'comment';
    },

    stepLine(content, _nl) {
      console.log('  -> stepLine, content children:', content.numChildren);
      const result = (content as unknown as { debug(): unknown }).debug();
      console.log('  -> stepLine result:', JSON.stringify(result));
      return result;
    },

    content(self) {
      const result = (self as unknown as { debug(): unknown[] }).debug();
      console.log('  -> content result:', JSON.stringify(result));
      return result;
    },

    item(self) {
      return (self as unknown as { debug(): unknown }).debug();
    },

    text(self) {
      const value = self.sourceString;
      console.log('    -> text:', JSON.stringify(value));
      return {
        type: 'text',
        value
      };
    },

    _iter(...children) {
      const results = children.map((c) => {
        const result = (c as unknown as { debug?: () => unknown }).debug?.();
        return result;
      }).filter((x): x is NonNullable<typeof x> => x !== null && x !== undefined);
      console.log('    -> _iter result:', JSON.stringify(results));
      return results;
    },

    _terminal() {
      return null;
    }
  });

  const debugCst = semantics(matchResult);
  (debugCst as unknown as { debug(): unknown }).debug();
} else {
  console.log('Match failed:', matchResult.message);
}
