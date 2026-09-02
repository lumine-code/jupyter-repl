const { Point } = require("lumine");
const { log, rowRangeForCodeFoldAtBufferRow } = require("./utils");

// The `# %%` cell model lives in the jupyter-cells package now, consumed as
// the jupyter.cells service. The block detector clips blocks at cell
// boundaries when it is present; without it there are no recognized markers,
// so there is no boundary to clip at.
let cellsService = null;

function setCellsService(service) {
  cellsService = service;
}

/**
 * Escape special regex characters in a string
 * Replacement for escape-string-regexp package
 */
function escapeStringRegexp(string) {
  if (typeof string !== "string") {
    throw new TypeError("Expected a string");
  }
  // Escape characters with special meaning in RegExp
  return string.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&").replace(/-/g, "\\x2d");
}

function normalizeString(code) {
  if (code) {
    return code.replace(/\r\n|\r/g, "\n");
  }

  return null;
}

function getRow(editor, row) {
  return normalizeString(editor.lineTextForBufferRow(row));
}

function getTextInRange(editor, start, end) {
  const code = editor.getTextInBufferRange([start, end]);
  return normalizeString(code);
}

function getRows(editor, startRow, endRow) {
  const code = editor.getTextInBufferRange({
    start: { row: startRow, column: 0 },
    end: { row: endRow, column: 9999999 },
  });
  return normalizeString(code);
}

function getSelectedText(editor) {
  return normalizeString(editor.getSelectedText());
}

function isExpressionChar(char) {
  return typeof char === "string" && char.length === 1 && /[\w$.\u00A0-\uFFFF]/.test(char);
}

function isIdentifierStartChar(char) {
  return (
    typeof char === "string" &&
    char.length === 1 &&
    (/[$A-Z_a-z\u00A0-\uFFFF]/.test(char) || char === "_")
  );
}

function stripOuterParentheses(text) {
  let result = text.trim();

  while (result.startsWith("(") && result.endsWith(")")) {
    let depth = 0;
    let wrapsExpression = true;

    for (let i = 0; i < result.length; i++) {
      const char = result[i];
      if (char === "(") depth++;
      if (char === ")") depth--;

      if (depth === 0 && i < result.length - 1) {
        wrapsExpression = false;
        break;
      }
      if (depth < 0) {
        wrapsExpression = false;
        break;
      }
    }

    if (!wrapsExpression || depth !== 0) {
      break;
    }

    result = result.slice(1, -1).trim();
  }

  return result;
}

function normalizePanelExpression(text) {
  let expression = stripOuterParentheses(text || "");
  const emptyCall = expression.match(/^([\w$.\u00A0-\uFFFF]+)\(\s*\)$/);
  if (emptyCall) {
    expression = emptyCall[1];
  }
  return expression.trim();
}

function getMatchingCloseParen(line, openIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let i = openIndex; i < line.length; i++) {
    const char = line[i];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === "(") depth++;
    if (char === ")") {
      depth--;
      if (depth === 0) {
        return i;
      }
      if (depth < 0) {
        return -1;
      }
    }
  }

  return -1;
}

function getCallExpressionAtArgumentCursor(line, cursorPosition) {
  for (let open = cursorPosition - 1; open >= 0; open--) {
    if (line[open] !== "(") {
      continue;
    }

    const close = getMatchingCloseParen(line, open);
    if (close === -1 || close < cursorPosition) {
      continue;
    }
    if (line.slice(open + 1, close).trim() === "") {
      continue;
    }

    let calleeEnd = open;
    while (calleeEnd > 0 && /\s/.test(line[calleeEnd - 1])) {
      calleeEnd--;
    }
    if (!isExpressionChar(line[calleeEnd - 1])) {
      continue;
    }

    let calleeStart = calleeEnd;
    while (calleeStart > 0 && isExpressionChar(line[calleeStart - 1])) {
      calleeStart--;
    }

    return {
      expression: line.slice(calleeStart, close + 1).trim(),
      cursorPosition: cursorPosition - calleeStart,
    };
  }

  return null;
}

function getSymbolExpressionAtCursor(line, cursorPosition) {
  let end = cursorPosition;

  if (isExpressionChar(line[end])) {
    while (end < line.length && isExpressionChar(line[end])) {
      end++;
    }
  } else if (!isExpressionChar(line[end - 1])) {
    return null;
  }

  let start = end;
  while (start > 0 && isExpressionChar(line[start - 1])) {
    start--;
  }

  const expression = normalizePanelExpression(line.slice(start, end).replace(/^\.+|\.+$/g, ""));
  if (!expression || !isIdentifierStartChar(expression[0])) {
    return null;
  }

  return {
    expression,
    cursorPosition: expression.length,
  };
}

function getExpressionFromLineAtCursor(line, cursorPosition) {
  if (!line) {
    return { expression: "", cursorPosition: 0 };
  }

  let cursor = Math.max(0, Math.min(cursorPosition, line.length));
  const symbolExpression = getSymbolExpressionAtCursor(line, cursor);
  if (symbolExpression) {
    return symbolExpression;
  }

  const callExpression = getCallExpressionAtArgumentCursor(line, cursor);
  if (callExpression) {
    return callExpression;
  }

  let end = cursor;

  if (line[end] === "(" && end > 0 && isExpressionChar(line[end - 1])) {
    // Cursor is on an empty-call open paren: obj.method(|) -> obj.method.
  } else if (end > 0 && line[end - 1] === "(" && isExpressionChar(line[end - 2])) {
    end--;
  } else if (end > 0 && line[end - 1] === ")") {
    let close = end - 1;
    while (close > 0 && /\s/.test(line[close - 1])) {
      close--;
    }
    const open = line.lastIndexOf("(", close - 1);
    if (open !== -1 && line.slice(open + 1, close).trim() === "") {
      end = open;
    }
  } else {
    while (end < line.length && isExpressionChar(line[end])) {
      end++;
    }
  }

  let start = end;
  while (start > 0 && isExpressionChar(line[start - 1])) {
    start--;
  }

  const expression = normalizePanelExpression(line.slice(start, end).replace(/^\.+|\.+$/g, ""));
  return {
    expression,
    cursorPosition: expression.length,
  };
}

function getExpressionInfoAtCursor(editor) {
  const selectedText = getSelectedText(editor);
  if (selectedText) {
    const expression = normalizePanelExpression(selectedText);
    return {
      expression,
      cursorPosition: expression.length,
    };
  }

  const cursor = editor.getLastCursor();
  return getExpressionFromLineAtCursor(
    getRow(editor, cursor.getBufferRow()),
    cursor.getBufferColumn(),
  );
}

function getExpressionAtCursor(editor) {
  return getExpressionInfoAtCursor(editor).expression;
}

function isBlank(editor, row) {
  return editor.getBuffer().isRowBlank(row);
}

function escapeBlankRows(editor, startRow, endRow) {
  while (endRow > startRow) {
    if (!isBlank(editor, endRow)) {
      break;
    }
    endRow -= 1;
  }

  return endRow;
}

function getFoldRange(editor, row) {
  const range = rowRangeForCodeFoldAtBufferRow(editor, row);
  if (!range) {
    return;
  }

  if (range[1] < editor.getLastBufferRow() && getRow(editor, range[1] + 1) === "end") {
    range[1] += 1;
  }

  log("getFoldRange:", range);
  return range;
}

function getFoldContents(editor, row) {
  const range = getFoldRange(editor, row);
  if (!range) {
    return;
  }
  return { code: getRows(editor, range[0], range[1]), row: range[1] };
}

function getCommentStartString(editor) {
  const cursor = editor.getCursorBufferPosition();
  const firstNonWhitespaceColumn = editor.lineTextForBufferRow(cursor.row).search(/\S/);
  const position = [
    cursor.row,
    firstNonWhitespaceColumn === -1 ? cursor.column : firstNonWhitespaceColumn,
  ];
  const delimiters = editor.getCommentDelimitersForBufferPosition(position);
  const commentStartString = delimiters?.line ?? delimiters?.block?.[0];
  if (!commentStartString) {
    log("CellManager: No comment string defined in root scope");
    return null;
  }

  return commentStartString.trimEnd();
}

/**
 * Center the screen on cursor position
 */
function centerScreenOnCursorPosition(editor) {
  const cursorPosition = editor.element.pixelPositionForScreenPosition(
    editor.getCursorScreenPosition(),
  ).top;
  const editorHeight = editor.element.getHeight();
  editor.element.setScrollTop(cursorPosition - editorHeight / 2);
}

/**
 * Scroll if cursor is below half of the visible area
 * Only scrolls when cursor passes the midpoint of the visible window
 */
function scrollIfBelowHalf(editor) {
  const cursorPosition = editor.element.pixelPositionForScreenPosition(
    editor.getCursorScreenPosition(),
  ).top;
  const scrollTop = editor.element.getScrollTop();
  const editorHeight = editor.element.getHeight();
  const halfWindow = scrollTop + editorHeight / 2;

  // Only scroll if cursor is below the midpoint
  if (cursorPosition > halfWindow) {
    // Scroll to put cursor at the midpoint
    editor.element.setScrollTop(cursorPosition - editorHeight / 2);
  }
}

/**
 * Apply scroll behavior based on setting
 * @param {TextEditor} editor
 */
function applyScrollBehavior(editor) {
  const scrollMode = lumine.config.get("jupyter-repl.scrollOnMoveDown");

  switch (scrollMode) {
    case "center":
      centerScreenOnCursorPosition(editor);
      break;
    case "halfWindow":
      scrollIfBelowHalf(editor);
      break;
    case "none":
    default:
      // Don't scroll
      break;
  }
}

/**
 * Move cursor down after execution.
 * @param {TextEditor} editor
 * @param {number} endRow - The last row of the executed code
 */
function moveDown(editor, endRow) {
  const lastRow = editor.getLastBufferRow();

  if (endRow >= lastRow) {
    editor.moveToBottom();
    editor.insertNewline();
    return;
  }

  // Move to next non-blank row after the executed code
  let targetRow = endRow + 1;

  // Skip blank lines
  while (targetRow <= lastRow && isBlank(editor, targetRow)) {
    targetRow++;
  }

  if (targetRow > lastRow) {
    editor.moveToBottom();
    editor.insertNewline();
    return;
  }

  editor.setCursorBufferPosition({ row: targetRow, column: 0 });
  applyScrollBehavior(editor);
}

function findPrecedingBlock(editor, row, indentLevel) {
  let previousRow = row - 1;

  while (previousRow >= 0) {
    const previousIndentLevel = editor.indentationForBufferRow(previousRow);
    const sameIndent = previousIndentLevel <= indentLevel;
    const blank = isBlank(editor, previousRow);
    const isEnd = getRow(editor, previousRow) === "end";

    if (isBlank(editor, row)) {
      row = previousRow;
    }

    if (sameIndent && !blank && !isEnd) {
      const cell = cellsService?.getCell(editor, new Point(row, 0));

      if (cell && cell.start.row > row) {
        return { code: "", row };
      }

      return { code: getRows(editor, previousRow, row), row };
    }

    previousRow -= 1;
  }

  return null;
}

function findCodeBlock(editor, selection) {
  if (!selection.isEmpty()) {
    const selectedRange = selection.getBufferRange();
    let startPoint = selectedRange.start;
    let endRow = selectedRange.end.row;
    if (selectedRange.end.column === 0) {
      endRow -= 1;
    }
    endRow = escapeBlankRows(editor, startPoint.row, endRow);
    return {
      code: getTextInRange(editor, startPoint, selectedRange.end),
      row: endRow,
    };
  } else {
    return findCodeBlockAtRow(editor, selection.cursor.getBufferRow());
  }
}

// =============================================================================
// CODE BLOCK DETECTION SYSTEM
// =============================================================================
// Priority order:
// 1. Selection - explicit user choice (handled in findCodeBlock)
// 2. Brackets - multi-line bracket expressions (arrays, dicts, function calls)
// 3. Specials - language-specific patterns (Python if-else, try-except, decorators)
// 4. Folds - language constructs (functions, classes, blocks)
// 5. Single line - fallback to current line
// =============================================================================

// -----------------------------------------------------------------------------
// BRACKET DETECTION
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// MAIN CODE BLOCK DETECTION
// -----------------------------------------------------------------------------

function findCodeBlockAtRow(editor, row) {
  log("findCodeBlockAtRow:", row);

  // If current line is blank, scan upward to find the nearest non-blank line
  if (isBlank(editor, row)) {
    let scanRow = row - 1;
    while (scanRow >= 0 && isBlank(editor, scanRow)) {
      scanRow--;
    }
    if (scanRow < 0) {
      return null;
    }
    row = scanRow;
    log("findCodeBlockAtRow: scanned up to row", row);
  }

  // 1. Check for language-specific specials (Python if-else, try-except, decorators)
  const specialBlock = getLanguageSpecialBlock(editor, row);
  if (specialBlock) {
    return { code: specialBlock.code, row: specialBlock.endRow };
  }

  // 2. Check for bracket-based blocks
  const bracketBlock = findBracketBlock(editor, row);
  if (bracketBlock) {
    const { startRow, endRow } = bracketBlock;
    // Only use bracket block if it spans multiple lines
    if (startRow !== endRow) {
      return { code: getRows(editor, startRow, endRow), row: endRow };
    }
  }

  // 3. Check for fold-based blocks. The public fold-range API is exact-row and
  // never walks backwards to a containing fold. Keep the foldability gate so
  // a run-all-inline sweep does not ask for ranges it will discard anyway.
  const indentLevel = editor.indentationForBufferRow(row);
  let foldable = editor.isFoldableAtBufferRow(row);
  let foldedBlock = null;
  if (foldable) {
    foldedBlock = getFoldContents(editor, row);
    if (!foldedBlock) foldable = false;
  }
  if (foldable) {
    return foldedBlock;
  }

  // 4. Handle special "end" keyword (Ruby, Lua, etc.)
  if (getRow(editor, row) === "end") {
    return findPrecedingBlock(editor, row, indentLevel);
  }

  // 5. Check cell boundaries
  const cell = cellsService?.getCell(editor, new Point(row, 0));
  if (cell && cell.start.row > row) {
    return { code: "", row };
  }

  // 6. Fallback to single line
  return { code: getRow(editor, row), row };
}

// -----------------------------------------------------------------------------
// LANGUAGE-SPECIFIC SPECIALS
// -----------------------------------------------------------------------------

/**
 * Get language-specific code block (currently Python support)
 * Returns { code, startRow, endRow } or null
 *
 * Language-specific detection is applied only when:
 * 1. The editor grammar matches the expected language (e.g., source.python)
 * 2. The running kernel's language matches (e.g., python)
 *
 * This ensures Python-specific block detection (if-else chains, decorators, etc.)
 * only applies when actually running Python code in a Python kernel.
 */
function getLanguageSpecialBlock(editor, row) {
  const grammar = editor.getGrammar();
  if (!grammar) return null;

  const scopeName = grammar.scopeName;
  // Required here rather than at module scope: the store imports this module,
  // so a static import would close a load-time cycle.
  const kernel = require("./store").kernel;
  const kernelLanguage = kernel?.language?.toLowerCase();

  // Python: requires both a Python grammar AND a Python kernel. The prefix
  // check also covers dialect grammars such as IPython (source.python.ipy).
  if (scopeName.startsWith("source.python") && kernelLanguage === "python") {
    return getPythonSpecialBlock(editor, row);
  }

  // Add more language handlers here as needed
  // if (scopeName === "source.ruby" && kernelLanguage === "ruby") {
  //   return getRubySpecialBlock(editor, row);
  // }

  return null;
}

/**
 * Try to get tree-sitter syntax node at position
 * Returns the node or null if tree-sitter is not available
 */
function getSyntaxNodeAtPosition(editor, position) {
  try {
    return editor.getSyntaxNodeAtBufferPosition(position);
  } catch (e) {
    // Tree-sitter not available or error
  }
  return null;
}

/**
 * Python tree-sitter node types that represent complete blocks
 */
const PYTHON_BLOCK_TYPES = new Set([
  "function_definition",
  "class_definition",
  "if_statement",
  "for_statement",
  "while_statement",
  "try_statement",
  "with_statement",
  "match_statement",
  "decorated_definition",
]);

/**
 * Python tree-sitter node types that are parts of compound statements
 */
const PYTHON_CLAUSE_TYPES = new Set([
  "elif_clause",
  "else_clause",
  "except_clause",
  "finally_clause",
  "case_clause",
]);

/**
 * Python-specific block detection using tree-sitter when available
 * Falls back to regex-based detection otherwise
 *
 * Supported constructs:
 * - Functions/classes with decorators
 * - if-elif-else chains
 * - try-except-else-finally blocks
 * - with statements
 * - for/while loops with else
 * - match/case statements
 */
function getPythonSpecialBlock(editor, row) {
  const currentLine = editor.lineTextForBufferRow(row);
  const trimmedLine = currentLine.trim();

  // Skip empty lines
  if (trimmedLine.length === 0) return null;

  // Try tree-sitter first for accurate detection
  const node = getSyntaxNodeAtPosition(editor, new Point(row, 0));
  if (node) {
    const result = getPythonBlockFromNode(editor, node, row);
    if (result) return result;
  }

  // Fallback to regex-based detection
  return getPythonSpecialBlockFallback(editor, row, trimmedLine);
}

/**
 * Get Python block from tree-sitter node
 * Only returns a block if the cursor is on a "control" line (def, class, if, elif, else, etc.)
 * If cursor is inside the body, returns null to allow single-line execution
 */
function getPythonBlockFromNode(editor, node, row) {
  // Walk up the tree to find a block node
  let current = node;

  while (current) {
    const nodeType = current.type;

    // If this is a complete block type
    if (PYTHON_BLOCK_TYPES.has(nodeType)) {
      // Only capture the block if cursor is on the FIRST line of the block
      // (the control statement line like 'def', 'class', 'if', etc.)
      if (current.startPosition.row === row) {
        return extractPythonBlock(editor, current);
      }
      // If cursor is inside the body, don't capture - let it fall through to single line
      return null;
    }

    // If we're in a clause (elif, else, except, finally)
    if (PYTHON_CLAUSE_TYPES.has(nodeType)) {
      // Only capture if cursor is on the clause line itself
      if (current.startPosition.row === row) {
        // Get the parent compound statement
        let parent = current.parent;
        while (parent && !PYTHON_BLOCK_TYPES.has(parent.type)) {
          parent = parent.parent;
        }
        if (parent) {
          return extractPythonBlock(editor, parent);
        }
      }
      // If cursor is inside the clause body, don't capture
      return null;
    }

    // Check if we're on a decorator
    if (nodeType === "decorator") {
      // Only capture if cursor is on the decorator line
      if (current.startPosition.row === row) {
        // Find decorated_definition parent
        let parent = current.parent;
        if (parent && parent.type === "decorated_definition") {
          return extractPythonBlock(editor, parent);
        }
      }
      return null;
    }

    current = current.parent;
  }

  return null;
}

/**
 * Extract code block from a tree-sitter node
 */
function extractPythonBlock(editor, node) {
  const startRow = node.startPosition.row;
  // endPosition.row is inclusive for the last line, but we need to handle
  // whether the end position is at column 0 (meaning line above)
  let endRow = node.endPosition.row;
  if (node.endPosition.column === 0 && endRow > startRow) {
    endRow -= 1;
  }

  const code = editor.getTextInBufferRange([
    [startRow, 0],
    [endRow + 1, 0],
  ]);

  return { code: normalizeString(code), startRow, endRow };
}

/**
 * Fallback regex-based Python block detection
 * Only captures blocks when cursor is on the control line, not inside body
 */
function getPythonSpecialBlockFallback(editor, row, trimmedLine) {
  // Check for decorator - find the function/class it decorates
  // Decorators are always "control" lines
  if (trimmedLine.startsWith("@")) {
    return getPythonDecoratedBlock(editor, row);
  }

  // Check for function or class definition
  // Only captures when cursor is on the 'def' or 'class' line
  if (/^(async\s+)?def\s+\w+|^class\s+\w+/.test(trimmedLine)) {
    return getPythonFunctionOrClassBlock(editor, row);
  }

  // Check for compound statements: if, try, for, while, with (start)
  // Only captures when cursor is on the starting control line
  if (/^(if|try|for|while|with|match)\s/.test(trimmedLine) && trimmedLine.endsWith(":")) {
    return getPythonCompoundBlock(editor, row);
  }

  // Check for continuation clauses (elif, else, except, finally, case)
  // Only captures when cursor is on the clause line itself
  if (/^(elif|else|except|finally|case)\s*.*:$/.test(trimmedLine)) {
    return getPythonContinuationBlock(editor, row);
  }

  // If cursor is inside a body (indented line that's not a control statement),
  // return null to allow single-line execution
  return null;
}

// -----------------------------------------------------------------------------
// PYTHON SPECIAL BLOCK HELPERS
// -----------------------------------------------------------------------------

/**
 * Find the end row of a Python indented block
 * @param {TextEditor} editor
 * @param {number} startRow - Row where the block starts (def/class/if/etc.)
 * @param {number} baseIndent - Indentation level of the starting row
 * @returns {number} The last row of the block (excluding trailing blank lines)
 */
function findPythonBlockEnd(editor, startRow, baseIndent) {
  const lineCount = editor.getLineCount();
  let lastNonEmpty = startRow;

  for (let i = startRow + 1; i < lineCount; i++) {
    const text = editor.lineTextForBufferRow(i);

    // Skip blank lines (include them in block but track last non-empty)
    if (text.trim().length === 0) {
      continue;
    }

    const ilvl = editor.indentationForBufferRow(i);

    // If indentation is greater than base, it's part of the block
    if (ilvl > baseIndent) {
      lastNonEmpty = i;
    } else {
      // Block ends here
      break;
    }
  }

  return lastNonEmpty;
}

/**
 * Look backwards from a row to find all decorators
 * @returns {number} The row of the first decorator, or startRow if none
 */
function findPythonDecoratorStart(editor, startRow) {
  let decoratorStart = startRow;

  for (let i = startRow - 1; i >= 0; i--) {
    const line = editor.lineTextForBufferRow(i);
    const trimmed = line.trim();

    // Skip blank lines
    if (trimmed.length === 0) continue;

    // Check for decorator
    if (trimmed.startsWith("@")) {
      decoratorStart = i;
    } else {
      // Non-decorator, non-blank line ends the search
      break;
    }
  }

  return decoratorStart;
}

/**
 * Handle decorated blocks (cursor on @decorator line)
 */
function getPythonDecoratedBlock(editor, row) {
  const lineCount = editor.getLineCount();

  // Find the function/class this decorator applies to
  let functionRow = null;
  for (let i = row + 1; i < lineCount; i++) {
    const line = editor.lineTextForBufferRow(i);
    const trimmed = line.trim();

    // Skip blank lines and other decorators
    if (trimmed.length === 0 || trimmed.startsWith("@")) continue;

    // Check for function/class definition
    if (/^(async\s+)?def\s+\w+|^class\s+\w+/.test(trimmed)) {
      functionRow = i;
    }
    break;
  }

  if (functionRow === null) return null;

  // Find all decorators above the original row
  const decoratorStart = findPythonDecoratorStart(editor, row);

  // Find end of function/class body
  const baseIndent = editor.indentationForBufferRow(functionRow);
  const endRow = findPythonBlockEnd(editor, functionRow, baseIndent);

  const code = editor.getTextInBufferRange([
    [decoratorStart, 0],
    [endRow + 1, 0],
  ]);

  return { code: normalizeString(code), startRow: decoratorStart, endRow };
}

/**
 * Handle function/class definitions (with potential decorators above)
 */
function getPythonFunctionOrClassBlock(editor, row) {
  // Look for decorators above
  const decoratorStart = findPythonDecoratorStart(editor, row);

  // Find end of function/class body
  const baseIndent = editor.indentationForBufferRow(row);
  const endRow = findPythonBlockEnd(editor, row, baseIndent);

  const code = editor.getTextInBufferRange([
    [decoratorStart, 0],
    [endRow + 1, 0],
  ]);

  return { code: normalizeString(code), startRow: decoratorStart, endRow };
}

/**
 * Handle continuation clauses (elif, else, except, finally) by finding the parent block
 */
function getPythonContinuationBlock(editor, row) {
  const currentIndent = editor.indentationForBufferRow(row);
  const trimmedLine = editor.lineTextForBufferRow(row).trim();

  // Determine what kind of parent we're looking for
  let parentPattern;
  if (trimmedLine.startsWith("elif") || trimmedLine.startsWith("else")) {
    // Could be if-elif-else or for/while-else or try-else
    parentPattern = /^(if|elif|for|while|try|except)\s/;
  } else if (trimmedLine.startsWith("except") || trimmedLine.startsWith("finally")) {
    parentPattern = /^(try|except)\s/;
  }

  // Look backwards for the parent statement at same indentation
  for (let i = row - 1; i >= 0; i--) {
    const line = editor.lineTextForBufferRow(i);
    const trimmed = line.trim();

    if (trimmed.length === 0) continue;

    const ilvl = editor.indentationForBufferRow(i);

    // If same indentation, check if it's the start of compound statement
    if (ilvl === currentIndent) {
      if (/^(if|try|for|while)\s/.test(trimmed) && trimmed.endsWith(":")) {
        // Found the start - delegate to compound block handler
        return getPythonCompoundBlock(editor, i);
      }
      // If it's another continuation clause, keep looking
      if (!parentPattern.test(trimmed)) {
        // Hit something else at same level - this continuation is orphaned
        break;
      }
    } else if (ilvl < currentIndent) {
      // Went past the parent's indentation level
      break;
    }
  }

  return null;
}

/**
 * Handle compound statements: if-elif-else, try-except-finally, for-else, while-else, with
 */
function getPythonCompoundBlock(editor, startRow) {
  const lineCount = editor.getLineCount();
  const baseIndent = editor.indentationForBufferRow(startRow);
  let lastNonEmpty = startRow;

  // Determine which continuation keywords to look for
  const startLine = editor.lineTextForBufferRow(startRow).trim();
  let continuationPattern;

  if (startLine.startsWith("if")) {
    continuationPattern = /^(elif|else)\s*.*:$/;
  } else if (startLine.startsWith("try")) {
    continuationPattern = /^(except|else|finally)\s*.*:$/;
  } else if (startLine.startsWith("for") || startLine.startsWith("while")) {
    continuationPattern = /^else\s*:$/;
  } else if (startLine.startsWith("with")) {
    continuationPattern = null; // 'with' has no continuation clauses
  }

  for (let i = startRow + 1; i < lineCount; i++) {
    const text = editor.lineTextForBufferRow(i);
    const trimmed = text.trim();

    // Skip blank lines
    if (trimmed.length === 0) continue;

    const ilvl = editor.indentationForBufferRow(i);

    // If more indented, it's part of current clause body
    if (ilvl > baseIndent) {
      lastNonEmpty = i;
      continue;
    }

    // If less indented, block ends
    if (ilvl < baseIndent) break;

    // Same indentation - check for continuation clause
    if (continuationPattern && continuationPattern.test(trimmed)) {
      lastNonEmpty = i;
      continue;
    }

    // Same indentation but not a continuation - block ends
    break;
  }

  const code = editor.getTextInBufferRange([
    [startRow, 0],
    [lastNonEmpty + 1, 0],
  ]);

  return { code: normalizeString(code), startRow, endRow: lastNonEmpty };
}

module.exports = {
  setCellsService,
  escapeStringRegexp,
  normalizeString,
  getRow,
  getTextInRange,
  getRows,
  getSelectedText,
  getExpressionInfoAtCursor,
  getExpressionAtCursor,
  isBlank,
  escapeBlankRows,
  getFoldRange,
  getFoldContents,
  getCommentStartString,
  moveDown,
  findPrecedingBlock,
  findCodeBlock,
  findCodeBlockAtRow,
};
