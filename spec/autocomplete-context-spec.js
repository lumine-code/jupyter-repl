const path = require("node:path");
const { Disposable, Emitter, Range } = require("lumine");

async function flush() {
  for (let turn = 0; turn < 8; turn++) await Promise.resolve();
}

describe("source assistance in the addressed editor's session", () => {
  let main,
    store,
    editor,
    expression,
    panel,
    events,
    first,
    second,
    ownership,
    globalMode,
    settings;
  beforeEach(async () => {
    if (lumine.packages.isPackageLoaded("jupyter-repl"))
      await lumine.packages.unloadPackage("jupyter-repl");
    const language = await lumine.packages.activatePackage("language-python");
    await language.resourceLoadPromise;
    const pack = await lumine.packages.activatePackage(path.resolve(__dirname, ".."));
    main = pack.mainModule;
    store = require("../lib/store");
    globalMode = store.globalMode;
    store.globalMode = false;
    settings = ["jupyter-repl.autocomplete", "autocomplete.minimumWordLength"].map((key) => [
      key,
      lumine.config.get(key),
    ]);
    lumine.config.set("jupyter-repl.autocomplete", true);
    lumine.config.set("autocomplete.minimumWordLength", 1);
    editor = await lumine.workspace.open();
    editor.setGrammar(lumine.grammars.grammarForScopeName("source.python"));
    expression = lumine.workspace.buildTextEditor({ mini: true });
    expression.setGrammar(editor.getGrammar());
    expression.setText("va");
    expression.moveToEndOfLine();
    const Kernel = require("../lib/kernel");
    const KernelTransport = require("../lib/kernel-transport");
    class Transport extends KernelTransport {
      supportsComms = false;
      requests = [];
      constructor(name) {
        super({ display_name: name, language: "python" }, editor.getGrammar());
        this.setLifecycle("ready");
        this.setExecutionState("idle");
      }
      complete(code, receive) {
        const record = { type: "complete_request", code, receive };
        this.requests.push(record);
        return new Disposable(() => {
          record.receive = null;
        });
      }
      inspect(code, _cursor, receive) {
        const record = { type: "inspect_request", code, receive };
        this.requests.push(record);
        return new Disposable(() => {
          record.receive = null;
        });
      }
      reply(record, content) {
        record.receive?.(
          {
            header: { msg_id: "reply", msg_type: record.type.replace(/_request$/, "_reply") },
            parent_header: { msg_id: "request", msg_type: record.type },
            content,
          },
          "shell",
        );
      }
    }
    first = new Kernel(new Transport("Center"));
    second = new Kernel(new Transport("Panel"));
    store.newKernel(first, `Unsaved Editor ${editor.id}`, editor, editor.getGrammar());
    store.commitNotebookKernel(store.prepareNotebookKernel(second, "panel-owned-completion"));
    store.updateEditor(editor);
    store.updateActivePaneItem(editor);
    events = new Emitter();
    panel = {
      element: document.createElement("div"),
      kernel: second.getPluginWrapper(),
      getURI: () => "lumine://jupyter-completion-context-test",
      getTitle: () => "Completion context",
      getDefaultLocation: () => "bottom",
      getAllowedLocations: () => ["bottom"],
      getJupyterKernel: () => panel.kernel,
      onDidChangeJupyterKernel: (callback) => events.on("kernel", callback),
      onDidDestroy: (callback) => events.on("destroy", callback),
      destroy() {
        if (panel.destroyed) return;
        panel.destroyed = true;
        events.emit("destroy");
        events.dispose();
        panel.element.remove();
      },
    };
    panel.element.appendChild(expression.element);
    ownership = lumine.textEditors.add(expression, { role: "input" });
    await lumine.workspace.open(panel, { location: "bottom", activatePane: false });
    await lumine.workspace.open(editor);
    await flush();
  });
  afterEach(async () => {
    panel?.destroy();
    ownership?.dispose();
    expression?.destroy();
    first?.destroy();
    second?.destroy();
    editor?.destroy();
    store.globalMode = globalMode;
    for (const [key, value] of settings) lumine.config.set(key, value);
    if (lumine.packages.isPackageLoaded("jupyter-repl"))
      await lumine.packages.unloadPackage("jupyter-repl");
    await lumine.fileWatchClient.settlePendingTeardown();
  });

  const suggestions = (signal) =>
    main.provideAutocomplete().getSuggestions({
      editor: expression,
      bufferPosition: { row: 0, column: 2 },
      prefix: "va",
      signal,
    });

  for (const centerHasKernel of [true, false]) {
    it(`uses the panel's session while the center ${centerHasKernel ? "has another" : "has no"} kernel`, async () => {
      if (!centerHasKernel) first.destroy();
      const provider = main.provideJupyterKernel();
      expect(provider.getActiveKernel()).toBe(centerHasKernel ? first.getPluginWrapper() : null);
      expect(provider.getKernelForEditor(expression)).toBe(second.getPluginWrapper());
      expect(main.provideAutocomplete().enabled).toBe(true);
      const pending = suggestions();
      await flush();
      expect(first.transport.requests.length).toBe(0);
      expect(second.transport.requests.length).toBe(1);
      second.transport.reply(second.transport.requests[0], {
        matches: ["value"],
        cursor_start: 0,
        cursor_end: 2,
      });
      expect((await pending)[0].text).toBe("value");
    });
  }

  it("inspects a selected suggestion in its captured session after the center context changes", async () => {
    const pending = suggestions();
    await flush();
    second.transport.reply(second.transport.requests[0], {
      matches: ["value"],
      cursor_start: 0,
      cursor_end: 2,
    });
    const [suggestion] = await pending;
    first.destroy();
    const details = main.provideAutocomplete().getSuggestionDetailsOnSelect(suggestion);
    await flush();
    expect(second.transport.requests[1].type).toBe("inspect_request");
    second.transport.reply(second.transport.requests[1], {
      found: true,
      data: { "text/plain": "Panel value" },
    });
    expect((await details).description).toBe("Panel value");
  });

  it("invalidates pending and cached dropdown data on binding, generation and signal changes", async () => {
    let pending = suggestions();
    await flush();
    panel.kernel = first.getPluginWrapper();
    events.emit("kernel");
    expect(await pending).toBeNull();
    expect(second.transport.requests[0].receive).toBeNull();
    panel.kernel = second.getPluginWrapper();
    pending = suggestions();
    await flush();
    second.transport.emitDidResetComms("Kernel restarted");
    expect(await pending).toBeNull();
    const controller = new AbortController();
    pending = suggestions(controller.signal);
    await flush();
    second.transport.reply(second.transport.requests.at(-1), {
      matches: ["value"],
      cursor_start: 0,
      cursor_end: 2,
    });
    const [suggestion] = await pending;
    controller.abort();
    expect(main.provideAutocomplete().getSuggestionDetailsOnSelect(suggestion)).toBeNull();
  });

  it("resolves hyperclick source through the same public panel ownership lookup", async () => {
    const query = spyOn(require("../lib/runtime-source"), "queryRuntimeSource").and.resolveTo({
      filename: path.join(__dirname, "panel.py"),
      line: 1,
      source: "",
    });
    spyOn(require("node:fs/promises"), "stat").and.resolveTo({ isFile: () => true });
    const suggestion = await main
      .provideHyperclick()
      .getSuggestionForWord(expression, "va", new Range([0, 0], [0, 2]));
    expect(suggestion).toBeTruthy();
    expect(query.calls.argsFor(0)[0]).toBe(second.getPluginWrapper());
  });

  it("revokes pending and cached completions when their originating source changes", async () => {
    let pending = suggestions();
    await flush();
    expression.setText("vb");
    expect(await pending).toBeNull();
    expect(second.transport.requests[0].receive).toBeNull();
    expression.setText("va");
    expression.moveToEndOfLine();
    pending = suggestions();
    await flush();
    second.transport.reply(second.transport.requests.at(-1), {
      matches: ["value"],
      cursor_start: 0,
      cursor_end: 2,
    });
    const [suggestion] = await pending;
    expression.setText("vb");
    expect(main.provideAutocomplete().getSuggestionDetailsOnSelect(suggestion)).toBeNull();
  });
});
