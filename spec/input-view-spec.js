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

  requestInput({ prompt = "Value", password = false } = {}) {
    this.onResults(
      {
        header: { msg_id: "stdin", msg_type: "input_request" },
        parent_header: { msg_id: "execute", msg_type: "execute_request" },
        content: { prompt, password },
      },
      "stdin",
    );
  }
}

describe("InputView primary modal", () => {
  let detachedPane, editor, view, workspaceElement;

  beforeEach(async () => {
    lumine.initializeDetachedPaneSurfaces({ force: true });
    workspaceElement = lumine.workspace.getElement();
    jasmine.attachToDOM(workspaceElement);
    editor = await lumine.workspace.open();
    detachedPane = await lumine.workspace.detachPaneItem(editor, { show: false });
  });

  afterEach(async () => {
    view?.close();
    if (detachedPane?.isAlive?.()) await lumine.workspace.attachDetachedPane(detachedPane);
    editor?.destroy();
    lumine.initializeDetachedPaneSurfaces();
  });

  it("mounts, focuses, and restores focus in the primary document", () => {
    const confirmed = jasmine.createSpy("confirmed");
    const priorFocus = document.createElement("button");
    workspaceElement.append(priorFocus);
    priorFocus.focus();
    view = new InputView({ prompt: "Value", defaultText: "answer" }, confirmed).attach();

    expect(view.element.ownerDocument).toBe(document);
    expect(view.miniEditor.element.ownerDocument).toBe(document);
    expect(view.panel.getContainer()).toBe(lumine.workspace.panelContainers.modal);
    expect(view.miniEditor.element.contains(document.activeElement)).toBe(true);

    lumine.commands.dispatch(view.element, "core:confirm");

    expect(confirmed).toHaveBeenCalledWith("answer");
    expect(document.activeElement).toBe(priorFocus);
    priorFocus.remove();
  });

  it("presents kernel stdin in the primary window for a detached execution", () => {
    const detachedDocument = lumine.workspace.getWindowSurface(editor).document;
    const transport = new InputTransport();
    const kernel = new Kernel(transport);
    editor.getElement().focus();
    kernel.execute("input()", () => {});

    transport.requestInput();

    const input = document.querySelector(".input-view");
    expect(input).not.toBeNull();
    expect(detachedDocument.querySelector(".input-view")).toBeNull();
    const miniEditor = input.querySelector("lumine-text-editor").getModel();
    miniEditor.setText("from primary");
    lumine.commands.dispatch(input, "core:confirm");

    expect(transport.replies).toEqual(["from primary"]);
    transport.destroy();
  });

  it("masks passwords only while the input contains text", () => {
    const confirmed = jasmine.createSpy("confirmed");
    view = new InputView(
      { prompt: "Password", defaultText: "secret", password: true },
      confirmed,
    ).attach();

    expect(view.miniEditor.element.style.webkitTextSecurity).toBe("disc");
    view.miniEditor.setText("");
    expect(view.miniEditor.element.style.webkitTextSecurity).toBe("none");
    view.miniEditor.setText("new secret");
    expect(view.miniEditor.element.style.webkitTextSecurity).toBe("disc");

    view.confirm();

    expect(confirmed).toHaveBeenCalledWith("new secret");
  });

  it("settles once with an empty reply when its panel is destroyed externally", () => {
    const transport = new InputTransport();
    const kernel = new Kernel(transport);
    kernel.execute("input()", () => {});
    transport.requestInput();

    const input = document.querySelector(".input-view");
    lumine.workspace.panelForItem(input).destroy();

    expect(transport.replies).toEqual([""]);
    expect(input.isConnected).toBe(false);
    transport.destroy();
  });

  it("routes direct destruction through the same idempotent cancellation path", () => {
    const cancelled = jasmine.createSpy("cancelled");
    view = new InputView({ prompt: "Value" }, jasmine.createSpy("confirmed"), cancelled).attach();

    view.destroy();
    view.destroy();
    view.cancel();

    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(view.destroyed).toBe(true);
  });

  it("settles once with an empty reply when another modal displaces it", () => {
    const transport = new InputTransport();
    const kernel = new Kernel(transport);
    kernel.execute("input()", () => {});
    transport.requestInput();

    const replacement = lumine.workspace.addModalPanel({ item: document.createElement("div") });

    expect(transport.replies).toEqual([""]);
    replacement.destroy();
    transport.destroy();
  });

  it("can present delayed stdin after the detached item has closed", async () => {
    const transport = new InputTransport();
    const kernel = new Kernel(transport);
    kernel.execute("input()", () => {});

    await detachedPane.destroyItem(editor, true);
    editor = null;
    detachedPane = null;
    transport.requestInput();

    const input = document.querySelector(".input-view");
    expect(input).not.toBeNull();
    const miniEditor = input.querySelector("lumine-text-editor").getModel();
    miniEditor.setText("still running");
    lumine.commands.dispatch(input, "core:confirm");

    expect(transport.replies).toEqual(["still running"]);
    transport.destroy();
  });

  it("allows cancellable prompts to settle exactly once", () => {
    const confirmed = jasmine.createSpy("confirmed");
    const cancelled = jasmine.createSpy("cancelled");
    view = new InputView({ prompt: "Name", allowCancel: true }, confirmed, cancelled).attach();

    lumine.commands.dispatch(view.element, "core:cancel");
    view.cancel();

    expect(confirmed).not.toHaveBeenCalled();
    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(view.destroyed).toBe(true);
  });
});
