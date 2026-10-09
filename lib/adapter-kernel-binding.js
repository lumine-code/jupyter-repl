/**
 * Own pending document bindings and the local-kernel picker. Document lifetime
 * and target execution are ports, so binding transactions own no pane or cell
 * resources and cannot outlive the captured integration generation.
 */
class AdapterKernelBinding {
  pendingBindings = new Set();
  picker = null;
  settlePicker = null;
  disposedKernels = new WeakSet();

  constructor(ports) {
    this.ports = ports;
    this.store = ports.store;
    this.documents = ports.documents;
  }

  detachPicker() {
    const snapshot = { settle: this.settlePicker, picker: this.picker };
    this.settlePicker = null;
    this.picker = null;
    return snapshot;
  }

  disposePicker({ settle, picker } = this.detachPicker()) {
    settle?.(null);
    picker?.destroy?.();
  }

  detachPending() {
    const pending = this.pendingBindings;
    this.pendingBindings = new Set();
    return pending;
  }

  clearPending(pending = this.detachPending()) {
    pending.clear();
  }

  normalizeLanguage(language) {
    return String(language || "")
      .trim()
      .toLowerCase();
  }

  getAdapterKernelLanguage(adapter, kernelSpec = null) {
    return this.normalizeLanguage(adapter.getKernelLanguage(kernelSpec));
  }

  getPlainTextGrammar() {
    return this.ports.plainTextGrammar();
  }

  getAdapterKernelGrammar(adapter, kernelSpec = null) {
    return adapter.getKernelGrammar(kernelSpec) || this.getPlainTextGrammar();
  }

  adapterKernelIsBusy(context, candidate = null) {
    const mappedKernel = this.documents.getMappedKernel(
      this.documents.getAdapterKey(context.adapter),
    );
    return Boolean(
      mappedKernel &&
      mappedKernel !== candidate &&
      (mappedKernel.executionState === "busy" || this.ports.hasRunningTargets(context.owner)),
    );
  }

  warnAdapterKernelBusy() {
    this.ports.notifications().addWarning("The notebook kernel is busy", {
      description: "Wait for the current execution to finish before changing kernels.",
    });
  }

  async getPreferredKernelSpec(kernelManager, adapter) {
    const metadata = adapter.getMetadata?.() || {};
    const kernelspec = metadata.kernelspec || {};
    const preferred = [kernelspec.name, kernelspec.display_name].filter(Boolean);
    if (preferred.length === 0) return null;

    const kernelSpecs = await kernelManager.getAllKernelSpecs();
    return (
      kernelSpecs.find((spec) => preferred.includes(spec.name)) ||
      kernelSpecs.find((spec) => preferred.includes(spec.display_name)) ||
      null
    );
  }

  adapterKernelMatchesMetadata(adapter, kernel) {
    const expected = this.getAdapterKernelLanguage(adapter);
    const actual = this.getAdapterKernelLanguage(adapter, {
      ...(kernel?.kernelSpec || {}),
      language: kernel?.language,
    });
    return !expected || !actual || expected === actual;
  }

  disposeUnboundKernel(kernel) {
    if (!kernel || this.disposedKernels.has(kernel)) return;
    this.disposedKernels.add(kernel);
    const key = kernel?.transport?.startingKernelKey || kernel?.kernelSpec?.display_name;
    const pending = this.store.startingKernels.get(key);
    if (pending && (pending === kernel || pending === kernel?.transport)) {
      this.store.startingKernels.delete(key);
    }
    if (kernel?.transport?.ownsKernelProcess === false) {
      kernel.destroy?.();
    } else {
      kernel?.shutdownAndDestroy?.();
    }
  }

  adapterKernelChangeIsPending(context) {
    return this.pendingBindings.has(context?.owner);
  }

  warnAdapterKernelChangePending() {
    this.ports.notifications().addWarning("A notebook kernel change is already in progress");
  }

  async bindAdapterKernel(context, kernel, { owned = false } = {}) {
    if (!context?.adapter || !kernel) return false;
    context = this.documents.refreshAdapterKernelContext(context);
    if (!context || !this.documents.adapterContextIsAlive(context)) {
      if (owned) this.disposeUnboundKernel(kernel);
      return false;
    }

    if (this.adapterKernelIsBusy(context, kernel)) {
      this.warnAdapterKernelBusy();
      if (owned) this.disposeUnboundKernel(kernel);
      return false;
    }
    const bindingOwner = context.owner;
    const pending = this.pendingBindings;
    if (pending.has(bindingOwner)) {
      if (owned) this.disposeUnboundKernel(kernel);
      this.warnAdapterKernelChangePending();
      return false;
    }
    pending.add(bindingOwner);

    const adapter = context.adapter;
    const filePath = this.documents.getAdapterKey(adapter);
    const previousKernel = this.documents.getMappedKernel(filePath);
    const kernelSpec = kernel.kernelSpec;
    const kernelWasRunning = this.store.runningKernels.includes(kernel);
    let registration = null;
    let contextWasInvalidated = false;

    try {
      const effectiveKernelSpec = {
        ...kernelSpec,
        language: kernel.language || kernelSpec.language,
      };
      const grammar = this.getAdapterKernelGrammar(adapter, effectiveKernelSpec);
      registration = this.store.prepareNotebookKernel(kernel, filePath);
      const metadataUpdated = adapter.setKernelSpec(kernelSpec, kernel.languageInfo || null);
      if (metadataUpdated && typeof metadataUpdated.then === "function") {
        throw new TypeError("Notebook adapter setKernelSpec must complete synchronously.");
      }
      if (metadataUpdated === false) {
        throw new Error("The notebook document refused the kernel metadata update.");
      }
      const refreshedContext = this.documents.refreshAdapterKernelContext(context);
      if (!refreshedContext || !this.documents.adapterContextIsAlive(refreshedContext)) {
        contextWasInvalidated = true;
        throw new Error("The notebook was closed while the kernel was being connected.");
      }
      context = refreshedContext;
      registration.filePath = this.documents.getAdapterKey(context.adapter);
      if (!kernelWasRunning && kernel.transport) kernel.transport.grammar = grammar;
      if (!this.store.commitNotebookKernel(registration)) {
        throw new Error("The notebook kernel binding was superseded before it could be committed.");
      }
      const committedContext = this.documents.refreshAdapterKernelContext(context);
      if (!committedContext || !this.documents.adapterContextIsAlive(committedContext)) {
        contextWasInvalidated = true;
        throw new Error("The notebook became unavailable while the kernel was being connected.");
      }
      context = committedContext;
      this.store.setExternalKernel(kernel, this.documents.getAdapterContext(context.adapter));
    } catch (error) {
      const ownerWasDestroyed = this.documents.ownerIsDestroyed(bindingOwner);
      if (!ownerWasDestroyed) this.store.rollbackNotebookKernel(registration);
      if (
        owned &&
        (!this.store.runningKernels.includes(kernel) ||
          this.store.getFilesForKernel(kernel).length === 0)
      )
        this.disposeUnboundKernel(kernel);
      if (
        (ownerWasDestroyed || registration?.committed) &&
        previousKernel &&
        previousKernel !== kernel &&
        this.store.getFilesForKernel(previousKernel).length === 0
      ) {
        this.disposeUnboundKernel(previousKernel);
      }
      if (!ownerWasDestroyed && !contextWasInvalidated) {
        this.ports.notifications().addError("Failed to bind notebook kernel", {
          description: error.message || String(error),
          dismissable: true,
        });
      }
      return false;
    } finally {
      pending.delete(bindingOwner);
    }

    if (
      previousKernel &&
      previousKernel !== kernel &&
      this.store.getFilesForKernel(previousKernel).length === 0
    ) {
      this.disposeUnboundKernel(previousKernel);
    }
    return true;
  }

  startLocalAdapterKernel(kernelManager, context, kernelSpec, callback = null) {
    context = this.documents.refreshAdapterKernelContext(context);
    if (!kernelSpec || !context || !this.documents.adapterContextIsAlive(context))
      return callback?.(null);
    if (this.adapterKernelChangeIsPending(context)) {
      this.warnAdapterKernelChangePending();
      return callback?.(null);
    }
    if (this.adapterKernelIsBusy(context)) {
      this.warnAdapterKernelBusy();
      return callback?.(null);
    }

    const adapter = context.adapter;
    const grammar = this.getAdapterKernelGrammar(adapter, kernelSpec);
    const filePath = this.documents.getAdapterKey(adapter);
    let settled = false;
    let lifecycleSubscription = null;
    const finish = (...args) => {
      if (settled) return;
      settled = true;
      lifecycleSubscription?.dispose();
      callback?.(...args);
    };
    const transport = kernelManager.startKernel(
      kernelSpec,
      grammar,
      context.editor || context.owner,
      filePath,
      (kernel) => {
        if (!kernel) return finish(null);
        void this.bindAdapterKernel(context, kernel, { owned: true })
          .then((bound) => {
            const liveContext = bound && this.documents.refreshAdapterKernelContext(context);
            finish(liveContext ? kernel : null, liveContext?.adapter);
          })
          .catch((error) => {
            finish(null);
            this.ports.notifications().addError("Failed to bind notebook kernel", {
              description: error.message || String(error),
            });
          });
      },
      {
        bindingOwner: context.owner,
        deferRegistration: true,
        startKey: context.owner,
      },
    );
    if (settled) return;
    if (!transport) return finish(null);
    lifecycleSubscription = transport.onDidChangeLifecycle?.((state) => {
      if (state === "dead") finish(null);
    });
    if (transport.lifecycle === "dead") finish(null);
  }

  showAdapterKernelPicker(kernelManager, context, kernelSpecs, callback) {
    if (this.picker?.selectListHost?.isVisible()) {
      this.picker.selectListHost.cancel();
      callback(null);
      return;
    }

    if (this.settlePicker) this.settlePicker(null);
    if (this.picker) {
      this.picker.kernelSpecs = kernelSpecs;
    } else {
      const KernelPicker = this.ports.loadKernelPicker();
      this.picker = new KernelPicker(kernelSpecs, { allowKernelComment: false });
    }

    const picker = this.picker;
    let settled = false;
    const settle = (kernelSpec) => {
      if (settled) return;
      settled = true;
      if (this.settlePicker === settle) this.settlePicker = null;
      picker.onConfirmed = null;
      picker.onCancelled = null;
      callback(kernelSpec);
    };
    this.settlePicker = settle;
    this.picker.onConfirmed = (kernelSpec) => settle(kernelSpec);
    this.picker.onCancelled = () => settle(null);
    this.picker.onUpdate = () => kernelManager.updateKernelSpecs(null, true);
    this.picker.toggle();
  }

  async chooseAdapterKernelSpec(kernelManager, context) {
    const preferred = await this.getPreferredKernelSpec(kernelManager, context.adapter);
    if (!this.documents.adapterContextIsAlive(context)) return null;
    if (preferred) return preferred;

    const kernelSpecs = await kernelManager.getAllKernelSpecs();
    if (!this.documents.adapterContextIsAlive(context)) return null;
    const language = this.getAdapterKernelLanguage(context.adapter);
    const matching = language
      ? kernelSpecs.filter(
          (spec) => this.getAdapterKernelLanguage(context.adapter, spec) === language,
        )
      : [];
    if (matching.length === 1 && this.ports.autoPickerEnabled()) {
      return matching[0];
    }

    return new Promise((resolve) => {
      this.showAdapterKernelPicker(kernelManager, context, kernelSpecs, resolve);
    });
  }

  async checkForAdapterKernel(kernelManager, context, callback) {
    context = this.documents.refreshAdapterKernelContext(context);
    if (!context) return callback(null);
    if (this.adapterKernelChangeIsPending(context)) {
      this.warnAdapterKernelChangePending();
      return callback(null);
    }
    const { adapter } = context;
    const filePath = this.documents.getAdapterKey(adapter);
    let existingKernel = this.documents.getMappedKernel(filePath);
    if (existingKernel && !this.adapterKernelMatchesMetadata(adapter, existingKernel)) {
      if (this.adapterKernelIsBusy(context)) {
        this.warnAdapterKernelBusy();
        return callback(null);
      }
      this.store.removeKernelKey(filePath);
      if (this.store.getFilesForKernel(existingKernel).length === 0) {
        this.disposeUnboundKernel(existingKernel);
      }
      existingKernel = null;
    }
    if (existingKernel) {
      this.store.setExternalKernel(existingKernel, this.documents.getAdapterContext(adapter));
      const liveContext = this.documents.refreshAdapterKernelContext(context);
      callback(liveContext ? existingKernel : null, liveContext?.adapter);
      return;
    }

    try {
      const kernelSpec = await this.chooseAdapterKernelSpec(kernelManager, context);
      if (!kernelSpec) return callback(null);
      this.startLocalAdapterKernel(kernelManager, context, kernelSpec, callback);
    } catch (error) {
      if (this.documents.adapterContextIsAlive(context))
        this.ports.notifications().addError("Failed to start adapter kernel", {
          description: error.message || String(error),
          dismissable: true,
        });
      callback(null);
    }
  }

  startAdapterKernel(adapterService, kernelManager) {
    const context = this.documents.captureAdapterKernelContext(adapterService);
    if (!context) return false;
    if (this.adapterKernelChangeIsPending(context)) {
      this.warnAdapterKernelChangePending();
      return true;
    }
    if (this.adapterKernelIsBusy(context)) {
      this.warnAdapterKernelBusy();
      return true;
    }

    kernelManager
      .getAllKernelSpecs()
      .then((kernelSpecs) => {
        if (!this.documents.adapterContextIsAlive(context)) return;
        this.showAdapterKernelPicker(kernelManager, context, kernelSpecs, (kernelSpec) => {
          if (kernelSpec) this.startLocalAdapterKernel(kernelManager, context, kernelSpec);
        });
      })
      .catch((error) => {
        if (this.documents.adapterContextIsAlive(context))
          this.ports.notifications().addError("Failed to load kernels", {
            description: error.message || String(error),
            dismissable: true,
          });
      });

    return true;
  }

  handleAdapterKernelCommand(adapterService, command) {
    const adapter = this.documents.getActiveAdapter(adapterService);
    if (!adapter) return false;

    const kernel = this.documents.getMappedKernel(this.documents.getAdapterKey(adapter));

    if (!kernel) {
      this.ports.notifications().addError("No running kernel for adapter target found");
      return true;
    }

    this.store.setExternalKernel(kernel, this.documents.getAdapterContext(adapter));

    if (command === "interrupt-kernel") {
      this.ports.cancelTargets(adapter, kernel, "interrupted");
      kernel.interrupt();
    } else if (command === "restart-kernel") {
      this.ports.cancelTargets(adapter, kernel, "restarted");
      kernel.restart();
    } else if (command === "shutdown-kernel") {
      this.ports.cancelTargets(adapter, kernel, "shutdown");
      kernel.shutdownAndDestroy();
    }

    return true;
  }

  canChangeAdapterKernel(context) {
    if (!context) return true;
    if (this.adapterKernelChangeIsPending(context)) {
      this.warnAdapterKernelChangePending();
      return false;
    }
    if (!this.adapterKernelIsBusy(context)) return true;
    this.warnAdapterKernelBusy();
    return false;
  }

  getKernelForAdapter(adapter) {
    this.documents.observeAdapterPath(adapter);
    return this.documents.getMappedKernel(this.documents.getAdapterKey(adapter));
  }

  async bindExistingAdapterKernel(adapterServices, adapter, kernel, onBinding) {
    const context = this.documents.captureAdapterKernelContext(adapterServices, adapter);
    if (!context || !this.documents.adapterContextIsAlive(context)) {
      const error = new Error("The notebook is no longer available.");
      error.code = "notebook_unavailable";
      throw error;
    }
    if (this.getKernelForAdapter(adapter) === kernel) return true;
    if (this.adapterKernelChangeIsPending(context) || this.adapterKernelIsBusy(context, kernel)) {
      const error = new Error(
        "The notebook's current kernel binding is busy or changing. Wait for its execution to finish before replacing it.",
      );
      error.code = "kernel_binding_busy";
      throw error;
    }
    onBinding?.();
    return this.bindAdapterKernel(context, kernel, { owned: false });
  }
}

module.exports = AdapterKernelBinding;
