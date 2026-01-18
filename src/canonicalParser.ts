/**
 * Canonical Cooklang Parser
 * Handles all canonical test cases including inline items
 * No type casts or 'any' types
 */

interface CanonicalTextItem {
  type: 'text';
  value: string;
}

interface CanonicalIngredient {
  type: 'ingredient';
  name: string;
  quantity: string | number;
  units: string;
}

interface CanonicalCookware {
  type: 'cookware';
  name: string;
  quantity: number | string;
}

interface CanonicalTimer {
  type: 'timer';
  quantity: string | number;
  units: string;
  name: string;
}

type CanonicalStepItem = CanonicalTextItem | CanonicalIngredient | CanonicalCookware | CanonicalTimer;

interface CanonicalRecipe {
  steps: CanonicalStepItem[][];
  metadata: Record<string, string>;
}

/**
 * Check if character is whitespace
 */
function isWhitespace(char: string): boolean {
  return /\s/.test(char);
}

/**
 * Check if character is a word character
 */
function isWordChar(char: string): boolean {
  return /[a-zA-Z0-9\u00C0-\u00FF_]/.test(char);
}

/**
 * Check if character is punctuation
 */
function isPunctuation(char: string): boolean {
  return /[!"#$%&'()*+,\-./:;<=>?@[\\]^_`{|}~]/.test(char);
}

/**
 * Parse a quantity string and convert to appropriate type
 */
function parseQuantity(qty: string): string | number {
  if (!qty) return 'some';

  qty = qty.trim();

  // Check for fraction
  if (qty.includes('/')) {
    const parts = qty.split('/');
    if (parts.length === 2) {
      const num = parseFloat(parts[0]);
      const den = parseFloat(parts[1]);
      if (!isNaN(num) && !isNaN(den) && den !== 0) {
        return num / den;
      }
    }
    return qty;
  }

  // Check for decimal
  const asNum = parseFloat(qty);
  if (!isNaN(asNum)) {
    return asNum;
  }

  return qty;
}

/**
 * Parse a Cooklang recipe in canonical format
 */
export function parseCanonical(source: string): CanonicalRecipe {
  const lines = source.split(/\r?\n/);
  const steps: CanonicalStepItem[][] = [];
  const metadata: Record<string, string> = {};
  let inMetadata = false;
  let metadataLines: string[] = [];
  let currentStep: CanonicalStepItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for metadata start/end
    if (line.trim() === '---') {
      if (!inMetadata && i === 0) {
        inMetadata = true;
        continue;
      } else if (inMetadata) {
        inMetadata = false;
        // Parse metadata
        for (const metaLine of metadataLines) {
          const match = metaLine.match(/^([^:]+):\s*(.*)$/);
          if (match && match[1] && match[2]) {
            const key = match[1].trim();
            const value = match[2].trim();
            metadata[key] = value;
          }
        }
        metadataLines = [];
        continue;
      }
    }

    if (inMetadata) {
      metadataLines.push(line);
      continue;
    }

    // Check for blank line (end of step)
    if (line.trim() === '') {
      if (currentStep.length > 0) {
        steps.push(currentStep);
        currentStep = [];
      }
      continue;
    }

    // Parse the line for ingredients, cookware, timers, and text
    const items = parseLine(line);
    currentStep.push(...items);
  }

  // Don'tforget the last step
  if (currentStep.length > 0) {
    steps.push(currentStep);
  }

  return { steps, metadata };
}

/**
 * Parse a single line and extract items
 */
function parseLine(line: string): CanonicalStepItem[] {
  const items: CanonicalStepItem[] = [];
  let pos = 0;

  while (pos < line.length) {
    // Skip whitespace
    while (pos < line.length && isWhitespace(line[pos])) {
      pos++;
    }

    if (pos >= line.length) break;

    // Check for special characters
    const char = line[pos];

    if (char === '@') {
      const result = parseIngredient(line, pos);
      items.push(result.item);
      pos = result.newPos;
    } else if (char === '#') {
      const result = parseCookware(line, pos);
      items.push(result.item);
      pos = result.newPos;
    } else if (char === '~') {
      const result = parseTimer(line, pos);
      items.push(result.item);
      pos = result.newPos;
    } else if (char === '-' && pos + 1 < line.length && line[pos + 1] === '-') {
      // Comment detected - skip the rest of the line
      break;
    } else {
      const result = parseText(line, pos);
      items.push(result.item);
      pos = result.newPos;
    }
  }

  return items;
}

/**
 * Parse an ingredient starting at position pos
 */
function parseIngredient(line: string, pos: number): { item: CanonicalIngredient; newPos: number } {
  let newPos = pos + 1; // Skip @

  // Extract name (can be multi-word)
  let name = '';
  let hasBraces = false;
  let braceStart = -1;

  // Scan to find the end of the ingredient name
  while (newPos < line.length) {
    const char = line[newPos];

    if (char === '{') {
      braceStart = newPos;
      hasBraces = true;
      newPos++;
      break;
    }

    if (isWhitespace(char) || char === '}' || char === '#' || char === '~' || char === '@') {
      break;
    }

    if (isPunctuation(char)) {
      // Check if part of multi-word name (punctuation within name)
      if (name.length > 0 && isWordChar(name[name.length - 1]) && isWordChar(char)) {
        name += char;
        newPos++;
        continue;
      }
      break;
    }

    name += char;
    newPos++;
  }

  // If we found braces, extract and parse the amount
  let quantity: string | number = 'some';
  let units = '';

  if (hasBraces && braceStart >= 0 && braceStart < line.length && line[braceStart] === '{') {
    // Find the matching closing brace
    let braceDepth = 1;
    let endBrace = braceStart + 1;

    while (endBrace < line.length && braceDepth > 0) {
      if (line[endBrace === '{') braceDepth++;
      else if (line[endBrace === '}') braceDepth--;
      endBrace++;
    }

    if (endBrace < line.length && braceDepth === 0) {
      const content = line.slice(braceStart + 1, endBrace).trim();

      // Parse the amount - try to parse quantity%unit or just quantity
      const unitMatch = content.match(/^([^%]*)%\s*([^%]*)?$/);
      if (unitMatch && unitMatch[1]) {
        quantity = parseQuantity(unitMatch[1]);
        units = unitMatch[2] || '';
      } else {
        quantity = parseQuantity(content);
      }

      newPos = endBrace + 1;
    }
  }

  return {
    item: {
      type: 'ingredient',
      name: name.trim(),
      quantity,
      units,
    },
    newPos,
  };
}

/**
 * Parse cookware starting at position pos
 */
function parseCookware(line: string, pos: number): { item: CanonicalCookware; newPos: number } {
  let newPos = pos + 1; // Skip #

  // Extract name (can be multi-word)
  let name = '';
  let hasBraces = false;
  let braceStart = -1;

  while (newPos < line.length) {
    const char = line[newPos];

    if (char === '{') {
      braceStart = newPos;
      hasBraces = true;
      newPos++;
      break;
    }

    if (isWhitespace(char) || char === '}' || char === '#' || char === '~' || char === '@') {
      break;
    }

    if (isPunctuation(char)) {
      // Check if part of multi-word name (punctuation within name)
      if (name.length > 0 && isWordChar(name[name.length - 1]) && isWordChar(char)) {
        name += char;
        newPos++;
        continue;
      }
      break;
    }

    name += char;
    newPos++;
  }

  let quantity: number | string = 1;

  if (hasBraces && braceStart >= 0 && braceStart < line.length && line[braceStart] === '{') {
    // Find the matching closing brace
    let braceDepth = 1;
    let endBrace = braceStart + 1;

    while (endBrace < line.length && braceDepth > 0) {
      if (line[endBrace === '{') braceDepth++;
      else if (line[endBrace === '}') braceDepth--;
      endBrace++;
    }

    if (endBrace < line.length && braceDepth === 0) {
      const content = line.slice(braceStart + 1, endBrace).trim();

      // Try to parse as number
      const num = parseFloat(content);
      if (!isNaN(num)) {
        quantity = num;
      } else {
        quantity = content;
      }

      newPos = endBrace + 1;
    }
  }

  return {
    item: {
      type: 'cookware',
      name: name.trim(),
      quantity,
    },
    newPos,
  };
}

/**
 * Parse timer starting at position pos
 */
function parseTimer(line: string, pos: number): { item: CanonicalTimer; newPos: number } {
  let newPos = pos + 1; // Skip ~

  // Extract name (can be multi-word)
  let name = '';
  let hasBraces = false;
  let braceStart = -1;

  // Check for single-word timer (no space, no {)
  const remaining = line.slice(newPos);
  const singleWordMatch = remaining.match(/^([^\s{}#~@]+)(?:\s|$)/);
  if (singleWordMatch && !remaining.includes('{')) {
    name = singleWordMatch[1];
    newPos += name.length;

    return {
      item: {
        type: 'timer',
        name: name.trim(),
        quantity: '',
        units: '',
      },
      newPos,
    };
  }

  // Multi-word timer or timer with amount
  while (newPos < line.length) {
    const char = line[newPos];

    if (char === '{') {
      braceStart = newPos;
      hasBraces = true;
      newPos++;
      break;
    }

    if (isWhitespace(char) || char === '}' || char === '#' || char === '~' || char === '@') {
      break;
    }

    if (isPunctuation(char)) {
      // Check if part of multi-word name (punctuation within name)
      if (name.length > 0 && isWordChar(name[name.length - 1]) && isWordChar(char)) {
        name += char;
        newPos++;
        continue;
      }
      break;
    }

    name += char;
    newPos++;
  }

  let quantity: string | number = '';
  let units = '';

  if (hasBraces && braceStart >= 0 && braceStart < line.length && line[braceStart] === '{') {
    // Find the matching closing brace
    let braceDepth = 1;
    let endBrace = braceStart + 1;

    while (endBrace < line.length && braceDepth > 0) {
      if (line[endBrace === '{') braceDepth++;
      else if (line[endBrace === '}') braceDepth--;
      endBrace++;
    }

    if (endBrace < line.length && braceDepth === 0) {
      const content = line.slice(braceStart + 1, endBrace).trim();

      // Parse the amount - try to parse quantity%unit or just quantity
      const unitMatch = content.match(/^([^%]*)%\s*([^%]*)?$/);
      if (unitMatch && unitMatch[1]) {
        quantity = parseQuantity(unitMatch[1]);
        units = unitMatch[2] || '';
      } else {
        quantity = parseQuantity(content);
      }

      newPos = endBrace + 1;
    }
  }

  return {
    item: {
      type: 'timer',
      name: name.trim(),
      quantity,
      units,
    },
    newPos,
  };
}

/**
 * Parse text starting at position pos
 */
function parseText(line: string, pos: number): { item: CanonicalTextItem; newPos: number } {
  const start = pos;

  // Find the next special character (@, #, ~, --)
  while (pos < line.length) {
    const char = line[pos];

    // Stop at special characters
    if (char === '@' || char === '#' || char === '~') {
      break;
    }

    // Stop at comment start
    if (char === '-' && pos + 1 < line.length && line[pos + 1] === '-') {
      break;
    }

    pos++;
  }

  return {
    item: {
      type: 'text',
      value: line.substring(start, pos),
    },
    newPos,
  };
}

export { parseCanonical as parse };
