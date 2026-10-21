const { findCodeBlockAtRow } = require("../lib/code-manager");

// The old private containing-range query could walk backwards to the top of
// the file. These pin both parts of the replacement contract: Jupyter asks the
// public exact-row API only for foldable rows, and still returns real folds.
describe("code-manager scaling", () => {
  let editor;

  const open = async (text) => {
    await lumine.packages.activatePackage("language-python");
    editor = await lumine.workspace.open("code-manager-scaling.py");
    editor.getBuffer().setText(text);
    const languageMode = editor.getBuffer().getLanguageMode();
    if (languageMode.atTransactionEnd) {
      await languageMode.atTransactionEnd();
    }
    return editor;
  };

  describe("the fold-range query", () => {
    it("is not asked about a row that is not foldable", async () => {
      await open(Array.from({ length: 200 }, (_, i) => `x${i} = ${i}`).join("\n"));
      const foldQueries = spyOn(editor, "getFoldableRangeAtBufferRow").and.callThrough();

      const result = await editor.analyzeSyntax(
        require.resolve("./helpers/source-analysis"),
        "inspectBlocks",
        {
          rows: Array.from({ length: 200 }, (_, row) => row),
          tabLength: editor.getTabLength(),
        },
      );
      expect(result.foldQueries).toEqual([]);
      expect(foldQueries).not.toHaveBeenCalled();
    });

    it("still returns the fold's contents for a row that is foldable", async () => {
      await open("def f():\n    a = 1\n    b = 2\nc = 3\n");
      const foldQueries = spyOn(editor, "getFoldableRangeAtBufferRow").and.callThrough();
      const block = await findCodeBlockAtRow(editor, 0);
      expect(block.code).toBe("def f():\n    a = 1\n    b = 2");
      expect(block.row).toBe(2);
      if (editor.getBuffer().getLanguageMode().asynchronousSyntax)
        expect(foldQueries).not.toHaveBeenCalled();
      else expect(foldQueries).toHaveBeenCalledOnceWith(0);
      const result = await editor.analyzeSyntax(
        require.resolve("./helpers/source-analysis"),
        "inspectBlocks",
        {
          rows: [0],
          tabLength: editor.getTabLength(),
        },
      );
      expect(result.foldQueries).toEqual([0]);
    });
  });
});
