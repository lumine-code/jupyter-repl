const path = require("node:path");

describe("public editorless session execution", () => {
  let main, store, editor, kernels;
  beforeEach(async () => {
    const pkg = await lumine.packages.activatePackage(path.resolve(__dirname, ".."));
    main = pkg.mainModule;
    store = require("../lib/store");
    editor = await lumine.workspace.open();
    const Transport = require("../lib/kernel-transport");
    const Kernel = require("../lib/kernel");
    kernels = ["center", "requested"].map((name) => {
      const transport = new Transport(
        { display_name: name, language: "python" },
        editor.getGrammar(),
      );
      transport.setLifecycle("ready");
      transport.setExecutionState("idle");
      const kernel = new Kernel(transport);
      kernel.execute = jasmine.createSpy(name).and.callFake((code, callback) => {
        kernel.receive = callback;
        kernel.code = code;
        return { disposeObservation: jasmine.createSpy("dispose observation") };
      });
      store.runningKernels = [...store.runningKernels, kernel];
      return kernel;
    });
    store.updateEditor(editor);
    spyOnProperty(store, "kernel", "get").and.returnValue(kernels[0]);
    spyOn(lumine.workspace, "open").and.returnValue(Promise.resolve(null));
  });
  afterEach(async () => {
    for (const kernel of kernels) kernel.destroy();
    editor.destroy();
    await lumine.packages.deactivatePackage("jupyter-repl");
  });

  function submit(options = {}) {
    const session = kernels[1].getPluginWrapper();
    return main
      .provideJupyterExecution()
      .execute({ session, generation: session.generation, code: "print('requested')", ...options });
  }

  it("runs and renders in the explicitly requested session, independent of the active editor", async () => {
    const receipt = await submit();
    await Promise.resolve();
    expect(receipt.accepted).toBe(true);
    expect(kernels[0].execute).not.toHaveBeenCalled();
    expect(kernels[1].code).toBe("print('requested')");
    kernels[1].receive({ output_type: "stream", name: "stdout", text: "requested\n" });
    kernels[1].receive({ stream: "status", data: "ok" });
    kernels[1].receive({ output_type: "status", execution_state: "idle" });
    const outcome = await receipt.done;
    expect(outcome.status).toBe("ok");
    expect(outcome.requestId).toBeTruthy();
    expect(kernels[1].outputStore.outputs[0].text).toBe("requested\n");
    expect(kernels[0].outputStore.outputs).toEqual([]);
  });

  it("refuses a stale captured generation without sending code", async () => {
    const receipt = await submit({ generation: -1 });
    expect(receipt.accepted).toBe(false);
    expect((await receipt.done).status).toBe("unavailable");
    expect(kernels[1].execute).not.toHaveBeenCalled();
  });

  it("refuses a retired session without selecting the active session", async () => {
    const session = kernels[1].getPluginWrapper();
    kernels[1].destroy();
    const receipt = await main
      .provideJupyterExecution()
      .execute({ session, generation: session.generation, code: "never()" });
    expect(receipt.accepted).toBe(false);
    expect(kernels[0].execute).not.toHaveBeenCalled();
  });

  it("cancels only its observation when the caller signal is aborted", async () => {
    const controller = new AbortController();
    const interrupt = spyOn(kernels[1], "interrupt");
    const receipt = await submit({ signal: controller.signal });
    controller.abort();
    expect((await receipt.done).status).toBe("cancelled");
    expect(interrupt).not.toHaveBeenCalled();
  });

  it("preserves an accepted unknown outcome while its execution facade retires", async () => {
    const receipt = await submit();
    await Promise.resolve();
    main.provideJupyterExecution().dispose();
    kernels[1].receive({
      output_type: "error",
      ename: "ExecutionOutcomeUnknown",
      evalue: "The code may have run.",
      traceback: [],
    });
    kernels[1].receive({ stream: "status", data: "error" });
    kernels[1].receive({ output_type: "status", execution_state: "idle" });
    expect((await receipt.done).status).toBe("unknown");
  });
});
