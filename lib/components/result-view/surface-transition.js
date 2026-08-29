const { Disposable } = require("lumine");

// Result bubbles are decoration views owned by a TextEditor. The pane item is
// therefore the editor, not the bubble, so the bubble cannot expose the item
// transition hook itself. Keep one light registry and let the package register
// a single workspace participant instead of one global observer per result.
const resultViewsByEditor = new WeakMap();

function registerResultView(editor, view) {
  let views = resultViewsByEditor.get(editor);
  if (!views) {
    views = new Set();
    resultViewsByEditor.set(editor, views);
  }
  views.add(view);
  return new Disposable(() => {
    views.delete(view);
    if (views.size === 0) resultViewsByEditor.delete(editor);
  });
}

function beginResultViewSurfaceTransition(context) {
  const views = [...(resultViewsByEditor.get(context.item) || [])].filter(
    (view) => !view.destroyed,
  );
  if (views.length === 0) return null;

  const prepared = [];
  try {
    for (const view of views) {
      prepared.push({ view, state: view.prepareWindowSurfaceTransition() });
    }
  } catch (error) {
    // The coordinator cannot roll this callback back until it has returned a
    // participant, so restore anything already quiesced before rethrowing.
    for (let index = prepared.length - 1; index >= 0; index--) {
      const { view, state } = prepared[index];
      view.restoreWindowSurface(context.from.document, state);
    }
    throw error;
  }

  const restore = (domDocument) => {
    for (const { view, state } of prepared) {
      view.restoreWindowSurface(domDocument, state);
    }
  };
  return {
    commit: ({ to }) => restore(to.document),
    rollback: ({ from }) => restore(from.document),
  };
}

module.exports = { beginResultViewSurfaceTransition, registerResultView };
