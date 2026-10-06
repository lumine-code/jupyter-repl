const { Point } = require("lumine");
const { log, rowRangeForCodeFoldAtBufferRow } = require("../utils");
const {
  getRow,
  getRows,
  getTextInRange,
  isBlank,
  escapeBlankRows,
  rangeForRows,
} = require("./editor-text");
const { findBracketBlock } = require("./bracket-blocks");
const { getPythonSpecialBlock } = require("./python-blocks");

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
  return {
    code: getRows(editor, range[0], range[1]),
    row: range[1],
    range: rangeForRows(editor, range[0], range[1]),
  };
}

function findPrecedingBlock(editor, row, indentLevel, context = {}) {
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
      const cell = context.cellsService?.getCell(editor, new Point(row, 0));

      if (cell && cell.start.row > row) {
        return { code: "", row };
      }

      return {
        code: getRows(editor, previousRow, row),
        row,
        range: rangeForRows(editor, previousRow, row),
      };
    }

    previousRow -= 1;
  }

  return null;
}

function findCodeBlock(editor, selection, context = {}) {
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
      range: selectedRange,
    };
  } else {
    return findCodeBlockAtRow(editor, selection.cursor.getBufferRow(), context);
  }
}

function findCodeBlockAtRow(editor, row, context = {}) {
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
  const specialBlock = getLanguageSpecialBlock(editor, row, context.kernel);
  if (specialBlock) {
    return {
      code: specialBlock.code,
      row: specialBlock.endRow,
      range: rangeForRows(editor, specialBlock.startRow, specialBlock.endRow),
    };
  }

  // 2. Check for bracket-based blocks
  const bracketBlock = findBracketBlock(editor, row);
  if (bracketBlock) {
    const { startRow, endRow } = bracketBlock;
    // Only use bracket block if it spans multiple lines
    if (startRow !== endRow) {
      return {
        code: getRows(editor, startRow, endRow),
        row: endRow,
        range: rangeForRows(editor, startRow, endRow),
      };
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
    return findPrecedingBlock(editor, row, indentLevel, context);
  }

  // 5. Check cell boundaries
  const cell = context.cellsService?.getCell(editor, new Point(row, 0));
  if (cell && cell.start.row > row) {
    return { code: "", row };
  }

  // 6. Fallback to single line
  return { code: getRow(editor, row), row, range: rangeForRows(editor, row, row) };
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
function getLanguageSpecialBlock(editor, row, kernel) {
  const grammar = editor.getGrammar();
  if (!grammar) return null;

  const scopeName = grammar.scopeName;
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

module.exports = {
  getFoldRange,
  getFoldContents,
  findPrecedingBlock,
  findCodeBlock,
  findCodeBlockAtRow,
};
