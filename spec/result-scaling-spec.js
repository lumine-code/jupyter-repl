const OutputStore = require("../lib/store/output");
const MarkerStore = require("../lib/store/markers");

// A notebook-sized file carries hundreds of inline results, and every one of
// them used to add work to operations that have nothing to do with it: creating
// a result scanned every existing one, and a keystroke anywhere recomputed
// every bubble's position. These pin the three properties that keep those
// costs off the common paths.
describe("inline result scaling", () => {
  const withStubbedResizeObserver = async (body) => {
    const previous = global.ResizeObserver;
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    try {
      await body();
    } finally {
      global.ResizeObserver = previous;
    }
  };

  describe("the marker store's row index", () => {
    it("clears a row without consulting the bubbles on other rows", async () => {
      const ResultView = require("../lib/components/result-view");
      await withStubbedResizeObserver(async () => {
        const editor = await lumine.workspace.open();
        editor.setText(Array.from({ length: 20 }, (_, i) => `x${i} = ${i}`).join("\n"));
        const markers = new MarkerStore();
        const views = Array.from(
          { length: 20 },
          (_, row) => new ResultView(markers, editor, row, true),
        );

        // Reading a bubble's range is what the old linear scan did per bubble.
        // Only the one on the cleared row may be touched now.
        const ranges = views.map((view) => spyOn(view.marker, "getBufferRange").and.callThrough());
        expect(markers.clearOnRow(7)).toBe(true);

        for (let row = 0; row < ranges.length; row++) {
          if (row === 7) continue;
          expect(ranges[row]).not.toHaveBeenCalled();
        }
        expect(markers.markers.size).toBe(19);
        expect(views[7].destroyed).toBe(true);

        markers.clear();
        editor.destroy();
      });
    });

    it("still clears a bubble after an edit has moved it to another row", async () => {
      // The index is keyed by row, so it only stays true if a bubble reports
      // the moves its marker makes.
      const ResultView = require("../lib/components/result-view");
      await withStubbedResizeObserver(async () => {
        const editor = await lumine.workspace.open();
        editor.setText("a = 1\nb = 2\nc = 3\n");
        const markers = new MarkerStore();
        const view = new ResultView(markers, editor, 2, true);

        editor.getBuffer().insert([0, 0], "# inserted\n");
        expect(view.marker.getStartBufferPosition().row).toBe(3);

        expect(markers.clearOnRow(2)).toBe(false);
        expect(markers.clearOnRow(3)).toBe(true);
        expect(view.destroyed).toBe(true);

        markers.clear();
        editor.destroy();
      });
    });

    it("clears every bubble sharing a row", () => {
      // A ResultView clears its row as it is built, so two on one row is not a
      // state the editor reaches — but the index holds a set per row rather
      // than a single bubble, and nothing else pins that.
      const stub = (id, row) => ({
        destroyed: false,
        marker: { id, getStartBufferPosition: () => ({ row }) },
        destroy() {
          this.destroyed = true;
        },
      });
      const markers = new MarkerStore();
      const first = stub(1, 4);
      const second = stub(2, 4);
      const elsewhere = stub(3, 9);
      markers.new(first);
      markers.new(second);
      markers.new(elsewhere);

      expect(markers.clearOnRow(4)).toBe(true);
      expect(first.destroyed).toBe(true);
      expect(second.destroyed).toBe(true);
      expect(elsewhere.destroyed).toBe(false);
      expect(markers.markers.size).toBe(1);

      // An emptied row leaves no bucket behind, so a long session's index does
      // not grow one entry per row ever used.
      expect(markers.bubblesByRow.has(4)).toBe(false);
    });
  });

  describe("a bubble's position", () => {
    it("is left alone by an edit that only moved it down", async () => {
      // Typing above a result changes its row and nothing else — not the line
      // it sits on, not any editor metric. Recomputing anyway cost a layout
      // read per bubble below the cursor on every keystroke.
      const ResultView = require("../lib/components/result-view");
      await withStubbedResizeObserver(async () => {
        const editor = await lumine.workspace.open();
        editor.setText("a = 1\nb = 2\nc = 3\n");
        const markers = new MarkerStore();
        const view = new ResultView(markers, editor, 2, true);

        const updates = spyOn(view.outputStore, "updatePosition").and.callThrough();
        editor.getBuffer().insert([0, 0], "# inserted\n");

        expect(view.marker.getStartBufferPosition().row).toBe(3);
        expect(updates).not.toHaveBeenCalled();

        markers.clear();
        editor.destroy();
      });
    });

    it("is recomputed when an edit changes the line it sits on", async () => {
      const ResultView = require("../lib/components/result-view");
      await withStubbedResizeObserver(async () => {
        const editor = await lumine.workspace.open();
        editor.setText("a = 1\nb = 2\nc = 3\n");
        const markers = new MarkerStore();
        const view = new ResultView(markers, editor, 2, true);

        const updates = spyOn(view.outputStore, "updatePosition").and.callThrough();
        // The marker sits at the end of its line, so lengthening that line
        // moves its column — which is exactly what lineLength is built from.
        editor.getBuffer().insert([2, 0], "longer_name_");

        expect(updates).toHaveBeenCalled();

        markers.clear();
        editor.destroy();
      });
    });
  });

  describe("the output store's position", () => {
    it("announces an update only when a value really changed", async () => {
      // Every listener re-renders, and position refreshes arrive wholesale
      // with all values usually identical.
      const store = new OutputStore();
      let updates = 0;
      store.onDidUpdate(() => updates++);

      store.updatePosition({ lineLength: 10, charWidth: 8 });
      expect(updates).toBe(1);

      store.updatePosition({ lineLength: 10, charWidth: 8 });
      expect(updates).toBe(1);

      store.updatePosition({ lineLength: 11, charWidth: 8 });
      expect(updates).toBe(2);
      expect(store.position.lineLength).toBe(11);
      expect(store.position.charWidth).toBe(8);
    });
  });
});
