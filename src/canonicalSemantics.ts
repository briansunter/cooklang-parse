/**
 * Ohm semantics for Cooklang canonical format
 */

import * as Ohm from "ohm-js"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { safeGetSourceString, safeToCanonical } from "./cstTypes.js"

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const grammarFile = readFileSync(join(__dirname, '../grammars/cooklang-canonical.ohm'), 'utf-8');
const grammar = Ohm.grammar(grammarFile);

/**
 * Parse quantity string - convert fractions to numbers
 */
function parseQuantity(qty: string): string | number {
  qty = qty.trim();
  if (!qty) return '';

  // Check if it's a pure number (with optional spaces for fractions like "1 / 2")
  // If it contains letters, return it as a string
  if (/[a-zA-Z]/.test(qty)) {
    return qty; // Contains letters, keep as string
  }

  // Remove spaces from quantity (e.g., "1 / 2" -> "1/2")
  const qtyNoSpaces = qty.replace(/\s+/g, '');

  // Check for fraction like "1/2" but NOT "01/2" (leading zero means keep as string)
  const fractionMatch = qtyNoSpaces.match(/^(\d+)\/(\d+)$/);
  if (fractionMatch) {
    const numStr = fractionMatch[1]!;
    const denStr = fractionMatch[2]!;

    // If the fraction has a leading zero (like "01/2"), keep it as a string
    if (numStr.startsWith('0') && numStr.length > 1) {
      return qty; // Return original with spaces preserved
    }

    const num = parseFloat(numStr);
    const den = parseFloat(denStr);
    if (!isNaN(num) && !isNaN(den) && den !== 0) {
      return num / den;
    }
  }

  // Check for decimal
  const asNum = parseFloat(qtyNoSpaces);
  if (!isNaN(asNum)) {
    return asNum;
  }

  return qty; // Return original qty (with spaces if present)
}

/**
 * Parse amount content (e.g., "3%items" or "250% g" or "1 / 2 %cup")
 */
function parseAmount(content: string): { quantity: string | number; units: string } {
  content = content.trim();

  // Try quantity%units format - handle spaces in quantity
  // First, try to find the last % sign to separate quantity from units
  const lastPercentIndex = content.lastIndexOf('%');
  if (lastPercentIndex !== -1) {
    const qtyStr = content.slice(0, lastPercentIndex).trim();
    const unitsStr = content.slice(lastPercentIndex + 1).trim();
    return {
      quantity: parseQuantity(qtyStr),
      units: unitsStr,
    };
  }

  // Check if there's a number followed by text (space-separated)
  // But only split if the units part is more than 1-2 characters (to avoid splitting "7 k")
  const spaceMatch = content.match(/^(\S+)\s+(\S{3,}.*)$/);
  if (spaceMatch) {
    return {
      quantity: parseQuantity(spaceMatch[1]!),
      units: spaceMatch[2]!.trim(),
    };
  }

  // Just a quantity, no units
  return {
    quantity: parseQuantity(content),
    units: '',
  };
}

/**
 * Parse cookware quantity
 */
function parseCookwareAmount(content: string): number | string {
  content = content.trim();
  const asNum = parseFloat(content);
  if (!isNaN(asNum)) {
    return asNum;
  }
  return content;
}

/**
 * Merge consecutive text items into a single text item
 */
function mergeConsecutiveTexts(items: unknown[]): unknown[] {
  const result: unknown[] = [];
  let currentText = '';

  for (const item of items) {
    if (typeof item === 'object' && item !== null && 'type' in item && (item as { type: string }).type === 'text') {
      const textItem = item as { type: string; value: string };
      currentText += textItem.value;
    } else {
      // Flush current text if any
      if (currentText) {
        result.push({ type: 'text', value: currentText });
        currentText = '';
      }
      result.push(item);
    }
  }

  // Don't forget the last text
  if (currentText) {
    result.push({ type: 'text', value: currentText });
  }

  return result;
}

/**
 * Merge consecutive text items with newlines between them
 * Used to merge text items from different source lines
 */
function mergeConsecutiveTextsWithNewlines(items: unknown[]): unknown[] {
  const result: unknown[] = [];
  let currentText = '';
  let lastItemWasText = false;

  for (const item of items) {
    if (typeof item === 'object' && item !== null && 'type' in item && (item as { type: string }).type === 'text') {
      const textItem = item as { type: string; value: string };
      if (lastItemWasText) {
        // Previous item was text, add newline before this text
        currentText += '\n';
      }
      currentText += textItem.value;
      lastItemWasText = true;
    } else {
      // Flush current text if any
      if (currentText) {
        result.push({ type: 'text', value: currentText });
        currentText = '';
        lastItemWasText = false;
      }
      result.push(item);
      lastItemWasText = false;
    }
  }

  // Don't forget the last text
  if (currentText) {
    result.push({ type: 'text', value: currentText });
  }

  return result;
}

/**
 * Create semantic actions
 */
function createSemantics() {
  const semantics = grammar.createSemantics();

  semantics.addOperation('toCanonical', {
    recipe(self) {
      return safeToCanonical(self);
    },

    recipeWithMetadata(metadata, _restOfRecipe) {
      const md = safeToCanonical(metadata) as Record<string, string>;
      const rawLines = safeToCanonical(_restOfRecipe);
      const lines = Array.isArray(rawLines) ? rawLines : [];

      // Process all lines and group into steps
      const steps: unknown[][] = [];
      let currentStep: unknown[] = [];

      for (const lineResult of lines) {
        if (lineResult === 'blank') {
          // Blank line - start a new step
          if (currentStep.length > 0) {
            steps.push(mergeConsecutiveTextsWithNewlines(currentStep));
            currentStep = [];
          }
        } else if (Array.isArray(lineResult)) {
          // Add items to current step (will merge at step boundaries)
          currentStep.push(...lineResult);
        }
        // Comments are handled by not being added to the current step
      }

      // Add the last step if it has content
      if (currentStep.length > 0) {
        steps.push(mergeConsecutiveTextsWithNewlines(currentStep));
      }

      return {
        metadata: md,
        steps,
      };
    },

    recipeWithoutMetadata(_restOfRecipe) {
      const rawLines = safeToCanonical(_restOfRecipe);
      const lines = Array.isArray(rawLines) ? rawLines : [];

      // Process all lines and group into steps
      const steps: unknown[][] = [];
      let currentStep: unknown[] = [];

      for (const lineResult of lines) {
        if (lineResult === 'blank') {
          // Blank line - start a new step
          if (currentStep.length > 0) {
            steps.push(mergeConsecutiveTextsWithNewlines(currentStep));
            currentStep = [];
          }
        } else if (Array.isArray(lineResult)) {
          // Add items to current step (will merge at step boundaries)
          currentStep.push(...lineResult);
        }
        // Comments are handled by not being added to the current step
      }

      // Add the last step if it has content
      if (currentStep.length > 0) {
        steps.push(mergeConsecutiveTextsWithNewlines(currentStep));
      }

      return {
        metadata: {},
        steps,
      };
    },

    nonCommentLines(self, _end) {
      // Return array of line results, filtering out nulls from end node
      return self.children
        .map((c) => safeToCanonical(c))
        .filter((x): x is NonNullable<typeof x> => x !== null && x !== undefined);
    },

    line(self) {
      return safeToCanonical(self);
    },

    blankLine(_spaces, _lookahead, _nl) {
      return 'blank';
    },

    comment(_dash, _space, _content, _nl) {
      return 'comment';
    },

    stepLine(content, _nl) {
      const rawResult = safeToCanonical(content);
      const result = Array.isArray(rawResult) ? rawResult : [];
      // If the content is empty and the source line is just ---, preserve it as text
      if (result.length === 0) {
        // Get the full source line from self (in the semantic action context)
        // We need to check if this is a metadata marker line that should be preserved
        // The parent line node has the source string
        const lineSource = safeGetSourceString(this);
        const trimmedLine = lineSource.trim();
        if (trimmedLine === '---') {
          return [{ type: 'text', value: '---' }];
        }
      }
      return result;
    },

    _iter(...children) {
      // For iteration rules (like `item*`), we want the array of results
      // But Ohm passes us the raw CST nodes, so we need to transform them
      const results = children
        .map((c) => safeToCanonical(c))
        .filter((x): x is NonNullable<typeof x> => x !== null && x !== undefined);

      return results;
    },

    item(self) {
      return safeToCanonical(self);
    },

    text(self) {
      return {
        type: 'text',
        value: self.sourceString,
      };
    },

    comment_inline(_spaces, _dash, _content) {
      // Inline comments are filtered out
      return null;
    },

    // The text rule now has multiple alternatives - Ohm will call the appropriate one
    // We don't need separate handlers since they all return the same structure

    ingredient(_at, name, amount) {
      const nameStr = name.sourceString.trim();
      const amountStr = amount.numChildren > 0 ? amount.sourceString : '';

      if (!amountStr) {
        return {
          type: 'ingredient',
          name: nameStr,
          quantity: 'some',
          units: '',
        };
      }

      const content = amountStr.slice(1, -1).trim();

      // Check if the amount is empty (just {})
      if (!content) {
        return {
          type: 'ingredient',
          name: nameStr,
          quantity: 'some',
          units: '',
        };
      }

      const parsed = parseAmount(content);

      return {
        type: 'ingredient',
        name: nameStr,
        quantity: parsed.quantity,
        units: parsed.units,
      };
    },

    cookware(_hash, name, amount) {
      const nameStr = name.sourceString.trim();
      const amountStr = amount.numChildren > 0 ? amount.sourceString : '';

      if (!amountStr) {
        return {
          type: 'cookware',
          name: nameStr,
          quantity: 1,
          units: '',
        };
      }

      const content = amountStr.slice(1, -1).trim();

      // Check if the amount is empty (just {})
      if (!content) {
        return {
          type: 'cookware',
          name: nameStr,
          quantity: 1,
          units: '',
        };
      }

      return {
        type: 'cookware',
        name: nameStr,
        quantity: parseCookwareAmount(content),
        units: '',
      };
    },

    timer(_tilde, timerPart) {
      // timerPart is either timerWithName or unnamedTimer
      const result = safeToCanonical(timerPart);
      return result;
    },

    timerWithName(_lookahead, name, amount) {
      const nameStr = name.sourceString.trim();
      const amountStr = amount.numChildren > 0 ? amount.sourceString : '';

      if (!amountStr) {
        return {
          type: 'timer',
          name: nameStr,
          quantity: '',
          units: '',
        };
      }

      const content = amountStr.slice(1, -1);
      const parsed = parseAmount(content);

      return {
        type: 'timer',
        name: nameStr,
        quantity: parsed.quantity,
        units: parsed.units,
      };
    },

    unnamedTimer(_lookahead, amount) {
      const amountStr = amount.sourceString;
      const content = amountStr.slice(1, -1);
      const parsed = parseAmount(content);

      return {
        type: 'timer',
        name: '',
        quantity: parsed.quantity,
        units: parsed.units,
      };
    },

    // timerName is no longer used - parsing is done in the timer semantic action


    startMetadata(_dash1, content, _dash2, _nl) {
      const text = content.sourceString;
      const data: Record<string, string> = {};

      const lines = text.trim().split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const colonIdx = trimmed.indexOf(':');
        if (colonIdx === -1) continue;

        const key = trimmed.slice(0, colonIdx).trim();
        const value = trimmed.slice(colonIdx + 1).trim();

        if (key && value) {
          data[key] = value;
        }
      }

      return data;
    },

    _terminal() {
      return null;
    },
  });

  return semantics;
}

const semantics = createSemantics();

/**
 * Parse Cooklang source to canonical format
 */
export function parseToCanonical(source: string): {
  steps: unknown[][];
  metadata: Record<string, string>;
} {
  const matchResult = grammar.match(source);

  if (!matchResult.succeeded()) {
    // Extract error information from Ohm's matchResult
    const errorInfo = matchResult;
    const msg =
      (errorInfo as { message?: string }).message ??
      (errorInfo as { shortMessage?: string }).shortMessage ??
        "Unknown error";
    throw new Error(`Parse error: ${msg}`);
  }

  const cst = semantics(matchResult);
  const result = safeToCanonical(cst);

  // Ensure the result has the expected structure
  type CanonicalResult = {
    steps: unknown[][];
    metadata: Record<string, string>;
  }

  if (
    typeof result === "object" &&
    result !== null &&
    "steps" in result &&
    "metadata" in result &&
    Array.isArray(result.steps)
  ) {
    return result as CanonicalResult;
  }

  // Fallback if structure is unexpected
  return {
    steps: [],
    metadata: {},
  };
}

export { grammar };
