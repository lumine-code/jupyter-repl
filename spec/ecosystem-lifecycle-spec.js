const path = require("node:path");
const { Disposable } = require("lumine");

const FAMILY = [
  "jupyter-repl",
  "jupyter-cells",
  "jupyter-view",
  "jupyter-inspector",
  "jupyter-variables",
  "jupyter-explorer",
  "jupyter-watches",
  "jupyter-prompt",
  "jupyter-monitor",
];

async function flush() {
  for (let index = 0; index < 12; index++) await Promise.resolve();
}

function main(name) {
  return lumine.packages.getActivePackage(name).mainModule;
}

function peerModule(name, file) {
  return require(path.resolve(lumine.packages.getLoadedPackage(name).path, "lib", file));
}

async function stopFamily() {
  for (const name of [...FAMILY].reverse()) {
    if (lumine.packages.isPackageLoaded(name)) await lumine.packages.unloadPackage(name);
  }
  await flush();
}

async function activateFamily(order = FAMILY) {
  for (const name of order) {
    await lumine.packages.activatePackage(
      name === "jupyter-repl" ? path.resolve(__dirname, "..") : name,
    );
  }
  await flush();
}

// The runtime, service hub and all consumers are real. Only the wire boundary
// is controlled, so late messages and channel order remain deterministic.
function kernel(grammar) {
  const KernelTransport = require("../lib/kernel-transport");
  const Kernel = require("../lib/kernel");
  class Transport extends KernelTransport {
    supportsComms = false;
    requests = [];
    constructor() {
      super({ name: "python3", display_name: "Python 3", language: "python" }, grammar);
      this.setLifecycle("ready");
      this.setExecutionState("idle");
    }
    execute(code, receive) {
      this.requests.push({ code, receive });
      return { cancelQueued: () => false };
    }
    executeWatch(code, receive) {
      return this.execute(code, receive);
    }
    complete(code, receive) {
      const record = { code, receive };
      this.requests.push(record);
      return new Disposable();
    }
    inspect(code, _cursor, receive) {
      return this.complete(code, receive);
    }
    reply(record, type, content, channel = "iopub") {
      record.receive(
        {
          header: { msg_id: `${type}-${this.requests.length}`, msg_type: type },
          parent_header: { msg_id: "request", msg_type: "execute_request" },
          content,
        },
        channel,
      );
    }
    finish(record, outputs = []) {
      for (const output of outputs) {
        const { output_type: type, ...content } = output;
        this.reply(record, type, content);
      }
      this.reply(record, "execute_reply", { status: "ok" }, "shell");
      this.reply(record, "status", { execution_state: "idle" });
    }
  }
  return new Kernel(new Transport());
}

describe("nine-package Jupyter lifecycle", () => {
  let kernels, edges;

  beforeEach(async () => {
    jasmine.attachToDOM(lumine.views.getView(lumine.workspace));
    kernels = [];
    edges = [];
    await stopFamily();
    await lumine.packages.activatePackage("language-python");
    await lumine.packages.activatePackage("language-ipython");
    await lumine.packages.activatePackage("language-json");
    await lumine.packages.activatePackage("language-text");
  });

  afterEach(async () => {
    for (const edge of edges.reverse()) edge.dispose();
    for (const item of [...lumine.workspace.getPaneItems()]) item.destroy?.();
    for (const value of kernels) value.destroy();
    await stopFamily();
    await lumine.fileWatchClient.settlePendingTeardown();
  });

  function makeKernel() {
    const value = kernel(lumine.grammars.grammarForScopeName("source.python"));
    kernels.push(value);
    return value;
  }

  async function sourceEditor(code = "# %%\nvalue = 1") {
    const editor = await lumine.workspace.open();
    editor.setText(code);
    lumine.grammars.assignLanguageMode(editor.getBuffer(), "source.python");
    await editor.getBuffer().getLanguageMode().atTransactionEnd?.();
    return editor;
  }

  function registerEditor(value, editor) {
    const store = require("../lib/store");
    store.newKernel(value, `Unsaved Editor ${editor.id}`, editor, editor.getGrammar());
    store.updateEditor(editor);
    store.updateActivePaneItem(editor);
    return value.getPluginWrapper();
  }

  for (const order of [
    FAMILY,
    [...FAMILY.slice(1), FAMILY[0]],
    [
      "jupyter-prompt",
      "jupyter-monitor",
      ...FAMILY.filter((name) => !["jupyter-prompt", "jupyter-monitor"].includes(name)),
    ],
  ]) {
    it(`connects all nine packages with ${order[0]} activated first`, async () => {
      await activateFamily(order);
      const provider = main("jupyter-repl").provideJupyterKernel();
      const output = main("jupyter-repl").provideJupyterOutput();
      const execution = main("jupyter-repl").provideJupyterExecution();
      expect(main("jupyter-variables").getSession().provider).toBe(provider);
      expect(main("jupyter-watches").getSession().provider).toBe(provider);
      expect(main("jupyter-watches").getSession().outputService).toBe(output);
      expect(main("jupyter-inspector").deserializeInspectorPane().component.session.provider).toBe(
        provider,
      );
      expect(main("jupyter-view").executionService).toBe(execution);
      expect(peerModule("jupyter-view", "output-renderer").get()).toBe(output);
      expect(peerModule("jupyter-cells", "services").getExecution()).toBe(execution);
      expect(peerModule("jupyter-cells", "services").getKernel()).toBe(provider);
      expect(peerModule("jupyter-cells", "services").getOutput()).toBe(output);
      expect(main("jupyter-prompt").getKernelProvider()).toBe(provider);
      expect(main("jupyter-prompt").getExecutionService()).toBe(execution);
      expect(main("jupyter-prompt").getPromptPanel()).toBeNull();
      expect(main("jupyter-monitor").deserializeMonitorPane().component.provider).toBe(provider);
    });
  }

  async function promptPanel() {
    lumine.commands.dispatch(lumine.views.getView(lumine.workspace), "jupyter-prompt:toggle-focus");
    await flush();
    return main("jupyter-prompt").getPromptPanel();
  }

  it("runs standalone prompt code on its captured session through shared dock output", async () => {
    await activateFamily();
    const editor = await sourceEditor();
    const value = makeKernel();
    registerEditor(value, editor);
    const panel = await promptPanel();
    const running = panel.run("print('prompt')");
    await flush();
    const request = value.transport.requests.find((record) => record.code === "print('prompt')");
    expect(request).toBeTruthy();
    const otherEditor = await sourceEditor();
    const other = makeKernel();
    registerEditor(other, otherEditor);
    value.transport.finish(request, [{ output_type: "stream", name: "stdout", text: "prompt\n" }]);
    await running;
    expect(panel.history[0].status).toBe("ok");
    expect(value.outputStore.outputs.at(-1).text).toBe("prompt\n");
    expect(other.transport.requests.some((record) => record.code === "print('prompt')")).toBe(
      false,
    );
  });

  it("retires prompt observation on unload while the runtime and monitor stay available", async () => {
    await activateFamily();
    const editor = await sourceEditor();
    const value = makeKernel();
    const session = registerEditor(value, editor);
    const monitor = main("jupyter-monitor").deserializeMonitorPane();
    const panel = await promptPanel();
    const running = panel.run("never_finishes()");
    await flush();
    const request = value.transport.requests.find((record) => record.code === "never_finishes()");
    expect(request).toBeTruthy();
    await lumine.packages.unloadPackage("jupyter-prompt");
    await running;
    expect(panel.destroyed).toBe(true);
    expect(panel.history[0].status).toBe("cancelled");
    expect(session.isDestroyed()).toBe(false);
    expect(monitor.component.provider.getRunningKernels()).toContain(session);
    value.transport.finish(request, [{ output_type: "stream", name: "stdout", text: "late\n" }]);
    await flush();
    expect(value.outputStore.outputs.some((output) => output.text === "late\n")).toBe(false);
    await lumine.packages.activatePackage("jupyter-prompt");
    expect(main("jupyter-prompt").getKernelProvider()).toBe(
      main("jupyter-repl").provideJupyterKernel(),
    );
    expect(main("jupyter-prompt").getPromptPanel()).toBeNull();
  });

  it("unloads and restores the standalone monitor without retiring shared sessions", async () => {
    await activateFamily();
    const editor = await sourceEditor();
    const session = registerEditor(makeKernel(), editor);
    const provider = main("jupyter-repl").provideJupyterKernel();
    const monitor = main("jupyter-monitor").deserializeMonitorPane();
    await lumine.workspace.open(monitor);
    expect(monitor.component.provider.getRunningKernels()).toContain(session);
    await lumine.packages.unloadPackage("jupyter-monitor");
    expect(monitor.destroyed).toBe(true);
    expect(session.isDestroyed()).toBe(false);
    expect(main("jupyter-prompt").getKernelProvider()).toBe(provider);
    await lumine.packages.activatePackage("jupyter-monitor");
    await flush();
    const restored = main("jupyter-monitor").deserializeMonitorPane();
    expect(restored).not.toBe(monitor);
    expect(restored.component.provider).toBe(provider);
    expect(restored.component.provider.getRunningKernels()).toContain(session);
  });

  it("resolves an inactive panel expression to its own session", async () => {
    await activateFamily();
    const editor = await sourceEditor();
    const active = registerEditor(makeKernel(), editor);
    const target = makeKernel();
    const store = require("../lib/store");
    store.commitNotebookKernel(store.prepareNotebookKernel(target, "panel-owned-session"));
    const session = target.getPluginWrapper();
    const item = await main("jupyter-explorer").provideExplorer().explore(session, "value");
    target.transport.finish(target.transport.requests[0], [
      { output_type: "stream", name: "stdout", text: '{"kind":"scalar","repr":"value"}\n' },
    ]);
    await flush();
    await lumine.workspace.open(editor);
    const expression = item.element
      .querySelector("lumine-text-editor.explorer-expression")
      .getModel();
    const provider = main("jupyter-repl").provideJupyterKernel();
    expect(provider.getActiveKernel()).toBe(active);
    expect(provider.getKernelForEditor(expression)).toBe(session);
    expect(provider.getKernelForItem(item)).toBe(session);
    expect(
      main("jupyter-repl").provideJupyterContext().getFocusedEditor({ target: expression.element }),
    ).toBe(expression);
  });

  it("resolves notebook fragments through their document adapter with another editor active", async () => {
    await activateFamily();
    const notebook = await main("jupyter-view").newNotebook();
    await notebook._sourceEditorSetupPromise;
    const adapterService = main("jupyter-view").provideJupyterAdapter();
    const adapter = adapterService.getAdapterForItem(notebook);
    const target = makeKernel();
    const integration = require("../lib/adapter-integration");
    expect(await integration.bindExistingAdapterKernel([adapterService], adapter, target)).toBe(
      true,
    );
    const fragment = notebook.getCellEditor(1);
    const editor = await sourceEditor();
    const active = registerEditor(makeKernel(), editor);
    const provider = main("jupyter-repl").provideJupyterKernel();
    expect(provider.getActiveKernel()).toBe(active);
    expect(provider.getKernelForEditor(fragment)).toBe(target.getPluginWrapper());
    expect(provider.getKernelForItem(notebook)).toBe(target.getPluginWrapper());
    expect(peerModule("jupyter-cells", "services").getAdapter(notebook).getKernelOwner()).toBe(
      notebook.document,
    );
  });

  it("invalidates real-session observations before late output reaches panel models", async () => {
    await activateFamily();
    const editor = await sourceEditor();
    const value = makeKernel();
    const session = registerEditor(value, editor);
    const watch = main("jupyter-watches").getSession().storeFor(session).createWatch();
    watch.setCode("value");
    watch.toggleWatching();
    const variables = main("jupyter-variables").getSession().storeFor(session);
    variables.fetchVariables();
    await flush();
    const old = [...value.transport.requests];
    value.transport.emitDidResetComms("Connection replaced");
    for (const request of old)
      value.transport.finish(request, [{ output_type: "stream", name: "stdout", text: "late" }]);
    await flush();
    expect(session.generation).toBe(1);
    expect(watch.getCode()).toBe("value");
    expect(watch.outputStore.outputs).toEqual([]);
    expect(watch._running).toBe(false);
    expect(variables.variables).toEqual([]);
    expect(variables.refreshing).toBe(false);
  });

  it("keeps watch models and editors when a real output provider edge is replaced", async () => {
    await activateFamily();
    const editor = await sourceEditor();
    const session = registerEditor(makeKernel(), editor);
    const watches = main("jupyter-watches");
    const watch = watches.getSession().storeFor(session).createWatch();
    watch.setCode("value");
    watch.outputStore.appendOutput({ output_type: "stream", name: "stdout", text: "retained" });
    const pane = await lumine.workspace.open(watches.WATCHES_URI);
    require("@lumine-code/etch").updateSync(pane.component);
    const firstEditor = [...watches.getSession().storeFor(session).editors.keys()][0];
    const output = main("jupyter-repl").provideJupyterOutput();
    const replacement = new Proxy(output, {});
    const edge = lumine.packages.serviceHub.provide("jupyter.output", "1.0.0", replacement);
    edges.push(edge);
    await flush();
    require("@lumine-code/etch").updateSync(pane.component);
    expect(watches.getSession().outputService).toBe(replacement);
    expect(watches.getSession().storeFor(session).watches[0]).toBe(watch);
    expect(watch.getCode()).toBe("value");
    expect(watch.outputStore.outputs[0].text).toBe("retained");
    expect([...watches.getSession().storeFor(session).editors.keys()][0]).toBe(firstEditor);
    edge.dispose();
    await flush();
    expect(pane.destroyed).not.toBe(true);
    expect(watch.outputStore.outputs[0].text).toBe("retained");
  });

  it("reconnects notebook and cells consumers after runtime cache teardown", async () => {
    await activateFamily();
    const notebook = await main("jupyter-view").newNotebook();
    await notebook._sourceEditorSetupPromise;
    const cells = peerModule("jupyter-cells", "services");
    const firstExecution = cells.getExecution();
    const firstOutput = peerModule("jupyter-view", "output-renderer").get();
    const prompt = main("jupyter-prompt");
    const monitor = main("jupyter-monitor").deserializeMonitorPane();
    const retired = makeKernel();
    const retiredSession = retired.getPluginWrapper();
    require("../lib/store").commitNotebookKernel(
      require("../lib/store").prepareNotebookKernel(retired, "retired-session"),
    );
    await lumine.packages.unloadPackage("jupyter-repl");
    await flush();
    expect(retiredSession.isDestroyed()).toBe(true);
    expect(notebook.document.isDestroyed()).toBe(false);
    expect(lumine.workspace.getPaneItems()).toContain(notebook);
    expect(cells.getExecution()).toBeNull();
    expect(main("jupyter-view").executionService).toBeNull();
    expect(peerModule("jupyter-view", "output-renderer").get()).toBeNull();
    expect(prompt.getKernelProvider()).toBeNull();
    expect(prompt.getExecutionService()).toBeNull();
    expect(monitor.component.provider.getRunningKernels()).toEqual([]);
    expect(monitor.destroyed).not.toBe(true);
    await lumine.packages.activatePackage(path.resolve(__dirname, ".."));
    await flush();
    expect(cells.getExecution()).toBeTruthy();
    expect(cells.getExecution() !== firstExecution).toBe(true);
    expect(main("jupyter-view").executionService).toBe(cells.getExecution());
    expect(peerModule("jupyter-view", "output-renderer").get() !== firstOutput).toBe(true);
    expect(prompt.getExecutionService()).toBe(cells.getExecution());
    expect(prompt.getKernelProvider()).toBe(main("jupyter-repl").provideJupyterKernel());
    expect(monitor.component.provider).toBe(prompt.getKernelProvider());
    const fresh = makeKernel();
    expect(fresh.getPluginWrapper().id).not.toBe(retiredSession.id);
    const service = main("jupyter-view").provideJupyterAdapter();
    const adapter = service.getAdapterForItem(notebook);
    expect(
      await require("../lib/adapter-integration").bindExistingAdapterKernel(
        [service],
        adapter,
        fresh,
      ),
    ).toBe(true);
    expect(main("jupyter-repl").provideJupyterKernel().getKernelForItem(notebook)).toBe(
      fresh.getPluginWrapper(),
    );
    notebook.document.updateCellSource(0, "1 + 1", notebook);
    const notebookRun = main("jupyter-view").executeNotebook("cell", false, {
      target: notebook.getElement(),
    });
    const notebookReceipt = await notebookRun;
    expect(notebookReceipt.accepted).toBe(true);
    await flush();
    const notebookRequest = fresh.transport.requests.at(-1);
    expect(notebookRequest.code).toBe("1 + 1");
    fresh.transport.finish(notebookRequest, [
      {
        output_type: "execute_result",
        data: { "text/plain": "2" },
        metadata: {},
        execution_count: 1,
      },
    ]);
    expect((await notebookReceipt.done).status).toBe("ok");
    expect(notebook.document.getCell(0).outputs.at(-1).data["text/plain"]).toBe("2");

    const editor = await sourceEditor("# %%\nprint('source')");
    const sourceKernel = makeKernel();
    registerEditor(sourceKernel, editor);
    const sourceRun = peerModule("jupyter-cells", "run-cells").runCell(editor, false, editor);
    const sourceReceipt = await sourceRun;
    expect(sourceReceipt.accepted).toBe(true);
    await flush();
    const sourceRequest = sourceKernel.transport.requests.at(-1);
    expect(sourceRequest.code).toContain("print('source')");
    sourceKernel.transport.finish(sourceRequest, [
      { output_type: "stream", name: "stdout", text: "source\n" },
    ]);
    expect((await sourceReceipt.done).status).toBe("ok");
  });

  it("does not let disposed same-object edges erase their replacements", async () => {
    await activateFamily();
    const output = main("jupyter-repl").provideJupyterOutput();
    for (const name of [
      "jupyter-cells",
      "jupyter-view",
      "jupyter-inspector",
      "jupyter-variables",
      "jupyter-watches",
    ]) {
      const consumer = main(name);
      const old = consumer.consumeJupyterOutput(output);
      const current = consumer.consumeJupyterOutput(output);
      edges.push(current);
      old.dispose();
      const actual =
        name === "jupyter-cells"
          ? peerModule(name, "services").getOutput()
          : name === "jupyter-watches"
            ? consumer.getSession().outputService
            : peerModule(name, "output-renderer").get();
      expect(actual).withContext(name).toBe(output);
    }
    const provider = main("jupyter-repl").provideJupyterKernel();
    const execution = main("jupyter-repl").provideJupyterExecution();
    const prompt = main("jupyter-prompt");
    const oldKernel = prompt.consumeJupyterKernel(provider);
    const currentKernel = prompt.consumeJupyterKernel(provider);
    const oldExecution = prompt.consumeJupyterExecution(execution);
    const currentExecution = prompt.consumeJupyterExecution(execution);
    const monitor = main("jupyter-monitor");
    const oldMonitor = monitor.consumeJupyterKernel(provider);
    const currentMonitor = monitor.consumeJupyterKernel(provider);
    edges.push(currentKernel, currentExecution, currentMonitor);
    oldKernel.dispose();
    oldExecution.dispose();
    oldMonitor.dispose();
    expect(prompt.getKernelProvider()).toBe(provider);
    expect(prompt.getExecutionService()).toBe(execution);
    expect(monitor.deserializeMonitorPane().component.provider).toBe(provider);
  });
});
