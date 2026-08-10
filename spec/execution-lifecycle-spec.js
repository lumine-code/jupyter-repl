const etch = require("@lumine-code/etch");
const Kernel = require("../lib/kernel");
const KernelTransport = require("../lib/kernel-transport");
const OutputStore = require("../lib/store/output");
const ResultViewComponent = require("../lib/components/result-view/result-view");
const { createResultAsync } = require("../lib/result");

// A result bubble owns its execution lifecycle outright: queued -> running ->
// ok | error, driven only by the messages of its own execution. It never
// consults the kernel's execution state — which is what lets that state mean
// whatever the kernel process is doing, on a kernel other clients share.

// The transport is fed messages by hand. They pass the middleware's message
// validation, so they carry the full envelope a kernel would send.
class FakeTransport extends KernelTransport {
  constructor() {
    super({ language: "python", display_name: "Python 3" }, null);
    this.restarted = 0;
  }

  execute(code, onResults) {
    this.onResults = onResults;
  }

  executeWatch(code, onResults) {
    this.watchOnResults = onResults;
  }

  restart(onRestarted) {
    this.restarted++;
    onRestarted?.();
  }

  deliver(message, channel) {
    this.onResults(message, channel);
  }

  deliverInput(executionCount) {
    this.deliver(
      {
        header: { msg_id: "in", msg_type: "execute_input" },
        parent_header: { msg_id: "execute_1", msg_type: "execute_request" },
        content: { execution_count: executionCount },
      },
      "iopub",
    );
  }

  deliverReply(status, executionCount) {
    this.deliver(
      {
        header: { msg_id: "re", msg_type: "execute_reply" },
        parent_header: { msg_id: "execute_1", msg_type: "execute_request" },
        content: { status, execution_count: executionCount },
      },
      "shell",
    );
  }

  deliverIdle() {
    this.deliver(
      {
        header: { msg_id: "st", msg_type: "status" },
        parent_header: { msg_id: "execute_1", msg_type: "execute_request" },
        content: { execution_state: "idle" },
      },
      "iopub",
    );
  }
}

describe("the execution lifecycle of a result store", () => {
  it("starts queued, runs on execute_input, and settles on the reply", () => {
    const store = new OutputStore();
    expect(store.status).toBe("queued");

    store.appendOutput({ data: 1, stream: "execution_count" });
    expect(store.status).toBe("running");

    store.appendOutput({ data: "ok", stream: "status" });
    expect(store.status).toBe("ok");
  });

  it("renders each stage without consulting any kernel", () => {
    const store = new OutputStore();
    store.updatePosition({ editorWidth: 800, lineLength: 0, charWidth: 8, lineHeight: 16 });
    const component = new ResultViewComponent({
      store,
      editor: null,
      destroy: () => {},
      showResult: true,
    });

    expect(component.element.classList.contains("queued")).toBe(true);

    store.appendOutput({ data: 1, stream: "execution_count" });
    etch.updateSync(component);
    expect(component.element.classList.contains("spinner")).toBe(true);

    store.appendOutput({ data: "error", stream: "status" });
    etch.updateSync(component);
    expect(component.element.classList.contains("icon-x")).toBe(true);

    component.destroy();
  });
});

describe("settling in-flight executions", () => {
  let transport;
  let kernel;
  let results;

  beforeEach(() => {
    transport = new FakeTransport();
    kernel = new Kernel(transport);
    results = [];
    kernel.execute("1 + 1", (result) => results.push(result));
  });

  afterEach(() => {
    transport.destroy();
  });

  const statuses = () => results.filter((r) => r.stream === "status").map((r) => r.data);
  const idles = () =>
    results.filter((r) => r.output_type === "status" && r.execution_state === "idle");
  const errors = () => results.filter((r) => r.output_type === "error");

  it("restart settles the execution with an error, a status, and an idle", () => {
    kernel.restart();

    expect(errors().length).toBe(1);
    expect(errors()[0].evalue).toBe("Kernel restarted");
    expect(statuses()).toEqual(["error"]);
    expect(idles().length).toBe(1);
    expect(kernel._inFlight.size).toBe(0);
    expect(transport.restarted).toBe(1);
  });

  it("a lost kernel process settles the execution the same way", () => {
    transport.emitDidLoseKernel("Kernel process exited");

    expect(errors()[0].evalue).toBe("Kernel process exited");
    expect(statuses()).toEqual(["error"]);
    expect(idles().length).toBe(1);
  });

  it("ignores messages that straggle in after an abort", () => {
    kernel.abortInFlight("Kernel restarted");
    const settledCount = results.length;

    transport.deliverReply("ok", 1);
    transport.deliverIdle();

    expect(results.length).toBe(settledCount);
  });

  it("a completed execution is not settled again", () => {
    transport.deliverInput(1);
    transport.deliverReply("ok", 1);
    transport.deliverIdle();
    expect(kernel._inFlight.size).toBe(0);
    const settledCount = results.length;

    kernel.abortInFlight("Kernel restarted");

    expect(results.length).toBe(settledCount);
  });

  it("resolves an awaiting createResultAsync instead of hanging it", async () => {
    // Minimal editor stand-in: inline=false takes the no-bubble path, so only
    // the kernel wiring is exercised.
    const resolution = createResultAsync(
      { editor: {}, kernel, markers: null },
      { code: "sleep(9999)", row: 0, cellType: "codecell", inline: false },
    );

    kernel.restart();

    const { success } = await resolution;
    expect(success).toBe(false);
  });
});

describe("the kernel-wide idle signal", () => {
  let transport;
  let kernel;
  let refetches;

  beforeEach(() => {
    transport = new FakeTransport();
    kernel = new Kernel(transport);
    refetches = 0;
    kernel.onDidBecomeIdle(() => refetches++);
  });

  afterEach(() => {
    transport.destroy();
  });

  it("coalesces a burst of any client's idles into one refetch", () => {
    // A chatty console produces busy/idle pairs many times a second; watches
    // and the variable explorer only need the state after the last one.
    transport.setExecutionState("busy");
    transport.setExecutionState("idle");
    transport.setExecutionState("busy");
    transport.setExecutionState("idle");

    expect(refetches).toBe(0);
    window.advanceClock(Kernel.WATCH_REFETCH_DEBOUNCE_MS + 50);
    expect(refetches).toBe(1);
  });

  it("does not let a watch refetch re-trigger the watches", () => {
    // The watch execution's own busy/idle transition arrives while the watch
    // is outstanding; refetching on it would run the watches off their own
    // completions, without end.
    kernel.executeWatch("len(x)", () => {});
    transport.setExecutionState("busy");
    transport.setExecutionState("idle");
    window.advanceClock(Kernel.WATCH_REFETCH_DEBOUNCE_MS + 50);
    expect(refetches).toBe(0);

    // The watch completes; the next real idle refetches again.
    transport.watchOnResults(
      {
        header: { msg_id: "ws", msg_type: "status" },
        parent_header: { msg_id: "w1", msg_type: "execute_request" },
        content: { execution_state: "idle" },
      },
      "iopub",
    );
    transport.setExecutionState("busy");
    transport.setExecutionState("idle");
    window.advanceClock(Kernel.WATCH_REFETCH_DEBOUNCE_MS + 50);
    expect(refetches).toBe(1);
  });

  it("freezes the finished span for any client's cell", () => {
    let now = 1000;
    spyOn(Date, "now").and.callFake(() => now);

    transport.setExecutionState("busy");
    now = 3500;
    transport.setExecutionState("idle");

    expect(transport.lastExecutionTime).toBe("2.500 sec");
  });
});

describe("per-execution durations", () => {
  it("measures each execution from its own start", () => {
    const transport = new FakeTransport();
    const kernel = new Kernel(transport);

    let now = 1000;
    spyOn(Date, "now").and.callFake(() => now);

    const first = kernel.execute("a", () => {});
    const firstTransportCallback = transport.onResults;
    const second = kernel.execute("b", () => {});
    const secondTransportCallback = transport.onResults;

    // First cell starts at t=2000, second at t=5000, first replies at t=6000:
    // the first cell took 4000 ms and must not be measured from the second's
    // start, which the old shared clock would have done.
    now = 2000;
    firstTransportCallback(
      {
        header: { msg_id: "i1", msg_type: "execute_input" },
        parent_header: { msg_id: "e1", msg_type: "execute_request" },
        content: { execution_count: 1 },
      },
      "iopub",
    );
    now = 5000;
    secondTransportCallback(
      {
        header: { msg_id: "i2", msg_type: "execute_input" },
        parent_header: { msg_id: "e2", msg_type: "execute_request" },
        content: { execution_count: 2 },
      },
      "iopub",
    );
    now = 6000;
    firstTransportCallback(
      {
        header: { msg_id: "r1", msg_type: "execute_reply" },
        parent_header: { msg_id: "e1", msg_type: "execute_request" },
        content: { status: "ok", execution_count: 1 },
      },
      "shell",
    );

    expect(first.durationMs).toBe(4000);
    expect(second.durationMs).toBe(null);

    transport.destroy();
  });
});
