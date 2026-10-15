const path = require("node:path");

describe("Jupyter source editor shortcuts", () => {
  let editor;
  let subscriptions;
  let received;

  const executionCommands = [
    "jupyter-repl:run",
    "jupyter-repl:run-and-move-down",
    "jupyter-repl:clear-results",
  ];

  beforeEach(async () => {
    jasmine.attachToDOM(lumine.workspace.getElement());
    editor = await lumine.workspace.open();
    editor.setText("first\nsecond");
    editor.setCursorBufferPosition([0, 2]);
    editor.element.focus();
    received = [];
    subscriptions = [
      lumine.keymaps.add(
        "jupyter-repl-source-shortcuts-spec",
        lumine.keymaps.readKeymap(path.join(__dirname, "../keymaps/main.json")),
      ),
      lumine.commands.add(
        editor.element,
        Object.fromEntries(
          executionCommands.map((command) => [
            command,
            (event) => {
              received.push(command);
              event.stopPropagation();
            },
          ]),
        ),
      ),
    ];
  });

  afterEach(() => {
    for (const subscription of subscriptions ?? []) subscription.dispose();
  });

  function press(key, modifiers = {}) {
    lumine.keymaps.handleKeyboardEvent(
      lumine.keymaps.constructor.buildKeydownEvent(key, {
        target: editor.element,
        ...modifiers,
      }),
    );
  }

  it("preserves normal newline below and above with the Jupyter keymap loaded", () => {
    const primary = process.platform === "darwin" ? { cmd: true } : { ctrl: true };
    press("enter", primary);
    expect(editor.getText()).toBe("first\n\nsecond");
    editor.setText("first\nsecond");
    editor.setCursorBufferPosition([0, 2]);
    press("enter", { ...primary, shift: true });
    expect(editor.getText()).toBe("\nfirst\nsecond");
    expect(received).toEqual([]);
  });

  it("dispatches every execution chord once without changing the buffer", () => {
    for (const suffix of [["r"], ["s"], ["x"]]) {
      press("j", { alt: true });
      for (const key of suffix) press(key);
    }
    expect(received).toEqual(executionCommands);
    expect(editor.getText()).toBe("first\nsecond");
  });
});
