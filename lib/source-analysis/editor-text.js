const { readLine, readRange } = require("../source-budget");
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
  return normalizeString(readLine(editor, row));
}

function getTextInRange(editor, start, end) {
  const code = readRange(editor, [start, end]);
  return normalizeString(code);
}

function getRows(editor, startRow, endRow) {
  const code = readRange(editor, {
    start: { row: startRow, column: 0 },
    end: { row: endRow, column: editor.getBuffer().lineLengthForRow(endRow) },
  });
  return normalizeString(code);
}

function getSelectedText(editor) {
  return normalizeString(readRange(editor, editor.getSelectedBufferRange()));
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
  return new Range([first, 0], [last, editor.getBuffer().lineLengthForRow(last)]);
}

function getCommentStartString(editor, cursor = editor.getCursorBufferPosition()) {
  const firstNonWhitespaceColumn = readLine(editor, cursor.row).search(/\S/);
  const position = [
    cursor.row,
    firstNonWhitespaceColumn === -1 ? cursor.column : firstNonWhitespaceColumn,
  ];
  const delimiters = editor.getCommentDelimitersForBufferPosition(position);
  const read = (delimiters) => {
    const commentStartString = delimiters?.line ?? delimiters?.block?.[0];
    if (!commentStartString) {
      log("CellManager: No comment string defined in root scope");
      return null;
    }

    return commentStartString.trimEnd();
  };
  return delimiters?.then ? delimiters.then(read) : read(delimiters);
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
