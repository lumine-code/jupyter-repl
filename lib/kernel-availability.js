const grammarLanguage = require("./grammar-language");

function mappedKernel(value, editor) {
  if (!(value instanceof Map)) return value ?? null;
  const grammar = editor?.getGrammar?.();
  return value.get(grammar?.name) ?? (value.size === 1 ? value.values().next().value : null);
}

// A presentation query reads only bindings and values populated by normal
// runtime work. It never creates a Store, adapter, plugin wrapper or observer.
function peekKernel({ store, adapterKernel, windowContext, languageMappings = {} }, input = {}) {
  const { item, editor, window } = input;
  if (!store) return null;
  if ((Object.hasOwn(input, "item") || Object.hasOwn(input, "editor")) && !item && !editor)
    return null;
  if (editor?.isDestroyed?.() || item?.isDestroyed?.() || item?._destroyed) return null;
  const context = window && windowContext(window);
  const currentItem = context?.container.getActivePaneItem();
  let kernel = null;
  if (typeof item?.getJupyterKernel === "function") {
    const declared = item.getJupyterKernel();
    kernel = store.runningKernels.find(
      (candidate) => candidate === declared || candidate.pluginWrapper === declared,
    );
    return kernel && !kernel._destroyed && !kernel.destroyed ? kernel : null;
  }
  if (context && (!item || currentItem === item)) kernel = context.lastKernel;
  if (!kernel && item) kernel = mappedKernel(adapterKernel(item), editor);
  if (!kernel && item && item !== editor) {
    kernel = mappedKernel(store.kernelMapping.get(item.getPath?.()), editor);
  }
  if (!kernel && editor && (!item || item === editor)) {
    if (editor === store.editor && (!store.activePaneItem || store.activePaneItem === editor))
      kernel = store._lastEmittedKernel;
    kernel ??= mappedKernel(
      store.kernelMapping.get(editor.getPath?.() || `Unsaved Editor ${editor.id}`),
      editor,
    );
    if (!kernel && store.globalMode) {
      const language = grammarLanguage(editor.getGrammar?.(), languageMappings);
      if (language)
        kernel = store.runningKernels.find(
          (entry) => grammarLanguage(entry.grammar, languageMappings) === language,
        );
    }
  }
  if (!kernel || kernel._destroyed || kernel.destroyed || !store.runningKernels.includes(kernel))
    return null;
  return kernel;
}

function snapshot(kernel) {
  if (!kernel) return null;
  const transport = kernel.transport;
  return Object.freeze({
    id: kernel.id,
    language: kernel.language ?? null,
    executionState: kernel.executionState ?? null,
    connectionState: transport?.lifecycle ?? null,
    capabilities: Object.freeze({
      rename: typeof transport?.rename === "function",
      disconnect: transport?.ownsKernelProcess === false,
      localSource: !transport?.session,
      console: Boolean(transport?.connectionFile),
    }),
  });
}

module.exports = { peekKernel, snapshot };
