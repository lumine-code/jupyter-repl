const { wrapSession } = require("./helpers/session");
const path = require("node:path");
const fs = require("node:fs/promises");
const { Range, Emitter } = require("lumine");

describe("kernel source navigation through hyperclick", () => {
  let editor, target, provider, store, kernel, session, query, context;
  const range = () => new Range([0, 0], [0, 5]);
  const filename = path.join(__dirname, "runtime-target.py");
  const source = () => ({ filename, line: 2, source: "def target():\n    return 1\n" });

  beforeEach(async () => {
    jasmine.attachToDOM(lumine.views.getView(lumine.workspace));
    const language = await lumine.packages.activatePackage("language-python");
    await language.resourceLoadPromise;
    editor = await lumine.workspace.open();
    editor.setGrammar(lumine.grammars.grammarForScopeName("source.python"));
    editor.setText("alias");
    target = lumine.workspace.buildTextEditor();
    target.setText("# module\ndef target():\n    return 1\n");
    kernel = {
      language: "python",
      executionState: "idle",
      destroyed: false,
      transport: { lifecycle: "ready", _connectionGeneration: 1, _destroyed: false },
    };
    kernel.emitter = new Emitter();
    kernel.transport.events = new Emitter();
    kernel.transport.onDidResetComms = (callback) => kernel.transport.events.on("reset", callback);
    session = wrapSession(kernel);
    store = {
      globalMode: false,
      runningKernels: [kernel],
      kernelMapping: new Map([[`Unsaved Editor ${editor.id}`, kernel]]),
    };
    context = { getStore: () => store, getAdapterServices: () => [], getIPythonSource: () => null };
    // Resolve this Package generation after bootstrap/lifecycle specs.
    query = spyOn(require("../lib/runtime-source"), "queryRuntimeSource").and.resolveTo(source());
    spyOn(fs, "stat").and.resolveTo({ isFile: () => true });
    spyOn(lumine.workspace, "open").and.resolveTo(target);
    provider = require("../lib/services/provided/hyperclick").createHyperclickProvider(context);
  });
  afterEach(() => {
    provider.dispose();
    kernel.emitter.emit("did-destroy");
    kernel.emitter.dispose();
    kernel.transport.events.dispose();
    editor.destroy();
    target.destroy();
  });

  it("uses the pointed editor's existing kernel and opens a freshly resolved source", async () => {
    store.kernel = { language: "python", executionState: "idle" };
    const suggestion = await provider.getSuggestionForWord(editor, "alias", range());
    expect(query.calls.argsFor(0)[0]).toBe(session);
    expect(suggestion.range).toEqual(range());
    const latest = { ...source(), filename: path.join(__dirname, "rebound-target.py") };
    query.and.resolveTo(latest);
    await suggestion.callback();
    expect(query.calls.count()).toBe(2);
    expect(lumine.workspace.open).toHaveBeenCalledWith(latest.filename, { searchAllPanes: true });
    expect(target.getCursorBufferPosition()).toEqual(
      jasmine.objectContaining({ row: 1, column: 0 }),
    );
  });

  it("declines unbound and busy kernels without sending a request", async () => {
    store.kernelMapping.clear();
    expect(await provider.getSuggestionForWord(editor, "alias", range())).toBeUndefined();
    store.kernelMapping.set(`Unsaved Editor ${editor.id}`, kernel);
    kernel.executionState = "busy";
    expect(await provider.getSuggestionForWord(editor, "alias", range())).toBeUndefined();
    expect(query).not.toHaveBeenCalled();
  });

  it("keeps the language-matched global kernel without changing the active editor", async () => {
    store.globalMode = true;
    store.kernelMapping.clear();
    const unrelated = { language: "javascript", executionState: "idle" };
    store.runningKernels = [unrelated, kernel];
    expect(await provider.getSuggestionForWord(editor, "alias", range())).toBeTruthy();
    expect(query.calls.argsFor(0)[0]).toBe(session);
  });

  it("reads dotted symbols at the mouse range and rejects calls and subscripts", async () => {
    const { expressionAt } = require("../lib/services/provided/hyperclick");
    editor.setText("mod . alias");
    const word = new Range([0, 6], [0, 11]);
    expect(expressionAt(editor, word)).toBe("mod.alias");
    editor.setText("obj[0].alias");
    expect(expressionAt(editor, new Range([0, 7], [0, 12]))).toBeNull();
    editor.setText("factory().alias");
    expect(expressionAt(editor, new Range([0, 10], [0, 15]))).toBeNull();
  });

  it("leaves function-local references to lexical providers", async () => {
    editor.setText("def f(alias):\n    alias()");
    await editor.getBuffer().getLanguageMode().atGrammarSettlement();
    expect(
      await provider.getSuggestionForWord(editor, "alias", new Range([1, 4], [1, 9])),
    ).toBeUndefined();
    expect(query).not.toHaveBeenCalled();
  });

  it("does not mistake a multiline attribute for a same-named global", async () => {
    editor.setText("(obj.\n    alias)");
    expect(
      await provider.getSuggestionForWord(editor, "alias", new Range([1, 4], [1, 9])),
    ).toBeUndefined();
    expect(query).not.toHaveBeenCalled();
  });

  it("leaves non-Python regions in an IPython document to their own providers", async () => {
    const language = await lumine.packages.activatePackage("language-ipython");
    await language.resourceLoadPromise;
    editor.setGrammar(lumine.grammars.grammarForScopeName("source.python.ipy"));
    const service = {
      project: async () => ({ isCurrent: () => true, isPythonRange: () => false }),
    };
    provider.dispose();
    provider = require("../lib/services/provided/hyperclick").createHyperclickProvider({
      ...context,
      getIPythonSource: () => service,
    });
    expect(await provider.getSuggestionForWord(editor, "alias", range())).toBeUndefined();
    expect(query).not.toHaveBeenCalled();
  });

  it("discards a pending IPython answer when its projection provider detaches", async () => {
    const language = await lumine.packages.activatePackage("language-ipython");
    await language.resourceLoadPromise;
    editor.setGrammar(lumine.grammars.grammarForScopeName("source.python.ipy"));
    let service = { project: async () => ({ isCurrent: () => true, isPythonRange: () => true }) };
    provider.dispose();
    provider = require("../lib/services/provided/hyperclick").createHyperclickProvider({
      ...context,
      getIPythonSource: () => service,
    });
    let finish, started;
    const queried = new Promise((resolve) => {
      started = resolve;
    });
    query.and.callFake(
      () =>
        new Promise((resolve) => {
          finish = resolve;
          started();
        }),
    );
    const pending = provider.getSuggestionForWord(editor, "alias", range());
    await queried;
    service = null;
    finish(source());
    expect(await pending).toBeUndefined();
  });

  it("does not claim a symbol for which the kernel cannot provide source", async () => {
    query.and.resolveTo(null);
    expect(await provider.getSuggestionForWord(editor, "alias", range())).toBeUndefined();
    expect(lumine.workspace.open).not.toHaveBeenCalled();
  });

  it("follows a bounded source preview without treating its cut-off line as a mismatch", async () => {
    query.and.resolveTo({ ...source(), source: "def target():\n    ret", sourceTruncated: true });
    const suggestion = await provider.getSuggestionForWord(editor, "alias", range());
    await suggestion.callback();
    expect(target.getCursorBufferPosition().row).toBe(1);
  });

  it("discards a late answer after the editor is rebound", async () => {
    let finish, started;
    const queried = new Promise((resolve) => {
      started = resolve;
    });
    query.and.callFake(
      () =>
        new Promise((resolve) => {
          finish = resolve;
          started();
        }),
    );
    const pending = provider.getSuggestionForWord(editor, "alias", range());
    await queried;
    store.kernelMapping.set(`Unsaved Editor ${editor.id}`, {
      ...kernel,
      getPluginWrapper: () => ({ id: "rebound" }),
    });
    finish(source());
    expect(await pending).toBeUndefined();
  });

  it("refuses cached hover callbacks after editing, restarting or disposing", async () => {
    const edited = await provider.getSuggestionForWord(editor, "alias", range());
    editor.setText("other");
    await edited.callback();
    editor.setText("alias");
    const restarted = await provider.getSuggestionForWord(editor, "alias", range());
    kernel.transport.events.emit("reset", "Kernel restarted");
    await restarted.callback();
    const retired = await provider.getSuggestionForWord(editor, "alias", range());
    provider.dispose();
    await retired.callback();
    expect(lumine.workspace.open).not.toHaveBeenCalled();
  });

  it("aborts a pending probe when the provider is disposed", async () => {
    let finish, started;
    const queried = new Promise((resolve) => {
      started = resolve;
    });
    query.and.callFake(
      () =>
        new Promise((resolve) => {
          finish = resolve;
          started();
        }),
    );
    const pending = provider.getSuggestionForWord(editor, "alias", range());
    await queried;
    const signal = query.calls.argsFor(0)[2].signal;
    provider.dispose();
    expect(signal.aborted).toBe(true);
    finish(source());
    expect(await pending).toBeUndefined();
  });

  it("uses the notebook adapter's binding and guarded source link", async () => {
    store.kernelMapping.clear();
    const open = jasmine.createSpy("open runtime cell").and.resolveTo(true);
    const adapter = {
      getElement: () => ({ contains: (element) => element === lumine.views.getView(editor) }),
      resolveSourceFrame: jasmine.createSpy("resolve source").and.returnValue({ open }),
    };
    context.getAdapterServices = () => [{ getAdapterForItem: () => adapter }];
    provider.dispose();
    provider = require("../lib/services/provided/hyperclick").createHyperclickProvider(context);
    spyOn(require("../lib/adapter-integration"), "getKernelForAdapter").and.returnValue(kernel);
    query.and.resolveTo({ filename: "<ipython-input-7-hash>", line: 2, executionCount: 7 });
    const suggestion = await provider.getSuggestionForWord(editor, "alias", range());
    await suggestion.callback();
    expect(open).toHaveBeenCalled();
    const [frame, queriedKernel] = adapter.resolveSourceFrame.calls.mostRecent().args;
    expect(frame.executionCount).toBe(7);
    expect(frame.generation).toBe(session.generation);
    expect(queriedKernel).toBe(session);
    expect(lumine.workspace.open).not.toHaveBeenCalled();
  });

  it("never opens an unproven temporary IPython source file", async () => {
    query.and.resolveTo({ ...source(), executionCount: 7 });
    expect(await provider.getSuggestionForWord(editor, "alias", range())).toBeUndefined();
    expect(fs.stat.calls.allArgs().some(([targetPath]) => targetPath === filename)).toBe(false);
  });

  it("does not expose a remote kernel path as a local source link", async () => {
    kernel.transport.session = {};
    expect(await provider.getSuggestionForWord(editor, "alias", range())).toBeUndefined();
    expect(fs.stat.calls.allArgs().some(([targetPath]) => targetPath === filename)).toBe(false);
  });

  it("does not move or focus a file after restarting during its asynchronous open", async () => {
    const suggestion = await provider.getSuggestionForWord(editor, "alias", range());
    let finishOpen, opening;
    const opened = new Promise((resolve) => {
      opening = resolve;
    });
    lumine.workspace.open.and.callFake(() => {
      opening();
      return new Promise((resolve) => {
        finishOpen = resolve;
      });
    });
    spyOn(target, "setCursorBufferPosition");
    const following = suggestion.callback();
    await opened;
    kernel.transport.events.emit("reset", "Kernel restarted");
    finishOpen(target);
    await following;
    expect(target.setCursorBufferPosition).not.toHaveBeenCalled();
  });
});
