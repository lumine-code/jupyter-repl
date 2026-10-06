const { captureEditorContext, kernelForEditor } = require("./execution-context");
const { captureCommandAdapter } = require("./adapter-command-context");
const { terminateEditorPendingState, cancelAutocomplete } = require("./utils");

// A command owns its editor, kernel and cursor range before it starts waiting.
// The workspace's active context remains free to change while that work runs.
function createRunCommands({
  store,
  kernelManager,
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
    return { context: captureEditorContext(store, editor), adapterScope };
  }

  function current(context) {
    return Boolean(
      context &&
      isCurrent() &&
      !context.editor.isDestroyed?.() &&
      kernelForEditor(context.editor, store, context.grammar) === context.kernel &&
      !context.kernel?._destroyed &&
      !context.kernel?.destroyed,
    );
  }

  function adapterRun(scope, moveDown, adapterScope) {
    return (
      adapterScope &&
      getIntegration().runAdapterTargets(adapterScope.services(), kernelManager, {
        scope,
        moveDown,
        autocompleteCancelled: true,
      })
    );
  }

  async function run(moveDown = false, event = null) {
    const { context, adapterScope } = commandContext(event);
    if (adapterRun("editor", moveDown, adapterScope) || !current(context)) return;
    const blocks = await require("./run-source").selectionBlocks(
      context.editor,
      getCellsService,
      context,
    );
    if (!current(context) || !blocks.length) return;
    if (moveDown) require("./code-manager").moveDown(context.editor, blocks[blocks.length - 1].row);
    return getExecution().runBlocks(context.editor, blocks, {
      autocompleteCancelled: true,
      executionContext: context,
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
    return getExecution().runBlocks(context.editor, blocks, {
      autocompleteCancelled: true,
      executionContext: context,
    });
  }

  function runInline(scope, event = null, autocompleteCancelled = false) {
    const { context, adapterScope } = commandContext(event, autocompleteCancelled);
    if (adapterRun(scope, false, adapterScope) || !current(context)) return;
    return runRange(context, ...rangeFor(context, scope));
  }

  async function recalculate(scope, event = null) {
    const { context, adapterScope } = commandContext(event);
    const adapterContext = adapterContextFor(adapterScope);
    if (adapterContext) {
      if (!adapterCurrent(adapterContext, adapterScope)) return;
      getIntegration().clearAdapterResults(adapterScope.services());
      const restarted = () => {
        if (adapterCurrent(adapterContext, adapterScope)) adapterRun(scope, false, adapterScope);
      };
      if (adapterContext.kernel) return adapterContext.kernel.restart(restarted);
      return restarted();
    }
    if (!current(context)) return;
    const range = rangeFor(context, scope);
    const grammar = context.editor.getGrammar();
    let changed = false;
    const subscription = context.editor.getBuffer().onWillChange(() => {
      changed = true;
    });
    let running;
    try {
      require("./result").clearResults(context);
      const restarted = () => {
        if (!current(context) || changed || context.editor.getGrammar() !== grammar) return;
        running = runRange(context, ...range);
      };
      if (context.kernel) await context.kernel.restart(restarted);
      else restarted();
      if (running) return await running;
    } finally {
      subscription.dispose();
    }
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
