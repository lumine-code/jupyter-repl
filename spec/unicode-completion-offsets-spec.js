const path = require("node:path");
const { CompositeDisposable } = require("lumine");

describe("Jupyter completion code-point offsets", () => {
  let editor, kernel, store, provider, requests, inspections, reply;

  beforeEach(async () => {
    for (const method of ["openExternal", "openPath", "showItemInFolder", "openApplication"])
      spyOn(lumine.shell, method).and.resolveTo();
    spyOn(lumine.application, "openWindow").and.resolveTo();
    lumine.config.set("jupyter-repl.autocomplete", true);
    lumine.config.set("jupyter-repl.showInspectorResultsInAutocomplete", true);
    lumine.config.set("autocomplete.minimumWordLength", 1);
    // Load the current package resources without starting kernel discovery.
    // Only the owned transport edge below supplies protocol replies.
    const pack = lumine.packages.loadPackage(path.resolve(__dirname, ".."));
    const WSKernel = require(path.join(pack.path, "lib/ws-kernel"));
    const Kernel = require(path.join(pack.path, "lib/kernel"));
    const { provideAutocomplete } = require(
      path.join(pack.path, "lib/services/provided/autocomplete"),
    );
    requests = [];
    inspections = [];
    const transport = new WSKernel(
      "owned-completion",
      { name: "owned-python", display_name: "Owned Python", language: "python" },
      lumine.grammars.nullGrammar,
      {
        kernel: {
          status: "idle",
          registerCommTarget() {},
          removeCommTarget() {},
          requestComplete(content) {
            requests.push(content);
            return Promise.resolve({
              header: { msg_id: "owned-reply", msg_type: "complete_reply" },
              parent_header: { msg_id: "owned-request", msg_type: "complete_request" },
              content: reply,
            });
          },
          requestInspect(content) {
            inspections.push(content);
            return Promise.resolve({
              header: { msg_id: "owned-inspect-reply", msg_type: "inspect_reply" },
              parent_header: { msg_id: "owned-inspect", msg_type: "inspect_request" },
              content: { status: "ok", found: true, data: { "text/plain": "Owned details" } },
            });
          },
        },
        dispose() {},
      },
    );
    kernel = new Kernel(transport);
    const session = kernel.getPluginWrapper();
    editor = await lumine.workspace.open();
    store = { subscriptions: new CompositeDisposable() };
    provider = provideAutocomplete(store, { getKernelForEditor: () => session });
  });

  afterEach(() => {
    store?.subscriptions.dispose();
    kernel?.destroy();
    editor?.destroy();
    lumine.config.unset("jupyter-repl.autocomplete");
    lumine.config.unset("jupyter-repl.showInspectorResultsInAutocomplete");
    lumine.config.unset("autocomplete.minimumWordLength");
    editor = kernel = store = provider = requests = inspections = reply = null;
  });

  async function suggest(code, start, end, typed = false) {
    editor.setText(code);
    editor.setCursorBufferPosition([0, code.length]);
    reply = {
      status: "ok",
      matches: ["bcd"],
      cursor_start: start,
      cursor_end: end,
      metadata: typed
        ? { _jupyter_types_experimental: [{ text: "bcd", start, end, type: "property" }] }
        : {},
    };
    return provider.getSuggestions({
      editor,
      bufferPosition: editor.getCursorBufferPosition(),
      prefix: code,
    });
  }

  async function complete(code, start, end, typed = false) {
    const [suggestion] = await suggest(code, start, end, typed);
    expect(requests).toEqual([{ code, cursor_pos: end }]);
    expect(suggestion.replacementPrefix).toBe("bc");
    const cursor = editor.getCursorBufferPosition();
    editor.setTextInBufferRange(
      [[cursor.row, cursor.column - suggestion.replacementPrefix.length], cursor],
      suggestion.text,
    );
    expect(editor.getText()).toBe(code.slice(0, -2) + "bcd");
    expect(suggestion.replacedText).toBe(editor.getText());
  }

  it("uses code points for a combining-mark identifier and a plain reply", async () => {
    await complete("a\u0301.bc", 3, 5);
  });

  it("uses code points for the typed completion's explicit range", async () => {
    await complete("a\u0301.bc", 3, 5, true);
  });

  it("keeps astral identifier letters mapped to their two UTF-16 units", async () => {
    await complete("\u{10400}x.bc", 3, 5);
  });

  it("keeps the ordinary ASCII completion path", async () => {
    await complete("ax.bc", 3, 5);
  });

  async function inspect(code) {
    const [suggestion] = await suggest(code, 3, 5);
    const details = await provider.getSuggestionDetailsOnSelect(suggestion);
    expect(details.description).toBe("Owned details");
    expect(inspections).toEqual([
      { code: code.slice(0, -2) + "bcd", cursor_pos: 6, detail_level: 0 },
    ]);
  }

  it("keeps separate code points in inspection of a combining-mark identifier", async () => {
    await inspect("a\u0301.bc");
  });

  it("translates the astral UTF-16 inspection position onto the wire", async () => {
    await inspect("\u{10400}x.bc");
  });

  it("keeps the ordinary ASCII inspection position", async () => {
    await inspect("ax.bc");
  });
});
