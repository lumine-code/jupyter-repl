const store = require("./store");
const MarkerStore = require("./store/markers");
const {
  terminateEditorPendingState,
  cancelAutocomplete,
  formatElapsedTime,
  NO_EXECTIME_STRING,
} = require("./utils");

const PERSISTABLE_OUTPUT_TYPES = new Set(["execute_result", "display_data", "stream", "error"]);

const markerStores = new Map();
const unsavedItemKeys = new WeakMap();
const adapterOwnerKeys = new WeakMap();
const adapterOwnerSubscriptions = new WeakMap();
const observedAdapterSubscriptions = new Set();
const destroyedAdapterOwners = new WeakSet();
const runningAdapterTargets = new Map();
const pendingAdapterBindings = new Set();
let nextUnsavedItemId = 1;
let adapterKernelPicker = null;
let settleAdapterKernelPicker = null;
let adapterIntegrationActive = false;
let adapterIntegrationGeneration = 0;

function getActiveAdapter(adapterServices) {
  const services = Array.isArray(adapterServices)
    ? adapterServices
    : adapterServices
      ? [adapterServices]
      : [];
  const activeItem = lumine.workspace.getCenter().getActivePaneItem();

  for (const service of services) {
    const adapter =
      service.getActiveAdapter?.() ||
      (service.handlesItem?.(activeItem) ? service.getAdapterForItem?.(activeItem) : null);
    if (adapter) {
      observeAdapterPath(adapter);
      return adapter;
    }
  }

  return null;
}

function getAdapterOwner(adapter) {
  return adapter.getKernelOwner?.() || null;
}

function getAdapterServices(adapterServices) {
  return Array.isArray(adapterServices)
    ? adapterServices
    : adapterServices
      ? [adapterServices]
      : [];
}

function getAdapterKey(adapter) {
  const owner = getAdapterOwner(adapter);
  const adapterId = adapter.getAdapterId?.();
  const path = adapter.getPath?.() || owner?.getPath?.();
  if (path) {
    const previousKey = owner && typeof owner === "object" ? adapterOwnerKeys.get(owner) : null;
    if (previousKey && previousKey !== path) {
      store.remapKernelKey(previousKey, path);
    }
    if (owner && typeof owner === "object") adapterOwnerKeys.set(owner, path);
    return path;
  }

  if (owner && typeof owner === "object") {
    if (!unsavedItemKeys.has(owner)) {
      const ownerId = owner.id == null ? null : `Jupyter Adapter ${owner.id}`;
      unsavedItemKeys.set(owner, ownerId || adapterId || `Unsaved Adapter ${nextUnsavedItemId++}`);
    }
    const key = adapterOwnerKeys.get(owner) || unsavedItemKeys.get(owner);
    adapterOwnerKeys.set(owner, key);
    return key;
  }

  if (adapterId) return adapterId;

  return `Unsaved Adapter ${nextUnsavedItemId++}`;
}

function observeAdapterPath(adapter) {
  const paneItem = adapter.getPaneItem?.();
  const owner = getAdapterOwner(adapter);
  if (!owner || typeof owner !== "object" || adapterOwnerSubscriptions.has(owner)) return;

  const pathSubscriber =
    (typeof owner.onDidChangePath === "function" && owner) ||
    (typeof adapter.onDidChangePath === "function" && adapter) ||
    (typeof paneItem?.onDidChangePath === "function" && paneItem) ||
    null;
  const disposables = [];

  adapterOwnerKeys.set(owner, getAdapterKey(adapter));
  if (pathSubscriber) {
    disposables.push(
      pathSubscriber.onDidChangePath((newPath) => {
        if (!newPath) return;
        const previousKey = adapterOwnerKeys.get(owner);
        if (previousKey && previousKey !== newPath) {
          store.remapKernelKey(previousKey, newPath);
        }
        adapterOwnerKeys.set(owner, newPath);
      }),
    );
  }

  const destroySubscriber =
    (typeof owner.onDidDestroy === "function" && owner) ||
    (typeof paneItem?.onDidDestroy === "function" && paneItem) ||
    null;
  if (destroySubscriber) {
    disposables.push(
      destroySubscriber.onDidDestroy(() => {
        destroyedAdapterOwners.add(owner);
        const key = adapterOwnerKeys.get(owner);
        const kernel = getMappedKernel(key);
        cancelAdapterTargets(adapter, null, "notebook closed");
        store.removeKernelKey(key);
        if (kernel && store.getFilesForKernel(kernel).length === 0) {
          disposeUnboundKernel(kernel);
        }
        for (const disposable of disposables) disposable?.dispose?.();
        observedAdapterSubscriptions.delete(subscription);
        adapterOwnerSubscriptions.delete(owner);
        adapterOwnerKeys.delete(owner);
      }),
    );
  }

  const subscription = {
    dispose() {
      for (const disposable of disposables) disposable?.dispose?.();
      adapterOwnerSubscriptions.delete(owner);
      adapterOwnerKeys.delete(owner);
      observedAdapterSubscriptions.delete(subscription);
    },
  };
  adapterOwnerSubscriptions.set(owner, subscription);
  observedAdapterSubscriptions.add(subscription);
}

function getAdapterTitle(adapter, paneItem, filePath) {
  return (
    adapter.getTitle?.() ||
    paneItem?.getTitle?.() ||
    (filePath ? String(filePath).split(/[\\/]/).pop() : "")
  );
}

function getAdapterContext(adapter) {
  const paneItem = adapter.getPaneItem?.() || null;
  const filePath = getAdapterKey(adapter);
  return {
    filePath,
    title: getAdapterTitle(adapter, paneItem, filePath),
    paneItem,
    owner: getAdapterOwner(adapter),
  };
}

function getMarkerStore(editor) {
  if (!editor) return null;
  const key = editor.id || editor;
  if (!markerStores.has(key)) {
    markerStores.set(key, new MarkerStore());
    editor.onDidDestroy?.(() => {
      markerStores.get(key)?.clear();
      markerStores.delete(key);
    });
  }
  return markerStores.get(key);
}

function getExistingMarkerStore(editor) {
  if (!editor) return null;
  return markerStores.get(editor.id || editor) || null;
}

function getMappedKernel(filePath) {
  if (!filePath) return null;
  return store.kernelMapping.get(filePath) || null;
}

function normalizeLanguage(language) {
  return String(language || "")
    .trim()
    .toLowerCase();
}

function getAdapterKernelLanguage(adapter, kernelSpec = null) {
  return normalizeLanguage(adapter.getKernelLanguage(kernelSpec));
}

function getPlainTextGrammar() {
  return (
    lumine.grammars.grammarForScopeName("text.plain") ||
    lumine.grammars.grammarForScopeName("text.plain.null-grammar") ||
    lumine.grammars.nullGrammar || {
      name: "Plain Text",
      scopeName: "text.plain",
    }
  );
}

function getAdapterKernelGrammar(adapter, kernelSpec = null) {
  return adapter.getKernelGrammar(kernelSpec) || getPlainTextGrammar();
}

function captureAdapterKernelContext(adapterService, explicitAdapter = null) {
  if (!adapterIntegrationActive) return null;
  const adapter = explicitAdapter || getActiveAdapter(adapterService);
  if (!adapter) return null;
  observeAdapterPath(adapter);
  const owner = getAdapterOwner(adapter);
  if (!owner) return null;
  const target = getAdapterKernelTarget(adapter);
  const context = getAdapterContext(adapter);
  return {
    ...context,
    adapter,
    target,
    editor: target?.editor || null,
    grammar: getAdapterKernelGrammar(adapter),
    adapterServices: getAdapterServices(adapterService),
    integrationGeneration: adapterIntegrationGeneration,
  };
}

function refreshAdapterKernelContext(context) {
  if (!context || context.integrationGeneration !== adapterIntegrationGeneration) return null;
  const owner = context.owner;
  if (!owner || owner.isDestroyed?.() || destroyedAdapterOwners.has(owner)) return null;

  const candidates = [context.paneItem, ...lumine.workspace.getPaneItems()].filter(
    (item, index, items) => item && !item.isDestroyed?.() && items.indexOf(item) === index,
  );
  for (const item of candidates) {
    for (const service of context.adapterServices || []) {
      const adapter = service.getAdapterForItem?.(item);
      if (adapter && getAdapterOwner(adapter) === owner) {
        observeAdapterPath(adapter);
        const target = getAdapterKernelTarget(adapter);
        return {
          ...context,
          ...getAdapterContext(adapter),
          adapter,
          target,
          editor: target?.editor && !target.editor.isDestroyed?.() ? target.editor : null,
          grammar: getAdapterKernelGrammar(adapter),
        };
      }
    }
  }

  // Test adapters and non-enumerating providers may not expose
  // getAdapterForItem. They are still usable while their captured pane lives.
  if (!context.paneItem?.isDestroyed?.()) {
    const target = getAdapterKernelTarget(context.adapter);
    return {
      ...context,
      target,
      editor: target?.editor && !target.editor.isDestroyed?.() ? target.editor : null,
    };
  }
  return null;
}

function adapterContextIsAlive(context) {
  if (
    !adapterIntegrationActive ||
    context?.integrationGeneration !== adapterIntegrationGeneration
  ) {
    return false;
  }
  const owner = context?.owner;
  const paneItem = context?.paneItem;
  if (owner && typeof owner === "object" && destroyedAdapterOwners.has(owner)) return false;
  if (owner?.isDestroyed?.()) return false;
  if (owner && owner !== paneItem) return true;
  return !paneItem?.isDestroyed?.();
}

function adapterKernelIsBusy(context, candidate = null) {
  const mappedKernel = getMappedKernel(getAdapterKey(context.adapter));
  return Boolean(
    mappedKernel &&
    mappedKernel !== candidate &&
    (mappedKernel.executionState === "busy" || runningAdapterTargets.get(context.owner)?.size > 0),
  );
}

function warnAdapterKernelBusy() {
  lumine.notifications.addWarning("The notebook kernel is busy", {
    description: "Wait for the current execution to finish before changing kernels.",
  });
}

async function getPreferredKernelSpec(kernelManager, adapter) {
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

function adapterKernelMatchesMetadata(adapter, kernel) {
  const expected = getAdapterKernelLanguage(adapter);
  const actual = getAdapterKernelLanguage(adapter, {
    ...(kernel?.kernelSpec || {}),
    language: kernel?.language,
  });
  return !expected || !actual || expected === actual;
}

function disposeUnboundKernel(kernel) {
  store.startingKernels.delete(
    kernel?.transport?.startingKernelKey || kernel?.kernelSpec?.display_name,
  );
  if (kernel?.transport?.ownsKernelProcess === false) {
    kernel.destroy?.();
  } else {
    kernel?.shutdownAndDestroy?.();
  }
}

function adapterKernelChangeIsPending(context) {
  return pendingAdapterBindings.has(context?.owner);
}

function warnAdapterKernelChangePending() {
  lumine.notifications.addWarning("A notebook kernel change is already in progress");
}

async function bindAdapterKernel(context, kernel, { owned = false } = {}) {
  if (!context?.adapter || !kernel) return false;
  context = refreshAdapterKernelContext(context);
  if (!context || !adapterContextIsAlive(context)) {
    if (owned) disposeUnboundKernel(kernel);
    return false;
  }

  if (adapterKernelIsBusy(context, kernel)) {
    warnAdapterKernelBusy();
    if (owned) disposeUnboundKernel(kernel);
    return false;
  }
  const bindingOwner = context.owner;
  if (pendingAdapterBindings.has(bindingOwner)) {
    if (owned) disposeUnboundKernel(kernel);
    warnAdapterKernelChangePending();
    return false;
  }
  pendingAdapterBindings.add(bindingOwner);

  const adapter = context.adapter;
  const filePath = getAdapterKey(adapter);
  const previousKernel = getMappedKernel(filePath);
  const kernelSpec = kernel.kernelSpec;
  const kernelWasRunning = store.runningKernels.includes(kernel);
  let registration = null;
  let contextWasDestroyed = false;

  try {
    const effectiveKernelSpec = { ...kernelSpec, language: kernel.language || kernelSpec.language };
    const grammar = getAdapterKernelGrammar(adapter, effectiveKernelSpec);
    registration = store.prepareNotebookKernel(kernel, filePath);
    const metadataUpdated = adapter.setKernelSpec(kernelSpec, kernel.languageInfo || null);
    if (metadataUpdated && typeof metadataUpdated.then === "function") {
      throw new TypeError("Notebook adapter setKernelSpec must complete synchronously.");
    }
    if (metadataUpdated === false) {
      throw new Error("The notebook document refused the kernel metadata update.");
    }
    const refreshedContext = refreshAdapterKernelContext(context);
    if (!refreshedContext || !adapterContextIsAlive(refreshedContext)) {
      contextWasDestroyed = true;
      throw new Error("The notebook was closed while the kernel was being connected.");
    }
    context = refreshedContext;
    registration.filePath = getAdapterKey(context.adapter);
    if (!kernelWasRunning && kernel.transport) kernel.transport.grammar = grammar;
    if (!store.commitNotebookKernel(registration)) {
      throw new Error("The notebook kernel binding was superseded before it could be committed.");
    }
    store.setExternalKernel(kernel, getAdapterContext(context.adapter));
  } catch (error) {
    if (!contextWasDestroyed) store.rollbackNotebookKernel(registration);
    if (owned) disposeUnboundKernel(kernel);
    if (
      contextWasDestroyed &&
      previousKernel &&
      previousKernel !== kernel &&
      store.getFilesForKernel(previousKernel).length === 0
    ) {
      disposeUnboundKernel(previousKernel);
    }
    if (!contextWasDestroyed) {
      lumine.notifications.addError("Failed to bind notebook kernel", {
        description: error.message || String(error),
        dismissable: true,
      });
    }
    return false;
  } finally {
    pendingAdapterBindings.delete(bindingOwner);
  }

  if (
    previousKernel &&
    previousKernel !== kernel &&
    store.getFilesForKernel(previousKernel).length === 0
  ) {
    disposeUnboundKernel(previousKernel);
  }
  return true;
}

function startLocalAdapterKernel(kernelManager, context, kernelSpec, callback = null) {
  context = refreshAdapterKernelContext(context);
  if (!kernelSpec || !context || !adapterContextIsAlive(context)) return;
  if (adapterKernelChangeIsPending(context)) {
    warnAdapterKernelChangePending();
    return;
  }
  if (adapterKernelIsBusy(context)) {
    warnAdapterKernelBusy();
    return;
  }

  const adapter = context.adapter;
  const grammar = getAdapterKernelGrammar(adapter, kernelSpec);
  const filePath = getAdapterKey(adapter);
  kernelManager.startKernel(
    kernelSpec,
    grammar,
    context.editor || context.owner,
    filePath,
    async (kernel) => {
      if (await bindAdapterKernel(context, kernel, { owned: true })) {
        const liveContext = refreshAdapterKernelContext(context);
        if (liveContext) callback?.(kernel, liveContext.adapter);
      }
    },
    {
      bindingOwner: context.owner,
      deferRegistration: true,
      startKey: context.owner,
    },
  );
}

function showAdapterKernelPicker(kernelManager, context, kernelSpecs, callback) {
  if (adapterKernelPicker?.selectListHost?.isVisible()) {
    adapterKernelPicker.selectListHost.cancel();
    callback(null);
    return;
  }

  if (settleAdapterKernelPicker) settleAdapterKernelPicker(null);
  if (adapterKernelPicker) {
    adapterKernelPicker.kernelSpecs = kernelSpecs;
  } else {
    const KernelPicker = require("./kernel-picker");
    adapterKernelPicker = new KernelPicker(kernelSpecs, { allowKernelComment: false });
  }

  let settled = false;
  const settle = (kernelSpec) => {
    if (settled) return;
    settled = true;
    if (settleAdapterKernelPicker === settle) settleAdapterKernelPicker = null;
    adapterKernelPicker.onConfirmed = null;
    adapterKernelPicker.onCancelled = null;
    callback(kernelSpec);
  };
  settleAdapterKernelPicker = settle;
  adapterKernelPicker.onConfirmed = (kernelSpec) => settle(kernelSpec);
  adapterKernelPicker.onCancelled = () => settle(null);
  adapterKernelPicker.onUpdate = () => kernelManager.updateKernelSpecs(null, true);
  adapterKernelPicker.toggle();
}

async function chooseAdapterKernelSpec(kernelManager, context) {
  const preferred = await getPreferredKernelSpec(kernelManager, context.adapter);
  if (!adapterContextIsAlive(context)) return null;
  if (preferred) return preferred;

  const kernelSpecs = await kernelManager.getAllKernelSpecs();
  if (!adapterContextIsAlive(context)) return null;
  const language = getAdapterKernelLanguage(context.adapter);
  const matching = language
    ? kernelSpecs.filter((spec) => getAdapterKernelLanguage(context.adapter, spec) === language)
    : [];
  if (matching.length === 1 && lumine.config.get("jupyter-repl.autoKernelPicker")) {
    return matching[0];
  }

  return new Promise((resolve) => {
    showAdapterKernelPicker(kernelManager, context, kernelSpecs, resolve);
  });
}

async function checkForAdapterKernel(kernelManager, context, callback) {
  context = refreshAdapterKernelContext(context);
  if (!context) return;
  if (adapterKernelChangeIsPending(context)) {
    warnAdapterKernelChangePending();
    return;
  }
  const { adapter } = context;
  const filePath = getAdapterKey(adapter);
  let existingKernel = getMappedKernel(filePath);
  if (existingKernel && !adapterKernelMatchesMetadata(adapter, existingKernel)) {
    if (adapterKernelIsBusy(context)) {
      warnAdapterKernelBusy();
      return;
    }
    store.removeKernelKey(filePath);
    if (store.getFilesForKernel(existingKernel).length === 0) {
      disposeUnboundKernel(existingKernel);
    }
    existingKernel = null;
  }
  if (existingKernel) {
    store.setExternalKernel(existingKernel, getAdapterContext(adapter));
    const liveContext = refreshAdapterKernelContext(context);
    if (liveContext) callback(existingKernel, liveContext.adapter);
    return;
  }

  try {
    const kernelSpec = await chooseAdapterKernelSpec(kernelManager, context);
    if (!kernelSpec) return;
    startLocalAdapterKernel(kernelManager, context, kernelSpec, callback);
  } catch (error) {
    lumine.notifications.addError("Failed to start adapter kernel", {
      description: error.message || String(error),
      dismissable: true,
    });
  }
}

function persistTargetResult(adapter, target, result) {
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

function isExecutableTarget(target) {
  if (!target) return false;
  if (target.executable === false) return false;
  if (target.type === "markdown" || target.type === "raw") return false;
  return true;
}

function targetRecordId(target) {
  return String(target?.id ?? target?.index ?? "");
}

function adapterExecutionKey(adapter) {
  return getAdapterOwner(adapter);
}

function registerRunningTarget(adapter, kernel, target) {
  const adapterKey = adapterExecutionKey(adapter);
  if (!targetRecordId(target)) return null;

  if (!runningAdapterTargets.has(adapterKey)) {
    runningAdapterTargets.set(adapterKey, new Set());
  }

  let cancelExecution;
  const cancellation = new Promise((resolve) => {
    cancelExecution = (reason = "cancelled") => resolve({ cancelled: true, reason });
  });
  const record = {
    adapter,
    kernel,
    target,
    cancellation,
    cancelExecution,
    cancelReason: null,
  };
  runningAdapterTargets.get(adapterKey).add(record);
  adapter.beginTargetExecution?.(target, { kernel });
  return record;
}

function finishRunningTarget(record, result) {
  if (!record) return;

  const adapterKey = adapterExecutionKey(record.adapter);
  runningAdapterTargets.get(adapterKey)?.delete(record);
  if (runningAdapterTargets.get(adapterKey)?.size === 0) {
    runningAdapterTargets.delete(adapterKey);
  }

  if (record.suppressAdapterCallbacks) {
    return;
  }
  if (result.status === "cancelled") {
    record.adapter.cancelTargetExecution?.(record.target, result);
  } else if (result.status === "failed") {
    record.adapter.failTargetExecution?.(record.target, result);
  } else if (result.status === "skipped") {
    record.adapter.skipTargetExecution?.(record.target, result);
  }

  record.adapter.finishTargetExecution?.(record.target, result);
}

function cancelAdapterTargets(adapter, kernel, reason) {
  const records = runningAdapterTargets.get(adapterExecutionKey(adapter));
  if (!records) return;

  for (const record of records.values()) {
    if (kernel && record.kernel !== kernel) continue;
    record.cancelReason = reason;
    record.cancelExecution(reason);
  }
}

function getRunTargets(adapter, scope) {
  const targets = adapter.getRunTargets?.(scope) || [];
  if (targets.length > 0 || scope !== "selected") {
    return targets;
  }
  const target = adapter.getRunTarget?.(adapter.getActiveTargetId?.());
  return target ? [target] : [];
}

function getEditorRunTargets(adapter, moveDown) {
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
  const targets = [];

  for (const selection of editor.getSelections()) {
    const codeBlock = codeManager.findCodeBlock(editor, selection);
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

function getAdapterKernelTarget(adapter) {
  const activeTargetId = adapter.getActiveTargetId?.();
  return (
    adapter.getKernelTarget?.(activeTargetId) ||
    adapter.getRunTarget?.(activeTargetId) ||
    adapter.getRunTargets?.("all")?.[0] ||
    null
  );
}

function focusNextAdapterTarget(adapter, target) {
  if (!target) return;
  const nextTarget =
    adapter.getNextRunTarget?.(target) ||
    (typeof target.id === "number" ? adapter.getRunTarget?.(target.id + 1) : null);
  if (nextTarget) {
    adapter.focusTarget?.(nextTarget);
  }
}

function shouldUpdateActiveTargetForRun(scope) {
  return scope === "active" || scope === "editor";
}

function runAdapterTargets(
  adapterService,
  kernelManager,
  { scope = "selected", moveDown = false } = {},
) {
  const adapter = getActiveAdapter(adapterService);
  if (!adapter) return false;
  const kernelContext = captureAdapterKernelContext(adapterService, adapter);

  const targets =
    scope === "editor" ? getEditorRunTargets(adapter, moveDown) : getRunTargets(adapter, scope);
  const executableTargets = targets.filter(isExecutableTarget);
  if (targets.length === 0 || executableTargets.length === 0) {
    const activeTarget = adapter.getRunTarget?.(adapter.getActiveTargetId?.());
    const kernelTarget = getAdapterKernelTarget(adapter);
    const kernelEditor = kernelTarget?.editor;
    if (targets.length === 0 && kernelContext) {
      if (kernelEditor) terminateEditorPendingState(kernelEditor);
      checkForAdapterKernel(kernelManager, kernelContext, () => {});
    }
    if (targets.length > 0) {
      for (const target of targets) {
        adapter.skipTargetExecution?.(target, { reason: "not-executable" });
        adapter.finishTargetExecution?.(target, {
          success: true,
          status: "skipped",
          reason: "not-executable",
        });
      }
    }
    if (moveDown && activeTarget) {
      focusNextAdapterTarget(adapter, activeTarget);
    }
    return true;
  }
  const persistResults = scope !== "editor";

  const firstTarget = executableTargets[0];
  const firstEditor = firstTarget.editor;
  if (!firstEditor || !kernelContext) return true;
  const shouldUpdateActiveTarget = shouldUpdateActiveTargetForRun(scope);

  checkForAdapterKernel(
    kernelManager,
    kernelContext,
    async (kernel, executionAdapter = adapter) => {
      const result = require("./result");

      const clearedTargets = new Set();
      for (const capturedTarget of targets) {
        const liveTarget = executionAdapter.getRunTarget?.(capturedTarget.id);
        if (!liveTarget || liveTarget.editor?.isDestroyed?.()) continue;
        const target = {
          ...capturedTarget,
          type: liveTarget.type,
          executable: liveTarget.executable,
          editor: liveTarget.editor,
        };
        if (!isExecutableTarget(target)) {
          executionAdapter.skipTargetExecution?.(target, { reason: "not-executable" });
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

        const markers = getMarkerStore(editor);
        const code = target.source || "";
        const row = target.row == null ? Math.max(0, editor.getLastBufferRow?.() || 0) : target.row;

        if (shouldUpdateActiveTarget) {
          executionAdapter.setActiveTargetId?.(target.id);
        }
        if (persistResults && !clearedTargets.has(target.id)) {
          executionAdapter.clearTargetOutputs?.(target);
          clearedTargets.add(target.id);
        }
        cancelAutocomplete(editor);
        store.updateEditor(editor);
        store.setExternalKernel(kernel, getAdapterContext(executionAdapter));

        let success = false;
        let status = "error";
        let durationMs = null;
        let executionPromise;
        const runningTarget = registerRunningTarget(executionAdapter, kernel, target);
        try {
          executionPromise = result.createResultAsync(
            { editor, kernel, markers },
            {
              code,
              row,
              cellType: "codecell",
              inline: !persistResults,
              onResult: persistResults
                ? (kernelResult) => persistTargetResult(executionAdapter, target, kernelResult)
                : null,
            },
          );
          if (moveDown && scope !== "editor" && capturedTarget === targets[targets.length - 1]) {
            focusNextAdapterTarget(executionAdapter, target);
          }
          const executionResult = runningTarget
            ? await Promise.race([executionPromise, runningTarget.cancellation])
            : await executionPromise;
          if (executionResult?.cancelled) {
            success = false;
            status = "cancelled";
          } else {
            success = executionResult?.success === true;
            status = success ? "ok" : "error";
            durationMs = executionResult?.durationMs ?? null;
          }
        } catch (error) {
          success = false;
          status = "failed";
          lumine.notifications.addError("Notebook cell execution failed", {
            description: error.message || String(error),
            dismissable: true,
          });
        } finally {
          const finishResult = {
            kernel,
            // This execution's own duration — the kernel's shared field can
            // name another client's cell on a shared kernel. The sentinel is
            // filtered out by the notebook view, keeping the previous text.
            lastExecutionTime:
              durationMs === null ? NO_EXECTIME_STRING : formatElapsedTime(durationMs),
            success,
            status,
          };
          if (runningTarget) {
            finishRunningTarget(runningTarget, finishResult);
          } else {
            executionAdapter.finishTargetExecution?.(target, finishResult);
          }
        }

        if (!success) break;
      }
    },
  );

  return true;
}

/**
 * "Start Local Kernel" for adapter editors (e.g. jupyter-view notebooks):
 * show the kernel picker, start the selected kernel keyed to the notebook
 * path so subsequent runs use it, replace (shut down) the previously mapped
 * kernel, and persist the new kernelspec into the notebook metadata.
 * Returns true when an adapter editor is active (handled).
 */
function startAdapterKernel(adapterService, kernelManager) {
  const context = captureAdapterKernelContext(adapterService);
  if (!context) return false;
  if (adapterKernelChangeIsPending(context)) {
    warnAdapterKernelChangePending();
    return true;
  }
  if (adapterKernelIsBusy(context)) {
    warnAdapterKernelBusy();
    return true;
  }

  kernelManager
    .getAllKernelSpecs()
    .then((kernelSpecs) => {
      if (!adapterContextIsAlive(context)) return;
      showAdapterKernelPicker(kernelManager, context, kernelSpecs, (kernelSpec) => {
        if (kernelSpec) startLocalAdapterKernel(kernelManager, context, kernelSpec);
      });
    })
    .catch((error) => {
      lumine.notifications.addError("Failed to load kernels", {
        description: error.message || String(error),
        dismissable: true,
      });
    });

  return true;
}

function handleAdapterKernelCommand(adapterService, command) {
  const adapter = getActiveAdapter(adapterService);
  if (!adapter) return false;

  const kernel = getMappedKernel(getAdapterKey(adapter));

  if (!kernel) {
    lumine.notifications.addError("No running kernel for adapter target found");
    return true;
  }

  store.setExternalKernel(kernel, getAdapterContext(adapter));

  if (command === "interrupt-kernel") {
    cancelAdapterTargets(adapter, kernel, "interrupted");
    kernel.interrupt();
  } else if (command === "restart-kernel") {
    cancelAdapterTargets(adapter, kernel, "restarted");
    kernel.restart();
  } else if (command === "shutdown-kernel") {
    cancelAdapterTargets(adapter, kernel, "shutdown");
    kernel.shutdownAndDestroy();
  }

  return true;
}

function clearAdapterResults(adapterService) {
  const adapter = getActiveAdapter(adapterService);
  if (!adapter) return false;

  const targets = adapter.getRunTargets?.("all") || [];
  const fallbackTarget = adapter.getRunTarget?.(adapter.getActiveTargetId?.());
  const editors = new Set(
    (targets.length > 0 ? targets : fallbackTarget ? [fallbackTarget] : [])
      .map((target) => target.editor)
      .filter(Boolean),
  );

  for (const editor of editors) {
    getExistingMarkerStore(editor)?.clear();
  }

  return true;
}

/**
 * The editor a code-reading command should act on when an adapter owns the
 * active item. A notebook's cells are editors the workspace does not report,
 * so the adapter is the only one that can name the right one.
 *
 * @param {Object|Object[]} adapterService
 * @returns {TextEditor|null}
 */
function getAdapterFocusedEditor(adapterService) {
  const adapter = getActiveAdapter(adapterService);
  if (!adapter) return null;
  return getAdapterKernelTarget(adapter)?.editor || null;
}

function canChangeAdapterKernel(context) {
  if (!context) return true;
  if (adapterKernelChangeIsPending(context)) {
    warnAdapterKernelChangePending();
    return false;
  }
  if (!adapterKernelIsBusy(context)) return true;
  warnAdapterKernelBusy();
  return false;
}

function disposeAdapterIntegration() {
  adapterIntegrationActive = false;
  adapterIntegrationGeneration++;
  settleAdapterKernelPicker?.(null);
  settleAdapterKernelPicker = null;
  adapterKernelPicker?.destroy?.();
  adapterKernelPicker = null;
  for (const subscription of [...observedAdapterSubscriptions]) {
    subscription.dispose?.();
  }
  for (const records of runningAdapterTargets.values()) {
    for (const record of records.values()) {
      record.suppressAdapterCallbacks = true;
      record.cancelExecution("package deactivated");
    }
  }
  runningAdapterTargets.clear();
  pendingAdapterBindings.clear();
  for (const markers of markerStores.values()) markers.clear();
  markerStores.clear();
}

function activateAdapterIntegration() {
  adapterIntegrationActive = true;
  adapterIntegrationGeneration++;
}

module.exports = {
  runAdapterTargets,
  startAdapterKernel,
  handleAdapterKernelCommand,
  clearAdapterResults,
  getAdapterFocusedEditor,
  captureAdapterKernelContext,
  bindAdapterKernel,
  canChangeAdapterKernel,
  disposeAdapterIntegration,
  activateAdapterIntegration,
};
