const { Emitter, Disposable } = require("lumine");
const etch = require("@lumine-code/etch");
let createKernelTools, MONITOR_URI;

function fakeProvider(kernels = []) {
  const emitter = new Emitter();
  return {
    emitter,
    getRunningKernels: () => kernels,
    getActiveKernel: () => kernels[0] || null,
    getFilesForKernel: () => [],
    observeActiveKernel(callback) {
      callback(kernels[0] || null);
      return new Disposable();
    },
    onDidChangeKernels: (callback) => emitter.on("did-change-kernels", callback),
  };
}

describe("owned kernel UI bootstrap and persistence", () => {
  let tools, provider, ensureEtch;
  beforeEach(() => {
    ({ createKernelTools, MONITOR_URI } = require("../lib/ui/kernel-tools"));
    provider = fakeProvider();
    ensureEtch = jasmine
      .createSpy("ensure Etch")
      .and.callFake(() => etch.setScheduler(lumine.views));
    tools = createKernelTools({
      getProvider: () => provider,
      executePrompt: () => Promise.resolve({ status: "ok" }),
      ensureEtch,
    });
  });
  afterEach(() => {
    tools.dispose();
    provider?.emitter.dispose();
  });

  it("publishes commands and the opener before constructing any view", () => {
    const ownership = tools.activate();
    const commands = lumine.commands
      .findCommands({ target: lumine.views.getView(lumine.workspace) })
      .map((command) => command.name);
    expect(commands).toContain("jupyter-repl:toggle-prompt-focus");
    expect(commands).toContain("jupyter-repl:toggle-kernel-monitor-focus");
    expect(ensureEtch).not.toHaveBeenCalled();
    ownership.dispose();
    expect(
      lumine.commands
        .findCommands({ target: lumine.views.getView(lumine.workspace) })
        .map((command) => command.name),
    ).not.toContain("jupyter-repl:toggle-kernel-monitor-focus");
  });

  it("keeps a restored monitor singleton through activation and opening", async () => {
    const restored = tools.deserializeMonitorPane();
    expect(restored.serialize()).toEqual({ deserializer: "jupyter-repl/KernelMonitorPane" });
    expect(restored.getURI()).toBe(MONITOR_URI);
    expect(restored.getDefaultLocation()).toBe("bottom");
    expect(restored.getAllowedLocations()).toEqual(["bottom"]);
    tools.activate();
    const opened = await lumine.workspace.open(MONITOR_URI, { searchAllPanes: true });
    expect(opened).toBe(restored);
    expect(tools.deserializeMonitorPane()).toBe(restored);
    restored.destroy();
    expect(tools.deserializeMonitorPane()).not.toBe(restored);
  });

  it("swaps a late provider into a pre-activation restored monitor", async () => {
    const previous = provider;
    provider = null;
    const restored = tools.deserializeMonitorPane();
    const empty = restored.component;
    etch.updateSync(empty);
    expect(empty.element.querySelectorAll(".monitor-row").length).toBe(0);
    provider = previous;
    tools.activate();
    await Promise.resolve();
    expect(restored.component).not.toBe(empty);
    expect(restored.component.provider).toBe(provider);
  });

  it("destroys a restored monitor even when activation never happened", () => {
    const restored = tools.deserializeMonitorPane();
    const workspacePane = lumine.workspace.getCenter().getActivePane();
    workspacePane.addItem(restored);
    tools.dispose();
    expect(restored.destroyed).toBe(true);
    expect(workspacePane.getItems()).not.toContain(restored);
  });
});

describe("UI ownership of kernel input", () => {
  let tools, provider, emitter, views;
  beforeEach(async () => {
    ({ createKernelTools } = require("../lib/ui/kernel-tools"));
    const InputView = require("../lib/input-view");
    views = [];
    emitter = new Emitter();
    const session = {
      id: "session-input",
      isDestroyed: () => false,
      onDidRequestInput: (callback) => emitter.on("input", callback),
      onDidChangeGeneration: (callback) => emitter.on("generation", callback),
      onDidDestroy: (callback) => emitter.on("destroy", callback),
    };
    provider = fakeProvider([session]);
    tools = createKernelTools({
      getProvider: () => provider,
      executePrompt: () => Promise.resolve({ status: "ok" }),
      ensureEtch() {},
    });
    spyOn(InputView.prototype, "attach").and.callFake(function () {
      views.push(this);
    });
    tools.activate();
    await Promise.resolve();
  });
  afterEach(() => {
    tools.dispose();
    emitter.dispose();
    provider.emitter.dispose();
  });

  function request() {
    const closed = new Emitter();
    const input = {
      prompt: "Name: ",
      password: true,
      reply: jasmine.createSpy("reply"),
      onDidClose: (callback) => closed.on("closed", callback),
    };
    emitter.emit("input", input);
    return { input, closed };
  }

  it("creates an input view only when requested and sends confirmation once", () => {
    expect(views).toEqual([]);
    const { input, closed } = request();
    views[0].miniEditor.setText("answer");
    views[0].confirm();
    views[0].confirm();
    expect(input.reply).toHaveBeenCalledOnceWith("answer");
    expect(views[0].closed).toBe(true);
    closed.dispose();
  });

  it("closes the view when its owning execution retires", () => {
    const { input, closed } = request();
    closed.emit("closed");
    views[0].confirm();
    expect(views[0].closed).toBe(true);
    expect(input.reply).not.toHaveBeenCalled();
    closed.dispose();
  });

  it("closes a pending prompt on generation replacement and controller disposal", () => {
    const first = request();
    emitter.emit("generation", 1);
    expect(views[0].closed).toBe(true);
    const second = request();
    tools.dispose();
    expect(views[1].closed).toBe(true);
    views[1].confirm();
    expect(first.input.reply).not.toHaveBeenCalled();
    expect(second.input.reply).not.toHaveBeenCalled();
    first.closed.dispose();
    second.closed.dispose();
  });
});
