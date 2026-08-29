const { outputService } = require("../lib/output-service");
const { loadBundleFor } = require("../lib/realm-runtime");
const ResultView = require("../lib/components/result-view");
const MarkerStore = require("../lib/store/markers");
const {
  beginResultViewSurfaceTransition,
} = require("../lib/components/result-view/surface-transition");
const etch = require("@lumine-code/etch");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

describe("jupyter.output window realms", () => {
  it("loads a cached renderer bundle without Node and installs its child styles", async () => {
    const frame = document.createElement("iframe");
    frame.src = pathToFileURL(
      path.join(lumine.packages.resourcePath, "static", "detached-pane.html"),
    ).href;
    const loaded = new Promise((resolve) =>
      frame.addEventListener("load", resolve, { once: true }),
    );
    document.body.appendChild(frame);
    await loaded;
    const domDocument = frame.contentDocument;
    frame.contentWindow.require = undefined;
    try {
      const source = require.resolve("./fixtures/realm-script");
      const first = await loadBundleFor(domDocument, source, {
        global: "__jupyterRealmProbe",
      });
      const second = await loadBundleFor(domDocument, source, {
        global: "__jupyterRealmProbe",
      });

      expect(first).toBe(second);
      expect(first.document).toBe(domDocument);
      expect(first.hasRequire).toBe(false);
      expect(domDocument.head.querySelector("style[data-realm-probe=true]")).toBeTruthy();

      const widgets = await loadBundleFor(
        domDocument,
        require.resolve("../lib/vendor/jupyter-widgets-realm"),
        { global: "LumineJupyterWidgets" },
      );
      expect(typeof widgets.controls.IntSliderView).toBe("function");
      expect(typeof frame.contentWindow.require).toBe("undefined");
    } finally {
      frame.remove();
    }
  });

  it("keeps the primary document on the primary renderer service", () => {
    expect(outputService.forDocument(document)).toBe(outputService);
  });

  it("rebuilds inline rich output before each surface commit and preserves its UI state", async () => {
    const editor = await lumine.workspace.open();
    const view = new ResultView(new MarkerStore(), editor, 0, true);
    view.outputStore.appendOutput({ output_type: "stream", name: "stdout", text: "42\n" });
    etch.updateSync(view.component);
    const frame = document.createElement("iframe");
    document.body.appendChild(frame);
    const primarySurface = { document, window };
    const detachedSurface = {
      document: frame.contentDocument,
      window: frame.contentWindow,
    };
    let detachedPane = null;
    try {
      const primaryComponent = view.component;
      const detach = beginResultViewSurfaceTransition({
        item: editor,
        from: primarySurface,
        to: detachedSurface,
      });
      detachedPane = lumine.workspace.getCenter().detachPaneItem(editor);
      detachedSurface.document.body.appendChild(editor.element);
      await detach.commit({ to: detachedSurface });

      expect(view.component).not.toBe(primaryComponent);
      expect(view.element.ownerDocument).toBe(detachedSurface.document);
      expect(view.component.element.ownerDocument).toBe(detachedSurface.document);

      view.component.expanded = true;
      view.component.resizedWidth = 321;
      view.component.resizedHeight = 123;
      const detachedComponent = view.component;
      const attach = beginResultViewSurfaceTransition({
        item: editor,
        from: detachedSurface,
        to: primarySurface,
      });
      lumine.workspace.getCenter().attachDetachedPane(detachedPane);
      document.body.appendChild(editor.element);
      await attach.commit({ to: primarySurface });
      detachedPane = null;

      expect(view.component).not.toBe(detachedComponent);
      expect(view.element.ownerDocument).toBe(document);
      expect(view.component.element.ownerDocument).toBe(document);
      expect(view.component.captureSurfaceState()).toEqual({
        expanded: true,
        resizedWidth: 321,
        resizedHeight: 123,
      });
    } finally {
      if (detachedPane?.isAlive?.()) {
        lumine.workspace.getCenter().attachDetachedPane(detachedPane);
      }
      view.destroy();
      editor.destroy();
      frame.remove();
    }
  });
});
