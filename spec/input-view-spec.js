const InputView = require("../lib/input-view");
const Kernel = require("../lib/kernel");
const KernelTransport = require("../lib/kernel-transport");

class InputTransport extends KernelTransport {
  constructor() {
    super({ language: "python", display_name: "Python" }, null);
  }

  execute(code, onResults) {
    this.onResults = onResults;
  }

  inputReply(value) {
    this.reply = value;
    this.replies ||= [];
    this.replies.push(value);
  }

  requestInput() {
    this.onResults(
      {
        header: { msg_id: "stdin", msg_type: "input_request" },
        parent_header: { msg_id: "execute", msg_type: "execute_request" },
        content: { prompt: "Value", password: false },
      },
      "stdin",
    );
  }
}

describe("InputView window surfaces", () => {
  let detachedPane, editor, editorElement, view, workspaceElement;

  beforeEach(async () => {
    lumine.initializeDetachedPaneSurfaces({ force: true });
    workspaceElement = lumine.workspace.getElement();
    jasmine.attachToDOM(workspaceElement);
    editor = await lumine.workspace.open();
    editorElement = editor.getElement();
    detachedPane = await lumine.workspace.detachPaneItem(editor, { show: false });
  });

  afterEach(async () => {
    view?.close();
    if (detachedPane?.isAlive?.()) await lumine.workspace.attachDetachedPane(detachedPane);
    editor?.destroy();
    lumine.initializeDetachedPaneSurfaces();
  });

  it("mounts, focuses, and restores focus in its owner's Document", () => {
    const surface = lumine.workspace.getWindowSurface(editor);
    const confirmed = jasmine.createSpy("confirmed");
    editorElement.focus();
    view = new InputView(
      { prompt: "Value", defaultText: "answer", route: { owner: editor } },
      confirmed,
    );

    view.attach();

    expect(view.element.ownerDocument).toBe(surface.document);
    expect(view.miniEditor.element.ownerDocument).toBe(surface.document);
    expect(view.panel.surface).toBe(surface);
    expect(view.miniEditor.element.contains(surface.document.activeElement)).toBe(true);

    lumine.commands.dispatch(view.element, "core:confirm");

    expect(confirmed).toHaveBeenCalledWith("answer");
    expect(surface.document.activeElement).toBe(editorElement);
  });

  it("carries the execution owner through a kernel stdin request", () => {
    const surface = lumine.workspace.getWindowSurface(editor);
    const transport = new InputTransport();
    const kernel = new Kernel(transport);
    editorElement.focus();
    kernel.execute("input()", () => {}, { owner: editor });

    transport.requestInput();

    const input = surface.document.querySelector(".input-view");
    expect(input).not.toBeNull();
    const miniEditor = input.querySelector("lumine-text-editor").getModel();
    miniEditor.setText("from child");
    lumine.commands.dispatch(input, "core:confirm");

    expect(transport.reply).toBe("from child");
    expect(surface.document.activeElement).toBe(editorElement);
    transport.destroy();
  });

  it("keeps one panel, its text, and its focus while the owner attaches and detaches", async () => {
    view = new InputView({ prompt: "Value", route: { owner: editor } }, () => {});
    view.attach();
    const panel = view.panel;
    view.miniEditor.setText("preserved");

    await lumine.workspace.attachDetachedPane(detachedPane);
    detachedPane = null;

    expect(view.panel).toBe(panel);
    expect(view.miniEditor.getText()).toBe("preserved");
    expect(view.element.ownerDocument).toBe(document);
    expect(panel.getContainer()).toBe(lumine.workspace.panelContainers.modal);
    expect(view.element.contains(document.activeElement)).toBe(true);

    detachedPane = await lumine.workspace.detachPaneItem(editor, { show: false });
    const detachedSurface = lumine.workspace.getWindowSurface(editor);

    expect(view.panel).toBe(panel);
    expect(view.miniEditor.getText()).toBe("preserved");
    expect(view.element.ownerDocument).toBe(detachedSurface.document);
    expect(panel.getContainer()).toBe(detachedSurface.modalPanelContainer);
    expect(view.element.contains(detachedSurface.document.activeElement)).toBe(true);
  });

  it("rehomes the same visible panel back when an attach transaction rolls back", async () => {
    const originalSurface = lumine.workspace.getWindowSurface(editor);
    view = new InputView({ prompt: "Value", route: { owner: editor } }, () => {});
    view.attach();
    const panel = view.panel;
    view.miniEditor.setText("survives rollback");
    const blocker = lumine.workspace.addWindowSurfaceTransitionObserver(({ item }) => {
      if (item !== editor) return;
      return {
        commit() {
          throw new Error("test attach failure");
        },
      };
    });

    try {
      await expectAsync(lumine.workspace.attachDetachedPane(detachedPane)).toBeRejectedWithError(
        "test attach failure",
      );
      detachedPane = lumine.workspace.paneForItem(editor);

      expect(lumine.workspace.getWindowSurface(editor)).toBe(originalSurface);
      expect(view.panel).toBe(panel);
      expect(view.miniEditor.getText()).toBe("survives rollback");
      expect(panel.getContainer()).toBe(originalSurface.modalPanelContainer);
      expect(view.element.ownerDocument).toBe(originalSurface.document);
      expect(panel.isVisible()).toBe(true);
    } finally {
      blocker.dispose();
    }
  });

  it("settles once with an empty reply when its panel is destroyed externally", () => {
    const transport = new InputTransport();
    const kernel = new Kernel(transport);
    kernel.execute("input()", () => {}, { owner: editor });
    transport.requestInput();

    const input = lumine.workspace.getWindowSurface(editor).document.querySelector(".input-view");
    lumine.workspace.panelForItem(input).destroy();

    expect(transport.replies).toEqual([""]);
    expect(input.isConnected).toBe(false);
    transport.destroy();
  });

  it("routes direct destruction through the same idempotent cancellation path", () => {
    const cancelled = jasmine.createSpy("cancelled");
    view = new InputView(
      { prompt: "Value", route: { owner: editor } },
      jasmine.createSpy("confirmed"),
      cancelled,
    ).attach();

    view.destroy();
    view.destroy();
    view.cancel();

    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(view.destroyed).toBe(true);
  });

  it("settles once with an empty reply when another modal displaces it", () => {
    const transport = new InputTransport();
    const kernel = new Kernel(transport);
    kernel.execute("input()", () => {}, { owner: editor });
    transport.requestInput();

    const replacement = lumine.workspace.addModalPanel({
      item: lumine.workspace.getWindowSurface(editor).document.createElement("div"),
      owner: editor,
    });

    expect(transport.replies).toEqual([""]);
    replacement.destroy();
    transport.destroy();
  });

  it("settles once with an empty reply when the owner is destroyed", async () => {
    const transport = new InputTransport();
    const kernel = new Kernel(transport);
    kernel.execute("input()", () => {}, { owner: editor });
    transport.requestInput();

    await detachedPane.destroyItem(editor, true);

    expect(transport.replies).toEqual([""]);
    editor = null;
    detachedPane = null;
    transport.destroy();
  });

  it("answers empty when the execution route disappears before stdin arrives", async () => {
    spyOn(console, "error");
    const transport = new InputTransport();
    const kernel = new Kernel(transport);
    kernel.execute("input()", () => {}, { owner: editor });

    await detachedPane.destroyItem(editor, true);
    transport.requestInput();

    expect(transport.replies).toEqual([""]);
    expect(console.error).toHaveBeenCalled();
    editor = null;
    detachedPane = null;
    transport.destroy();
  });

  it("settles a fixed-surface input when that surface's modal container is destroyed", () => {
    const surface = lumine.workspace.getWindowSurface(editor);
    const cancelled = jasmine.createSpy("cancelled");
    view = new InputView({ prompt: "Value", route: { surface } }, () => {}, cancelled);
    view.attach();

    surface.modalPanelContainer.destroy();

    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(view.destroyed).toBe(true);
  });

  it("rejects malformed, unregistered, and ownerless routes synchronously", () => {
    expect(() => new InputView({ route: {} }, () => {})).toThrowError(TypeError);
    expect(() => new InputView({ route: { owner: editor, surface: {} } }, () => {})).toThrowError(
      TypeError,
    );
    expect(() => new InputView({ route: { owner: {} } }, () => {})).toThrowError(TypeError);
    expect(() => new InputView({ route: { surface: {} } }, () => {})).toThrowError(TypeError);
  });
});
