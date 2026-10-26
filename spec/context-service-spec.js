describe("source context ownership", () => {
  beforeEach(async () => {
    const textGrammarPackage = await lumine.packages.activatePackage("language-text");
    await textGrammarPackage.resourceLoadPromise;
  });

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

  it("refuses initially None expression and cell requests before reading source", async () => {
    const { createContextService } = require("../lib/context-service");
    const { getExpressionInfoAtCursor } = require("../lib/source-analysis/expressions");
    const editor = await lumine.workspace.open();
    const cells = jasmine.createSpy("resolve cell").and.throwError("None must not resolve cells");
    const context = createContextService({
      getCellsService: () => ({ getCurrentCell: cells }),
      getAdapterServices: () => [],
    });
    try {
      editor.setText("alpha.beta");
      lumine.grammars.assignGrammar(editor, lumine.grammars.nullGrammar);
      const text = spyOn(editor, "getText").and.throwError("None must not read source");
      const selected = spyOn(editor, "getSelectedText").and.throwError(
        "None must not read selections",
      );
      const row = spyOn(editor, "lineTextForBufferRow").and.throwError("None must not read rows");

      expect(context.getExpressionAtCursor(editor)).toBe("");
      expect(context.getCellRange(editor)).toBeNull();
      expect(getExpressionInfoAtCursor(editor)).toEqual({ expression: "", cursorPosition: 0 });
      expect(context.getFocusedEditor({ target: editor.element })).toBe(editor);
      expect(text).not.toHaveBeenCalled();
      expect(selected).not.toHaveBeenCalled();
      expect(row).not.toHaveBeenCalled();
      expect(cells).not.toHaveBeenCalled();
      expect(editor.getBuffer().getText()).toBe("alpha.beta");
    } finally {
      editor.destroy();
    }
  });

  it("resumes cached context methods with current source after real to None to the same grammar", async () => {
    const { createContextService } = require("../lib/context-service");
    const editor = await lumine.workspace.open();
    const grammar = lumine.grammars.grammarForScopeName("text.plain");
    const cells = jasmine.createSpy("resolve cell").and.returnValue([
      [0, 0],
      [0, 10],
    ]);
    const context = createContextService({
      getCellsService: () => ({ getCurrentCell: cells }),
      getAdapterServices: () => [],
    });
    const expression = context.getExpressionAtCursor;
    const range = context.getCellRange;
    try {
      lumine.grammars.assignGrammar(editor, grammar);
      editor.setText("alpha.beta");
      editor.setCursorBufferPosition([0, 5]);
      expect(expression(editor)).toBe("alpha.beta");
      expect(range(editor)).toEqual([
        [0, 0],
        [0, 10],
      ]);

      lumine.grammars.assignGrammar(editor, lumine.grammars.nullGrammar);
      editor.setText("gamma.delta");
      const selected = spyOn(editor, "getSelectedText").and.throwError(
        "None must not read selections",
      );
      const row = spyOn(editor, "lineTextForBufferRow").and.throwError("None must not read rows");
      cells.calls.reset();
      expect(expression(editor)).toBe("");
      expect(range(editor)).toBeNull();
      expect(selected).not.toHaveBeenCalled();
      expect(row).not.toHaveBeenCalled();
      expect(cells).not.toHaveBeenCalled();

      selected.and.callThrough();
      row.and.callThrough();
      lumine.grammars.assignGrammar(editor, grammar);
      editor.setCursorBufferPosition([0, 5]);
      expect(editor.getGrammar()).toBe(grammar);
      expect(expression(editor)).toBe("gamma.delta");
      expect(range(editor)).toEqual([
        [0, 0],
        [0, 10],
      ]);
      expect(selected).toHaveBeenCalledTimes(1);
      expect(row).toHaveBeenCalledTimes(1);
      expect(cells).toHaveBeenCalledTimes(1);
      expect(editor.getText()).toBe("gamma.delta");
    } finally {
      editor.destroy();
    }
  });
});
