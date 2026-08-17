const { findCodeBlockAtRow } = require("../lib/code-manager");

// The fold-range query used to be asked about every row of the buffer, so a
// caller walking each row of a file — run-all-inline is one — paid O(rows²)
// and froze the window for seconds. These pin the property that keeps it
// linear: the query is only asked about rows that are actually foldable. The
// cell-marker index that shared this file moved to the jupyter-cells package,
// and its scaling specs went with it.
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
      // getFoldableRangeContainingPoint walks backwards a row at a time from
      // the point to the top of the file when nothing contains it, so asking
      // it per row is what made the sweep quadratic. The answer was discarded
      // for a non-foldable row anyway.
      await open(Array.from({ length: 200 }, (_, i) => `x${i} = ${i}`).join("\n"));
      const languageMode = editor.getBuffer().getLanguageMode();
      if (typeof languageMode.getFoldableRangeContainingPoint !== "function") {
        return; // A buffer whose language mode has no fold provider proves nothing.
      }
      const foldQueries = spyOn(languageMode, "getFoldableRangeContainingPoint").and.callThrough();

      for (let row = 0; row < 200; row++) {
        findCodeBlockAtRow(editor, row);
      }

      for (const args of foldQueries.calls.allArgs()) {
        expect(editor.isFoldableAtBufferRow(args[0].row)).toBe(true);
      }
    });

    it("still returns the fold's contents for a row that is foldable", async () => {
      await open("def f():\n    a = 1\n    b = 2\nc = 3\n");
      expect(editor.isFoldableAtBufferRow(0)).toBe(true);
      const block = findCodeBlockAtRow(editor, 0);
      expect(block.code).toBe("def f():\n    a = 1\n    b = 2");
      expect(block.row).toBe(2);
    });
  });
});
