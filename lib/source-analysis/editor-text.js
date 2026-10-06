const { Range } = require("lumine");
const { log } = require("../utils");

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

function rangeForRows(editor, first, last) {
  return new Range([first, 0], [last, editor.lineTextForBufferRow(last).length]);
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

module.exports = {
  escapeStringRegexp,
  normalizeString,
  getRow,
  getTextInRange,
  getRows,
  getSelectedText,
  isBlank,
  escapeBlankRows,
  rangeForRows,
  getCommentStartString,
};
