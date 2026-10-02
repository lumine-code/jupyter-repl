/**
 * Bounded real-kernel regression for CI. Native ZMQ runs in Node, separately
 * from the spec renderer. Only editor services are replaced; the transport,
 * request queue, Kernel facade and protocol are the shipped implementations.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const { execFileSync } = require("node:child_process");

const resourcePath = process.env.LUMINE_RESOURCE_PATH;
if (!resourcePath)
  throw new Error("Set LUMINE_RESOURCE_PATH to the editor checkout for this test.");
const python = process.env.LUMINE_TEST_PYTHON || "python";
execFileSync(python, ["-c", "import ipykernel"], { stdio: "inherit", timeout: 10000 });
const { Emitter, Disposable, CompositeDisposable } = require(
  path.join(resourcePath, "node_modules/@lumine-code/event-kit"),
);
const esbuild = require("esbuild");
const libRoot = path.resolve(__dirname, "../lib");
const temporaryParent = fs.realpathSync.native(
  process.env.LUMINE_TEST_TEMP_DIR || process.env.RUNNER_TEMP || os.tmpdir(),
);
const temporaryRoot = fs.mkdtempSync(path.join(temporaryParent, "lumine-kernel-ci-"));
const runtimeDir = path.join(temporaryRoot, "runtime");
fs.mkdirSync(runtimeDir);
// Keep native IPC and Python runtime files inside the owned test directory.
process.env.TEMP = temporaryRoot;
process.env.TMP = temporaryRoot;
process.env.JUPYTER_RUNTIME_DIR = runtimeDir;

const notifications = [];
const editorStore = {
  editor: null,
  startingKernels: new Map(),
  runningKernels: [],
  deleteKernel(kernel) {
    this.runningKernels = this.runningKernels.filter((candidate) => candidate !== kernel);
  },
};
global.lumine = {
  config: {
    get: (key) => (key === "jupyter-repl.pythonAutoreload" ? "off" : false),
    observe: (_key, callback) => {
      callback(false);
      return new Disposable();
    },
  },
  notifications: Object.fromEntries(
    ["addError", "addWarning", "addInfo"].map((method) => [
      method,
      (title, options) => {
        notifications.push({ method, title, detail: options?.detail });
        return { dismiss() {} };
      },
    ]),
  ),
};
const originalLoad = Module._load;
Module._load = function (name, parent, isMain) {
  if (name === "lumine") return { Emitter, Disposable, CompositeDisposable };
  if (name === "./store" && parent?.filename.startsWith(libRoot + path.sep)) return editorStore;
  return originalLoad.call(this, name, parent, isMain);
};
require.extensions[".jsx"] = (module, filename) => {
  const { code } = esbuild.transformSync(fs.readFileSync(filename, "utf8"), {
    loader: "jsx",
    format: "cjs",
    jsxFactory: "etch.dom",
  });
  module._compile(code, filename);
};

const ZMQKernel = require("../lib/zmq-kernel");
const Kernel = require("../lib/kernel");
const live = new Set();
const retired = [];
const counts = { starts: 0, restarts: 0, executes: 0, watches: 0, inspections: 0, completions: 0 };
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const outputText = (result) =>
  result.outputs.map((output) => output.text || output.data?.["text/plain"] || "").join("");

async function start() {
  let transport;
  const readiness = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      transport.destroy();
      reject(new Error("Owned CI kernel did not become ready in 30 seconds"));
    }, 30000);
    try {
      transport = new ZMQKernel(
        {
          name: "python3",
          display_name: "Owned CI Python",
          language: "python",
          argv: [python, "-m", "ipykernel_launcher", "-f", "{connection_file}"],
        },
        { name: "Python", scopeName: "source.python" },
        { cwd: temporaryRoot, stdio: ["ignore", "pipe", "pipe"] },
        () => {
          clearTimeout(timer);
          resolve();
        },
      );
    } catch (error) {
      clearTimeout(timer);
      reject(error);
      return;
    }
    live.add(transport);
    const failure = transport.onDidChangeLifecycle((state) => {
      if (state === "dead" || state === "unresponsive") {
        clearTimeout(timer);
        failure.dispose();
        reject(new Error(`Owned CI kernel startup failed: ${state}`));
      } else if (state === "ready") failure.dispose();
    });
  });
  await readiness;
  const kernel = new Kernel(transport);
  editorStore.runningKernels.push(kernel);
  counts.starts++;
  return kernel;
}

async function retire(kernel) {
  const transport = kernel.transport;
  const child = transport.kernelProcess;
  const connectionFile = transport.connectionFile;
  await kernel.shutdownAndDestroy();
  await transport._killProcessTree(child);
  assert.equal(kernel._inFlight.size, 0);
  assert.equal(kernel._watchExecutionDepth, 0);
  assert.equal(kernel.watchCallbacks.length, 0);
  assert.equal(Object.keys(transport.executionCallbacks).length, 0);
  assert.equal(transport._shellQueue.length, 0);
  assert.equal(transport._activeShellRequest, null);
  assert.equal(transport._readyProbe, null);
  assert.equal(transport._ackWatchdog, null);
  assert.equal(transport.shellSocket, null);
  assert.equal(transport.ioSocket, null);
  assert.equal(transport.stdinSocket, null);
  assert(!fs.existsSync(connectionFile));
  assert(child.exitCode !== null || child.signalCode !== null);
  retired.push(child.pid);
  live.delete(transport);
}

function watch(kernel, code) {
  return new Promise((resolve, reject) => {
    let reply = null;
    let idle = false;
    const timer = setTimeout(() => reject(new Error("Owned CI watch timed out")), 15000);
    try {
      kernel.executeWatch(code, (result) => {
        if (result.stream === "status") reply = result.data;
        if (result.output_type === "status" && result.execution_state === "idle") idle = true;
        if (reply !== null && idle) {
          clearTimeout(timer);
          reply === "ok" ? resolve() : reject(new Error("Owned CI watch failed"));
        }
      });
    } catch (error) {
      clearTimeout(timer);
      reject(error);
    }
  });
}

async function run() {
  for (let cycle = 0; cycle < 2; cycle++) {
    const kernel = await start();
    const api = kernel.getPluginWrapper();
    try {
      for (let generation = 0; generation < 3; generation++) {
        if (generation > 0) {
          const previous = kernel.transport.kernelProcess;
          assert.equal(await api.restart(), true);
          assert(previous.exitCode !== null || previous.signalCode !== null);
          retired.push(previous.pid);
          counts.restarts++;
        }
        const results = await Promise.all(
          Array.from({ length: 6 }, (_, index) =>
            api.execute(
              `seen = globals().get('seen', [])\nseen.append(${index})\nprint('request_${index}')`,
              { timeoutMs: 15000 },
            ),
          ),
        );
        for (let index = 0; index < results.length; index++) {
          assert.equal(results[index].status, "ok");
          assert(outputText(results[index]).includes(`request_${index}`));
        }
        assert.equal(new Set(results.map((result) => result.executionCount)).size, 6);
        assert.equal(
          (await api.execute("assert sorted(seen) == list(range(6))", { timeoutMs: 15000 })).status,
          "ok",
        );
        counts.executes += 7;
        await watch(kernel, "print('background watch')");
        counts.watches++;
        assert((await api.complete("see")).matches.includes("seen"));
        counts.completions++;
        assert.equal((await api.inspect("print", 5)).found, true);
        counts.inspections++;
      }
      const stream = await api.execute("print('ż😀 ' * 62500)", { timeoutMs: 15000 });
      assert.equal(stream.status, "ok");
      assert.equal(outputText(stream), "ż😀 ".repeat(62500) + "\n");
      counts.executes++;
      const pending = api.execute("import time\ntime.sleep(2)\nprint('old generation')", {
        timeoutMs: 15000,
      });
      const deadline = Date.now() + 5000;
      while (api.executionState !== "busy" && Date.now() < deadline) await wait(10);
      assert.equal(api.executionState, "busy");
      const previous = kernel.transport.kernelProcess;
      assert.equal(await api.restart(), true);
      assert(previous.exitCode !== null || previous.signalCode !== null);
      retired.push(previous.pid);
      counts.restarts++;
      const cancelled = await pending;
      assert.equal(cancelled.status, "error");
      assert(!outputText(cancelled).includes("old generation"));
      const fresh = await api.execute("print('fresh generation')", { timeoutMs: 15000 });
      assert.equal(outputText(fresh), "fresh generation\n");
      counts.executes++;
    } finally {
      await retire(kernel);
    }
  }
  // Give the socket observers their documented self-close turn.
  await wait(600);
  assert.equal(editorStore.runningKernels.length, 0);
  assert.deepEqual(fs.readdirSync(runtimeDir), []);
  assert.deepEqual(notifications, []);
  console.log(
    JSON.stringify({ ...counts, retiredProcesses: retired.length, remaining: live.size }),
  );
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const transport of live) {
      const child = transport.kernelProcess;
      transport.destroy();
      await transport._killProcessTree(child);
    }
    if (path.dirname(path.resolve(temporaryRoot)) !== path.resolve(temporaryParent)) {
      throw new Error("Unexpected owned test directory; refusing cleanup");
    }
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  });
