// Keep the existing code-manager surface for package callers. Source analysis
// receives the editor's captured kernel; it never reads the active store.
const text = require("./source-analysis/editor-text");
const expressions = require("./source-analysis/expressions");
const { getCellsService, setCellsService } = require("./code-manager-state");

function analysisContext(editor, context = {}) {
  const kernel = Object.hasOwn(context, "kernel")
    ? context.kernel
    : require("./execution-context").kernelForEditor(editor);
  return {
    ...context,
    kernel,
    cellsService: Object.hasOwn(context, "cellsService") ? context.cellsService : getCellsService(),
  };
}

module.exports = {
  setCellsService,
  escapeStringRegexp: text.escapeStringRegexp,
  normalizeString: text.normalizeString,
  getRow: text.getRow,
  getTextInRange: text.getTextInRange,
  getRows: text.getRows,
  getSelectedText: text.getSelectedText,
  getExpressionInfoAtCursor: expressions.getExpressionInfoAtCursor,
  getExpressionAtCursor: expressions.getExpressionAtCursor,
  isBlank: text.isBlank,
  escapeBlankRows: text.escapeBlankRows,
  getCommentStartString: text.getCommentStartString,
  getFoldRange(editor, row) {
    return require("./source-analysis/blocks").getFoldRange(editor, row);
  },
  getFoldContents(editor, row) {
    return require("./source-analysis/blocks").getFoldContents(editor, row);
  },
  moveDown(editor, endRow) {
    return require("./source-analysis/cursor-motion").moveDown(editor, endRow);
  },
  findPrecedingBlock(editor, row, indentLevel, context) {
    return require("./source-analysis/blocks").findPrecedingBlock(
      editor,
      row,
      indentLevel,
      analysisContext(editor, context),
    );
  },
  findCodeBlock(editor, selection, context) {
    return require("./source-analysis/blocks").findCodeBlock(
      editor,
      selection,
      analysisContext(editor, context),
    );
  },
  findCodeBlockAtRow(editor, row, context) {
    return require("./source-analysis/blocks").findCodeBlockAtRow(
      editor,
      row,
      analysisContext(editor, context),
    );
  },
};
