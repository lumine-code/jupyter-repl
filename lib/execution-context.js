function filePathForEditor(editor) {
  return editor ? editor.getPath() || `Unsaved Editor ${editor.id}` : null;
}

// Resolve a requested editor independently of the sticky editor used by docks.
// Only the current editor in its own pane inherits the pane's kernel contract.
function kernelForEditor(editor, store = require("./store"), grammar, filePath) {
  if (!editor || editor.isDestroyed?.()) return null;
  if (
    editor === store.editor &&
    (!store.activePaneItem || store.activePaneItem === editor) &&
    (grammar === undefined || grammar === store.grammar)
  ) {
    return store.kernel || null;
  }
  grammar ??= store.getEmbeddedGrammar(editor);
  filePath ??= filePathForEditor(editor);
  if (!grammar || !filePath) return null;
  if (store.globalMode) {
    const { grammarToLanguage } = require("./utils");
    const language = grammarToLanguage(grammar);
    return (
      store.runningKernels.find((kernel) => grammarToLanguage(kernel.grammar) === language) || null
    );
  }
  const mapping = store.kernelMapping.get(filePath);
  return mapping instanceof Map ? mapping.get(grammar.name) || null : mapping || null;
}

function captureEditorContext(store, editor) {
  if (!editor || editor.isDestroyed?.()) return null;
  const grammar = store.getEmbeddedGrammar(editor);
  const filePath = filePathForEditor(editor);
  return {
    editor,
    grammar,
    filePath,
    kernel: kernelForEditor(editor, store, grammar, filePath),
    markers: store.markersMapping.get(editor.id) || null,
  };
}

module.exports = { filePathForEditor, kernelForEditor, captureEditorContext };
