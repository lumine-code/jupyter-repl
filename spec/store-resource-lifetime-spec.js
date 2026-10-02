const { Disposable } = require("lumine");

describe("store resource ownership", () => {
  let store;

  beforeEach(() => {
    // The singleton may have been reloaded by a lifecycle spec; always create
    // this case's store from the current module generation.
    const Store = require("../lib/store").constructor;
    store = new Store();
  });

  afterEach(() => {
    store.dispose();
    store.emitter.dispose();
  });

  it("releases the marker store when its editor is destroyed", async () => {
    const editor = await lumine.workspace.open();
    const markers = store.newMarkerStore(editor.id, editor);
    spyOn(markers, "clear").and.callThrough();
    editor.destroy();
    expect(markers.clear).toHaveBeenCalled();
    expect(store.markersMapping.has(editor.id)).toBe(false);
  });

  it("releases the active item's kernel subscription on disposal", () => {
    const dispose = jasmine.createSpy("dispose active kernel observer");
    store.updateActivePaneItem({
      getJupyterKernel: () => null,
      onDidChangeJupyterKernel: () => new Disposable(dispose),
    });
    store.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(store._activeItemKernelSubscription).toBeNull();
  });

  it("clears launch markers and context references on disposal", () => {
    store.startingKernels.set("Python 3", true);
    store._externalKernel = {};
    store._externalKernelContext = { paneItem: {} };
    store.dispose();
    expect(store.startingKernels.size).toBe(0);
    expect(store._externalKernel).toBeNull();
    expect(store._externalKernelContext).toBeNull();
    expect(store.activePaneItem).toBeNull();
    expect(store.editor).toBeNull();
  });
});
