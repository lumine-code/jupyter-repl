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
    view = new InputView({ prompt: "Value?", allowCancel: true }, confirmed);
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

  it("keeps a required password request open on Escape and submits its masked draft once", () => {
    const InputView = require("../lib/input-view");
    const confirmed = jasmine.createSpy("confirmed");
    const cancelled = jasmine.createSpy("cancelled");
    const baseline = lumine.textEditors.getEditors().length;
    view = new InputView({ password: true, allowCancel: false }, confirmed, cancelled);
    view.attach();
    const editor = view.miniEditor;
    editor.setText("kernel secret");
    expect(editor.getElement().style.webkitTextSecurity).toBe("disc");
    lumine.commands.dispatch(editor.getElement(), "core:cancel");
    expect(view.closed).not.toBeTrue();
    expect(cancelled).not.toHaveBeenCalled();
    lumine.commands.dispatch(editor.getElement(), "core:confirm");
    view.confirm();
    expect(confirmed).toHaveBeenCalledOnceWith("kernel secret");
    expect(lumine.textEditors.getEditors().length).toBe(baseline);
  });

  it("keeps a cancellable request alive while focus moves to its Submit button", async () => {
    const InputView = require("../lib/input-view");
    const confirmed = jasmine.createSpy("confirmed");
    const cancelled = jasmine.createSpy("cancelled");
    view = new InputView({ allowCancel: true }, confirmed, cancelled);
    view.attach();
    view.miniEditor.setText("answer");
    const submit = view.element.querySelector(".btn-primary");
    submit.focus();
    await Promise.resolve();
    expect(cancelled).not.toHaveBeenCalled();
    submit.click();
    expect(confirmed).toHaveBeenCalledOnceWith("answer");
  });

  it("cancels an optional request when focus leaves its action button", async () => {
    const InputView = require("../lib/input-view");
    const cancelled = jasmine.createSpy("cancelled");
    view = new InputView({ allowCancel: true }, null, cancelled);
    const outside = document.createElement("button");
    jasmine.attachToDOM(outside);
    view.attach();
    spyOn(document, "hasFocus").and.returnValue(true);
    view.miniEditor.getElement().focus();
    view.element.querySelector(".btn-primary").focus();
    await Promise.resolve();
    expect(view.closed).not.toBeTrue();
    outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    expect(view.closed).toBeTrue();
    expect(cancelled).toHaveBeenCalledTimes(1);
  });

  it("resumes a required input after a covering modal closes without losing its draft", async () => {
    const InputView = require("../lib/input-view");
    const confirmed = jasmine.createSpy("confirmed");
    view = new InputView({ allowCancel: false }, confirmed);
    view.attach();
    const editor = view.miniEditor;
    editor.setText("pending answer");
    const cover = lumine.workspace.addModalPanel({ item: document.createElement("button") });
    expect(view.panel.isVisible()).toBeFalse();
    expect(view.closed).not.toBeTrue();
    cover.destroy();
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    expect(view.panel.isVisible()).toBeTrue();
    expect(view.miniEditor).toBe(editor);
    expect(editor.getText()).toBe("pending answer");
    expect(confirmed).not.toHaveBeenCalled();
  });

  it("recreates an externally destroyed required panel without resolving its request", async () => {
    const InputView = require("../lib/input-view");
    const confirmed = jasmine.createSpy("confirmed");
    view = new InputView({ allowCancel: false }, confirmed);
    view.attach();
    const previous = view.panel;
    const editor = view.miniEditor;
    editor.setText("preserved answer");
    previous.destroy();
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    expect(view.panel).not.toBe(previous);
    expect(view.panel.isVisible()).toBeTrue();
    expect(view.closed).not.toBeTrue();
    expect(editor.isDestroyed()).toBeFalse();
    expect(editor.getText()).toBe("preserved answer");
    expect(confirmed).not.toHaveBeenCalled();
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
