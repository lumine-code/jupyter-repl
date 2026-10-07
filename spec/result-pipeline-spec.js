describe("the shared result pipeline", () => {
  let result, editor, markers, kernel, session, previousDefault, previousResizeObserver;

  beforeEach(async () => {
    result = require("../lib/result");
    const OutputStore = require("../lib/store/output");
    const MarkerStore = require("../lib/store/markers");
    previousDefault = lumine.config.get("jupyter-repl.outputAreaDefault");
    previousResizeObserver = global.ResizeObserver;
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    lumine.config.set("jupyter-repl.outputAreaDefault", true);
    editor = await lumine.workspace.open();
    editor.setText("value()");
    markers = new MarkerStore();
    kernel = {
      outputStore: new OutputStore(),
      setLastOutputStore: jasmine.createSpy("setLastOutputStore"),
      onDidChangeExecutionState: () => new (require("lumine").Disposable)(),
      execute: jasmine.createSpy("execute").and.callFake((_code, receive) => {
        kernel.receive = receive;
      }),
    };
    session = require("./helpers/session").wrapSession(kernel);
    // Dock opening is independent of delivery; this spec owns no dock item.
    spyOn(lumine.workspace, "open").and.returnValue(Promise.resolve(null));
  });

  afterEach(() => {
    try {
      markers.clear();
    } finally {
      try {
        editor.destroy();
      } finally {
        lumine.config.set("jupyter-repl.outputAreaDefault", previousDefault);
        global.ResizeObserver = previousResizeObserver;
      }
    }
  });

  for (const method of ["createResult", "createResultAsync"]) {
    it(`${method} gives inline and dock stores independent stream records`, async () => {
      const completion = result[method](
        { editor, markers, kernel },
        { code: "value()", row: 0, cellType: "code" },
      );
      const messages = ["one ", "two ", "three"].map((text) =>
        Object.freeze({ output_type: "stream", name: "stdout", text }),
      );
      await Promise.resolve();
      for (const message of messages) kernel.receive(message);
      kernel.receive({ data: "ok", stream: "status" });
      kernel.receive({ output_type: "status", execution_state: "idle" });
      await Promise.resolve();
      const [view] = markers.markers.values();

      expect(view.outputStore.outputs[0].text).toBe("one two three");
      expect(kernel.outputStore.outputs[0].text).toBe("one two three");
      expect(view.outputStore.outputs[0]).not.toBe(kernel.outputStore.outputs[0]);
      expect(view.component.props.showResult).toBe(false);
      expect(kernel.setLastOutputStore).toHaveBeenCalledWith(kernel.outputStore);
      expect(messages.map((message) => message.text)).toEqual(["one ", "two ", "three"]);
      if (completion)
        expect(await completion).toEqual(
          jasmine.objectContaining({ status: "ok", success: true, durationMs: null }),
        );
    });

    it(`${method} renders markdown inline without sending code to the kernel`, async () => {
      const completion = result[method](
        { editor, markers, kernel },
        { code: "# Heading", row: 0, cellType: "markdown" },
      );
      const [view] = markers.markers.values();
      expect(view.outputStore.outputs[0].data).toEqual({ "text/markdown": "# Heading" });
      expect(view.outputStore.status).toBe("ok");
      expect(view.component.props.showResult).toBe(true);
      expect(kernel.outputStore.outputs.length).toBe(0);
      expect(kernel.execute).not.toHaveBeenCalled();
      if (completion)
        expect(await completion).toEqual(
          jasmine.objectContaining({ status: "ok", success: true, durationMs: null }),
        );
    });

    it(`${method} preserves the producing kernel and traceback source on copied outputs`, async () => {
      const { renderOptionsForOutput } = require("../lib/traceback-context");
      const completion = result[method](
        { editor, markers, kernel },
        { code: "value()", row: 0, cellType: "code" },
      );
      const output = {
        output_type: "error",
        ename: "ValueError",
        evalue: "failed",
        traceback: [],
      };
      await Promise.resolve();
      kernel.receive(output);
      kernel.receive({ data: "error", stream: "status" });
      kernel.receive({ output_type: "status", execution_state: "idle" });
      await Promise.resolve();
      const [view] = markers.markers.values();
      for (const store of [view.outputStore, kernel.outputStore]) {
        const options = renderOptionsForOutput(store.outputs[0]);
        expect(options.kernel).toBe(session);
        expect(
          options.resolveTracebackFrame({ filename: "<string>", line: 1, sourceLine: "value()" }),
        ).toBeTruthy();
      }
      expect(output._id).toBeUndefined();
      if (completion) expect((await completion).success).toBe(false);
    });
  }

  it("retains duration when both terminal messages arrive before execute returns", async () => {
    let now = 100;
    spyOn(Date, "now").and.callFake(() => now);
    kernel.execute.and.callFake((_code, receive) => {
      receive({ stream: "execution_count", data: 1 });
      now = 125;
      receive({ data: "ok", stream: "status" });
      receive({ output_type: "status", execution_state: "idle" });
    });
    const completion = result.createResultAsync(
      { editor, markers, kernel },
      { code: "value()", row: 0, cellType: "code" },
    );
    expect(await completion).toEqual(
      jasmine.objectContaining({ status: "ok", success: true, durationMs: 25 }),
    );
  });

  it("settles send failures and renders the error through every result sink", async () => {
    kernel.execute.and.throwError("send failed");
    const context = { editor, markers, kernel };
    const block = { code: "value()", row: 0, cellType: "code" };
    expect(() => result.createResult(context, block)).not.toThrow();
    const outcome = await result.createResultAsync(context, block);
    expect(outcome.success).toBe(false);
    expect(
      kernel.outputStore.outputs.some(
        (output) => output.output_type === "error" && output.evalue === "send failed",
      ),
    ).toBe(true);
    window.advanceClock(25);
  });

  it("preserves an unknown session outcome and its request identity", async () => {
    const pending = result.createResultAsync(
      { editor, markers, kernel },
      { code: "value()", row: 0, cellType: "code" },
    );
    await Promise.resolve();
    kernel.receive({
      output_type: "error",
      ename: "ExecutionOutcomeUnknown",
      evalue: "Execution may have run.",
      traceback: [],
    });
    kernel.receive({ data: "error", stream: "status" });
    kernel.receive({ output_type: "status", execution_state: "idle" });
    const outcome = await pending;
    expect(outcome.status).toBe("unknown");
    expect(outcome.success).toBe(false);
    expect(outcome.error.ename).toBe("ExecutionOutcomeUnknown");
    expect(outcome.requestId).toMatch(/^request-/);
    expect(outcome.generation).toBe(session.generation);
  });
});
