const path = require("node:path");
const { CompositeDisposable, Emitter } = require("lumine");
const root = path.resolve(__dirname, "..");

describe("autocomplete without a running kernel", () => {
  let pack, facade, store, editor, oldGlobal, oldMinimum;
  beforeEach(async () => {
    oldMinimum = lumine.config.get("autocomplete.minimumWordLength");
    lumine.config.set("autocomplete.minimumWordLength", 1);
    if (lumine.packages.isPackageLoaded("jupyter-repl"))
      await lumine.packages.unloadPackage("jupyter-repl");
    pack = await lumine.packages.startPackage(root);
    facade = pack.mainModule.provideAutocomplete();
    store = require("../lib/store");
    oldGlobal = store.globalMode;
    store.globalMode = false;
    editor = await lumine.workspace.open();
    editor.setText("a1");
    editor.moveToEndOfLine();
    store.updateEditor(editor);
    store.updateActivePaneItem(editor);
  });
  afterEach(async () => {
    editor.destroy();
    store.globalMode = oldGlobal;
    lumine.config.set("autocomplete.minimumWordLength", oldMinimum);
    if (lumine.packages.isPackageLoaded("jupyter-repl"))
      await lumine.packages.unloadPackage("jupyter-repl");
  });

  it("does not load the completion implementation or result renderers while inactive", async () => {
    const implementationPath = require.resolve("../lib/services/provided/autocomplete");
    const rendererPath = require.resolve("../lib/components/result-view");
    const beforeImplementation = require.cache[implementationPath];
    const beforeRenderer = require.cache[rendererPath];
    if (beforeImplementation)
      spyOn(beforeImplementation.exports, "provideAutocomplete").and.callThrough();
    expect(facade.enabled).toBe(false);
    expect(facade.suggestionDetailsEnabled).toBe(false);
    spyOn(editor, "getTextInBufferRange").and.throwError("No inactive provider text reads");
    for (let index = 0; index < 100; index++) {
      expect(
        facade.getSuggestions({ editor, bufferPosition: { row: 0, column: 2 }, prefix: "a1" }),
      ).toBeNull();
      expect(facade.getSuggestionDetailsOnSelect({ replacedText: "a1" })).toBeNull();
    }
    expect(await facade.timeout()).toBeNull();
    expect(editor.getTextInBufferRange).not.toHaveBeenCalled();
    expect(require.cache[implementationPath]).toBe(beforeImplementation);
    expect(require.cache[rendererPath]).toBe(beforeRenderer);
    if (beforeImplementation)
      expect(beforeImplementation.exports.provideAutocomplete).not.toHaveBeenCalled();
  });

  it("becomes available only for an idle live kernel and declines again after shutdown", async () => {
    const kernel = {
      language: "python",
      executionState: "idle",
      transport: { lifecycle: "ready" },
      complete(_code, callback) {
        callback({ matches: ["a100"], cursor_start: 0, cursor_end: 2 });
      },
    };
    const key = store.filePath;
    store.runningKernels.push(kernel);
    store.kernelMapping.set(key, new Map([[store.grammar.name, kernel]]));
    expect(facade.enabled).toBe(true);
    const results = await facade.getSuggestions({
      editor,
      bufferPosition: { row: 0, column: 2 },
      prefix: "a1",
    });
    expect(results[0].text).toBe("a100");
    kernel.executionState = "busy";
    expect(facade.enabled).toBe(false);
    kernel.executionState = "idle";
    kernel.transport.lifecycle = "dead";
    expect(facade.enabled).toBe(false);
    kernel.transport.lifecycle = "ready";
    kernel._destroyed = true;
    expect(facade.enabled).toBe(false);
    store.runningKernels.length = 0;
    store.kernelMapping.delete(key);
    expect(facade.getSuggestions({ editor })).toBeNull();
  });

  it("does not revive an old provider after the package generation changes", async () => {
    await lumine.packages.unloadPackage("jupyter-repl");
    pack = await lumine.packages.startPackage(root);
    expect(facade.enabled).toBe(false);
    expect(facade.getSuggestions({ editor })).toBeNull();
    expect(facade.getSuggestionDetailsOnSelect({ replacedText: "a1" })).toBeNull();
  });
});

describe("completion deadlines when a kernel becomes unavailable", () => {
  let store, provider, kernel, events, kernelEvents, editor, settings;
  beforeEach(() => {
    settings = [
      "autocomplete.minimumWordLength",
      "jupyter-repl.autocomplete",
      "jupyter-repl.showInspectorResultsInAutocomplete",
    ].map((key) => [key, lumine.config.get(key)]);
    lumine.config.set("autocomplete.minimumWordLength", 1);
    lumine.config.set("jupyter-repl.autocomplete", true);
    lumine.config.set("jupyter-repl.showInspectorResultsInAutocomplete", true);
    events = new Emitter();
    kernelEvents = new Emitter();
    kernel = {
      language: "python",
      executionState: "idle",
      complete() {},
      inspect() {},
      onDidChangeExecutionState: (callback) => kernelEvents.on("state", callback),
    };
    store = {
      kernel,
      subscriptions: new CompositeDisposable(),
      onDidChangeCurrentKernel: (callback) => events.on("kernel", callback),
    };
    editor = {
      isDestroyed: () => false,
      getTextInBufferRange: () => "a1",
      getCursorBufferPosition: () => ({ row: 0, column: 2 }),
    };
    provider = require("../lib/services/provided/autocomplete").provideAutocomplete(store);
  });
  afterEach(() => {
    store.subscriptions.dispose();
    events.dispose();
    kernelEvents.dispose();
    for (const [key, value] of settings) lumine.config.set(key, value);
  });
  const completion = () =>
    provider.getSuggestions({ editor, bufferPosition: { row: 0, column: 2 }, prefix: "a1" });

  it("settles completion and inspection immediately when the kernel is removed", async () => {
    const pending = completion();
    const detail = provider.getSuggestionDetailsOnSelect({ replacedText: "a1" });
    store.kernel = null;
    events.emit("kernel", null);
    await expectAsync(pending).toBeResolvedTo(null);
    await expectAsync(detail).toBeResolvedTo(null);
  });

  it("settles an outstanding completion as soon as execution starts", async () => {
    const pending = completion();
    kernel.executionState = "busy";
    kernelEvents.emit("state", "busy");
    await expectAsync(pending).toBeResolvedTo(null);
  });
});
