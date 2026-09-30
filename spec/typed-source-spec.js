const path = require("path");
const { Range } = require("lumine");

describe("typed source preparation", () => {
  let editor;
  let cells;
  let registration;
  let main;
  let source;

  beforeEach(async () => {
    await lumine.packages.activatePackage(path.resolve(__dirname, "../../language-ipython"));
    const provider = await lumine.packages.activatePackage(
      path.resolve(__dirname, "../../jupyter-cells"),
    );
    cells = provider.mainModule.provideJupyterCells();
    main = require("../lib/main");
    source = require("../lib/run-source");
    editor = await lumine.workspace.open();
    lumine.grammars.assignLanguageMode(editor.getBuffer(), "source.python.ipy");
    await editor.getBuffer().getLanguageMode().ready;
  });

  afterEach(async () => {
    registration?.dispose();
    editor.destroy();
    await lumine.packages.deactivatePackage("jupyter-cells");
  });

  it("classifies a non-code cell before Python bracket and indentation heuristics", async () => {
    editor.setText("# %% [markdown]\n# Heading\n    [not Python]\n# %% [raw]\nprint('raw')\n");
    editor.setCursorBufferPosition([2, 4]);
    const blocks = await source.selectionBlocks(editor, () => cells);
    expect(blocks.map((block) => block.cellType)).toEqual(["markdown"]);
    expect(blocks[0].code).toBe("# Heading\n    [not Python]");
  });

  it("splits a selection across code, Markdown and raw without changing literal source", async () => {
    editor.setText("# %%\nvalue = 1\n# %% [markdown]\n# Heading\n# %% [raw]\n# payload\n");
    editor.setSelectedBufferRange([
      [1, 0],
      [5, 9],
    ]);
    const blocks = await source.selectionBlocks(editor, () => cells);
    expect(blocks.map((block) => block.cellType)).toEqual(["code", "markdown", "raw"]);
    expect(blocks.map((block) => block.code)).toEqual(["value = 1", "# Heading", "# payload"]);
  });

  it("preserves full magic arguments for selected body and runs the full magic without a selection", async () => {
    editor.setText("# %%\n%%bash -e\nprintf 'one'\nprintf 'two'\n# %%\nvalue = 1\n");
    editor.setSelectedBufferRange([
      [3, 0],
      [3, 12],
    ]);
    let blocks = await source.selectionBlocks(editor, () => cells);
    expect(blocks[0].code).toBe("%%bash -e\nprintf 'two'");
    editor.setCursorBufferPosition([2, 5]);
    blocks = await source.selectionBlocks(editor, () => cells);
    expect(blocks[0].code).toBe("%%bash -e\nprintf 'one'\nprintf 'two'");
  });

  it("retains ordinary line and multiline statement detection inside code cells", async () => {
    editor.setText("# %%\nvalues = [\n    1,\n    2,\n]\nlater = 3\n# %% [raw]\nnot code\n");
    editor.setCursorBufferPosition([1, 2]);
    const blocks = await source.selectionBlocks(editor, () => cells);
    expect(blocks.map((block) => block.cellType)).toEqual(["code"]);
    expect(blocks[0].code).toBe("values = [\n    1,\n    2,\n]");
    const all = await source.inlineBlocks(editor, 0, editor.getLastBufferRow(), () => cells);
    expect(all.map((block) => block.cellType)).toEqual(["code", "code", "raw"]);
    expect(all[1].code).toBe("later = 3");
  });

  it("prepares a notebook fragment through the original body grammar", async () => {
    editor.destroy();
    editor = lumine.workspace.buildTextEditor();
    registration = lumine.textEditors.add(editor, { role: "fragment" });
    editor.setText("\n%%bash -e\nprintf 'one'\nprintf 'two'\n");
    editor.setSelectedBufferRange(new Range([3, 0], [3, 12]));
    const block = require("../lib/cell-magic").selectionBlock(editor, editor.getLastSelection());
    expect(block.code).toBe("%%bash -e\nprintf 'two'");
    expect((await cells.getExecutionBlocks(editor, editor.getSelectedBufferRange()))[0].code).toBe(
      block.code,
    );
  });

  it("does not execute a mixed document when the required service is unavailable", async () => {
    const request = spyOn(lumine.packages, "requestService").and.returnValue(Promise.resolve(null));
    editor.setText("# %% [raw]\nprint('raw')\n");
    expect(await source.selectionBlocks(editor, () => null)).toEqual([]);
    expect(request).toHaveBeenCalledWith("jupyter.cells", "^1.0.0");
    expect(lumine.notifications.getNotifications().at(-1).getMessage()).toContain("jupyter-cells");
    expect(main.getJupyterCellsService()).toBeDefined();
  });

  it("keeps cell magic execution available in ordinary Python without jupyter-cells", async () => {
    await lumine.packages.activatePackage("language-python");
    lumine.grammars.assignLanguageMode(editor.getBuffer(), "source.python");
    editor.setText("%%time\nvalue = 1\nlater = 2\n");
    const blocks = await source.inlineBlocks(editor, 0, editor.getLastBufferRow(), () => null);
    expect(blocks.map((block) => block.cellType)).toEqual(["code"]);
    expect(blocks[0].code).toBe("%%time\nvalue = 1\nlater = 2\n");
    const below = await source.inlineBlocks(editor, 2, editor.getLastBufferRow(), () => null);
    expect(below[0].code).toBe("%%time\nlater = 2\n");
  });

  it("does not reinterpret empty cell bodies as the next executable cell", async () => {
    editor.setText(
      "# %% [markdown]\n# %% [raw]\n# %% Empty Code\n# %% Code\ndangerous()\n# %% [raw]\n# %% Magic\n%%bash -e\nprintf 'once'\n",
    );
    for (const row of [0, 1, 2, 5]) {
      editor.setCursorBufferPosition([row, 0]);
      expect(await source.selectionBlocks(editor, () => cells)).toEqual([]);
    }
    const blocks = await source.inlineBlocks(editor, 0, editor.getLastBufferRow(), () => cells);
    expect(blocks.map((block) => block.cellType)).toEqual(["code", "code"]);
    expect(blocks.map((block) => block.code)).toEqual([
      "dangerous()",
      "%%bash -e\nprintf 'once'\n",
    ]);
  });

  it("cancels selected execution when text moves while preparation awaits parsing", async () => {
    editor.setText("# %% Code\nextra()\nharmless()\n# %% Next\ndangerous()\n");
    editor.setSelectedBufferRange([
      [2, 0],
      [3, 0],
    ]);
    let resume;
    let entered;
    const started = new Promise((resolve) => {
      entered = resolve;
    });
    const service = {
      getCellDescriptors: async () => [],
      getExecutionBlocks: () =>
        new Promise((resolve) => {
          resume = resolve;
          entered();
        }),
    };
    const pending = source.selectionBlocks(editor, () => service);
    await started;
    editor.setTextInBufferRange(
      [
        [0, 0],
        [2, 0],
      ],
      "",
    );
    resume([{ code: "dangerous()", row: 2, cellType: "code" }]);
    expect(await pending).toEqual([]);
    expect(lumine.notifications.getNotifications().at(-1).getMessage()).toContain("Source changed");
  });
});
