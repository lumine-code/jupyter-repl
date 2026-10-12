const { CompositeDisposable, Emitter } = require("lumine");

describe("window-local kernel status and command pickers", () => {
  let owner, consumer;
  beforeEach(async () => {
    jasmine.useRealClock();
    jasmine.attachToDOM(lumine.workspace.getElement());
    await lumine.packages.activatePackage("status-bar");
    owner = new CompositeDisposable();
    const { StatusBarConsumer } = require("../lib/services/consumed/status-bar/status-bar");
    consumer = new StatusBarConsumer();
  });
  afterEach(async () => {
    consumer.dispose();
    owner.dispose();
    await lumine.workspace.discardEditorWindows();
  });
  it("shows local kernels without changing the session editor and captures picker targets", async () => {
    const WindowKernelContext = require("../lib/window-kernel-context");
    const workspace = lumine.workspace;
    const first = await workspace.open();
    const main = workspace.getMainWindow();
    const extra = await workspace.openEditorWindow({ show: true });
    const second = workspace.buildTextEditor();
    extra.getEditorContainer().getActivePane().activateItem(second, { activatePane: true });
    const events = new Emitter();
    owner.add(events);
    const firstKernel = {
      displayName: "First",
      executionState: "idle",
      transport: { lifecycle: "ready" },
      onDidChangeStatus: (callback) => events.on("first-status", callback),
    };
    const secondKernel = {
      displayName: "Second",
      executionState: "idle",
      transport: { lifecycle: "ready" },
      onDidChangeStatus: (callback) => events.on("second-status", callback),
    };
    const session = {
      editor: second,
      activePaneItem: second,
      grammar: second.getGrammar(),
      kernel: secondKernel,
      runningKernels: [firstKernel, secondKernel],
      markersMapping: new Map(),
      kernelMapping: new Map([
        [`Unsaved Editor ${first.id}`, firstKernel],
        [`Unsaved Editor ${second.id}`, secondKernel],
      ]),
      getEmbeddedGrammar: (editor) => editor.getGrammar(),
      newMarkerStore(id) {
        const markers = {};
        this.markersMapping.set(id, markers);
        return markers;
      },
      onDidChangeKernels: (callback) => events.on("kernels", callback),
      onDidChangeCurrentKernel: (callback) => events.on("current", callback),
    };
    const local = new WindowKernelContext(session, main),
      remote = new WindowKernelContext(session, extra);
    owner.add(local, remote);
    expect(local.kernel).toBe(firstKernel);
    expect(remote.kernel).toBe(secondKernel);
    const service = lumine.packages.getActivePackage("status-bar").mainModule.provideStatusBar();
    for (const [context, window] of [
      [local, main],
      [remote, extra],
    ])
      owner.add(
        consumer.addStatusBar(context, service.forWindow(window), {
          window,
          beforeRender: () => require("@lumine-code/etch").setScheduler(lumine.views),
        }),
      );
    expect(main.getElement().querySelector("status-bar-tile.jupyter-repl").textContent).toContain(
      "First",
    );
    expect(extra.getElement().querySelector("status-bar-tile.jupyter-repl").textContent).toContain(
      "Second",
    );
    expect(session.editor).toBe(second);
    const handle = jasmine.createSpy("handle kernel command");
    await consumer.showKernelCommands(local.capture(), handle, main);
    await consumer.showKernelCommands(remote.capture(), handle, extra);
    const left = consumer.signalLists.get(main).view,
      right = consumer.signalLists.get(extra).view;
    expect(left.selectListHost.isVisible()).toBe(true);
    expect(right.selectListHost.isVisible()).toBe(true);
    expect(right.selectList.getElement().ownerDocument).toBe(extra.getDocument());
    session.kernelMapping.delete(`Unsaved Editor ${first.id}`);
    events.emit("kernels");
    expect(local.kernel).toBeNull();
    await left.selectList.selectItem(left.selectList.getItems()[0]);
    await left.selectList.confirmSelection();
    expect(handle.calls.mostRecent().args[1].kernel).toBe(firstKernel);
    expect(right.store.kernel).toBe(secondKernel);
  });
});
