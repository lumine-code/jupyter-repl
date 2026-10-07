const { Disposable, Emitter } = require("lumine");

describe("executed editor source provenance", () => {
  let context, text, editor, kernel, events;
  const frame = () => ({
    filename: "<ipython-input-17-a1b2>",
    line: 1,
    source: "@identity\ndef fn():\n    return 1",
    generation: 1,
  });

  beforeEach(() => {
    context = require("../lib/traceback-context");
    text = "before\n@identity\ndef fn():\n    return 1\nfn()";
    editor = {
      getText: () => text,
      isDestroyed: () => false,
      setSelectedBufferRange: jasmine.createSpy("select executed source"),
      scrollToBufferPosition: jasmine.createSpy("scroll executed source"),
    };
    events = new Emitter();
    kernel = {
      generation: 1,
      connectionState: "ready",
      isDestroyed: () => false,
      onDidChangeGeneration: (callback) => events.on("generation", callback),
      onDidDestroy: (callback) => events.on("destroy", callback),
      onDidChangeExecutionState: (callback) => events.on("state", callback),
    };
    context.captureExecution(
      editor,
      kernel,
      "@identity\ndef fn():\n    return 1",
      3,
    )({ stream: "execution_count", data: 17 });
  });
  afterEach(() => events.dispose());

  it("uses the captured execution count and decorator line to open its source", async () => {
    spyOn(lumine.workspace, "open").and.returnValue(Promise.resolve(editor));
    spyOn(lumine.views, "getView").and.returnValue({ focus() {} });
    const link = context.resolveSourceFrame(kernel, frame());
    expect(link).toBeTruthy();
    await link.open();
    expect(lumine.workspace.open).toHaveBeenCalledWith(editor, { searchAllPanes: true });
    expect(editor.setSelectedBufferRange).toHaveBeenCalledWith([
      [1, 0],
      [1, 0],
    ]);
  });

  it("accepts an explicit IPython execution count for modern temporary filenames", () => {
    const query = { ...frame(), filename: "C:/Temp/ipykernel_77/abc.py", executionCount: 17 };
    expect(context.resolveSourceFrame(kernel, query)).toBeTruthy();
    expect(context.resolveSourceFrame(kernel, { ...query, executionCount: 18 })).toBeNull();
  });

  it("leaves embedded fragments to their notebook adapter", () => {
    const original = lumine.textEditors.roleFor.bind(lumine.textEditors);
    spyOn(lumine.textEditors, "roleFor").and.callFake((candidate) =>
      candidate === editor ? "fragment" : original(candidate),
    );
    expect(context.resolveSourceFrame(kernel, frame())).toBeNull();
  });

  it("rejects changed buffers and mismatched runtime source lines", () => {
    expect(context.resolveSourceFrame(kernel, { ...frame(), source: "@different" })).toBeNull();
    text = text.replace("before", "changed");
    expect(context.resolveSourceFrame(kernel, frame())).toBeNull();
  });

  it("rejects a restarted transport before any new execution count arrives", () => {
    kernel.generation++;
    expect(context.resolveSourceFrame(kernel, frame())).toBeNull();
  });

  it("clears live provenance as the public session generation changes", () => {
    const query = { ...frame(), generation: undefined };
    for (let attempt = 0; attempt < 2; attempt++) {
      context.captureExecution(
        editor,
        kernel,
        "@identity\ndef fn():\n    return 1",
        3,
      )({ stream: "execution_count", data: 17 });
      expect(context.resolveSourceFrame(kernel, query)).toBeTruthy();
      events.emit("generation", ++kernel.generation);

      expect(context.resolveSourceFrame(kernel, query)).toBeNull();
    }
  });

  it("rechecks public connection state when a resolved link is clicked", async () => {
    const link = context.resolveSourceFrame(kernel, frame());
    const open = spyOn(lumine.workspace, "open");
    spyOn(lumine.notifications, "addWarning");
    kernel.connectionState = "unresponsive";
    await link.open();
    expect(open).not.toHaveBeenCalled();
    expect(editor.setSelectedBufferRange).not.toHaveBeenCalled();
  });

  it("rechecks generation after opening an editor asynchronously", async () => {
    let finishOpen;
    spyOn(lumine.workspace, "open").and.returnValue(
      new Promise((resolve) => (finishOpen = resolve)),
    );
    const pending = context.resolveSourceFrame(kernel, frame()).open();
    kernel.generation++;
    finishOpen(editor);
    await pending;
    expect(editor.setSelectedBufferRange).not.toHaveBeenCalled();
  });

  it("declines an expired origin at lookup and after an asynchronous source open", async () => {
    let originCurrent = false;
    let finishOpen;
    const query = { ...frame(), isCurrent: () => originCurrent };
    expect(context.resolveSourceFrame(kernel, query)).toBeNull();
    originCurrent = true;
    spyOn(lumine.workspace, "open").and.returnValue(
      new Promise((resolve) => (finishOpen = resolve)),
    );
    const pending = context.resolveSourceFrame(kernel, query).open();
    originCurrent = false;
    finishOpen(editor);
    await pending;
    expect(editor.setSelectedBufferRange).not.toHaveBeenCalled();
    expect(editor.scrollToBufferPosition).not.toHaveBeenCalled();
  });

  it("does not reuse a previous count's resolved link when that count is rebound", async () => {
    const link = context.resolveSourceFrame(kernel, frame());
    context.captureExecution(editor, kernel, "fn()", 4)({ stream: "execution_count", data: 17 });
    const open = spyOn(lumine.workspace, "open");
    spyOn(lumine.notifications, "addWarning");
    await link.open();
    expect(open).not.toHaveBeenCalled();
  });

  it("preserves old traceback output mappings across a later kernel restart", () => {
    const receive = context.captureExecution(editor, kernel, "fn()", 4);
    receive({ stream: "execution_count", data: 18 });
    const error = { output_type: "error" };
    receive(error);
    kernel.generation++;
    expect(context.resolveSourceFrame(kernel, frame())).toBeNull();
    expect(context.resolverForOutput(error)({ executionCount: 17, line: 1 })).toBeTruthy();
  });

  it("does not subscribe to kernels with no recorded execution provenance", () => {
    const unknown = {
      isDestroyed: () => false,
      connectionState: "ready",
      onDidChangeExecutionState: jasmine
        .createSpy("unused subscription")
        .and.returnValue(new Disposable()),
    };
    expect(context.resolveSourceFrame(unknown, frame())).toBeNull();
    expect(unknown.onDidChangeExecutionState).not.toHaveBeenCalled();
  });
});
