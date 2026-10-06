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
    it("releases a bubble closed directly and tolerates later store teardown", async () => {
      const ResultView = require("../lib/components/result-view");
      const MarkerStore = require("../lib/store/markers");
      await withStubbedResizeObserver(async () => {
        const editor = await lumine.workspace.open();
        const markers = new MarkerStore();
        const view = new ResultView(markers, editor, 0, true);
        view.outputStore.appendOutput({ output_type: "stream", name: "stdout", text: "large" });
        const teardown = spyOn(view.component, "destroy").and.callThrough();

        view.destroy();
        expect(markers.markers.size).toBe(0);
        expect(markers.bubblesByRow.size).toBe(0);
        markers.clear();
        view.destroy();
        expect(teardown).toHaveBeenCalledTimes(1);
        editor.destroy();
      });
    });

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

        const updates = spyOn(view.layout, "updatePosition").and.callThrough();
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

        const updates = spyOn(view.layout, "updatePosition").and.callThrough();
        // The marker sits at the end of its line, so lengthening that line
        // moves its column — which is exactly what lineLength is built from.
        editor.getBuffer().insert([2, 0], "longer_name_");

        expect(updates).toHaveBeenCalled();

        markers.clear();
        editor.destroy();
      });
    });
  });

  describe("the result layout's position", () => {
    it("announces an update only when a value really changed", async () => {
      // Every listener re-renders, and position refreshes arrive wholesale
      // with all values usually identical.
      const store = new OutputStore();
      const OutputLayout = require("../lib/components/result-view/output-layout");
      const layout = new OutputLayout(store);
      let updates = 0;
      let dataUpdates = 0;
      layout.onDidUpdate(() => updates++);
      store.onDidUpdate(() => dataUpdates++);

      layout.updatePosition({ lineLength: 10, charWidth: 8 });
      expect(updates).toBe(1);

      layout.updatePosition({ lineLength: 10, charWidth: 8 });
      expect(updates).toBe(1);

      layout.updatePosition({ lineLength: 11, charWidth: 8 });
      expect(updates).toBe(2);
      expect(layout.position.lineLength).toBe(11);
      expect(layout.position.charWidth).toBe(8);
      expect(dataUpdates).toBe(0);
      layout.destroy();
    });
  });

  describe("shared editor metrics", () => {
    it("coalesces viewport and font updates per editor and releases every subscription", async () => {
      const { Disposable, Point } = require("lumine");
      const ResultView = require("../lib/components/result-view");
      const MarkerStore = require("../lib/store/markers");
      const previous = global.ResizeObserver;
      const observations = [];
      global.ResizeObserver = class {
        constructor(callback) {
          this.callback = callback;
          this.targets = new Set();
          this.disconnected = false;
          observations.push(this);
        }
        observe(target) {
          this.targets.add(target);
        }
        unobserve(target) {
          this.targets.delete(target);
        }
        disconnect() {
          this.disconnected = true;
          this.targets.clear();
        }
      };
      let editor, markers;
      try {
        editor = await lumine.workspace.open();
        editor.setText("a\nb");
        markers = new MarkerStore();
        let width = 800,
          charWidth = 8,
          lineHeight = 16,
          column = 2;
        const widthRead = spyOn(editor.element, "getWidth").and.callFake(() => width);
        const charRead = spyOn(editor, "getDefaultCharWidth").and.callFake(() => charWidth);
        spyOn(editor, "getLineHeightInPixels").and.callFake(() => lineHeight);
        const screenPosition = editor.screenPositionForBufferPosition.bind(editor);
        spyOn(editor, "screenPositionForBufferPosition").and.callFake((position) => {
          const actual = screenPosition(position);
          return new Point(actual.row, column);
        });
        const readers = [];
        spyOn(lumine.views, "readDocument").and.callFake((callback) => readers.push(callback));
        const config = new Map();
        const released = [];
        spyOn(lumine.config, "onDidChange").and.callFake((key, callback) => {
          config.set(key, callback);
          return new Disposable(() => released.push(key));
        });
        const first = new ResultView(markers, editor, 0);
        const second = new ResultView(markers, editor, 1);
        const viewport = editor.element.querySelector(".scroll-view");
        const source = observations.filter(
          (observer) => observer.targets.has(editor.element) && observer.targets.has(viewport),
        );
        expect(source.length).toBe(1);
        const observer = source[0];
        let dataUpdates = 0;
        first.outputStore.onDidUpdate(() => dataUpdates++);
        second.outputStore.onDidUpdate(() => dataUpdates++);
        widthRead.calls.reset();
        charRead.calls.reset();

        width = 400;
        charWidth = 10;
        lineHeight = 20;
        column = 5;
        observer.callback([]);
        observer.callback([]);
        expect(readers.length).toBe(1);
        expect(widthRead).not.toHaveBeenCalled();
        readers.shift()();
        expect(widthRead).toHaveBeenCalledTimes(1);
        expect(charRead).toHaveBeenCalledTimes(1);
        for (const view of [first, second]) {
          expect(view.layout.position).toEqual({
            editorWidth: 400,
            charWidth: 10,
            lineHeight: 20,
            lineLength: 50,
          });
          expect(view._geometryDirty).toBe(true);
          expect(view._contentDirty).toBe(false);
        }
        expect(first.layout.position).not.toBe(second.layout.position);
        expect(dataUpdates).toBe(0);

        first.destroy();
        expect(observer.disconnected).toBe(false);
        charWidth = 12;
        lineHeight = 24;
        column = 3;
        config.get("editor.fontFamily")();
        config.get("editor.fontSize")();
        expect(readers.length).toBe(1);
        readers.shift()();
        expect(first.layout.position.charWidth).toBe(10);
        expect(second.layout.position.charWidth).toBe(12);
        expect(second.layout.position.lineLength).toBe(36);
        expect(dataUpdates).toBe(0);

        width = 500;
        observer.callback([]);
        const lateRead = readers.shift();
        second.destroy();
        expect(observer.disconnected).toBe(true);
        expect(released.sort()).toEqual(
          ["editor.fontFamily", "editor.fontSize", "editor.lineHeight"].sort(),
        );
        lateRead();
        observer.callback([]);
        expect(readers.length).toBe(0);
        expect(second.layout.position.editorWidth).toBe(400);
      } finally {
        try {
          markers?.clear();
          editor?.destroy();
        } finally {
          global.ResizeObserver = previous;
        }
      }
    });
  });
});
