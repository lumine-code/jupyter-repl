const { Point } = require("lumine");
const { normalizeString } = require("./editor-text");

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
  if (
    /^(?:(?:async\s+)?(?:for|with)|if|try|while|match)\b/.test(trimmedLine) &&
    /:\s*(?:#.*)?$/.test(trimmedLine)
  ) {
    return getPythonCompoundBlock(editor, row);
  }

  // Check for continuation clauses (elif, else, except, finally, case)
  // Only captures when cursor is on the clause line itself
  if (/^(elif|else|except|finally|case)\b.*:\s*(?:#.*)?$/.test(trimmedLine)) {
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

  // case clauses sit one indentation level inside match, unlike the other
  // continuation clauses. Find that enclosing statement before the generic
  // same-level walk; otherwise parentPattern was undefined and a second case
  // crashed execution preparation when no syntax tree was available.
  if (/^case\b/.test(trimmedLine)) {
    for (let i = row - 1; i >= 0; i--) {
      const trimmed = editor.lineTextForBufferRow(i).trim();
      if (!trimmed) continue;
      if (editor.indentationForBufferRow(i) < currentIndent) {
        return /^match\b.*:\s*(?:#.*)?$/.test(trimmed) ? getPythonCompoundBlock(editor, i) : null;
      }
    }
    return null;
  }

  // Determine what kind of parent we're looking for
  let parentPattern;
  if (trimmedLine.startsWith("elif") || trimmedLine.startsWith("else")) {
    // Could be if-elif-else or for/while-else or try-else
    parentPattern = /^(?:(?:async\s+)?for|if|elif|while|try|except)\b/;
  } else if (trimmedLine.startsWith("except") || trimmedLine.startsWith("finally")) {
    parentPattern = /^(try|except|else)\b/;
  }

  // Look backwards for the parent statement at same indentation
  for (let i = row - 1; i >= 0; i--) {
    const line = editor.lineTextForBufferRow(i);
    const trimmed = line.trim();

    if (trimmed.length === 0) continue;

    const ilvl = editor.indentationForBufferRow(i);

    // If same indentation, check if it's the start of compound statement
    if (ilvl === currentIndent) {
      if (/^(?:(?:async\s+)?for|if|try|while)\b/.test(trimmed) && /:\s*(?:#.*)?$/.test(trimmed)) {
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
  const startLine = editor
    .lineTextForBufferRow(startRow)
    .trim()
    .replace(/^async\s+/, "");
  let continuationPattern;

  if (startLine.startsWith("if")) {
    continuationPattern = /^(elif|else)\b.*:\s*(?:#.*)?$/;
  } else if (startLine.startsWith("try")) {
    continuationPattern = /^(except|else|finally)\b.*:\s*(?:#.*)?$/;
  } else if (startLine.startsWith("for") || startLine.startsWith("while")) {
    continuationPattern = /^else\s*:\s*(?:#.*)?$/;
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

module.exports = { getPythonSpecialBlock };
