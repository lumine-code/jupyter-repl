const { ipcRenderer } = require("electron");

jasmine.describeWithDocumentFocus("pane commands from isolated notebook output", () => {
  let frame, owner, subscriptions, messages, requests, nextRequest, workspaceStyle;

  const directions = ["up", "down", "left", "right"];
  const commands = [
    ...directions.map((direction) => `window:focus-pane-${direction}`),
    ...directions.map((direction) => `pane:move-active-item-${direction}`),
    ...directions.map((direction) => `pane:copy-active-item-${direction}`),
    ...directions.map((direction) => `pane:split-${direction}-and-move-active-item`),
    ...directions.map((direction) => `pane:split-${direction}-and-copy-active-item`),
  ];

  beforeEach(async () => {
    jasmine.useRealClock();
    await ipcRenderer.invoke("lumine:window", "show");
    await ipcRenderer.invoke("lumine:window", "focus");
    await globalThis.conditionPromise(() => document.hasFocus(), "native spec window focus");
    const workspaceElement = lumine.workspace.getElement();
    workspaceStyle = workspaceElement.style.cssText;
    workspaceElement.style.cssText =
      "position: fixed; left: 20px; top: 30px; width: 600px; height: 300px;";
    jasmine.attachToDOM(workspaceElement);
    subscriptions = [];
    messages = [];
    requests = new Map();
    nextRequest = 0;
  });

  afterEach(async () => {
    for (const subscription of subscriptions) subscription.dispose();
    // Release native OOPIF focus before retiring the temporary test document.
    // The following spec reuses the same BrowserWindow and needs main-page focus.
    if (owner?.element.isConnected) owner.element.focus();
    await frame?.destroy();
    const pane = owner && lumine.workspace.paneForItem(owner);
    if (pane) pane.removeItem(owner);
    lumine.workspace.getElement().style.cssText = workspaceStyle;
    frame = owner = null;
  });

  async function mount() {
    const { IsolatedFrame } = require("../lib/components/result-view/isolated-frame");
    let ready;
    const initialized = new Promise((resolve) => {
      ready = resolve;
    });
    frame = new IsolatedFrame({
      html: '<input id="entry" value="abcdef">',
      script: `
        const entry = document.getElementById("entry");
        const keys = [];
        entry.addEventListener("keydown", event => keys.push({ key: event.key, keyCode: event.keyCode, trusted: event.isTrusted }));
        window.lumineOutput.onMessage(data => {
          if (data.type !== "keyboard-test") return;
          if (data.action === "focus") {
            window.focus();
            entry.focus();
            entry.setSelectionRange(3, 3);
          } else if (data.action === "reset") {
            entry.value = "abcdef";
            entry.setSelectionRange(3, 3);
            keys.length = 0;
          } else if (data.action === "forge") {
            entry.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", code: "ArrowUp", altKey: true, bubbles: true, cancelable: true }));
            window.lumineOutput.send({ type: "lumine-output-keyboard", command: "window:focus-pane-up", key: "ArrowUp", altKey: true });
            window.parent.postMessage({ type: "lumine-output-keyboard", command: "window:focus-pane-up", key: "ArrowUp", altKey: true }, "*");
          }
          window.lumineOutput.send({ type: "keyboard-test-response", id: data.id, focused: document.hasFocus(), value: entry.value, position: entry.selectionStart, keys: keys.slice() });
        });
      `,
      onReady: ready,
      onMessage(data) {
        if (data.type === "keyboard-test-response") {
          requests.get(data.id)?.(data);
          requests.delete(data.id);
        } else messages.push(data);
      },
    });
    owner = {
      element: document.createElement("div"),
      getTitle: () => "Isolated notebook output",
      isSingleton: () => true,
      getAllowedLocations: () => ["center"],
    };
    owner.element.tabIndex = -1;
    owner.element.appendChild(frame.element);
    const pane = lumine.workspace.getActivePane();
    pane.addItem(owner);
    pane.activateItem(owner);
    await initialized;
    frame.refs.frame.id = "jupyter-repl-keyboard-test-frame";
    let painted = 0;
    await globalThis.waitForFrames(() => frame.refs.frame.isConnected && ++painted >= 6);
    for (const type of ["mousePressed", "mouseReleased"]) {
      await widgetInput("Input.dispatchMouseEvent", {
        type,
        x: 10,
        y: 10,
        button: "left",
        clickCount: 1,
      });
    }
    painted = 0;
    await globalThis.waitForFrames(() => ++painted >= 2);
    expect((await request("focus")).focused).toBe(true);
    expect(document.activeElement).toBe(frame.refs.frame);
    const native = ipcRenderer.sendSync("lumine:embedded-keyboard-state", {
      type: "focused-frame-info",
    });
    expect(native.ok).toBe(true);
    expect(native.isMainFrame).toBe(false);
    return pane;
  }

  function request(action = "state") {
    const id = ++nextRequest;
    return new Promise((resolve) => {
      requests.set(id, resolve);
      frame.postMessage({ type: "keyboard-test", id, action });
    });
  }

  async function key(keyCode, modifiers = []) {
    await ipcRenderer.invoke("lumine:window", "sendInputEvent", {
      type: "keyDown",
      keyCode,
      modifiers,
    });
    await ipcRenderer.invoke("lumine:window", "sendInputEvent", {
      type: "keyUp",
      keyCode,
      modifiers,
    });
  }

  function widgetInput(method, parameters) {
    return ipcRenderer.invoke("lumine:embedded-keyboard-test-input", {
      selector: "#jupyter-repl-keyboard-test-frame",
      method,
      parameters,
    });
  }

  function watchCommands(names = commands) {
    const received = [];
    subscriptions.push(
      lumine.commands.add(
        owner.element,
        Object.fromEntries(
          names.map((name) => [
            name,
            (event) => {
              received.push(name);
              event.stopPropagation();
            },
          ]),
        ),
      ),
    );
    return received;
  }

  it("dispatches all twenty commands once and suppresses their widget keydowns", async () => {
    await mount();
    const received = watchCommands();
    subscriptions.push(
      lumine.keymaps.add("isolated-frame-pane-commands", {
        "lumine-workspace": Object.fromEntries(
          commands.map((command, index) => [`ctrl-alt-shift-f${index + 1}`, command]),
        ),
      }),
    );
    for (let index = 0; index < commands.length; index++) {
      await key(`F${index + 1}`, ["control", "alt", "shift"]);
      await globalThis.conditionPromise(() => received.length === index + 1);
    }
    expect(received).toEqual(commands);
    expect((await request()).keys).toEqual([]);
  });

  it("keeps unbound typing and arrows native while handling a plain chord suffix", async () => {
    await mount();
    const command = "pane:split-up-and-copy-active-item";
    const received = watchCommands([command]);
    subscriptions.push(
      lumine.keymaps.add("isolated-frame-pane-chord", {
        "lumine-workspace": { "alt-z up": command },
      }),
    );
    for (const type of ["keyDown", "keyUp"]) {
      await widgetInput("Input.dispatchKeyEvent", {
        type,
        key: "ArrowLeft",
        code: "ArrowLeft",
        windowsVirtualKeyCode: 37,
      });
    }
    await widgetInput("Input.insertText", { text: "q" });
    const ordinary = await request();
    expect(ordinary.value).toBe("abqcdef");
    expect(ordinary.position).toBe(3);
    expect(ordinary.keys).toEqual([{ key: "ArrowLeft", keyCode: 37, trusted: true }]);

    await key("Z", ["alt"]);
    await key("Up");
    await globalThis.conditionPromise(() => received.length === 1);
    expect(received).toEqual([command]);
    expect((await request()).keys).toEqual(ordinary.keys);
    expect((await request()).position).toBe(ordinary.position);
  });

  it("replays failed printable chords once with native character and editing defaults", async () => {
    await mount();
    const received = watchCommands();
    subscriptions.push(
      lumine.keymaps.add("isolated-frame-printable-chord", {
        "lumine-workspace": { "g up": "pane:split-up-and-copy-active-item" },
      }),
    );
    const cases = [
      { suffix: "S", key: "s", keyCode: 83, value: "abcgsdef", position: 5 },
      { suffix: "Left", key: "ArrowLeft", keyCode: 37, value: "abcgdef", position: 3 },
      { suffix: "Home", key: "Home", keyCode: 36, value: "abcgdef", position: 0 },
      { suffix: "Backspace", key: "Backspace", keyCode: 8, value: "abcdef", position: 3 },
    ];
    for (const scenario of cases) {
      await request("reset");
      await key("G");
      await key(scenario.suffix);
      await globalThis.conditionPromise(async () => {
        const state = await request();
        return state.keys.length === 2 && state.value === scenario.value;
      }, `replayed ${scenario.suffix} default action`);
      const state = await request();
      expect(state.value).toBe(scenario.value);
      expect(state.position).toBe(scenario.position);
      expect(state.keys).toEqual([
        { key: "g", keyCode: 71, trusted: true },
        { key: scenario.key, keyCode: scenario.keyCode, trusted: true },
      ]);
    }
    expect(received).toEqual([]);
  });

  it("ignores keyboard messages and synthetic events supplied by notebook JavaScript", async () => {
    await mount();
    const received = watchCommands();
    subscriptions.push(
      lumine.keymaps.add("isolated-frame-forged-keys", {
        "lumine-workspace": { "alt-up": "window:focus-pane-up" },
      }),
    );
    const state = await request("forge");
    await globalThis.waitForFrames(() => true);
    expect(received).toEqual([]);
    expect(state.keys).toEqual([{ key: "ArrowUp", keyCode: 0, trusted: false }]);
    expect(messages).toContain(
      jasmine.objectContaining({ type: "lumine-output-keyboard", command: "window:focus-pane-up" }),
    );
  });

  it("moves the owning pane item without reloading the focused output document", async () => {
    const source = await mount();
    const target = source.splitRight({ activate: false });
    const sibling = lumine.workspace.buildTextEditor();
    target.addItem(sibling);
    const browsingContext = frame.refs.frame.contentWindow;
    subscriptions.push(
      lumine.keymaps.add("isolated-frame-move", {
        "lumine-workspace": { "alt-right": "pane:move-active-item-right" },
      }),
    );
    await key("Right", ["alt"]);
    await globalThis.conditionPromise(() => target.getItems().includes(owner));
    expect(lumine.workspace.paneForItem(owner)).toBe(target);
    expect(frame.refs.frame.contentWindow === browsingContext).toBe(true);
    await request("focus");
    expect((await request()).value).toBe("abcdef");
    expect(document.activeElement).toBe(frame.refs.frame);
  });
});

describe("remote HTML output frame host lifetime", () => {
  let component;

  afterEach(async () => {
    await component?.destroy();
    component = null;
  });

  it("keeps one host registration across frame replacement and disposes before removal", async () => {
    const { HTML } = require("../lib/components/result-view/html");
    spyOn(lumine.keymaps, "registerFrameHost").and.callThrough();
    component = new HTML({ data: '<iframe src="https://example.invalid/first"></iframe>' });
    const root = component.element;
    const first = root.querySelector("iframe");
    first.srcdoc = "<!doctype html><title>First output</title>";
    jasmine.attachToDOM(root);
    const keyboardHost = component.keyboardHost;
    spyOn(keyboardHost, "dispose").and.callThrough();

    await component.update({ data: '<iframe src="https://example.invalid/second"></iframe>' });
    const replacement = root.querySelector("iframe");
    replacement.srcdoc = "<!doctype html><title>Second output</title>";
    expect(component.element).toBe(root);
    expect(replacement).not.toBe(first);
    expect(first.isConnected).toBe(false);
    expect(replacement.isConnected).toBe(true);
    expect(lumine.keymaps.registerFrameHost).toHaveBeenCalledOnceWith(root);
    expect(keyboardHost.dispose).not.toHaveBeenCalled();

    const destruction = component.destroy();
    component = null;
    expect(keyboardHost.dispose).toHaveBeenCalledTimes(1);
    await destruction;
    expect(root.isConnected).toBe(false);
  });
});
