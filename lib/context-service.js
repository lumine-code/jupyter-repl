/** Resolve source UI once at invocation; sessions never interpret current focus. */
function createContextService({ getCellsService, getAdapterServices, isCurrent = () => true }) {
  function getFocusedEditor(event) {
    if (!isCurrent()) return null;
    const target = lumine.workspace.getTextEditorForElement(event?.target, { includeMini: false });
    if (target) return target;
    const focused = lumine.workspace.getFocusedTextEditor({ includeMini: false });
    if (focused) return focused;
    return (
      require("./adapter-integration").getAdapterFocusedEditor(getAdapterServices()) ||
      lumine.workspace.getActiveTextEditor() ||
      null
    );
  }
  return {
    getFocusedEditor,
    getExpressionAtCursor(editor = getFocusedEditor()) {
      if (!isCurrent()) return "";
      return editor ? require("./source-analysis/expressions").getExpressionAtCursor(editor) : "";
    },
    getCellRange(editor = getFocusedEditor()) {
      if (!isCurrent()) return null;
      return editor ? getCellsService()?.getCurrentCell(editor) || null : null;
    },
  };
}

module.exports = { createContextService };
