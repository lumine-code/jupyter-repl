// Keep the existing code-manager surface for package callers. Source analysis
// receives the editor's captured kernel; it never reads the active store.
const text = require("./source-analysis/editor-text");
const expressions = require("./source-analysis/expressions");
const { getCellsService, setCellsService } = require("./code-manager-state");
const { Point, Range } = require("lumine");
const workerOwned = (editor) => editor.getBuffer?.()?.getLanguageMode?.()?.asynchronousSyntax;
const restoreBlock = (block) =>
  block?.range ? { ...block, range: Range.fromObject(block.range) } : block;

function workerBlock(editor, method, params, context) {
  const captured = analysisContext(editor, context);
  const point = Point.fromObject(params.cursor ?? [params.row ?? 0, 0]);
  const cell = captured.cellsService?.getCell(editor, point);
  return editor
    .analyzeSyntax(require.resolve("./source-analysis/block-analysis"), "block", {
      ...params,
      method,
      cell,
      tabLength: editor.getTabLength(),
      language: captured.kernel?.language,
    })
    .then(restoreBlock);
}

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
    if (workerOwned(editor))
      return workerBlock(editor, "getFoldRange", { row }, { kernel: null, cellsService: null });
    return require("./source-analysis/blocks").getFoldRange(editor, row);
  },
  getFoldContents(editor, row) {
    if (workerOwned(editor))
      return workerBlock(editor, "getFoldContents", { row }, { kernel: null, cellsService: null });
    return require("./source-analysis/blocks").getFoldContents(editor, row);
  },
  moveDown(editor, endRow) {
    return require("./source-analysis/cursor-motion").moveDown(editor, endRow);
  },
  findPrecedingBlock(editor, row, indentLevel, context) {
    if (workerOwned(editor))
      return workerBlock(editor, "findPrecedingBlock", { row, indentLevel }, context);
    return require("./source-analysis/blocks").findPrecedingBlock(
      editor,
      row,
      indentLevel,
      analysisContext(editor, context),
    );
  },
  findCodeBlock(editor, selection, context) {
    if (workerOwned(editor))
      return workerBlock(
        editor,
        "findCodeBlock",
        { range: selection.getBufferRange(), cursor: selection.cursor.getBufferPosition() },
        context,
      );
    return require("./source-analysis/blocks").findCodeBlock(
      editor,
      selection,
      analysisContext(editor, context),
    );
  },
  findCodeBlockAtRow(editor, row, context) {
    if (workerOwned(editor)) return workerBlock(editor, "findCodeBlockAtRow", { row }, context);
    return require("./source-analysis/blocks").findCodeBlockAtRow(
      editor,
      row,
      analysisContext(editor, context),
    );
  },

  async findCodeBlocksInRange(editor, first, last, context = {}) {
    const captured = analysisContext(editor, context);
    const results = [];
    const summary = await editor.analyzeSyntax(
      require.resolve("./source-analysis/block-analysis"),
      "range",
      {
        first,
        last,
        tabLength: editor.getTabLength(),
        language: captured.kernel?.language,
        cell: context.cellRange,
      },
      {
        onChunk: (packet) => {
          for (const block of packet) results.push(restoreBlock(block));
        },
      },
    );
    if (!summary) return [];
    if (summary.count !== results.length) throw new Error("Incomplete source-block stream");
    return results;
  },
};
