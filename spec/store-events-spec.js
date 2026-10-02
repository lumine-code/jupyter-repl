// The panels are being moved off mobx observation onto these events, and later
// into their own packages, where mobx observables cannot cross the boundary.
// These specs pin the event contract itself, independent of mobx.

const KernelTransport = require("../lib/kernel-transport");
const OutputStore = require("../lib/store/output");

function kernelSpec(language = "python") {
  return { language, display_name: `${language} kernel` };
}

describe("kernel transport status events", () => {
  let transport;

  beforeEach(() => {
    transport = new KernelTransport(kernelSpec(), { name: "Python", scopeName: "source.python" });
  });

  afterEach(() => {
    transport.destroy();
  });

  it("emits on execution state changes", () => {
    const calls = [];
    transport.onDidChangeStatus(() => calls.push(transport.executionState));

    transport.setExecutionState("busy");
    transport.setExecutionState("idle");

    expect(calls).toEqual(["busy", "idle"]);
  });

  it("emits on count and timing changes the status bar reads", () => {
    let calls = 0;
    transport.onDidChangeStatus(() => calls++);

    transport.setExecutionCount(3);
    transport.setLastExecutionTime("1.000 sec");
    transport.setExecutionStartTime(1234);

    expect(calls).toBe(3);
    expect(transport.executionCount).toBe(3);
    expect(transport.lastExecutionTime).toBe("1.000 sec");
    expect(transport.executionStartTime).toBe(1234);
  });

  it("stops emitting once destroyed and still hands back a disposable", () => {
    let calls = 0;
    transport.destroy();

    const subscription = transport.onDidChangeStatus(() => calls++);
    expect(typeof subscription.dispose).toBe("function");

    transport.setExecutionCount(9);
    expect(calls).toBe(0);

    subscription.dispose();
  });
});

describe("output store events", () => {
  let store;

  beforeEach(() => {
    store = new OutputStore();
  });

  it("emits when output arrives", () => {
    let calls = 0;
    const subscription = store.onDidUpdate(() => calls++);

    store.appendOutput({ output_type: "stream", name: "stdout", text: "hi" });

    expect(calls).toBe(1);
    expect(store.outputs.length).toBe(1);
    subscription.dispose();
  });

  it("announces a deferred clear and its replacement as one settled update", () => {
    store.appendOutput({ output_type: "stream", name: "stdout", text: "old" });
    store.appendOutput({ output_type: "clear_output", wait: true });
    const snapshots = [];
    const subscription = store.onDidUpdate(() =>
      snapshots.push({ texts: store.outputs.map((output) => output.text), index: store.index }),
    );

    store.appendOutput({ output_type: "stream", name: "stdout", text: "new" });

    expect(snapshots).toEqual([{ texts: ["new"], index: 0 }]);
    subscription.dispose();
  });

  it("does not schedule redraws for a history index that cannot move", () => {
    let calls = 0;
    const subscription = store.onDidUpdate(() => calls++);
    store.incrementIndex();
    store.decrementIndex();
    store.setIndex(0);
    expect(store.index).toBe(-1);
    expect(calls).toBe(0);

    store.appendOutput({ output_type: "stream", name: "stdout", text: "only entry" });
    expect(calls).toBe(1);
    store.incrementIndex();
    store.decrementIndex();
    store.setIndex(0);
    expect(calls).toBe(1);
    subscription.dispose();
  });

  it("emits when cleared and when the history index moves", () => {
    store.appendOutput({ output_type: "stream", name: "stdout", text: "a" });
    store.startNewRun();
    store.appendOutput({ output_type: "stream", name: "stdout", text: "b" });

    let calls = 0;
    const subscription = store.onDidUpdate(() => calls++);

    store.decrementIndex();
    expect(calls).toBe(1);

    store.clear();
    expect(calls).toBe(2);
    expect(store.outputs).toEqual([]);

    subscription.dispose();
  });

  it("stops emitting to a disposed subscriber", () => {
    let calls = 0;
    const subscription = store.onDidUpdate(() => calls++);
    subscription.dispose();

    store.appendOutput({ output_type: "stream", name: "stdout", text: "hi" });

    expect(calls).toBe(0);
  });
});
