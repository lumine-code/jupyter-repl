const path = require("path");
const manifest = require(path.join(__dirname, "..", "package.json"));
const main = require(path.join(__dirname, "..", manifest.main));
const result = require("../lib/result");
const store = require("../lib/store");

// The jupyter.execution service is the seam the cell layer moved across:
// jupyter-cells computes {code, row, cellType} blocks and this side runs them.
// These pin the dispatch rules the contract documents, and the fallbacks the
// optional jupyter.cells consumption leaves behind.
describe("the jupyter.execution service", () => {
  let editor;
  let execution;
  let fakeKernel;
  let filePath;
  let previousEditor;
  let previousActivePaneItem;

  beforeEach(async () => {
    previousEditor = store.editor;
    previousActivePaneItem = store.activePaneItem;

    editor = await lumine.workspace.open();
    editor.setText("first()\nsecond()\nthird()");
    store.updateEditor(editor);
    store.updateActivePaneItem(editor);
    filePath = store.filePath;

    fakeKernel = {
      executions: [],
      setLastOutputStore() {},
      execute(code, callback) {
        this.executions.push({ code, callback });
      },
    };
    store.kernelMapping.set(filePath, new Map([[store.grammar.name, fakeKernel]]));
    execution = main.provideJupyterExecution();
  });

  afterEach(() => {
    store.markers?.clear();
    store.markersMapping.delete(editor.id);
    store.kernelMapping.delete(filePath);
    store.updateEditor(previousEditor);
    store.updateActivePaneItem(previousActivePaneItem);
    editor.destroy();
  });

  it("dispatches one block through the single-result path", async () => {
    const single = spyOn(result, "createResult");
    const batch = spyOn(result, "createResultBatch");

    const accepted = await execution.runBlocks(editor, [
      { code: "first()", row: 0, cellType: "codecell" },
    ]);

    expect(accepted).toBe(true);
    expect(single).toHaveBeenCalled();
    expect(batch).not.toHaveBeenCalled();
    const [context, block] = single.calls.mostRecent().args;
    expect(context.editor).toBe(editor);
    expect(block.code).toBe("first()");
  });

  it("dispatches several blocks through the batch path", async () => {
    const batch = spyOn(result, "createResultBatch").and.returnValue(Promise.resolve(true));

    const accepted = await execution.runBlocks(editor, [
      { code: "first()", row: 0, cellType: "codecell" },
      { code: "second()", row: 1, cellType: "codecell" },
    ]);

    expect(accepted).toBe(true);
    expect(batch.calls.mostRecent().args[1].length).toBe(2);
  });

  it("declines silently when there is nothing to run", async () => {
    const single = spyOn(result, "createResult");

    expect(await execution.runBlocks(editor, [])).toBe(false);
    expect(await execution.runBlocks(null, [{ code: "x", row: 0, cellType: "codecell" }])).toBe(
      false,
    );
    expect(single).not.toHaveBeenCalled();
    expect(lumine.notifications.getNotifications().length).toBe(0);
  });

  it("renders imported outputs through the editor's own marker store", () => {
    const importSpy = spyOn(result, "importResult");

    execution.importOutputs(editor, { outputs: [{ output_type: "stream" }], row: 1 });

    const [context, bundle] = importSpy.calls.mostRecent().args;
    expect(context.editor).toBe(editor);
    expect(context.markers).toBe(store.markersMapping.get(editor.id));
    expect(bundle.row).toBe(1);
  });

  it("restarts through the current kernel, or calls straight back without one", () => {
    const onRestarted = jasmine.createSpy("onRestarted");
    store.kernelMapping.delete(filePath);
    execution.restartKernel(onRestarted);
    expect(onRestarted).toHaveBeenCalled();
  });
});

describe("the optional jupyter.cells consumption", () => {
  const codeManager = require("../lib/code-manager");

  it("clips a block at a cell boundary only while the service is present", async () => {
    const editor = await lumine.workspace.open();
    editor.setText("a = 1\nb = 2\n");

    // Without the service there is no marker model, so nothing clips and the
    // row answers as a plain single-line block.
    expect(codeManager.findCodeBlockAtRow(editor, 1).code).toBe("b = 2");

    // A service claiming the row belongs to a later cell turns the block empty.
    const disposable = main.consumeJupyterCells({
      getCell: () => ({ start: { row: 2 }, end: { row: 3 } }),
      getCurrentCell: () => null,
      getMetadataForRow: () => "codecell",
      removeCommentsMarkdownCell: (target, text) => text,
    });
    expect(codeManager.findCodeBlockAtRow(editor, 1).code).toBe("");

    disposable.dispose();
    expect(codeManager.findCodeBlockAtRow(editor, 1).code).toBe("b = 2");
    editor.destroy();
  });

  it("answers null from getCellRange without the cell model", () => {
    const provider = main.provideJupyterKernel();
    expect(main.getJupyterCellsService()).toBeNull();
    expect(provider.getCellRange()).toBeNull();
  });
});
