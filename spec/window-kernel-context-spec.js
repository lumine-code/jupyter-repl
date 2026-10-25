const { CompositeDisposable, Emitter } = require("lumine");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

describe("window-local kernel status and command pickers", () => {
  let owner, consumer, notebook, notebookDocument, directory;
  beforeEach(async () => {
    const textGrammarPackage = await lumine.packages.activatePackage("language-text");
    await textGrammarPackage.resourceLoadPromise;
    jasmine.useRealClock();
    jasmine.attachToDOM(lumine.workspace.getElement());
    await lumine.packages.activatePackage("status-bar");
    owner = new CompositeDisposable();
    notebook = notebookDocument = directory = null;
    const { StatusBarConsumer } = require("../lib/services/consumed/status-bar/status-bar");
    consumer = new StatusBarConsumer();
  });
  afterEach(async () => {
    consumer.dispose();
    owner.dispose();
    const watchedFile = notebookDocument?.file;
    notebook?.destroy();
    notebookDocument?.destroy();
    await watchedFile?.closed;
    if (directory) fs.rmSync(directory, { recursive: true, force: true });
    await lumine.workspace.discardEditorWindows();
  });
  it("keeps the notebook kernel visible while editing its cells", async () => {
    await lumine.packages.activatePackage("language-python");
    await lumine.packages.activatePackage("language-json");
    const peer = await lumine.packages.loadPackage("jupyter-view");
    const NotebookDocument = require(path.join(peer.path, "lib/notebook-document"));
    const JupyterNotebookEditor = require(path.join(peer.path, "lib/jupyter-notebook-editor"));
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "jupyter-window-kernel-"));
    const filePath = path.join(directory, "notebook.ipynb");
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        cells: [
          {
            cell_type: "code",
            id: "python",
            metadata: {},
            source: ["1 + 1"],
            execution_count: null,
            outputs: [],
          },
        ],
        metadata: { kernelspec: { name: "python3", language: "python" } },
        nbformat: 4,
        nbformat_minor: 5,
      }),
    );
    notebookDocument = new NotebookDocument(filePath);
    await notebookDocument.load();
    notebook = new JupyterNotebookEditor(notebookDocument);
    await notebook._sourceEditorSetupPromise;
    const window = lumine.workspace.getMainWindow();
    const container = window.getEditorContainer();
    container.getActivePane().activateItem(notebook, { activatePane: true });
    const events = new Emitter();
    owner.add(events);
    const kernel = {
      displayName: "Python 3",
      executionState: "idle",
      onDidChangeStatus: (callback) => events.on("status", callback),
    };
    const session = {
      runningKernels: [kernel],
      kernelMapping: new Map([[filePath, kernel]]),
      markersMapping: new Map(),
      getEmbeddedGrammar: (editor) => editor.getGrammar(),
      newMarkerStore: () => ({}),
      onDidChangeKernels: (callback) => events.on("kernels", callback),
      onDidChangeCurrentKernel: (callback) => events.on("current", callback),
    };
    const WindowKernelContext = require("../lib/window-kernel-context");
    const context = new WindowKernelContext(session, window);
    owner.add(context);
    const changed = jasmine.createSpy("current kernel changed");
    owner.add(context.onDidChangeCurrentKernel(changed));
    const service = lumine.packages.getActivePackage("status-bar").mainModule.provideStatusBar();
    lumine.config.set("jupyter-repl.statusBarDisable", false);
    owner.add(
      consumer.addStatusBar(context, service.forWindow(window), {
        window,
        beforeRender: () => require("@lumine-code/etch").setScheduler(lumine.views),
      }),
    );
    const tile = window.getElement().querySelector("status-bar-tile.jupyter-repl");
    expect(context.kernel).toBe(kernel);
    expect(tile.textContent).toContain("Python 3");

    for (const language of ["python", "json"]) {
      notebook.setCellLanguage(0, language);
      for (const mode of ["edit", "command"]) {
        notebook.view.setMode(mode);
        await lumine.views.getNextUpdatePromise();
        expect(context.editor ?? null).toBe(notebook.getActiveEmbeddedTextEditor());
        if (mode === "edit") expect(context.grammar.scopeName).toBe(`source.${language}`);
        expect(context.kernel).toBe(kernel);
        expect(context.capture().kernel).toBe(kernel);
        expect(tile.style.display).not.toBe("none");
        expect(tile.textContent).toContain("Python 3");
      }
    }
    expect(changed).not.toHaveBeenCalled();
    session.kernelMapping.delete(filePath);
    events.emit("kernels");
    await lumine.views.getNextUpdatePromise();
    expect(context.kernel).toBeFalsy();
    expect(tile.style.display).toBe("none");
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
