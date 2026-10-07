const { captureEditorContext, kernelForEditor } = require("./execution-context");
const { captureCommandAdapter } = require("./adapter-command-context");
const { terminateEditorPendingState, cancelAutocomplete } = require("./utils");

// A command owns its editor, kernel and cursor range before it starts waiting.
// The workspace's active context remains free to change while that work runs.
function createRunCommands({
  store,
  getExecution,
  getCellsService,
  getIntegration,
  getAdapters,
  isCurrent,
}) {
  function commandContext(event, autocompleteCancelled = false) {
    const targetEditor = lumine.workspace.getTextEditorForElement(event?.target, {
      includeMini: false,
    });
    const editor =
      targetEditor ?? lumine.workspace.getFocusedTextEditor({ includeMini: false }) ?? store.editor;
    terminateEditorPendingState(editor);
    if (!autocompleteCancelled) cancelAutocomplete(editor);
    const adapterScope = captureCommandAdapter(getAdapters, getIntegration(), targetEditor);
    if (adapterScope?.unowned) {
      lumine.notifications.addWarning("No notebook adapter owns the target editor.");
      return { context: null, adapterScope: null };
    }
    const context = captureEditorContext(store, editor);
    if (context) context.sourceText = editor.getText();
    return { context, adapterScope };
  }

  function current(context) {
    return Boolean(
      context &&
      isCurrent() &&
      !context.editor.isDestroyed?.() &&
      context.editor.getText() === context.sourceText &&
      kernelForEditor(context.editor, store, context.grammar) === context.kernel &&
      !context.kernel?._destroyed &&
      !context.kernel?.destroyed,
    );
  }

  function adapterRun(scope, moveDown, adapterScope) {
    if (!adapterScope) return null;
    const adapter = adapterScope.context.adapter;
    const targets = getIntegration().prepareAdapterTargets(
      adapter,
      scope,
      scope === "editor" && moveDown,
    );
    return getExecution().execute({
      item: adapter.getPaneItem(),
      owner: adapter.getKernelOwner(),
      targets,
      scope,
      moveDown: scope !== "editor" && moveDown,
      autocompleteCancelled: true,
    });
  }

  async function run(moveDown = false, event = null) {
    const { context, adapterScope } = commandContext(event);
    const notebook = adapterRun("editor", moveDown, adapterScope);
    if (notebook) return notebook;
    if (!current(context)) return;
    const blocks = await require("./run-source").selectionBlocks(
      context.editor,
      getCellsService,
      context,
    );
    if (!current(context) || !blocks.length) return;
    return getExecution().execute({
      editor: context.editor,
      grammar: context.grammar,
      blocks,
      moveDown,
      autocompleteCancelled: true,
    });
  }

  function rangeFor(context, scope) {
    const row = context.editor.getCursorBufferPosition().row;
    const last = context.editor.getLastBufferRow();
    return [scope === "below" ? row : 0, scope === "above" ? row : last];
  }

  function adapterContextFor(adapterScope) {
    if (!adapterScope) return null;
    const integration = getIntegration();
    const context = integration.captureAdapterKernelContext(adapterScope.services());
    return context
      ? { ...context, kernel: integration.getKernelForAdapter(context.adapter) }
      : null;
  }

  function adapterCurrent(context, adapterScope) {
    const active = getIntegration().captureAdapterKernelContext(adapterScope.services());
    return Boolean(
      isCurrent() &&
      active &&
      active.owner === context.owner &&
      active.integrationGeneration === context.integrationGeneration &&
      getIntegration().getKernelForAdapter(active.adapter) === context.kernel &&
      !context.owner?.isDestroyed?.() &&
      !context.kernel?._destroyed &&
      !context.kernel?.destroyed,
    );
  }

  async function runRange(context, startRow, endRow) {
    if (!current(context)) return;
    const blocks = await require("./run-source").inlineBlocks(
      context.editor,
      startRow,
      endRow,
      getCellsService,
      context,
    );
    if (!current(context)) return;
    return getExecution().execute({
      editor: context.editor,
      grammar: context.grammar,
      blocks,
      autocompleteCancelled: true,
    });
  }

  function runInline(scope, event = null, autocompleteCancelled = false) {
    const { context, adapterScope } = commandContext(event, autocompleteCancelled);
    const notebook = adapterRun(scope, false, adapterScope);
    if (notebook) return notebook;
    if (!current(context)) return;
    return runRange(context, ...rangeFor(context, scope));
  }

  async function recalculate(scope, event = null) {
    const { context, adapterScope } = commandContext(event);
    if (adapterScope) {
      const adapter = adapterScope.context.adapter;
      const targets = getIntegration().prepareAdapterTargets(adapter, scope);
      return getExecution().execute({
        item: adapter.getPaneItem(),
        owner: adapter.getKernelOwner(),
        targets,
        scope,
        restart: true,
        clear: true,
        autocompleteCancelled: true,
      });
    }
    if (!current(context)) return;
    const source = context.editor.getText();
    const blocks = await require("./run-source").inlineBlocks(
      context.editor,
      ...rangeFor(context, scope),
      getCellsService,
      context,
    );
    if (!current(context) || context.editor.getText() !== source) return;
    return getExecution().execute({
      editor: context.editor,
      grammar: context.grammar,
      blocks,
      restart: true,
      clear: true,
      autocompleteCancelled: true,
    });
  }

  function clearResults(event = null) {
    const { context, adapterScope } = commandContext(event, true);
    if (adapterScope && getIntegration().clearAdapterResults(adapterScope.services())) return;
    if (current(context)) require("./result").clearResults(context);
  }

  function clearAndRestart(event = null) {
    const { context, adapterScope } = commandContext(event);
    const adapterContext = adapterContextFor(adapterScope);
    if (adapterContext) {
      if (!adapterCurrent(adapterContext, adapterScope)) return;
      getIntegration().clearAdapterResults(adapterScope.services());
      return adapterContext.kernel?.restart();
    }
    if (!current(context)) return;
    require("./result").clearResults(context);
    return context.kernel?.restart();
  }

  return {
    run,
    clearResults,
    clearAndRestart,
    runAllInline: (event, cancelled) => runInline("all", event, cancelled),
    runAllAboveInline: (event, cancelled) => runInline("above", event, cancelled),
    runAllBelowInline: (event) => runInline("below", event),
    recalculateAllInline: (event) => recalculate("all", event),
    recalculateAllAboveInline: (event) => recalculate("above", event),
  };
}

module.exports = { createRunCommands };
