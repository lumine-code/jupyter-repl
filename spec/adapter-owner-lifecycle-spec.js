const { Disposable, Emitter } = require("lumine");

describe("notebook adapter ownership across lifecycle callbacks", () => {
  const grammar = { name: "Python", scopeName: "source.python" };
  let integration, result, store, Kernel;
  let owners, subscriptions, previous;

  function makeEditor(id) {
    const destroyListeners = [];
    return {
      id,
      element: null,
      destroyListeners,
      getPath: () => null,
      getGrammar: () => grammar,
      getLastBufferRow: () => 0,
      isDestroyed: () => false,
      onDidDestroy(callback) {
        const listener = { callback, disposed: false };
        destroyListeners.push(listener);
        return new Disposable(() => {
          listener.disposed = true;
        });
      },
    };
  }

  function makeDocument({ targets = [], path = `C:\\work\\owned-${owners.length}.ipynb` } = {}) {
    const emitter = new Emitter();
    const owner = {
      id: `owner-${owners.length}`,
      metadata: { kernelspec: { name: "python3", language: "python" } },
      getPath: () => path,
      isDestroyed: () => owner.destroyed === true,
      onDidChangePath(callback) {
        const subscription = emitter.on("path", callback);
        return new Disposable(() => {
          subscription.dispose();
          owner.onPathDisposed?.();
        });
      },
      onDidDestroy: (callback) => emitter.on("destroy", callback),
      destroy() {
        if (owner.destroyed) return;
        owner.destroyed = true;
        emitter.emit("destroy");
        emitter.dispose();
      },
    };
    owners.push(owner);
    const paneItem = { getTitle: () => "owned.ipynb", isDestroyed: () => false };
    const adapter = {
      getPaneItem: () => paneItem,
      getKernelOwner: () => owner,
      getPath: () => path,
      getMetadata: () => owner.metadata,
      getKernelLanguage: () => "python",
      getKernelGrammar: () => grammar,
      getActiveTargetId: () => targets[0]?.id,
      getKernelTarget: () => targets[0] || null,
      getRunTarget: (id) => targets.find((target) => target.id === id) || null,
      getRunTargets: () => targets,
      setKernelSpec(spec) {
        owner.metadata = { kernelspec: spec };
      },
      clearTargetOutputs: jasmine.createSpy("clearTargetOutputs"),
      beginTargetExecution: jasmine.createSpy("beginTargetExecution"),
      finishTargetExecution: jasmine.createSpy("finishTargetExecution"),
      appendTargetOutput: jasmine.createSpy("appendTargetOutput"),
    };
    const service = {
      getActiveAdapter: () => adapter,
      getAdapterForItem: (item) => (item === paneItem ? adapter : null),
    };
    return { owner, adapter, service };
  }

  function makeTarget(id) {
    return {
      id,
      type: "code",
      executable: true,
      source: `run_${id}()`,
      row: 0,
      editor: makeEditor(id),
    };
  }

  function makeKernel(name = "python3") {
    // The real registry distinguishes a Kernel from a grammar mapping by
    // instanceof; only transport work is replaced in this fixture.
    const kernel = Object.create(Kernel.prototype);
    kernel.transport = {
      kernelSpec: { name, display_name: name, language: "python" },
      language: "python",
      languageInfo: null,
      grammar,
      executionState: "idle",
      ownsKernelProcess: true,
    };
    kernel.shutdownAndDestroy = jasmine.createSpy("shutdownAndDestroy").and.resolveTo();
    kernel.destroy = jasmine.createSpy("destroy");
    kernel.emitter = new Emitter();
    kernel.onDidChangeExecutionState = () => new Disposable();
    kernel.onDidChangeStatus = () => new Disposable();
    require("./helpers/session").wrapSession(kernel);
    return kernel;
  }

  function bindForExecution(document, kernel) {
    store.kernelMapping.set(document.adapter.getPath(), kernel);
    if (!store.runningKernels.includes(kernel)) store.runningKernels.push(kernel);
  }

  async function flushPromises() {
    for (let index = 0; index < 20; index++) await Promise.resolve();
  }

  beforeEach(async () => {
    integration = require("../lib/adapter-integration");
    result = require("../lib/result");
    store = require("../lib/store");
    Kernel = require("../lib/kernel");
    const languageText = await lumine.packages.activatePackage("language-text");
    await languageText.resourceLoadPromise;
    owners = [];
    subscriptions = [];
    previous = {
      editor: store.editor,
      mappings: new Map(store.kernelMapping),
      kernels: store.runningKernels,
      externalKernel: store._externalKernel,
      externalContext: store._externalKernelContext,
    };
    store.kernelMapping.clear();
    store.runningKernels = [];
    store.setExternalKernel(null);
    integration.activateAdapterIntegration();
  });

  afterEach(() => {
    integration.disposeAdapterIntegration();
    subscriptions.forEach((subscription) => subscription.dispose());
    owners.forEach((owner) => owner.destroy());
    store.kernelMapping.clear();
    for (const [key, kernel] of previous.mappings) store.kernelMapping.set(key, kernel);
    store.runningKernels = previous.kernels;
    store.updateEditor(previous.editor?.isDestroyed?.() ? null : previous.editor);
    store.setExternalKernel(previous.externalKernel, previous.externalContext);
  });

  it("detaches an old editor lease without letting its delayed callback erase a new marker store", async () => {
    const target = makeTarget("markers");
    const document = makeDocument({ targets: [target] });
    const kernel = makeKernel();
    bindForExecution(document, kernel);
    const markers = [];
    spyOn(result, "createResultAsync").and.callFake((context) => {
      markers.push(context.markers);
      return Promise.resolve({ status: "ok", success: true, durationMs: 1 });
    });
    const run = () =>
      integration.runExplicitAdapterTarget([document.service], document.adapter, kernel, target);

    await run();
    const oldLease = target.editor.destroyListeners[0];
    integration.disposeAdapterIntegration();
    expect(oldLease.disposed).toBe(true);
    integration.activateAdapterIntegration();
    await run();
    expect(markers[1]).not.toBe(markers[0]);
    const clearNewMarkers = spyOn(markers[1], "clear").and.callThrough();

    oldLease.callback();
    await run();

    expect(clearNewMarkers).not.toHaveBeenCalled();
    expect(markers[2]).toBe(markers[1]);
    expect(target.editor.destroyListeners.length).toBe(2);
  });

  it("rolls back a stale prepared binding after metadata reactivation without overwriting a newer binding", async () => {
    for (const superseded of [false, true]) {
      const document = makeDocument();
      const oldKernel = makeKernel("old");
      const candidate = makeKernel("candidate");
      const survivor = superseded ? makeKernel("new-generation") : oldKernel;
      bindForExecution(document, oldKernel);
      const context = integration.captureAdapterKernelContext([document.service], document.adapter);
      spyOn(document.adapter, "setKernelSpec").and.callFake(() => {
        integration.disposeAdapterIntegration();
        integration.activateAdapterIntegration();
        if (superseded) store.kernelMapping.set(document.adapter.getPath(), survivor);
      });

      expect(await integration.bindAdapterKernel(context, candidate, { owned: true })).toBe(false);

      expect(document.owner.isDestroyed()).toBe(false);
      expect(store.kernelMapping.get(document.adapter.getPath())).toBe(survivor);
      expect(store.runningKernels).not.toContain(candidate);
      expect(candidate.shutdownAndDestroy).toHaveBeenCalledTimes(1);
      expect(survivor.shutdownAndDestroy).not.toHaveBeenCalled();
    }
  });

  it("rechecks the document after a commit event closes it before publishing an external kernel", async () => {
    const document = makeDocument();
    const kernel = makeKernel();
    const context = integration.captureAdapterKernelContext([document.service], document.adapter);
    subscriptions.push(
      store.onDidAddKernel((added) => {
        if (added === kernel) document.owner.destroy();
      }),
    );
    const publish = spyOn(store, "setExternalKernel").and.callThrough();

    const accepted = await integration.bindAdapterKernel(context, kernel, { owned: true });

    expect(accepted).toBe(false);
    expect(document.owner.isDestroyed()).toBe(true);
    expect(store.kernelMapping.has(document.adapter.getPath())).toBe(false);
    expect(publish.calls.allArgs().some(([value]) => value === kernel)).toBe(false);
    expect(kernel.shutdownAndDestroy).toHaveBeenCalledTimes(1);
  });

  it("cancels only the closed document while another document keeps using their shared kernel", async () => {
    const targetA = makeTarget("first-document");
    const targetB = makeTarget("second-document");
    const first = makeDocument({ targets: [targetA] });
    const second = makeDocument({ targets: [targetB] });
    const kernel = makeKernel();
    bindForExecution(first, kernel);
    bindForExecution(second, kernel);
    const pending = [];
    spyOn(result, "createResultAsync").and.callFake((_context, options) => {
      let resolve;
      const promise = new Promise((settle) => {
        resolve = settle;
      });
      pending.push({ options, resolve });
      return promise;
    });
    const runA = integration.runExplicitAdapterTarget(
      [first.service],
      first.adapter,
      kernel,
      targetA,
    );
    const runB = integration.runExplicitAdapterTarget(
      [second.service],
      second.adapter,
      kernel,
      targetB,
    );
    first.owner.destroy();
    const output = { output_type: "stream", name: "stdout", text: "still bound\n" };
    pending[0].options.onResult(output);
    pending[1].options.onResult(output);
    pending[1].resolve({ status: "ok", success: true, durationMs: 1 });

    const [outcomeA, outcomeB] = await Promise.all([runA, runB]);

    expect(outcomeA.status).toBe("cancelled");
    expect(outcomeB.status).toBe("ok");
    expect(first.adapter.appendTargetOutput).not.toHaveBeenCalled();
    expect(first.adapter.finishTargetExecution).not.toHaveBeenCalled();
    expect(second.adapter.appendTargetOutput).toHaveBeenCalledWith(targetB, output);
    expect(second.adapter.finishTargetExecution).toHaveBeenCalledTimes(1);
    expect(store.kernelMapping.get(second.adapter.getPath())).toBe(kernel);
    expect(kernel.shutdownAndDestroy).not.toHaveBeenCalled();
    pending[0].resolve({ status: "ok", success: true, durationMs: 1 });
    second.owner.destroy();
    expect(kernel.shutdownAndDestroy).toHaveBeenCalledTimes(1);
  });

  it("does not dispatch after begin or clear hooks close the owner or deactivate the integration", async () => {
    const createResult = spyOn(result, "createResultAsync").and.resolveTo({
      status: "ok",
      success: true,
    });
    const warning = spyOn(lumine.notifications, "addWarning").and.callThrough();
    for (const explicit of [true, false]) {
      for (const hook of ["beginTargetExecution", "clearTargetOutputs"]) {
        integration.activateAdapterIntegration();
        const target = makeTarget(`${explicit}-${hook}`);
        const document = makeDocument({ targets: [target] });
        const kernel = makeKernel();
        bindForExecution(document, kernel);
        document.adapter[hook].and.callFake(() => {
          if (explicit) document.owner.destroy();
          else integration.disposeAdapterIntegration();
        });
        createResult.calls.reset();
        if (explicit) {
          const outcome = await integration.runExplicitAdapterTarget(
            [document.service],
            document.adapter,
            kernel,
            target,
          );
          expect(outcome).toEqual({
            cancelled: true,
            reason: "notebook closed",
            kernel,
            status: "cancelled",
            lastExecutionTime: "Not available",
          });
        } else {
          expect(integration.runAdapterTargets(document.service, {}, { scope: "active" })).toBe(
            true,
          );
          await flushPromises();
        }

        expect(createResult).not.toHaveBeenCalled();
        expect(document.adapter.finishTargetExecution).not.toHaveBeenCalled();
      }
    }
    expect(warning).not.toHaveBeenCalled();
  });

  it("does not carry the remaining target sequence into a reactivated integration", async () => {
    const targets = [makeTarget("sequence-first"), makeTarget("sequence-second")];
    const document = makeDocument({ targets });
    const kernel = makeKernel();
    bindForExecution(document, kernel);
    spyOn(result, "createResultAsync").and.resolveTo({
      status: "ok",
      success: true,
      durationMs: 1,
    });
    document.adapter.finishTargetExecution.and.callFake(() => {
      integration.disposeAdapterIntegration();
      integration.activateAdapterIntegration();
    });

    expect(integration.runAdapterTargets(document.service, {}, { scope: "all" })).toBe(true);
    await flushPromises();

    expect(result.createResultAsync).toHaveBeenCalledTimes(1);
    expect(document.adapter.beginTargetExecution).toHaveBeenCalledTimes(1);
    expect(document.adapter.clearTargetOutputs).toHaveBeenCalledTimes(1);
    expect(document.adapter.clearTargetOutputs.calls.first().args[0].id).toBe(targets[0].id);
    expect(document.adapter.finishTargetExecution).toHaveBeenCalledTimes(1);
    const currentContext = integration.captureAdapterKernelContext(
      [document.service],
      document.adapter,
    );
    expect(integration.canChangeAdapterKernel(currentContext)).toBe(true);
  });

  it("preserves a new execution started while an old document observer is being disposed", async () => {
    const target = makeTarget("observer-reentry");
    const document = makeDocument({ targets: [target] });
    const kernel = makeKernel();
    bindForExecution(document, kernel);
    const pending = [];
    spyOn(result, "createResultAsync").and.callFake((context, options) => {
      let resolve;
      const promise = new Promise((settle) => {
        resolve = settle;
      });
      pending.push({ context, options, resolve });
      return promise;
    });
    const run = () =>
      integration.runExplicitAdapterTarget([document.service], document.adapter, kernel, target);
    const oldExecution = run();
    let newExecution;
    document.owner.onPathDisposed = () => {
      document.owner.onPathDisposed = null;
      integration.activateAdapterIntegration();
      newExecution = run();
    };

    integration.disposeAdapterIntegration();
    expect(pending.length).toBe(2);
    expect(pending[1].context.markers).not.toBe(pending[0].context.markers);
    const output = { output_type: "stream", name: "stdout", text: "new generation\n" };
    pending[0].options.onResult(output);
    pending[1].options.onResult(output);
    pending[1].resolve({ status: "ok", success: true, durationMs: 1 });
    const [oldOutcome, newOutcome] = await Promise.all([oldExecution, newExecution]);

    expect(oldOutcome.status).toBe("cancelled");
    expect(newOutcome.status).toBe("ok");
    expect(document.adapter.appendTargetOutput).toHaveBeenCalledOnceWith(target, output);
    expect(document.adapter.finishTargetExecution).toHaveBeenCalledTimes(1);
    pending[0].resolve({ status: "ok", success: true, durationMs: 1 });
  });

  it("does not persist toolbar results through a refreshed adapter that now represents another owner", async () => {
    const target = makeTarget("rehydrated-owner");
    const document = makeDocument({ targets: [target] });
    const other = makeDocument();
    const kernel = makeKernel();
    bindForExecution(document, kernel);
    let executionOwner = document.owner;
    const refreshed = {
      ...document.adapter,
      getKernelOwner: () => executionOwner,
      appendTargetOutput: jasmine.createSpy("refreshed appendTargetOutput"),
      finishTargetExecution: jasmine.createSpy("refreshed finishTargetExecution"),
    };
    document.service.getAdapterForItem = (item) =>
      item === document.adapter.getPaneItem() ? refreshed : null;
    let options, resolve;
    spyOn(result, "createResultAsync").and.callFake((_context, executionOptions) => {
      options = executionOptions;
      return new Promise((settle) => {
        resolve = settle;
      });
    });

    integration.runAdapterTargets(document.service, {}, { scope: "active" });
    await flushPromises();
    expect(result.createResultAsync).toHaveBeenCalledTimes(1);
    expect(document.adapter.getKernelOwner()).toBe(document.owner);
    executionOwner = other.owner;
    options.onResult({ output_type: "stream", name: "stdout", text: "wrong owner\n" });
    resolve({ status: "ok", success: true, durationMs: 1 });
    await flushPromises();

    expect(refreshed.appendTargetOutput).not.toHaveBeenCalled();
    expect(refreshed.finishTargetExecution).not.toHaveBeenCalled();
    expect(other.adapter.appendTargetOutput).not.toHaveBeenCalled();
    const liveContext = integration.captureAdapterKernelContext(
      [document.service],
      document.adapter,
    );
    expect(integration.canChangeAdapterKernel(liveContext)).toBe(true);
  });

  it("stops a non-executable sequence when its skip hook reactivates the integration", () => {
    const targets = [
      { ...makeTarget("skip-first"), type: "markdown", executable: false },
      { ...makeTarget("skip-second"), type: "raw", executable: false },
    ];
    const document = makeDocument({ targets });
    document.adapter.getNextRunTarget = () => targets[1];
    document.adapter.focusTarget = jasmine.createSpy("focusTarget");
    document.adapter.skipTargetExecution = jasmine
      .createSpy("skipTargetExecution")
      .and.callFake(() => {
        integration.disposeAdapterIntegration();
        integration.activateAdapterIntegration();
      });
    spyOn(result, "createResultAsync");

    expect(
      integration.runAdapterTargets(document.service, {}, { scope: "all", moveDown: true }),
    ).toBe(true);

    expect(document.adapter.skipTargetExecution).toHaveBeenCalledOnceWith(targets[0], {
      reason: "not-executable",
    });
    expect(document.adapter.finishTargetExecution).not.toHaveBeenCalled();
    expect(document.adapter.focusTarget).not.toHaveBeenCalled();
    expect(result.createResultAsync).not.toHaveBeenCalled();
  });

  it("does not publish an explicit result to its external observer after persistence reactivates the integration", async () => {
    const target = makeTarget("persistence-reentry");
    const document = makeDocument({ targets: [target] });
    const kernel = makeKernel();
    bindForExecution(document, kernel);
    let options, resolve;
    spyOn(result, "createResultAsync").and.callFake((_context, executionOptions) => {
      options = executionOptions;
      return new Promise((settle) => {
        resolve = settle;
      });
    });
    document.adapter.appendTargetOutput.and.callFake(() => {
      integration.disposeAdapterIntegration();
      integration.activateAdapterIntegration();
    });
    const observer = jasmine.createSpy("external onResult");
    const execution = integration.runExplicitAdapterTarget(
      [document.service],
      document.adapter,
      kernel,
      target,
      observer,
    );
    const output = { output_type: "stream", name: "stdout", text: "old generation\n" };

    options.onResult(output);
    const outcome = await execution;

    expect(document.adapter.appendTargetOutput).toHaveBeenCalledOnceWith(target, output);
    expect(observer).not.toHaveBeenCalled();
    expect(document.adapter.finishTargetExecution).not.toHaveBeenCalled();
    expect(outcome.status).toBe("cancelled");
    resolve({ status: "ok", success: true, durationMs: 1 });
  });
});
