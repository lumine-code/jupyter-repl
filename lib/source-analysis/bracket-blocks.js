const BRACKET_PAIRS = {
  "(": ")",
  "[": "]",
  "{": "}",
  ")": "(",
  "]": "[",
  "}": "{",
};
/**
 * Check if character is inside a string or comment (basic heuristic)
 * This is a simplified check - for full accuracy would need tokenizer
 */
function isInStringOrComment(line, charIndex) {
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inTripleSingle = false;
  let inTripleDouble = false;

  for (let i = 0; i < charIndex; i++) {
    const char = line[i];
    const next2 = line.slice(i, i + 3);

    // Check for triple quotes first
    if (!inSingleQuote && !inDoubleQuote) {
      if (next2 === '"""') {
        inTripleDouble = !inTripleDouble;
        i += 2;
        continue;
      }
      if (next2 === "'''") {
        inTripleSingle = !inTripleSingle;
        i += 2;
        continue;
      }
    }

    if (inTripleSingle || inTripleDouble) continue;

    // Check for escape sequences
    if (char === "\\" && i + 1 < charIndex) {
      i++; // Skip next character
      continue;
    }

    // Check for single/double quotes
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
    } else if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
    }

    // Check for line comment (after quotes are handled)
    if (!inSingleQuote && !inDoubleQuote && char === "#") {
      return true; // Rest of line is comment
    }
  }

  return inSingleQuote || inDoubleQuote || inTripleSingle || inTripleDouble;
}

/**
 * Find bracket block that contains the given row
 * Returns { startRow, endRow } or null if not in a bracket block
 *
 * NOTE: Only captures the block if cursor is on the opening or closing bracket line.
 * If cursor is inside the bracket expression (middle lines), returns null to allow
 * single-line execution for inspection purposes.
 */
function findBracketBlock(editor, row) {
  const line = editor.lineTextForBufferRow(row);
  const trimmedLine = line.trim();

  // Check if line starts with closing bracket
  const startsWithClose = /^[)\]}]/.test(trimmedLine);
  // Check if line ends with opening bracket
  const endsWithOpen = /[([{]\s*$/.test(trimmedLine);

  // Only capture bracket blocks when cursor is on opening or closing bracket line
  // If cursor is inside (not on start/end line), return null for single-line execution
  if (!startsWithClose && !endsWithOpen) {
    // A triple-quoted multiline string hides its brackets from the line checks
    // above: `doc.x('''` ends with the string opener rather than the bracket,
    // and `''')` starts with the string closer. Handle those explicitly so the
    // whole statement runs even when no fold provider covers it.
    return findMultilineStringBlock(editor, row);
  }

  if (startsWithClose) {
    // Find matching opening bracket going backwards
    const closeBracket = trimmedLine[0];
    const openBracket = BRACKET_PAIRS[closeBracket];

    let depth = 1;
    for (let r = row - 1; r >= 0; r--) {
      const l = editor.lineTextForBufferRow(r);
      for (let i = l.length - 1; i >= 0; i--) {
        if (isInStringOrComment(l, i)) continue;
        const char = l[i];
        if (char === closeBracket) {
          depth++;
        } else if (char === openBracket) {
          depth--;
          if (depth === 0) {
            return { startRow: r, endRow: row };
          }
        }
      }
    }
  }

  if (endsWithOpen) {
    // Find matching closing bracket going forwards
    const match = trimmedLine.match(/[([{]\s*$/);
    const openBracket = match[0].trim();
    const closeBracket = BRACKET_PAIRS[openBracket];

    let depth = 1;
    const lastRow = editor.getLastBufferRow();
    for (let r = row + 1; r <= lastRow; r++) {
      const l = editor.lineTextForBufferRow(r);
      for (let i = 0; i < l.length; i++) {
        if (isInStringOrComment(l, i)) continue;
        const char = l[i];
        if (char === openBracket) {
          depth++;
        } else if (char === closeBracket) {
          depth--;
          if (depth === 0) {
            return { startRow: row, endRow: r };
          }
        }
      }
    }
  }

  return null;
}

const TRIPLE_QUOTES = ["'''", '"""'];

/**
 * If the line opens a triple-quoted string that does not close on the same
 * line (e.g. `doc.x('''` or a bare `x = '''`), return its description:
 * { quote, index, bracketDepth } where bracketDepth is the net count of
 * unclosed brackets on the line before the string starts.
 */
function findMultilineStringOpener(line) {
  for (const quote of TRIPLE_QUOTES) {
    let idx = line.indexOf(quote);
    while (idx !== -1) {
      if (!isInStringOrComment(line, idx)) {
        // A closer on the same line means the string is single-line
        if (line.indexOf(quote, idx + 3) !== -1) break;
        let depth = 0;
        for (let i = 0; i < idx; i++) {
          if (isInStringOrComment(line, i)) continue;
          const char = line[i];
          if (char === "(" || char === "[" || char === "{") depth++;
          else if (char === ")" || char === "]" || char === "}") depth--;
        }
        return { quote, index: idx, bracketDepth: depth };
      }
      idx = line.indexOf(quote, idx + 1);
    }
  }
  return null;
}

/**
 * Resolve the block started by a multiline string opener: find the row that
 * closes the string, then keep matching any brackets left open before the
 * string (e.g. the `(` in `doc.x('''`), which may close on a later row.
 * Returns { startRow, endRow } or null.
 */
function resolveMultilineStringBlock(editor, openRow, opener) {
  const lastRow = editor.getLastBufferRow();
  let closeRow = -1;
  let closeColumn = -1;
  for (let r = openRow + 1; r <= lastRow; r++) {
    const idx = editor.lineTextForBufferRow(r).indexOf(opener.quote);
    if (idx !== -1) {
      closeRow = r;
      closeColumn = idx + opener.quote.length;
      break;
    }
  }
  if (closeRow === -1) return null;

  let depth = opener.bracketDepth;
  if (depth <= 0) {
    return { startRow: openRow, endRow: closeRow };
  }
  for (let r = closeRow; r <= lastRow; r++) {
    const l = editor.lineTextForBufferRow(r);
    const text = r === closeRow ? l.slice(closeColumn) : l;
    for (let i = 0; i < text.length; i++) {
      if (isInStringOrComment(text, i)) continue;
      const char = text[i];
      if (char === "(" || char === "[" || char === "{") depth++;
      else if (char === ")" || char === "]" || char === "}") {
        depth--;
        if (depth === 0) {
          return { startRow: openRow, endRow: r };
        }
      }
    }
  }
  return null;
}

/**
 * Find the full statement around a multiline triple-quoted string when the
 * cursor is on its opening line (`doc.x('''`, `x = '''`, a bare docstring
 * `'''`) or its closing line (`''')`, `'''`).
 * Returns { startRow, endRow } or null.
 */
function findMultilineStringBlock(editor, row) {
  const line = editor.lineTextForBufferRow(row);
  const trimmedLine = line.trim();

  // Closing-line interpretation: `'''` / `''')` closes a string opened above.
  // The nearest preceding line containing the same quote must be its opener
  // (a line-local scan cannot tell an opener from a closer, so resolve the
  // candidate opener forward and check it lands on this row or beyond).
  const closeMatch = trimmedLine.match(/^('''|""")/);
  if (closeMatch) {
    const quote = closeMatch[1];
    for (let r = row - 1; r >= 0; r--) {
      const l = editor.lineTextForBufferRow(r);
      if (!l.includes(quote)) continue;
      const opener = findMultilineStringOpener(l);
      if (opener && opener.quote === quote) {
        const block = resolveMultilineStringBlock(editor, r, opener);
        if (block && block.endRow >= row) return block;
      }
      break;
    }
    // Fall through: the line may itself open a string (e.g. a docstring).
  }

  const opener = findMultilineStringOpener(line);
  if (opener) {
    return resolveMultilineStringBlock(editor, row, opener);
  }
  return null;
}

module.exports = { findBracketBlock };
