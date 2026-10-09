describe("Pending result marker ownership", () => {
  let store, markers, editor, kernel, result;
  beforeEach(async () => {
    await lumine.packages.activatePackage("jupyter-repl");
    store = require("../lib/store");
    result = require("../lib/result");
    const Kernel = require("../lib/kernel");
    const KernelTransport = require("../lib/kernel-transport");
    editor = await lumine.workspace.open();
    editor.setText("pending_code()");
    markers = store.markersMapping.get(editor.id) || store.newMarkerStore(editor.id, editor);
    const transport = new KernelTransport(
      { language: "python", display_name: "Controlled" },
      editor.getGrammar(),
    );
    transport.setLifecycle("ready");
    kernel = new Kernel(transport);
    store.newKernel(kernel, `Unsaved Editor ${editor.id}`, editor, editor.getGrammar());
  });
  afterEach(async () => {
    markers.clear();
    kernel.destroy();
    editor.destroy();
    await lumine.packages.deactivatePackage("jupyter-repl");
  });
  const reserve = () =>
    result.createPendingResult({ editor, kernel, markers }, { row: 0, cellType: "code" });
  it("does not recreate a delayed result in the retired marker store after package deactivation", async () => {
    reserve();
    expect(markers.markers.size).toBe(0);
    await lumine.packages.deactivatePackage("jupyter-repl");
    globalThis.advanceClock(20);
    expect(editor.isDestroyed()).toBe(false);
    expect(markers.markers.size).toBe(0);
    expect(store.markersMapping.has(editor.id)).toBe(false);
  });
  it("keeps a live reservation and allows a normal clear followed by another result", () => {
    reserve();
    globalThis.advanceClock(20);
    expect(markers.markers.size).toBe(1);
    markers.clear();
    expect(markers.markers.size).toBe(0);
    reserve();
    globalThis.advanceClock(20);
    expect(markers.markers.size).toBe(1);
  });
});
