describe("source context ownership", () => {
  it("observes a reentrant active session change during its initial callback", () => {
    const { Emitter } = require("lumine");
    const Provider = require("../lib/plugin-api/jupyter-provider");
    const emitter = new Emitter();
    const store = { kernel: null };
    const internal = { id: "observed-session" };
    const session = require("./helpers/session").wrapSession(internal);
    const provider = new Provider(emitter, { getStore: () => store });
    const observed = [];
    const subscription = provider.observeActiveKernel((value) => {
      observed.push(value);
      if (observed.length === 1) {
        store.kernel = internal;
        emitter.emit("did-change-kernel", internal);
      }
    });
    expect(observed).toEqual([null, session]);
    subscription.dispose();
    emitter.dispose();
  });
  it("does not read an editor through a retired cached context method", async () => {
    const { createContextService } = require("../lib/context-service");
    const editor = await lumine.workspace.open();
    let current = true;
    const context = createContextService({
      isCurrent: () => current,
      getCellsService: () => ({
        getCurrentCell: () => [
          [0, 0],
          [0, 1],
        ],
      }),
      getAdapterServices: () => [],
    });
    try {
      editor.setText("name");
      const expression = context.getExpressionAtCursor;
      const range = context.getCellRange;
      current = false;
      expect(expression(editor)).toBe("");
      expect(range(editor)).toBeNull();
      expect(context.getFocusedEditor({ target: editor.element })).toBeNull();
    } finally {
      editor.destroy();
    }
  });

  it("exposes public registry methods without store or emitter accessors", async () => {
    const pkg = await lumine.packages.activatePackage(
      require("node:path").resolve(__dirname, ".."),
    );
    const kernels = pkg.mainModule.provideJupyterKernel();
    expect(typeof kernels.getKernelForEditor).toBe("function");
    expect(kernels._getStore).toBeUndefined();
    expect(kernels._emitter).toBeUndefined();
    expect(Object.keys(kernels)).not.toContain("_getAdapterServices");
  });
});
