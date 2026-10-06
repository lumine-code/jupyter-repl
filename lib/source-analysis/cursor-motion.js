const { isBlank } = require("./editor-text");

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

module.exports = { moveDown };
