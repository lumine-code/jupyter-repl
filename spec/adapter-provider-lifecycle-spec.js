const path = require("node:path");
const { Disposable, Emitter } = require("lumine");

async function flush() {
  for (let turn = 0; turn < 12; turn++) await Promise.resolve();
}

describe("notebook adapter provider edge ownership", () => {
  let main, integration, kernel, transport, owner, adapter, service, item, editor, leases, jobs;

  beforeEach(async () => {
    if (lumine.packages.isPackageLoaded("jupyter-repl"))
      await lumine.packages.unloadPackage("jupyter-repl");
    const pack = await lumine.packages.activatePackage(path.resolve(__dirname, ".."));
    main = pack.mainModule;
    integration = require("../lib/adapter-integration");
    const KernelTransport = require("../lib/kernel-transport");
    const Kernel = require("../lib/kernel");
    class Transport extends KernelTransport {
      supportsComms = false;
      requests = [];
      constructor(grammar) {
        super({ name: "python3", display_name: "Python 3", language: "python" }, grammar);
        this.setLifecycle("ready");
        this.setExecutionState("idle");
      }
      execute(code, receive) {
        this.requests.push({ code, receive });
        return { cancelQueued: () => false };
      }
      reply(record, type, content, channel = "iopub") {
        record.receive(
          {
            header: { msg_id: "reply", msg_type: type },
            parent_header: { msg_id: "request", msg_type: "execute_request" },
            content,
          },
          channel,
        );
      }
    }
    editor = lumine.workspace.buildTextEditor();
    editor.setText("while True: pass");
    const events = new Emitter();
    owner = {
      id: "provider-owned-notebook",
      getPath: () => "C:/work/provider-owned-notebook.ipynb",
      isDestroyed: () => owner.destroyed === true,
      onDidDestroy: (callback) => events.on("destroy", callback),
      onDidChangePath: () => new Disposable(),
      destroy() {
        if (owner.destroyed) return;
        owner.destroyed = true;
        events.emit("destroy");
        events.dispose();
      },
    };
    item = {
      element: document.createElement("div"),
      getPath: owner.getPath,
      getTitle: () => "Provider lifetime",
      getURI: () => "lumine://jupyter-provider-lifetime-test",
      isDestroyed: owner.isDestroyed,
      onDidDestroy: owner.onDidDestroy,
      destroy: owner.destroy,
    };
    lumine.workspace.getCenter().getActivePane().addItem(item);
    const target = {
      id: "endless-cell",
      type: "code",
      executable: true,
      source: editor.getText(),
      row: 0,
      editor,
    };
    jobs = [];
    adapter = {
      getPaneItem: () => item,
      getKernelOwner: () => owner,
      getPath: owner.getPath,
      getTitle: item.getTitle,
      getMetadata: () => ({ kernelspec: { name: "python3", language: "python" } }),
      getKernelLanguage: () => "python",
      getKernelGrammar: () => editor.getGrammar(),
      getActiveTargetId: () => target.id,
      getKernelTarget: () => target,
      getRunTarget: (id) => (id === target.id ? target : null),
      getRunTargets: () => [target],
      setKernelSpec: () => true,
      clearTargetOutputs: jasmine.createSpy("clear outputs"),
      beginTargetExecution: jasmine.createSpy("begin execution").and.callFake((target) => {
        const job = { target, active: true, finished: false, disposed: 0 };
        job.lease = new Disposable(() => {
          job.disposed++;
          if (!job.finished) job.active = false;
        });
        jobs.push(job);
        return job.lease;
      }),
      appendTargetOutput: jasmine.createSpy("append output"),
      finishTargetExecution: jasmine.createSpy("finish execution").and.callFake((target) => {
        const job = jobs.find((candidate) => candidate.target === target);
        if (job) {
          job.finished = true;
          job.active = false;
        }
      }),
    };
    service = { getAdapterForItem: (candidate) => (candidate === item ? adapter : null) };
    leases = [main.consumeJupyterAdapter(service)];
    await flush();
    transport = new Transport(editor.getGrammar());
    kernel = new Kernel(transport);
    const context = integration.captureAdapterKernelContext([service], adapter);
    expect(await integration.bindAdapterKernel(context, kernel, { owned: false })).toBe(true);
    spyOn(kernel, "interrupt");
  });

  afterEach(async () => {
    for (const lease of leases.reverse()) lease.dispose();
    kernel?.destroy();
    owner?.destroy();
    editor?.destroy();
    await flush();
    if (lumine.packages.isPackageLoaded("jupyter-repl"))
      await lumine.packages.unloadPackage("jupyter-repl");
    await lumine.fileWatchClient.settlePendingTeardown();
  });

  function lateOutput() {
    transport.reply(transport.requests[0], "stream", { name: "stdout", text: "late output" });
  }

  it("routes global notebook commands through a minimal item resolver", () => {
    spyOn(lumine.workspace.getCenter(), "getActivePaneItem").and.returnValue(item);
    const context = integration.captureAdapterKernelContext([service]);
    expect(context.adapter).toBe(adapter);
    expect(integration.handleAdapterKernelCommand([service], "interrupt-kernel")).toBe(true);
    expect(kernel.interrupt).toHaveBeenCalledTimes(1);
  });

  it("keeps an endless request alive until the last duplicate provider lease disappears", async () => {
    leases.push(main.consumeJupyterAdapter(service));
    const receipt = await main
      .provideJupyterExecution()
      .execute({ item, owner, targets: adapter.getRunTargets(), scope: "all" });
    await flush();
    expect(transport.requests.length).toBe(1);
    let settled = false;
    receipt.done.then(() => {
      settled = true;
    });
    leases[0].dispose();
    await flush();
    expect(settled).toBe(false);
    lateOutput();
    expect(adapter.appendTargetOutput).toHaveBeenCalledTimes(1);
    leases[1].dispose();
    const outcome = await receipt.done;
    await flush();
    expect(outcome.status).toBe("unavailable");
    expect(owner.isDestroyed()).toBe(false);
    expect(jobs[0].disposed).toBe(1);
    expect(jobs[0].active).toBe(false);
    expect(kernel.getPluginWrapper().isDestroyed()).toBe(false);
    expect([...kernel._inFlight.values()][0].onResults).toBeNull();
    lateOutput();
    expect(adapter.appendTargetOutput).toHaveBeenCalledTimes(1);
    expect(adapter.finishTargetExecution).not.toHaveBeenCalled();
    expect(kernel.interrupt).not.toHaveBeenCalled();
  });

  it("revokes an explicit MCP target's observation without destroying its live document or interrupting code", async () => {
    const observed = jasmine.createSpy("MCP output");
    const execution = integration.runExplicitAdapterTarget(
      [service],
      adapter,
      kernel,
      adapter.getRunTargets()[0],
      observed,
    );
    await flush();
    expect(transport.requests.length).toBe(1);
    leases[0].dispose();
    const outcome = await execution;
    expect(outcome.status).toBe("cancelled");
    expect(outcome.reason).toBe("notebook adapter provider retired");
    expect(jobs[0].disposed).toBe(1);
    expect([...kernel._inFlight.values()][0].onResults).toBeNull();
    lateOutput();
    expect(observed).not.toHaveBeenCalled();
    expect(adapter.appendTargetOutput).not.toHaveBeenCalled();
    expect(adapter.finishTargetExecution).not.toHaveBeenCalled();
    expect(kernel.interrupt).not.toHaveBeenCalled();
  });

  it("combines invocation cancellation with target ownership and removes the observation", async () => {
    const controller = new AbortController();
    const execution = integration.runExplicitAdapterTarget(
      [service],
      adapter,
      kernel,
      adapter.getRunTargets()[0],
      null,
      { signal: controller.signal },
    );
    await flush();
    controller.abort();
    const outcome = await execution;
    expect(outcome.status).toBe("cancelled");
    expect(jobs[0].disposed).toBe(1);
    expect([...kernel._inFlight.values()][0].onResults).toBeNull();
    expect(kernel.interrupt).not.toHaveBeenCalled();
  });

  it("allows the same provider object to return without reviving its revoked requests", async () => {
    const first = await main
      .provideJupyterExecution()
      .execute({ item, owner, targets: adapter.getRunTargets(), scope: "all" });
    await flush();
    leases[0].dispose();
    expect((await first.done).status).toBe("unavailable");
    await flush();
    leases.push(main.consumeJupyterAdapter(service));
    const second = await main
      .provideJupyterExecution()
      .execute({ item, owner, targets: adapter.getRunTargets(), scope: "all" });
    await flush();
    expect(transport.requests.length).toBe(2);
    jobs[0].lease.dispose();
    expect(jobs[1].active).toBe(true);
    expect(jobs[1].disposed).toBe(0);
    lateOutput();
    expect(adapter.appendTargetOutput).not.toHaveBeenCalled();
    transport.reply(transport.requests[1], "stream", { name: "stdout", text: "current provider" });
    transport.reply(transport.requests[1], "execute_reply", { status: "ok" }, "shell");
    transport.reply(transport.requests[1], "status", { execution_state: "idle" });
    expect((await second.done).status).toBe("ok");
    expect(jobs[1].finished).toBe(true);
    expect(jobs[1].disposed).toBe(1);
    expect(adapter.appendTargetOutput).toHaveBeenCalledTimes(1);
    expect(kernel.interrupt).not.toHaveBeenCalled();
  });

  it("disposes a lease returned after reentrant provider revocation during begin", async () => {
    const disposed = jasmine.createSpy("late lease disposed");
    adapter.beginTargetExecution.and.callFake(() => {
      leases[0].dispose();
      return new Disposable(disposed);
    });
    const receipt = await main
      .provideJupyterExecution()
      .execute({ item, owner, targets: adapter.getRunTargets(), scope: "all" });
    expect((await receipt.done).status).toBe("unavailable");
    await flush();
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(transport.requests.length).toBe(0);
    expect(owner.isDestroyed()).toBe(false);
    expect(adapter.finishTargetExecution).not.toHaveBeenCalled();
  });

  it("disposes a normal lease only after the provider finishes its captured job", async () => {
    const execution = integration.runExplicitAdapterTarget(
      [service],
      adapter,
      kernel,
      adapter.getRunTargets()[0],
    );
    await flush();
    expect(jobs[0].active).toBe(true);
    expect(jobs[0].disposed).toBe(0);
    transport.reply(transport.requests[0], "execute_reply", { status: "ok" }, "shell");
    transport.reply(transport.requests[0], "status", { execution_state: "idle" });
    expect((await execution).status).toBe("ok");
    expect(jobs[0].finished).toBe(true);
    expect(jobs[0].active).toBe(false);
    expect(jobs[0].disposed).toBe(1);
  });

  it("refuses a begin hook that does not return its required execution lease", async () => {
    adapter.beginTargetExecution.and.returnValue(undefined);
    const receipt = await main
      .provideJupyterExecution()
      .execute({ item, owner, targets: adapter.getRunTargets(), scope: "all" });
    const outcome = await receipt.done;
    expect(outcome.status).toBe("error");
    expect(outcome.error.ename).toBe("TypeError");
    expect(outcome.error.evalue).toContain("must return a Disposable");
    expect(transport.requests.length).toBe(0);
    expect(kernel.interrupt).not.toHaveBeenCalled();
  });
});
