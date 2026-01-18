import { grammar } from './src/canonicalSemantics.ts';

const source = '---\n';
console.log('Testing:', JSON.stringify(source));

const matchResult = grammar.match(source);
console.log('Match succeeded:', matchResult.succeeded());

if (matchResult.succeeded()) {
  const semantics = grammar.createSemantics();
  semantics.addOperation('debug', {
    _terminal() { return this.sourceString; },
    nonCommentLines(self) { return self.children.map(c => c.debug()); },
    line(self) { return this.debug(); },
    stepLine(content, nl) {
      console.log('stepLine - content children:', content.numChildren);
      console.log('stepLine - content source:', content.sourceString);
      const items = content.children.map(c => c.debug());
      console.log('stepLine - items:', items);
      return items;
    },
    content(self) { return self.children.map(c => c.debug()); },
    item(self) { return this.debug(); },
    text(self) { return { type: 'text', value: this.sourceString }; },
    comment() { return { type: 'comment' }; },
    blankLine() { return { type: 'blank' }; },
    _iter(...children) { return children; }
  });

  const result = semantics(matchResult);
  console.log('Result:', JSON.stringify(result, null, 2));
}
