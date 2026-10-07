const { cancelAutocomplete } = require("../../utils");
const {
  captureEditorContext,
  filePathForEditor,
  kernelForEditor,
} = require("../../execution-context");
const { createReceipt, refused } = require("../../execution-receipt");

/** One explicit invocation contract for source files and notebook targets. */
function provideJupyterExecution({ store, kernelManager, getAdapterServices, onDidRemoveAdapter }) {
  const pending = new Set();
  let active = true;
  const adapterRemoval = onDidRemoveAdapter?.((provider) => {
    for (const run of [...pending]) {
      if (run.adapterProvider === provider)
        run.finish({ status: "unavailable", reason: "notebook adapter provider retired" });
    }
  });
  return {
    async execute(request = {}) {
      if (!active) return refused("execution provider retired");
      const { item, editor, owner, signal, scope = "active", moveDown = false } = request;
      if (
        signal?.aborted ||
        owner?.isDestroyed?.() ||
        item?.isDestroyed?.() ||
        editor?.isDestroyed?.()
      )
        return refused("execution owner unavailable");
      const adapters = getAdapterServices();
      const provider = item && adapters.find((service) => service.getAdapterForItem?.(item));
      const adapter = provider?.getAdapterForItem(item);
      if (adapter) {
        const targetOwner = adapter.getKernelOwner?.();
        if (owner && owner !== targetOwner) return refused("notebook owner changed");
        let run;
        run = createReceipt({
          owner: targetOwner || item,
          signal,
          onSettled: () => pending.delete(run),
        });
        pending.add(run);
        run.adapterProvider = provider;
        const integration = require("../../adapter-integration");
        const kernel = integration.getKernelForAdapter(adapter);
        const current = () =>
          active &&
          run.isAlive() &&
          getAdapterServices().includes(provider) &&
          !targetOwner?.isDestroyed?.() &&
          (!kernel || integration.getKernelForAdapter(adapter) === kernel);
        const start = async () => {
          if (!current())
            return run.finish({ status: "cancelled", reason: "notebook binding changed" });
          if (request.clear) integration.clearAdapterResults(adapters, adapter);
          if (request.restart && kernel && !(await kernel.restart())) {
            run.finish({ status: "unavailable", reason: "kernel restart failed" });
            return;
          }
          if (!current())
            return run.finish({ status: "cancelled", reason: "notebook binding changed" });
          integration.runAdapterTargets(adapters, kernelManager, {
            scope,
            moveDown,
            adapter,
            adapterProvider: provider,
            targets: request.targets,
            autocompleteCancelled: request.autocompleteCancelled,
            isCurrent: current,
            onComplete: run.finish,
            signal: run.signal,
          });
        };
        void start().catch((error) => run.finish({ status: "error", error }));
        return run.receipt;
      }
      if (item && item !== editor) return refused("no adapter owns the item");
      if (!editor || !Array.isArray(request.blocks) || !request.blocks.length)
        return refused("no executable source");
      const blocks = request.blocks
        .filter((block) => block?.cellType === "code" || block?.cellType === "markdown")
        .map((block) => ({ ...block }));
      if (!blocks.length) return { accepted: true, done: Promise.resolve({ status: "ok" }) };
      const captured = captureEditorContext(store, editor);
      if (captured && request.grammar) {
        captured.grammar = request.grammar;
        captured.kernel = kernelForEditor(editor, store, request.grammar);
      }
      if (
        !captured ||
        captured.editor !== editor ||
        captured.kernel?._destroyed ||
        captured.kernel?.destroyed
      )
        return refused("source context unavailable");
      let run;
      run = createReceipt({ owner: editor, signal, onSettled: () => pending.delete(run) });
      pending.add(run);
      if (!request.autocompleteCancelled) cancelAutocomplete(editor);
      if (moveDown && blocks.length)
        require("../../code-manager").moveDown(editor, blocks.at(-1).row);
      const source = editor.getText();
      const grammar = captured.grammar;
      const baseGrammar = editor.getGrammar();
      let expectedKernel = captured.kernel;
      const current = () =>
        active &&
        run.isAlive() &&
        !editor.isDestroyed?.() &&
        editor.getText() === source &&
        editor.getGrammar() === baseGrammar &&
        !expectedKernel?._destroyed &&
        !expectedKernel?.destroyed &&
        kernelForEditor(editor, store, grammar) === expectedKernel;
      const dispatch = async (kernel, selected) => {
        if (!current()) return { status: "cancelled", success: false };
        const markers =
          store.markersMapping.get(editor.id) || store.newMarkerStore(editor.id, editor);
        const result = require("../../result");
        if (selected.length === 1) {
          const outcome = await result.createResultAsync(
            { editor, kernel, markers },
            { ...selected[0], signal: run.signal },
          );
          return outcome;
        }
        return result.createResultBatch(
          { editor, kernel, markers },
          selected.map((block) => ({ ...block, signal: run.signal })),
        );
      };
      const start = async () => {
        let kernel = captured.kernel;
        if (request.clear) {
          const markers = store.markersMapping.get(editor.id);
          require("../../result").clearResults({ kernel, markers });
        }
        if (request.restart && kernel && !(await kernel.restart()))
          return run.finish({ status: "unavailable", reason: "kernel restart failed" });
        if (!current()) return run.finish({ status: "cancelled", reason: "source changed" });
        const firstCode = blocks.findIndex((block) => block.cellType === "code");
        if (firstCode !== -1 && !kernel) {
          if (!grammar || !captured.filePath)
            return run.finish({ status: "unavailable", reason: "no kernel grammar" });
          if (firstCode > 0) {
            const leading = await dispatch(null, blocks.slice(0, firstCode));
            if (!leading.success) return run.finish(leading);
          }
          kernel = await kernelManager.startKernelFor(
            grammar,
            editor,
            filePathForEditor(editor),
            null,
            {
              signal: run.signal,
              isCurrent: current,
            },
          );
          if (!kernel)
            return run.finish({ status: "cancelled", reason: "kernel selection cancelled" });
          expectedKernel = kernel;
          if (!current()) return run.finish({ status: "cancelled", reason: "source changed" });
          return run.finish(await dispatch(kernel, blocks.slice(firstCode)));
        }
        run.finish(await dispatch(kernel, blocks));
      };
      void start().catch((error) => run.finish({ status: "error", error }));
      return run.receipt;
    },
    dispose() {
      active = false;
      adapterRemoval?.dispose();
      for (const run of [...pending])
        run.finish({ status: "unavailable", reason: "provider retired" });
    },
  };
}

module.exports = { provideJupyterExecution };
