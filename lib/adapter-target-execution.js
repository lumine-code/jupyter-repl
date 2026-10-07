const MarkerStore = require("./store/markers");
const {
  terminateEditorPendingState,
  cancelAutocomplete,
  formatElapsedTime,
  NO_EXECTIME_STRING,
} = require("./utils");

const PERSISTABLE_OUTPUT_TYPES = new Set(["execute_result", "display_data", "stream", "error"]);
const publicSession = (kernel) => (kernel ? kernel.getPluginWrapper() : null);

/** Own running target records and editor marker resources for one integration. */
class AdapterTargetExecution {
  runningTargets = new Map();
  markerStores = new Map();

  constructor(ports) {
    this.ports = ports;
    this.store = ports.store;
    this.documents = ports.documents;
  }

  hasRunningTargets(owner) {
    return Boolean(this.runningTargets.get(owner)?.size > 0);
  }

  detachRunning() {
    const running = this.runningTargets;
    this.runningTargets = new Map();
    for (const records of running.values()) {
      for (const record of records) record.suppressAdapterCallbacks = true;
    }
    return running;
  }

  cancelAll(running = this.detachRunning()) {
    for (const records of running.values()) {
      for (const record of records) {
        record.suppressAdapterCallbacks = true;
        record.cancelReason = "package deactivated";
        record.cancelExecution("package deactivated");
      }
    }
  }

  detachMarkers() {
    const records = [...this.markerStores.values()];
    this.markerStores = new Map();
    return records;
  }

  clearMarkers(records = this.detachMarkers()) {
    for (const record of records) {
      record.subscription?.dispose?.();
      record.subscription = null;
      record.markers.clear();
    }
  }

  getMarkerStore(editor) {
    if (!editor) return null;
    const key = editor.id || editor;
    let record = this.markerStores.get(key);
    if (!record) {
      record = { editor, markers: new MarkerStore(), subscription: null };
      this.markerStores.set(key, record);
      record.subscription = editor.onDidDestroy?.(() => {
        if (this.markerStores.get(key) !== record) return;
        this.markerStores.delete(key);
        record.subscription?.dispose?.();
        record.subscription = null;
        record.markers.clear();
      });
    }
    return record.markers;
  }

  getExistingMarkerStore(editor) {
    if (!editor) return null;
    return this.markerStores.get(editor.id || editor)?.markers || null;
  }

  persistTargetResult(adapter, target, result) {
    if (!result) return;

    if (result.stream === "execution_count") {
      adapter.setTargetExecutionCount?.(target, result.data);
      return;
    }

    if (result.stream === "status" || result.output_type === "status") {
      return;
    }

    if (result.output_type === "execute_input") {
      if (result.execution_count != null) {
        adapter.setTargetExecutionCount?.(target, result.execution_count);
      }
      return;
    }

    if (PERSISTABLE_OUTPUT_TYPES.has(result.output_type) || result.output_type === "clear_output") {
      adapter.appendTargetOutput?.(target, result);
    }
  }

  isExecutableTarget(target) {
    if (!target) return false;
    if (target.executable === false) return false;
    if (target.type === "markdown" || target.type === "raw") return false;
    return true;
  }

  targetRecordId(target) {
    return String(target?.id ?? target?.index ?? "");
  }

  adapterExecutionKey(adapter) {
    return this.documents.getAdapterOwner(adapter);
  }

  providerForContext(context) {
    if (context?.adapterProvider) return context.adapterProvider;
    return (
      context?.adapterServices?.find((provider) => {
        const adapter =
          provider.getAdapterForItem?.(context.paneItem) || provider.getActiveAdapter?.();
        return adapter && this.documents.getAdapterOwner(adapter) === context.owner;
      }) || null
    );
  }

  registerRunningTarget(adapter, kernel, target, { context, signal } = {}) {
    const adapterKey = this.adapterExecutionKey(adapter);
    if (!this.targetRecordId(target)) return null;

    if (!this.runningTargets.has(adapterKey)) {
      this.runningTargets.set(adapterKey, new Set());
    }

    const controller = new AbortController();
    let resolveCancellation;
    const cancellation = new Promise((resolve) => {
      resolveCancellation = resolve;
    });
    const record = {
      adapter,
      provider: this.providerForContext(context),
      owner: adapterKey,
      generation: this.documents.generation,
      records: this.runningTargets.get(adapterKey),
      kernel,
      target,
      cancellation,
      signal: controller.signal,
      lease: null,
      retired: false,
      disposeLease: () => {
        const lease = record.lease;
        record.lease = null;
        try {
          lease?.dispose();
        } catch (error) {
          console.error("jupyter-repl: target execution lease disposal failed:", error);
        }
      },
      adoptLease: (lease) => {
        if (!lease || typeof lease.dispose !== "function")
          throw new TypeError("Notebook adapter beginTargetExecution must return a Disposable.");
        record.lease = lease;
        if (record.retired || controller.signal.aborted || !this.canNotifyRecord(record))
          record.disposeLease();
      },
      cancelExecution: (reason = "cancelled") => {
        if (controller.signal.aborted) return;
        record.cancelReason = reason;
        record.retired = true;
        controller.abort();
        resolveCancellation({ cancelled: true, reason });
        record.disposeLease();
      },
      cancelReason: null,
    };
    const cancel = () => record.cancelExecution("observation cancelled");
    signal?.addEventListener("abort", cancel, { once: true });
    record.dispose = () => signal?.removeEventListener("abort", cancel);
    if (signal?.aborted) cancel();
    this.runningTargets.get(adapterKey).add(record);
    try {
      if (!controller.signal.aborted && adapter.beginTargetExecution)
        record.adoptLease(adapter.beginTargetExecution(target, { kernel: publicSession(kernel) }));
    } catch (error) {
      this.removeRunningTarget(record);
      throw error;
    }
    return record;
  }

  removeRunningTarget(record) {
    record.retired = true;
    record.dispose();
    record.records.delete(record);
    if (this.runningTargets.get(record.owner) === record.records && record.records.size === 0) {
      this.runningTargets.delete(record.owner);
    }
  }

  canNotifyRecord(record) {
    return (
      !record.suppressAdapterCallbacks &&
      this.documents.active &&
      record.generation === this.documents.generation &&
      !this.documents.ownerIsDestroyed(record.owner) &&
      this.documents.getAdapterOwner(record.adapter) === record.owner
    );
  }

  canRunTarget(context, record = null) {
    return (
      this.documents.adapterContextIsAlive(context) &&
      (!record || (this.canNotifyRecord(record) && !record.cancelReason))
    );
  }

  cancelledOutcome(kernel, record) {
    return {
      cancelled: true,
      reason: record?.cancelReason || "cancelled",
      kernel,
      status: "cancelled",
      lastExecutionTime: NO_EXECTIME_STRING,
    };
  }

  finishRunningTarget(record, result) {
    if (!record) return;

    this.removeRunningTarget(record);
    try {
      if (!this.canNotifyRecord(record)) return;
      result = { ...result, kernel: publicSession(result.kernel) };
      if (result.status === "cancelled") {
        record.adapter.cancelTargetExecution?.(record.target, result);
      } else if (result.status === "failed") {
        record.adapter.failTargetExecution?.(record.target, result);
      } else if (result.status === "skipped") {
        record.adapter.skipTargetExecution?.(record.target, result);
      }
      if (this.canNotifyRecord(record))
        record.adapter.finishTargetExecution?.(record.target, result);
    } finally {
      record.disposeLease();
    }
  }

  cancelAdapterTargets(adapter, kernel, reason) {
    this.cancelOwnerTargets(this.adapterExecutionKey(adapter), kernel, reason);
  }

  cancelProviderTargets(provider) {
    const running = [...this.runningTargets.values()].flatMap((records) => [...records]);
    for (const record of running) {
      if (record.provider !== provider) continue;
      record.suppressAdapterCallbacks = true;
      record.cancelExecution("notebook adapter provider retired");
    }
  }

  cancelOwnerTargets(owner, kernel, reason) {
    const records = this.runningTargets.get(owner);
    if (!records) return;

    for (const record of [...records]) {
      if (kernel && record.kernel !== kernel) continue;
      record.cancelReason = reason;
      record.cancelExecution(reason);
    }
  }

  getRunTargets(adapter, scope) {
    const targets = adapter.getRunTargets?.(scope) || [];
    if (targets.length > 0 || scope !== "selected") {
      return targets;
    }
    const target = adapter.getRunTarget?.(adapter.getActiveTargetId?.());
    return target ? [target] : [];
  }

  getEditorRunTargets(adapter, moveDown) {
    const baseTarget = adapter.getRunTarget?.(adapter.getActiveTargetId?.());
    const editor = baseTarget?.editor;
    if (!baseTarget || !editor) return [];
    if (baseTarget.type && baseTarget.type !== "code") {
      return [
        {
          ...baseTarget,
          source: "",
          row: baseTarget.row || 0,
        },
      ];
    }

    const codeManager = require("./code-manager");
    const cellMagic = require("./cell-magic");
    const analysisContext = { kernel: this.ports.getKernelForAdapter(adapter) };
    const pythonKernel =
      adapter.getKernelLanguage?.() === "python" ||
      adapter.getKernelGrammar?.()?.scopeName?.startsWith("source.python");
    const targets = [];

    for (const selection of editor.getSelections()) {
      const codeBlock =
        (pythonKernel && cellMagic.selectionBlock(editor, selection)) ||
        codeManager.findCodeBlock(editor, selection, analysisContext);
      if (!codeBlock || codeBlock.code === null) continue;

      targets.push({
        ...baseTarget,
        source: codeBlock.code,
        row: codeBlock.row,
      });
    }

    if (moveDown && targets.length > 0) {
      codeManager.moveDown(editor, targets[targets.length - 1].row);
    }

    return targets;
  }

  focusNextAdapterTarget(adapter, target) {
    if (!target) return;
    const nextTarget =
      adapter.getNextRunTarget?.(target) ||
      (typeof target.id === "number" ? adapter.getRunTarget?.(target.id + 1) : null);
    if (nextTarget) {
      adapter.focusTarget?.(nextTarget);
    }
  }

  shouldUpdateActiveTargetForRun(scope) {
    return scope === "active" || scope === "editor";
  }

  runAdapterTargets(
    adapterService,
    kernelManager,
    {
      scope = "selected",
      moveDown = false,
      autocompleteCancelled = false,
      adapter: explicitAdapter = null,
      adapterProvider = null,
      targets: capturedTargets = null,
      isCurrent = () => true,
      onComplete = () => {},
      signal,
    } = {},
  ) {
    const adapter = explicitAdapter || this.documents.getActiveAdapter(adapterService);
    let completed = false;
    const complete = (outcome) => {
      if (completed) return;
      completed = true;
      onComplete(outcome);
    };
    if (!adapter) {
      complete({ status: "unavailable", reason: "adapter unavailable" });
      return false;
    }
    const kernelContext = this.documents.captureAdapterKernelContext(adapterService, adapter);
    if (kernelContext) kernelContext.adapterProvider = adapterProvider;
    if (kernelContext) kernelContext.requestIsCurrent = isCurrent;
    if (!autocompleteCancelled) cancelAutocomplete(kernelContext?.editor);
    if (!kernelContext || !isCurrent()) {
      complete({ status: "cancelled", reason: "owner unavailable" });
      return true;
    }

    const targets =
      capturedTargets ||
      (scope === "editor"
        ? this.getEditorRunTargets(adapter, moveDown)
        : this.getRunTargets(adapter, scope));
    const executableTargets = targets.filter((target) => this.isExecutableTarget(target));
    if (targets.length === 0 || executableTargets.length === 0) {
      const activeTarget = adapter.getRunTarget?.(adapter.getActiveTargetId?.());
      const kernelTarget = this.documents.getAdapterKernelTarget(adapter);
      const kernelEditor = kernelTarget?.editor;
      if (targets.length === 0 && kernelContext) {
        if (kernelEditor) terminateEditorPendingState(kernelEditor);
        this.ports.checkForKernel(kernelManager, kernelContext, () => {});
      }
      if (targets.length > 0) {
        for (const target of targets) {
          if (!this.documents.adapterContextIsAlive(kernelContext)) break;
          adapter.skipTargetExecution?.(target, { reason: "not-executable" });
          if (!this.documents.adapterContextIsAlive(kernelContext)) break;
          adapter.finishTargetExecution?.(target, {
            success: true,
            status: "skipped",
            reason: "not-executable",
          });
        }
      }
      if (this.documents.adapterContextIsAlive(kernelContext) && moveDown && activeTarget) {
        this.focusNextAdapterTarget(adapter, activeTarget);
      }
      complete({ status: "ok" });
      return true;
    }
    const persistResults = scope !== "editor";

    const firstTarget = executableTargets[0];
    const firstEditor = firstTarget.editor;
    if (!firstEditor || !kernelContext) {
      complete({ status: "unavailable", reason: "target editor unavailable" });
      return true;
    }
    const shouldUpdateActiveTarget = this.shouldUpdateActiveTargetForRun(scope);

    const executeTargets = async (kernel, executionAdapter = adapter) => {
      if (!kernel || !isCurrent() || !this.documents.adapterContextIsAlive(kernelContext)) {
        complete({ status: "cancelled", reason: "kernel selection cancelled" });
        return;
      }
      const result = require("./result");
      let finalStatus = "ok";
      let finalOutcome = { status: "ok" };

      const clearedTargets = new Set();
      for (const capturedTarget of targets) {
        if (!isCurrent() || !this.documents.adapterContextIsAlive(kernelContext)) {
          finalStatus = "cancelled";
          break;
        }
        const liveTarget = executionAdapter.getRunTarget?.(capturedTarget.id);
        if (!liveTarget || liveTarget.editor?.isDestroyed?.()) continue;
        const target = {
          ...capturedTarget,
          type: liveTarget.type,
          executable: liveTarget.executable,
          editor: liveTarget.editor,
        };
        if (!this.isExecutableTarget(target)) {
          executionAdapter.skipTargetExecution?.(target, { reason: "not-executable" });
          if (this.documents.adapterContextIsAlive(kernelContext))
            executionAdapter.finishTargetExecution?.(target, {
              success: true,
              status: "skipped",
              reason: "not-executable",
            });
          continue;
        }

        const editor = target.editor;
        if (!editor) continue;
        terminateEditorPendingState(editor);

        const markers = this.getMarkerStore(editor);
        const code = target.source || "";
        const row = target.row == null ? Math.max(0, editor.getLastBufferRow?.() || 0) : target.row;

        if (shouldUpdateActiveTarget) {
          executionAdapter.setActiveTargetId?.(target.id);
        }
        if (!this.documents.adapterContextIsAlive(kernelContext)) break;
        if (persistResults && !clearedTargets.has(target.id)) {
          executionAdapter.clearTargetOutputs?.(target);
          clearedTargets.add(target.id);
        }
        if (!this.documents.adapterContextIsAlive(kernelContext)) break;
        this.store.updateEditor(editor);
        if (!this.documents.adapterContextIsAlive(kernelContext)) break;
        this.store.setExternalKernel(kernel, this.documents.getAdapterContext(executionAdapter));
        if (!this.documents.adapterContextIsAlive(kernelContext)) break;

        let success = false;
        let status = "error";
        let durationMs = null;
        let executionPromise;
        let executionResult = null;
        const runningTarget = this.registerRunningTarget(executionAdapter, kernel, target, {
          context: kernelContext,
          signal,
        });
        try {
          executionPromise = this.canRunTarget(kernelContext, runningTarget)
            ? result.createResultAsync(
                { editor, kernel, markers },
                {
                  code,
                  signal: runningTarget?.signal || signal,
                  row,
                  cellType: "code",
                  inline: !persistResults,
                  onResult: persistResults
                    ? (kernelResult) => {
                        if (this.canRunTarget(kernelContext, runningTarget)) {
                          this.persistTargetResult(executionAdapter, target, kernelResult);
                        }
                      }
                    : null,
                },
              )
            : Promise.resolve(this.cancelledOutcome(kernel, runningTarget));
          if (
            this.canRunTarget(kernelContext, runningTarget) &&
            moveDown &&
            scope !== "editor" &&
            capturedTarget === targets[targets.length - 1]
          ) {
            this.focusNextAdapterTarget(executionAdapter, target);
          }
          executionResult = runningTarget
            ? await Promise.race([executionPromise, runningTarget.cancellation])
            : await executionPromise;
          if (executionResult?.cancelled || !this.canRunTarget(kernelContext, runningTarget)) {
            success = false;
            status = "cancelled";
          } else {
            success = executionResult?.success === true;
            status = executionResult?.status || (success ? "ok" : "error");
            durationMs = executionResult?.durationMs ?? null;
          }
        } catch (error) {
          success = false;
          status = "failed";
          if (this.documents.adapterContextIsAlive(kernelContext))
            this.ports.notifications().addError("Notebook cell execution failed", {
              description: error.message || String(error),
              dismissable: true,
            });
        } finally {
          const finishResult = {
            ...executionResult,
            kernel,
            // This execution's own duration — the kernel's shared field can
            // name another client's cell on a shared kernel. The sentinel is
            // filtered out by the notebook view, keeping the previous text.
            lastExecutionTime:
              durationMs === null ? NO_EXECTIME_STRING : formatElapsedTime(durationMs),
            success,
            status,
          };
          finalOutcome = { ...finishResult, kernel: publicSession(kernel) };
          if (runningTarget) {
            this.finishRunningTarget(runningTarget, finishResult);
          } else if (this.documents.adapterContextIsAlive(kernelContext)) {
            executionAdapter.finishTargetExecution?.(target, {
              ...finishResult,
              kernel: publicSession(kernel),
            });
          }
        }

        if (!success) {
          finalStatus = status === "failed" ? "error" : status;
          break;
        }
      }
      complete({ ...finalOutcome, status: isCurrent() ? finalStatus : "cancelled" });
    };
    const checking = this.ports.checkForKernel(kernelManager, kernelContext, (...args) => {
      void executeTargets(...args).catch((error) => complete({ status: "error", error }));
    });
    checking?.catch?.((error) => complete({ status: "error", error }));

    return true;
  }

  clearAdapterResults(adapterService, explicitAdapter = null) {
    const adapter = explicitAdapter || this.documents.getActiveAdapter(adapterService);
    if (!adapter) return false;

    const targets = adapter.getRunTargets?.("all") || [];
    const fallbackTarget = adapter.getRunTarget?.(adapter.getActiveTargetId?.());
    const editors = new Set(
      (targets.length > 0 ? targets : fallbackTarget ? [fallbackTarget] : [])
        .map((target) => target.editor)
        .filter(Boolean),
    );

    for (const editor of editors) {
      this.getExistingMarkerStore(editor)?.clear();
    }

    return true;
  }

  getAdapterFocusedEditor(adapterService) {
    const adapter = this.documents.getActiveAdapter(adapterService);
    if (!adapter) return null;
    return this.documents.getAdapterKernelTarget(adapter)?.editor || null;
  }

  async runExplicitAdapterTarget(
    adapterServices,
    adapter,
    kernel,
    target,
    onResult,
    { signal } = {},
  ) {
    const context = this.documents.captureAdapterKernelContext(adapterServices, adapter);
    if (!context || !this.documents.adapterContextIsAlive(context))
      throw new Error("The notebook is no longer available.");
    if (!this.providerForContext(context))
      throw new Error("The notebook adapter provider is unavailable.");
    if (this.ports.getKernelForAdapter(adapter) !== kernel)
      throw new Error("The requested kernel is not bound to this notebook.");
    const liveTarget = adapter.getRunTarget?.(target.id);
    if (
      !liveTarget ||
      liveTarget.source !== target.source ||
      !this.isExecutableTarget(liveTarget)
    ) {
      throw new Error("The notebook cell changed before execution.");
    }
    const current = { ...liveTarget };
    const record = this.registerRunningTarget(adapter, kernel, current, { context, signal });
    let outcome = { success: false, status: "failed" };
    try {
      if (!this.canRunTarget(context, record)) {
        outcome = this.cancelledOutcome(kernel, record);
        return outcome;
      }
      adapter.clearTargetOutputs?.(current);
      if (!this.canRunTarget(context, record)) {
        outcome = this.cancelledOutcome(kernel, record);
        return outcome;
      }
      const execution = require("./result").createResultAsync(
        {
          editor: current.editor,
          kernel,
          markers: this.getMarkerStore(current.editor),
        },
        {
          code: current.source || "",
          row: current.row,
          cellType: "code",
          signal: record?.signal || signal,
          inline: false,
          onResult: (result) => {
            if (this.canRunTarget(context, record)) {
              this.persistTargetResult(adapter, current, result);
              if (this.canRunTarget(context, record)) onResult?.(result);
            }
          },
        },
      );
      const result = record
        ? await Promise.race([execution, record.cancellation])
        : await execution;
      outcome = !this.canRunTarget(context, record)
        ? this.cancelledOutcome(kernel, record)
        : {
            ...result,
            kernel,
            status: result.cancelled
              ? "cancelled"
              : result.status || (result.success ? "ok" : "error"),
            lastExecutionTime:
              result.durationMs == null ? NO_EXECTIME_STRING : formatElapsedTime(result.durationMs),
          };
      return outcome;
    } finally {
      if (record) this.finishRunningTarget(record, outcome);
      else if (this.documents.adapterContextIsAlive(context))
        adapter.finishTargetExecution?.(current, outcome);
    }
  }
}

module.exports = AdapterTargetExecution;
