const {
  findCodeBlockAtRow,
  getBreakpoints,
  getCells,
  getMetadataForRow,
} = require("../lib/code-manager");
const { Point } = require("lumine");

// Every query here used to sweep the whole buffer on every call, so a caller
// walking each row of a file — run-all-inline is one — paid O(rows²) and froze
// the window for seconds. These pin the two properties that keep it linear:
// the marker scan happens once per buffer state, and the fold-range query is
// only asked about rows that are actually foldable. Both are invisible to the
// results, so the semantics are pinned alongside them.
describe("code-manager scaling", () => {
  let editor;

  // Cell markers are comments, so they need a grammar that defines one, and
  // getBreakpoints reads scopes — which only exist once the buffer has been
  // tokenized. Without the wait every file reads as a single cell.
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

  describe("the cell marker index", () => {
    // `# %% markdown`, not `# %% [markdown]`: the marker regex captures the
    // bare word, and the bracketed spelling matches as a plain code cell.
    const markers = ["# %%", "a = 1", "# %% markdown", "# text", "# %%", "b = 2"].join("\n");

    it("scans the buffer once for repeated queries at the same buffer state", async () => {
      await open(markers);
      const scans = spyOn(editor.getBuffer(), "scan").and.callThrough();

      for (let row = 0; row <= 5; row++) {
        getMetadataForRow(editor, new Point(row, 0));
      }
      getBreakpoints(editor);

      expect(scans.calls.count()).toBe(1);
    });

    it("rescans after the buffer changes", async () => {
      // TextBuffer carries no version counter, so the index invalidates on a
      // change subscription. Getting that wrong is invisible until an edit
      // moves a marker: every later query answers from the pre-edit scan.
      await open(markers);
      expect(getMetadataForRow(editor, new Point(1, 0))).toBe("codecell");
      const scans = spyOn(editor.getBuffer(), "scan").and.callThrough();

      // Turn the marker above row 1 into a markdown one, so that row's type
      // flips. The wait is for the re-tokenization the edit starts: the marker
      // regex is built from the grammar's comment string, which is
      // unavailable until it finishes.
      editor.getBuffer().setTextInRange(
        [
          [0, 0],
          [0, 4],
        ],
        "# %% markdown",
      );
      const languageMode = editor.getBuffer().getLanguageMode();
      if (languageMode.atTransactionEnd) {
        await languageMode.atTransactionEnd();
      }

      expect(getMetadataForRow(editor, new Point(1, 0))).toBe("markdown");
      expect(scans.calls.count()).toBe(1);
    });

    it("reports each row's cell type from the nearest marker above it", async () => {
      await open(markers);
      expect(getMetadataForRow(editor, new Point(0, 0))).toBe("codecell");
      expect(getMetadataForRow(editor, new Point(1, 0))).toBe("codecell");
      expect(getMetadataForRow(editor, new Point(2, 0))).toBe("markdown");
      expect(getMetadataForRow(editor, new Point(3, 0))).toBe("markdown");
      expect(getMetadataForRow(editor, new Point(4, 0))).toBe("codecell");
      expect(getMetadataForRow(editor, new Point(5, 0))).toBe("codecell");
    });

    it("reports codecell for a buffer with no markers at all", async () => {
      await open("a = 1\nb = 2\n");
      expect(getMetadataForRow(editor, new Point(1, 0))).toBe("codecell");
      expect(getBreakpoints(editor).length).toBe(1); // the end position alone
    });

    it("finds every marker as a breakpoint, in buffer order", async () => {
      await open(markers);
      const rows = getBreakpoints(editor).map((point) => point.row);
      expect(rows).toEqual([0, 2, 4, 5]); // three markers, then the end position
    });

    it("splits the buffer into cells at those markers", async () => {
      await open(markers);
      // The leading marker on row 0 opens an empty range, which getCells drops.
      const ranges = getCells(editor).map((cell) => [cell.start.row, cell.end.row]);
      expect(ranges).toEqual([
        [1, 2],
        [3, 4],
        [5, 5],
      ]);
    });
  });
});
