const adapterIntegration = require("../lib/adapter-integration");
const result = require("../lib/result");
const store = require("../lib/store");

describe("ownerless adapter input routing", () => {
  let adapter, editor, kernel, previousEditor, previousExternalKernel, previousExternalContext;

  beforeEach(() => {
    previousEditor = store.editor;
    previousExternalKernel = store._externalKernel;
    previousExternalContext = store._externalKernelContext;
    editor = lumine.workspace.buildTextEditor();
    kernel = {};
    adapter = {
      getActiveTargetId: () => "cell",
      getAdapterId: () => "ownerless-adapter",
      getPaneItem: () => null,
      getPath: () => "ownerless.ipynb",
      getRunTargets: () => [
        {
          id: "cell",
          editor,
          grammar: editor.getGrammar(),
          row: 0,
          source: "1 + 1",
          type: "code",
        },
      ],
    };
    store.kernelMapping.set("ownerless.ipynb", kernel);
  });

  afterEach(() => {
    store.kernelMapping.delete("ownerless.ipynb");
    store.editor = previousEditor;
    store._externalKernel = previousExternalKernel;
    store._externalKernelContext = previousExternalContext;
    editor.destroy();
  });

  it("captures the active surface before starting execution", async () => {
    const surface = lumine.workspace.getActiveWindowSurface();
    spyOn(result, "createResultAsync").and.resolveTo({ success: true, durationMs: 0 });

    expect(
      adapterIntegration.runAdapterTargets(
        { getActiveAdapter: () => adapter },
        {},
        { scope: "all" },
      ),
    ).toBe(true);
    await Promise.resolve();

    expect(result.createResultAsync).toHaveBeenCalled();
    expect(result.createResultAsync.calls.mostRecent().args[0].route).toEqual({ surface });
  });

  it("rejects synchronously when no active surface can own the execution", () => {
    spyOn(lumine.workspace, "getActiveWindowSurface").and.returnValue(null);
    spyOn(result, "createResultAsync");

    expect(() =>
      adapterIntegration.runAdapterTargets(
        { getActiveAdapter: () => adapter },
        {},
        { scope: "all" },
      ),
    ).toThrowError(TypeError);
    expect(result.createResultAsync).not.toHaveBeenCalled();
  });
});
