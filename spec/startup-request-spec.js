const path = require("node:path");
const { Emitter } = require("lumine");

describe("kernel startup invocation ownership", () => {
  let manager, store, editor, previousAutoPicker;
  const grammar = { name: "Python", scopeName: "source.python" };
  const spec = { name: "python3", display_name: "Python", language: "python", argv: ["python"] };

  beforeEach(async () => {
    const { KernelManager } = require("../lib/kernel-manager");
    store = require("../lib/store");
    manager = new KernelManager();
    editor = await lumine.workspace.open();
    editor.setText("source()");
    previousAutoPicker = lumine.config.get("jupyter-repl.autoKernelPicker");
    lumine.config.set("jupyter-repl.autoKernelPicker", true);
  });
  afterEach(() => {
    manager.dispose();
    editor.destroy();
    lumine.config.set("jupyter-repl.autoKernelPicker", previousAutoPicker);
  });

  function holdLaunch() {
    let ready;
    spyOn(require("../lib/zmq-connection-generation").prototype, "start").and.callFake(
      function (_options, onStarted) {
        ready = () => {
          this.transport.setLifecycle("ready");
          onStarted(this.transport);
        };
        return new Promise(() => {});
      },
    );
    return () => ready();
  }

  it("refuses an aborted invocation before discovering a kernelspec", async () => {
    const controller = new AbortController();
    controller.abort();
    const discover = spyOn(manager, "getKernelSpecForGrammar");
    expect(
      await manager.startKernelFor(grammar, editor, "cancelled.py", null, {
        signal: controller.signal,
      }),
    ).toBeNull();
    expect(discover).not.toHaveBeenCalled();
  });

  it("refuses a stale predicate before allocating a launch marker", () => {
    const before = store.startingKernels.size;
    const launch = spyOn(require("../lib/zmq-connection-generation").prototype, "start");
    expect(
      manager.startKernel(spec, grammar, editor, "stale.py", null, { isCurrent: () => false }),
    ).toBeUndefined();
    expect(launch).not.toHaveBeenCalled();
    expect(store.startingKernels.size).toBe(before);
  });

  it("does not spawn after the invocation's binding changes while discovery waits", async () => {
    let discover;
    let binding = "original";
    spyOn(manager, "getAllKernelSpecsForGrammar").and.returnValue(
      new Promise((resolve) => {
        discover = resolve;
      }),
    );
    const launch = spyOn(manager, "startKernel");
    const pending = manager.startKernelFor(grammar, editor, "captured.py", null, {
      isCurrent: () => binding === "original",
    });
    binding = "replacement";
    discover([spec]);
    expect(await pending).toBeNull();
    expect(launch).not.toHaveBeenCalled();
  });

  it("destroys a ready transport instead of registering it after its binding changes", () => {
    const ready = holdLaunch();
    let current = true;
    const register = spyOn(store, "newKernel");
    const started = jasmine.createSpy("started");
    const transport = manager.startKernel(spec, grammar, editor, "captured.py", started, {
      isCurrent: () => current,
    });
    current = false;
    ready();
    expect(register).not.toHaveBeenCalled();
    expect(started).toHaveBeenCalledOnceWith(null);
    expect(transport._destroyed).toBe(true);
    expect(manager._pendingStarts.size).toBe(0);
    expect(store.startingKernels.has(editor)).toBe(false);
  });

  it("releases an aborted pending launch and refuses its late readiness callback", () => {
    const ready = holdLaunch();
    const controller = new AbortController();
    const register = spyOn(store, "newKernel");
    const started = jasmine.createSpy("started");
    const transport = manager.startKernel(spec, grammar, editor, "cancelled.py", started, {
      signal: controller.signal,
    });
    controller.abort();
    expect(transport._destroyed).toBe(true);
    expect(manager._pendingStarts.size).toBe(0);
    expect(store.startingKernels.has(editor)).toBe(false);
    ready();
    expect(register).not.toHaveBeenCalled();
    expect(started).toHaveBeenCalledOnceWith(null);
  });

  it("resolves an inactive source editor's session with its embedded execution grammar", () => {
    const { wrapSession } = require("./helpers/session");
    const publicSession = wrapSession({});
    const kernel = require("../lib/plugin-api/jupyter-kernel").getInternalKernel(publicSession);
    const foreignSession = wrapSession({ id: "foreign-session" });
    const foreign = require("../lib/plugin-api/jupyter-kernel").getInternalKernel(foreignSession);
    const hostGrammar = { name: "Markdown", scopeName: "text.md" };
    spyOn(editor, "getGrammar").and.returnValue(hostGrammar);
    const filePath = path.resolve("embedded.md");
    spyOn(editor, "getPath").and.returnValue(filePath);
    spyOn(lumine.workspace, "getPaneItems").and.returnValue([]);
    const embedded = jasmine.createSpy("embedded grammar").and.returnValue(grammar);
    const sourceStore = {
      editor: null,
      globalMode: false,
      getEmbeddedGrammar: embedded,
      kernelMapping: new Map([
        [
          filePath,
          new Map([
            [grammar.name, kernel],
            [hostGrammar.name, foreign],
          ]),
        ],
      ]),
    };
    const events = new Emitter();
    const Provider = require("../lib/plugin-api/jupyter-provider");
    const provider = new Provider(events, { getStore: () => sourceStore });
    try {
      expect(provider.getKernelForEditor(editor)).toBe(publicSession);
      expect(embedded).toHaveBeenCalledWith(editor);
    } finally {
      events.dispose();
    }
  });
});
