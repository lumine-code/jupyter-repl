const { isBlank } = require("./editor-text");

/**
 * Apply scroll behavior based on setting
 * @param {TextEditor} editor
 */
function applyScrollBehavior(editor) {
  const scrollMode = lumine.config.get("jupyter-repl.scrollOnMoveDown");

  switch (scrollMode) {
    case "center":
      editor.scrollToCursorPosition({ mode: "center" });
      break;
    case "zone":
      editor.scrollToZone();
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
    editor.setCursorBufferPosition([lastRow, Infinity], { autoscroll: false });
    editor.insertNewline({ autoscroll: false });
    applyScrollBehavior(editor);
    return;
  }

  // Move to next non-blank row after the executed code
  let targetRow = endRow + 1;

  // Skip blank lines
  while (targetRow <= lastRow && isBlank(editor, targetRow)) {
    targetRow++;
  }

  if (targetRow > lastRow) {
    editor.setCursorBufferPosition([lastRow, Infinity], { autoscroll: false });
    editor.insertNewline({ autoscroll: false });
    applyScrollBehavior(editor);
    return;
  }

  editor.setCursorBufferPosition({ row: targetRow, column: 0 }, { autoscroll: false });
  applyScrollBehavior(editor);
}

module.exports = { moveDown };
