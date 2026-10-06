describe("source analysis keeps the execution's kernel context", () => {
  let editor, source, resolveKernel;
  const compound = "if ready:\n    run()\nelse:\n    wait()";

  beforeEach(async () => {
    source = require("../lib/run-source");
    resolveKernel = spyOn(require("../lib/execution-context"), "kernelForEditor").and.returnValue({
      language: "python",
    });
    editor = await lumine.workspace.open();
    editor.setText(compound + "\noutside()");
    editor.setCursorBufferPosition([0, 0]);
    spyOn(editor, "getGrammar").and.returnValue({ scopeName: "source.python", name: "Python" });
    spyOn(editor, "getSyntaxNodeAtBufferPosition").and.returnValue(null);
    spyOn(editor, "isFoldableAtBufferRow").and.returnValue(false);
  });

  afterEach(() => editor.destroy());

  function pendingCells() {
    let resume;
    let entered;
    const started = new Promise((resolve) => (entered = resolve));
    const cells = {
      getCellDescriptors: () =>
        new Promise((resolve) => {
          resume = () => resolve([{ range: editor.getBuffer().getRange(), cellType: "code" }]);
          entered();
        }),
      getExecutionBlocks: async (_editor, range) => [
        {
          code: editor.getTextInBufferRange(range),
          row: range.end.row - (range.end.column === 0 ? 1 : 0),
          cellType: "code",
        },
      ],
      getCell: () => editor.getBuffer().getRange(),
    };
    return { cells, started, resume: () => resume() };
  }

  it("captures the selection's kernel before waiting for cell descriptors", async () => {
    const pending = pendingCells();
    const run = source.selectionBlocks(editor, () => pending.cells);
    expect(resolveKernel).toHaveBeenCalledOnceWith(editor);
    await pending.started;
    resolveKernel.and.returnValue({ language: "javascript" });
    pending.resume();

    const blocks = await run;

    expect(blocks.length).toBe(1);
    expect(blocks[0].code.trimEnd()).toBe(compound);
    expect(blocks[0].row).toBe(3);
    expect(resolveKernel).toHaveBeenCalledTimes(1);
  });

  it("uses one captured kernel across an inline scan after cell synchronization", async () => {
    const pending = pendingCells();
    const run = source.inlineBlocks(editor, 0, editor.getLastBufferRow(), () => pending.cells);
    expect(resolveKernel).toHaveBeenCalledOnceWith(editor);
    await pending.started;
    resolveKernel.and.returnValue({ language: "javascript" });
    pending.resume();

    const blocks = await run;

    expect(blocks.map((block) => block.code.trimEnd())).toEqual([compound, "outside()"]);
    expect(resolveKernel).toHaveBeenCalledTimes(1);
  });

  it("passes an explicitly absent kernel through to block detection", async () => {
    resolveKernel.and.throwError("the request has no kernel");

    const blocks = await source.inlineBlocks(editor, 0, editor.getLastBufferRow(), () => null, {
      kernel: null,
    });

    expect(blocks.map((block) => block.code)).toEqual([
      "if ready:",
      "    run()",
      "else:",
      "    wait()",
      "outside()",
    ]);
    expect(resolveKernel).not.toHaveBeenCalled();
  });
});
