describe("Kernel input presentation ownership", () => {
  let view;

  beforeEach(async () => {
    const textGrammarPackage = await lumine.packages.activatePackage("language-text");
    await textGrammarPackage.resourceLoadPromise;
    jasmine.attachToDOM(lumine.workspace.getElement());
  });

  afterEach(async () => {
    view?.close();
    view = null;
    await lumine.workspace.discardEditorWindows();
    delete document.priorFocus;
  });

  it("opens input in the focused presentation without changing the main document's focus record", async () => {
    const extra = await lumine.workspace.openEditorWindow({ show: false });
    spyOn(lumine.workspace, "getFocusedWindow").and.returnValue(extra);
    const InputView = require("../lib/input-view");
    view = new InputView({ prompt: "Value?" });
    view.attach();
    expect(view.element.ownerDocument).toBe(extra.getDocument());
    expect(document.priorFocus).toBeUndefined();
  });

  it("keeps a pending answer when its presentation closes and rehosts it in the main window", async () => {
    const extra = await lumine.workspace.openEditorWindow({ show: false });
    const InputView = require("../lib/input-view");
    const confirmed = jasmine.createSpy("confirmed");
    view = new InputView({ prompt: "Value?" }, confirmed);
    view.attach({ window: extra });
    expect(view.element.ownerDocument).toBe(extra.getDocument());
    view.miniEditor.setText("pending answer");
    await lumine.workspace.closeEditorWindow(extra);
    expect(view.closed).not.toBeTrue();
    expect(view.element.ownerDocument).toBe(document);
    expect(view.miniEditor.getText()).toBe("pending answer");
    expect(confirmed).not.toHaveBeenCalled();
  });

  it("delivers cancellation once even when the owning request also closes", () => {
    const InputView = require("../lib/input-view");
    const cancelled = jasmine.createSpy("cancelled");
    view = new InputView({ allowCancel: true }, null, cancelled);
    view.cancel();
    view.cancel();
    expect(cancelled).toHaveBeenCalledTimes(1);
  });

  it("does not attach a retired input view to a new modal host", () => {
    const InputView = require("../lib/input-view");
    view = new InputView({ prompt: "Retired" });
    view.close();
    const add = spyOn(lumine.workspace, "addModalPanel").and.callThrough();
    view.attach();
    expect(add).not.toHaveBeenCalled();
  });

  for (const focused of [true, false]) {
    it(`restores only its own prior focus when its document is focused: ${focused}`, async () => {
      const extra = await lumine.workspace.openEditorWindow({ show: false });
      const document = extra.getDocument();
      const prior = document.createElement("button");
      document.body.append(prior);
      const active = spyOnProperty(document, "activeElement", "get").and.returnValue(prior);
      spyOn(document, "hasFocus").and.returnValue(focused);
      const InputView = require("../lib/input-view");
      view = new InputView({ prompt: "Value?" });
      view.attach({ window: extra });
      const focus = spyOn(prior, "focus");
      active.and.returnValue(view.miniEditor.element);
      view.close();
      expect(focus.calls.count()).toBe(focused ? 1 : 0);
    });
  }
});
