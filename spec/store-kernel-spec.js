const store = require("../lib/store");

// The store used to derive the current kernel through mobx, so every consumer
// re-read it for free and `filePath` was a cached computed. Both are plain now:
// the kernel change is announced by whoever mutates the state, and nothing
// caches. These specs pin the two behaviours that depended on mobx.

describe("store kernel tracking", () => {
  let previousEditor;
  let previousActivePaneItem;
  let editor;

  function fakeKernel(name = "Python 3") {
    return {
      displayName: name,
      grammar: { name: "Python", scopeName: "source.python" },
      language: "python",
    };
  }

  beforeEach(async () => {
    previousEditor = store.editor;
    previousActivePaneItem = store.activePaneItem;
    editor = await lumine.workspace.open();
    store.updateEditor(editor);
    store.updateActivePaneItem(editor);
  });

  afterEach(() => {
    store.kernelMapping.clear();
    store.runningKernels = [];
    editor.destroy();
    // Only hand back what is still alive: the store reads the grammar off
    // whatever editor it is given, and an earlier spec may have destroyed the
    // one that was current when this file started.
    const live = previousEditor && !previousEditor.isDestroyed() ? previousEditor : null;
    store.updateEditor(live);
    store.updateActivePaneItem(live ? previousActivePaneItem : null);
  });

  it("announces the current kernel when one is mapped to the active file", () => {
    const seen = [];
    const subscription = store.onDidChangeCurrentKernel((kernel) => seen.push(kernel));
    const kernel = fakeKernel();

    store.kernelMapping.set(store.filePath, new Map([[store.grammar.name, kernel]]));
    store._emitKernelsChanged();

    expect(store.kernel).toBe(kernel);
    expect(seen).toEqual([kernel]);
    subscription.dispose();
  });

  it("stays quiet when a change leaves the same kernel current", () => {
    const kernel = fakeKernel();
    store.kernelMapping.set(store.filePath, new Map([[store.grammar.name, kernel]]));
    store._emitKernelsChanged();

    let calls = 0;
    const subscription = store.onDidChangeCurrentKernel(() => calls++);

    // Re-announcing the same state must not look like a change.
    store._emitKernelsChanged();
    store.updateActivePaneItem(editor);

    expect(calls).toBe(0);
    subscription.dispose();
  });

  it("announces the other file's kernel on a tab switch, in event order", async () => {
    // A tab switch fires did-change-active-pane-item first and
    // did-change-active-text-editor second; the store hears them in that
    // order. The first sees the sticky old editor and must stay quiet; the
    // second carries the new file and must announce its kernel.
    const kernelA = fakeKernel("A");
    const kernelB = fakeKernel("B");
    const editorB = await lumine.workspace.open();
    store.kernelMapping.set(store.filePath, new Map([[store.grammar.name, kernelA]]));
    store._emitKernelsChanged();
    expect(store.kernel).toBe(kernelA);

    const seen = [];
    const subscription = store.onDidChangeCurrentKernel((kernel) => seen.push(kernel));

    store.updateActivePaneItem(editorB);
    store.updateEditor(editorB);
    const keyB = store.filePath;
    store.kernelMapping.set(keyB, new Map([[store.grammar.name, kernelB]]));
    store._emitKernelsChanged();

    expect(store.kernel).toBe(kernelB);
    expect(seen[seen.length - 1]).toBe(kernelB);

    // And back: the same two-step sequence re-announces the first kernel.
    store.updateActivePaneItem(editor);
    store.updateEditor(editor);
    expect(store.kernel).toBe(kernelA);
    expect(seen[seen.length - 1]).toBe(kernelA);

    subscription.dispose();
    editorB.destroy();
  });

  it("announces the change when the active pane item moves away", () => {
    const kernel = fakeKernel();
    store.kernelMapping.set(store.filePath, new Map([[store.grammar.name, kernel]]));
    store._emitKernelsChanged();

    const seen = [];
    const subscription = store.onDidChangeCurrentKernel((k) => seen.push(k));

    // A non-editor centre item with no path of its own has no kernel.
    store.updateActivePaneItem({ getURI: () => "lumine://something-else" });

    expect(store.kernel).toBe(null);
    expect(seen).toEqual([null]);
    subscription.dispose();
  });

  it("reports the kernel an active pane item declares for itself", () => {
    // The store used to name jupyter-explorer and the inspector by URI. It
    // asks the item instead now, so a panel that has moved into its own
    // package still gets the status bar to follow what is on screen.
    const kernel = fakeKernel("Panel kernel");
    store.runningKernels = [kernel];

    store.updateActivePaneItem({
      getURI: () => "lumine://some-other-package/panel",
      getJupyterKernel: () => kernel,
    });

    expect(store.kernel).toBe(kernel);
  });

  it("maps a declared plugin wrapper back to the kernel it wraps", () => {
    // Another package only ever holds wrappers, and consumers inside this one
    // expect the internal kernel, so the wrapper must not escape.
    const kernel = fakeKernel();
    const wrapper = {};
    kernel.getPluginWrapper = () => wrapper;
    store.runningKernels = [kernel];

    store.updateActivePaneItem({ getJupyterKernel: () => wrapper });

    expect(store.kernel).toBe(kernel);
  });

  it("answers null for a declared kernel it does not know", () => {
    store.runningKernels = [fakeKernel()];
    store.updateActivePaneItem({ getJupyterKernel: () => ({ displayName: "A stranger" }) });

    expect(store.kernel).toBe(null);
  });

  it("follows an item that changes which kernel it shows", () => {
    const { Emitter } = require("lumine");
    const first = fakeKernel("First");
    const second = fakeKernel("Second");
    store.runningKernels = [first, second];

    const emitter = new Emitter();
    let shown = first;
    store.updateActivePaneItem({
      getJupyterKernel: () => shown,
      onDidChangeJupyterKernel: (callback) => emitter.on("did-change", callback),
    });

    const seen = [];
    const subscription = store.onDidChangeCurrentKernel((kernel) => seen.push(kernel));

    shown = second;
    emitter.emit("did-change");

    expect(store.kernel).toBe(second);
    expect(seen).toEqual([second]);
    subscription.dispose();
  });

  it("moves a kernel from its unsaved placeholder onto the saved path", () => {
    // An editor with no path is keyed by its id; saving has to carry the
    // kernel over, or it is stranded under a key nothing looks up again.
    const unsavedKey = `Unsaved Editor ${editor.id}`;
    const kernel = fakeKernel();
    // A mapping holds either a Kernel or a grammar-name map; the map is the
    // shape a spec can build without a real kernel.
    const mapping = new Map([[store.grammar.name, kernel]]);
    store.kernelMapping.set(unsavedKey, mapping);

    const savedPath = "/tmp/saved-by-spec.py";
    spyOn(editor, "getPath").and.returnValue(savedPath);
    store.forceEditorUpdate();

    expect(store.kernelMapping.has(unsavedKey)).toBe(false);
    expect(store.kernelMapping.get(savedPath)).toBe(mapping);
  });

  it("leaves the mapping alone when the editor was never unsaved", () => {
    const savedPath = "/tmp/already-saved.py";
    spyOn(editor, "getPath").and.returnValue(savedPath);
    const mapping = new Map([[store.grammar.name, fakeKernel()]]);
    store.kernelMapping.set(savedPath, mapping);

    store.forceEditorUpdate();

    expect(store.kernelMapping.get(savedPath)).toBe(mapping);
    expect(store.kernelMapping.size).toBe(1);
  });
});
