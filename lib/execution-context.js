function filePathForEditor(editor) {
  return editor ? editor.getPath() || `Unsaved Editor ${editor.id}` : null;
}

function hasSourceGrammar(editor) {
  return Boolean(
    editor && !editor.isDestroyed?.() && editor.getGrammar?.() !== lumine.grammars.nullGrammar,
  );
}

// Resolve a requested editor independently of the sticky editor used by docks.
// Only the current editor in its own pane inherits the pane's kernel contract.
function kernelForEditor(editor, store = require("./store"), grammar, filePath) {
  if (!hasSourceGrammar(editor)) return null;
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

async function captureEditorContext(store, editor, { grammar: requestedGrammar, signal } = {}) {
  if (!hasSourceGrammar(editor)) return null;
  const sourceGrammar = editor.getGrammar?.();
  let grammar = requestedGrammar ?? store.getEmbeddedGrammar(editor);
  const filePath = filePathForEditor(editor);
  const buffer = editor.getBuffer?.();
  const mode = buffer?.getLanguageMode();
  const sourceCurrent = () =>
    hasSourceGrammar(editor) &&
    !signal?.aborted &&
    editor.getGrammar?.() === sourceGrammar &&
    buffer?.getLanguageMode() === mode;
  let isCurrent = sourceCurrent;
  if (
    !requestedGrammar &&
    mode?.asynchronousSyntax &&
    require("./utils").isMultilanguageGrammar(editor.getGrammar())
  ) {
    const revision = buffer.getTextRevision();
    const position = editor.getCursorBufferPosition().copy();
    const selections = editor.getSelectedBufferRanges();
    isCurrent = () =>
      sourceCurrent() &&
      buffer.getTextRevision() === revision &&
      buffer.getLanguageMode() === mode &&
      filePathForEditor(editor) === filePath;
    const descriptors = await editor.getScopeDescriptorsForBufferPositions([position], { signal });
    if (!descriptors || !isCurrent()) return null;
    const selected = editor.getSelectedBufferRanges();
    if (
      selected.length !== selections.length ||
      selected.some((range, index) => !range.isEqual(selections[index]))
    )
      return null;
    const scopes = descriptors[0].getScopesArray();
    const embedded = scopes.find((scope, index) => index > 0 && scope.startsWith("source."));
    grammar =
      (embedded && lumine.grammars.grammarForScopeName(embedded.replace(".embedded", ""))) ||
      editor.getGrammar();
    const token = buffer.getSyntaxSnapshotToken();
    const syntaxCurrent = isCurrent;
    isCurrent = () =>
      syntaxCurrent() && token !== null && buffer.getSyntaxSnapshotToken() === token;
  }
  if (!isCurrent()) return null;
  return {
    editor,
    grammar,
    filePath,
    kernel: kernelForEditor(editor, store, grammar, filePath),
    markers: store.markersMapping.get(editor.id) || null,
    isCurrent,
  };
}

module.exports = { filePathForEditor, kernelForEditor, captureEditorContext, hasSourceGrammar };
