const path = require("node:path");
const { Disposable, Emitter } = require("lumine");

describe("Run autocomplete cancellation boundary", () => {
  let main, store, integration, editor, commands, events, calls;

  beforeEach(async () => {
    jasmine.attachToDOM(lumine.views.getView(lumine.workspace));
    const pkg = await lumine.packages.activatePackage(path.join(__dirname, ".."));
    main = pkg.mainModule;
    store = require("../lib/store");
    integration = require("../lib/adapter-integration");
    editor = await lumine.workspace.open();
    editor.setText("a1");
    store.updateEditor(editor);
    store.updateActivePaneItem(editor);
    editor.element.focus();
    events = new Emitter();
    calls = [];
    commands = lumine.commands.add(editor.element, {
      "autocomplete:cancel": (event) => {
        event.stopPropagation();
        calls.push("cancel");
      },
    });
  });

  afterEach(async () => {
    commands.dispose();
    integration.disposeAdapterIntegration();
    events.emit("destroy");
    events.dispose();
    await lumine.packages.deactivatePackage("jupyter-repl");
    editor.destroy();
  });

  function adapter() {
    const target = { id: "cell", type: "code", executable: true, source: "a1", editor, row: 0 };
    const owner = {
      getPath: () => "C:/work/autocomplete-run.ipynb",
      isDestroyed: () => false,
      onDidDestroy: (callback) => events.on("destroy", callback),
      onDidChangePath: () => new Disposable(),
    };
    const pane = { isDestroyed: () => false };
    return {
      target,
      getPaneItem: () => pane,
      getKernelOwner: () => owner,
      getPath: () => owner.getPath(),
      getActiveTargetId: () => target.id,
      getKernelTarget: () => target,
      getRunTarget: () => target,
      getRunTargets: () => [target],
      getKernelLanguage: () => "python",
      getKernelGrammar: () => ({ name: "Python", scopeName: "source.python" }),
      getMetadata: () => ({
        kernelspec: { name: "python3", language: "python", display_name: "Python 3" },
      }),
      getNextRunTarget: () => null,
    };
  }

  function waitingManager() {
    return {
      getAllKernelSpecs: () => {
        calls.push("choose kernel");
        return new Promise(() => {});
      },
    };
  }

  it("cancels before asynchronous source preparation and does not cancel a newer intent afterward", async () => {
    let finishPreparation;
    editor.setSelectedBufferRange([
      [0, 0],
      [0, 2],
    ]);
    const cells = main.consumeJupyterCells({
      getCellDescriptors: () => [],
      getExecutionBlocks: () => {
        calls.push("prepare");
        return new Promise((resolve) => (finishPreparation = resolve));
      },
    });
    const result = require("../lib/result");
    const rendered = spyOn(result, "createResult");
    store.kernelMapping.set(store.filePath, new Map([[store.grammar.name, {}]]));
    try {
      const run = main.run(false, { target: editor.element });
      expect(calls[0]).toBe("cancel");
      for (let pass = 0; pass < 5 && !finishPreparation; pass++) await Promise.resolve();
      expect(calls.indexOf("cancel")).toBeLessThan(calls.indexOf("prepare"));
      const cancellationsBeforeNewIntent = calls.filter((item) => item === "cancel").length;
      // A new manual completion request may start while preparation awaits.
      // This only tests the public cancellation command boundary; autocomplete
      // owns the loading and popup lifecycle behind that command.
      finishPreparation([{ code: "a1", row: 0, cellType: "code" }]);
      await run;
      expect(rendered).toHaveBeenCalled();
      expect(calls.filter((item) => item === "cancel").length).toBe(cancellationsBeforeNewIntent);
    } finally {
      cells.dispose();
    }
  });

  it("cancels a notebook editor before moving down or waiting for kernel selection", () => {
    const current = adapter();
    const codeManager = require("../lib/code-manager");
    spyOn(codeManager, "findCodeBlock").and.returnValue({ code: "a1", row: 0 });
    spyOn(codeManager, "moveDown").and.callFake(() => calls.push("move"));
    integration.activateAdapterIntegration();
    expect(
      integration.runAdapterTargets({ getActiveAdapter: () => current }, waitingManager(), {
        scope: "editor",
        moveDown: true,
      }),
    ).toBe(true);
    expect(calls[0]).toBe("cancel");
    expect(calls.indexOf("cancel")).toBeLessThan(calls.indexOf("move"));
  });

  it("cancels an empty notebook Run request before opening the kernel picker", () => {
    const current = adapter();
    current.getRunTargets = () => [];
    integration.activateAdapterIntegration();
    expect(
      integration.runAdapterTargets({ getActiveAdapter: () => current }, waitingManager(), {
        scope: "above",
      }),
    ).toBe(true);
    expect(calls[0]).toBe("cancel");
    expect(calls.indexOf("cancel")).toBeLessThan(calls.indexOf("choose kernel"));
  });

  it("analyzes notebook selections with the notebook's bound kernel", () => {
    const current = adapter();
    const store = require("../lib/store");
    const bound = { language: "python" };
    store.kernelMapping.set(current.getPath(), bound);
    const find = spyOn(require("../lib/code-manager"), "findCodeBlock").and.callFake(() => {
      // Hold launch after analysis so this case owns no executing kernel.
      store.kernelMapping.delete(current.getPath());
      return { code: "a1", row: 0 };
    });
    integration.activateAdapterIntegration();
    integration.runAdapterTargets({ getActiveAdapter: () => current }, waitingManager(), {
      scope: "editor",
    });
    expect(find).toHaveBeenCalled();
    expect(find.calls.mostRecent().args[2].kernel).toBe(bound);
  });

  it("cancels recalculate requests before waiting for kernel restart", async () => {
    let finishRestart;
    const kernel = {
      outputStore: { clear() {} },
      restart: () => {
        calls.push("restart");
        return new Promise((resolve) => (finishRestart = resolve));
      },
    };
    spyOnProperty(store, "kernel", "get").and.returnValue(kernel);
    for (const command of [
      "jupyter-repl:recalculate-all-inline",
      "jupyter-repl:recalculate-all-above-inline",
    ]) {
      calls.length = 0;
      const dispatched = lumine.commands.dispatch(lumine.views.getView(lumine.workspace), command);
      expect(calls[0]).toBe("cancel");
      expect(calls.indexOf("cancel")).toBeLessThan(calls.indexOf("restart"));
      finishRestart(false);
      await dispatched;
    }
  });

  it("does not cancel newer completions when a delayed kernel finally starts", async () => {
    let resume;
    spyOn(require("../lib/kernel-manager").KernelManager.prototype, "startKernelFor").and.callFake(
      (_grammar, _editor, _filePath, callback) => {
        resume = callback;
      },
    );
    const rendered = spyOn(require("../lib/result"), "createResult");
    const execution = main.provideJupyterExecution();
    await execution.runBlocks(editor, [{ code: "a1", row: 0, cellType: "code" }]);
    expect(calls).toEqual(["cancel"]);
    calls.length = 0;
    editor.setText("a1 + newer_typing");
    await resume({});
    expect(calls).toEqual([]);
    expect(rendered).toHaveBeenCalled();
  });
});
