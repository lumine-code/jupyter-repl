describe("Inline output measurement across editor windows", () => {
  beforeEach(async () => {
    const textGrammarPackage = await lumine.packages.activatePackage("language-text");
    await textGrammarPackage.resourceLoadPromise;
  });

  let lease, bubble, markerStore;

  afterEach(async () => {
    bubble?.destroy();
    markerStore?.destroy();
    lease?.dispose();
    lease = bubble = markerStore = null;
    await lumine.workspace.discardEditorWindows();
  });

  it("releases the source observer and binds measurement to the adopted editor", async () => {
    jasmine.attachToDOM(lumine.workspace.getElement());
    const editor = await lumine.workspace.open();
    const extra = await lumine.workspace.openEditorWindow({ show: false });
    const source = spyOn(window, "ResizeObserver").and.callThrough();
    const {
      observeEditorOutputMetrics,
    } = require("../lib/components/result-view/editor-output-metrics");
    lease = observeEditorOutputMetrics(editor, () => {});
    const observer = source.calls.mostRecent().returnValue;
    const disconnect = spyOn(observer, "disconnect").and.callThrough();
    await lumine.workspace.movePaneItem(editor, {
      targetPane: extra.getEditorContainer().getActivePane(),
    });
    expect(disconnect).toHaveBeenCalled();
  });

  it("treats a connected output in another window as rendered and measures it immediately", async () => {
    jasmine.useRealClock();
    jasmine.attachToDOM(lumine.workspace.getElement());
    const editor = await lumine.workspace.open();
    editor.setText("x\n");
    const MarkerStore = require("../lib/store/markers");
    const ResultView = require("../lib/components/result-view");
    markerStore = new MarkerStore();
    bubble = new ResultView(markerStore, editor, 0);
    const sourceObserver = bubble.resizeObserver;
    const disconnect = spyOn(sourceObserver, "disconnect").and.callThrough();
    const extra = await lumine.workspace.openEditorWindow({ show: false });
    await lumine.workspace.movePaneItem(editor, {
      targetPane: extra.getEditorContainer().getActivePane(),
    });
    editor.element.appendChild(bubble.element);
    expect(bubble.element.isConnected).toBeTrue();
    expect(disconnect).toHaveBeenCalled();
    expect(bubble.resizeObserver instanceof extra.getDOMWindow().ResizeObserver).toBeTrue();
    expect(bubble.claimSelfResize([{ borderBoxSize: [{ blockSize: 100 }] }])).toBeTrue();
    const invalidate = spyOn(editor.element, "invalidateBlockDecorationDimensions");
    bubble._contentDirty = true;
    bubble._lastDetachedMeasure = Date.now();
    bubble.invalidateDecorationDimensions();
    expect(invalidate).toHaveBeenCalledOnceWith(bubble.decoration);
  });
});
