const assert = require("node:assert/strict");
const test = require("node:test");
const ProcessDiagnostics = require("../lib/process-diagnostics");
const { EventEmitter } = require("node:events");
const Module = require("node:module");

// Exercise the shipped generation owner's process boundary without native ZMQ
// or a GUI; only its unrelated launcher/socket imports and editor ports vary.
const originalLoad = Module._load;
let ZMQConnectionGeneration;
Module._load = function (request, parent, isMain) {
  if (parent?.filename.endsWith("zmq-connection-generation.js")) {
    if (request === "./kernel-launcher" || request === "./jmp") return {};
    if (request === "./utils") return { log() {} };
  }
  return originalLoad.call(this, request, parent, isMain);
};
try {
  ZMQConnectionGeneration = require("../lib/zmq-connection-generation");
} finally {
  Module._load = originalLoad;
}

function processOwner(t, { ready = true, ip = "127.0.0.1" } = {}) {
  const notifications = [];
  const previous = global.lumine;
  global.lumine = {
    config: { get: () => false },
    notifications: Object.fromEntries(
      ["addError", "addWarning", "addInfo"].map((method) => [
        method,
        (title, options) => notifications.push({ method, title, ...options }),
      ]),
    ),
  };
  const transport = {
    _destroyed: false,
    displayName: "Diagnostic test",
    kernelSpec: { display_name: "Diagnostic test" },
    lifecycle: "ready",
    _stopReadyProbe() {},
    _stopAckWatchdog() {},
    _rejectRestartReady() {},
    _clearStartingMarker() {},
    _clearState() {},
    emitDidLoseKernel() {},
    _releaseSockets: () => Promise.resolve(),
    setLifecycle(state) {
      this.lifecycle = state;
    },
    setExecutionState(state) {
      this.executionState = state;
    },
  };
  const owner = new ZMQConnectionGeneration(transport);
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  owner.kernelProcess = child;
  owner.config = { transport: "tcp", ip };
  owner.everReady = ready;
  owner.monitorProcess(child);
  t.after(() => {
    owner.detachProcess(child);
    global.lumine = previous;
  });
  return { owner, child, notifications };
}

test("a startup warning keeps its severity across arbitrary pipe chunks", () => {
  const records = [];
  const diagnostics = new ProcessDiagnostics((record) => records.push(record));
  const warning = "[IPKernelApp] WARNING | Kernel is running over TCP without encryption.\n";
  for (const byte of Buffer.from(warning)) diagnostics.write(Buffer.from([byte]));
  assert.deepEqual(records, [{ level: "WARNING", text: warning.trimEnd() }]);
});

test("a warning cannot downgrade an error in the same pipe chunk", () => {
  const records = [];
  const diagnostics = new ProcessDiagnostics((record) => records.push(record));
  diagnostics.write(
    "[IPKernelApp] WARNING | Startup advisory\n[IPKernelApp] ERROR | Binding failed\nTraceback: real failure\n",
  );
  assert.deepEqual(
    records.map((record) => record.level),
    ["WARNING", "ERROR", null],
  );
  assert.match(diagnostics.getTail(), /Binding failed\nTraceback: real failure/);
});

test("split Unicode and CRLF are decoded before records are emitted", () => {
  const records = [];
  const diagnostics = new ProcessDiagnostics((record) => records.push(record));
  const message = Buffer.from("[Kernel] INFO | ż😀\r\n");
  for (const byte of message) diagnostics.write(Buffer.from([byte]));
  assert.deepEqual(records, [{ level: "INFO", text: "[Kernel] INFO | ż😀" }]);
});

test("an unterminated final error is retained and emitted exactly once on exit", () => {
  const records = [];
  const diagnostics = new ProcessDiagnostics((record) => records.push(record));
  diagnostics.write("fatal startup exception");
  assert.deepEqual(records, []);
  diagnostics.end();
  diagnostics.end();
  diagnostics.write("retired output");
  assert.deepEqual(records, [{ level: null, text: "fatal startup exception" }]);
  assert.equal(diagnostics.getTail(), "fatal startup exception");
});

test("a noisy process cannot grow an unfinished record or retained tail without bound", () => {
  const records = [];
  const diagnostics = new ProcessDiagnostics((record) => records.push(record), {
    maxLineLength: 64,
    maxTailLength: 128,
  });
  for (let index = 0; index < 100; index++) diagnostics.write("x".repeat(1024));
  assert.equal(diagnostics.pending.length, 64);
  assert.equal(diagnostics.tail.length, 128);
  diagnostics.write("\nreal final failure\n");
  assert.equal(records.length, 2);
  assert.match(records[0].text, /\[diagnostic truncated\]$/);
  assert.equal(records[1].text, "real final failure");
  assert.match(diagnostics.getTail(), /^\[Earlier process diagnostics truncated\]/);
  assert.match(diagnostics.getTail(), /real final failure\n$/);
});

test("healthy local startup logging never becomes fragment error notifications", (t) => {
  const { child, notifications } = processOwner(t);
  const text = "[IPKernelApp] WARNING | Kernel is running over TCP without encryption.\n";
  for (const byte of Buffer.from(text)) child.stderr.emit("data", Buffer.from([byte]));
  child.stderr.emit("data", Buffer.from("[IPKernelApp] INFO | Ready\n"));
  assert.deepEqual(notifications, []);
});

test("the local advisory cannot hide a genuine error in the same chunk", (t) => {
  const { child, notifications } = processOwner(t);
  child.stderr.emit(
    "data",
    Buffer.from(
      "[IPKernelApp] WARNING | Kernel is running over TCP without encryption.\n[IPKernelApp] ERROR | Actual startup failure\n",
    ),
  );
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].method, "addError");
  assert.match(notifications[0].description, /Actual startup failure/);
});

test("plaintext transport warnings for a nonlocal address stay visible", (t) => {
  const { child, notifications } = processOwner(t, { ip: "192.0.2.1" });
  child.stderr.emit(
    "data",
    Buffer.from("[IPKernelApp] WARNING | Kernel is running over TCP without encryption.\n"),
  );
  assert.equal(notifications[0].method, "addWarning");
});

test("failed startup includes the final unterminated process diagnostic", (t) => {
  const { child, notifications } = processOwner(t, { ready: false });
  child.stderr.emit("data", Buffer.from("Traceback: missing kernel dependency"));
  child.emit("exit", 1, null);
  assert.match(notifications.at(-1).detail, /Process exited with code 1/);
  assert.match(notifications.at(-1).detail, /missing kernel dependency/);
});

test("unexpected signal exits report the retained bounded diagnostic tail", (t) => {
  const { child, notifications } = processOwner(t);
  child.stderr.emit(
    "data",
    Buffer.from("[Kernel] INFO | " + "x".repeat(20000) + "\nlast failure\n"),
  );
  child.emit("exit", null, "SIGTERM");
  const failure = notifications.at(-1);
  assert.match(failure.title, /kernel process died/);
  assert.match(failure.detail, /SIGTERM/);
  assert.match(failure.detail, /last failure/);
  assert.match(failure.detail, /Earlier process diagnostics truncated/);
  assert(failure.detail.length < 17000);
});

test("process exit does not discard diagnostic bytes still draining from stderr", (t) => {
  const { child, notifications } = processOwner(t);
  child.stderr.emit("data", Buffer.from("[Kernel] ERROR | trailing "));
  child.emit("exit", 1, null);
  child.stderr.emit("data", Buffer.from("real failure\n"));
  child.stderr.emit("end");
  assert(
    notifications.some((notification) =>
      notification.description?.includes("trailing real failure"),
    ),
  );
});
