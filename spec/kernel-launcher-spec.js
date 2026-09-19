const ChildProcess = require("child_process");
const { EventEmitter } = require("events");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  PROCESS_TREE_EXIT_GRACE_MS,
  PROCESS_TREE_KILL_TIMEOUT_MS,
  killProcessTree,
  launchSpec,
  launchSpecFromConnectionInfo,
  writeConnectionFile,
} = require("../lib/kernel-launcher");

// Kernel launching used to come from nteract's `spawnteract`, abandoned in
// 2020. These specs pin the parts of its contract this package relies on: the
// shape of the connection file, the `{connection_file}` argv substitution, and
// the cleanup-on-exit behaviour a caller can deliberately disable.
describe("kernel launcher", () => {
  let root;
  let savedRuntimeDir;
  let savedRunAsNode;

  // A kernel that exits immediately, so specs never leave a process behind.
  // `process.execPath` is Electron under the spec runner, so the stand-in
  // kernels only behave like `node -e` with ELECTRON_RUN_AS_NODE set, which
  // beforeEach puts in this process's environment for the children to inherit.
  function nodeSpec(script, ...args) {
    return { display_name: "spec kernel", argv: [process.execPath, "-e", script, ...args] };
  }

  function waitForExit(child) {
    return new Promise((resolve, reject) => {
      child.on("exit", (code) => resolve(code));
      child.on("error", reject);
    });
  }

  function fakeProcess(pid = 1234) {
    const child = new EventEmitter();
    child.pid = pid;
    child.exitCode = null;
    child.signalCode = null;
    child.kill = jasmine.createSpy("kill");
    child.exit = (code = 0, signal = null) => {
      child.exitCode = code;
      child.signalCode = signal;
      child.emit("exit", code, signal);
    };
    return child;
  }

  function onPlatform(platform, callback) {
    const descriptor = Object.getOwnPropertyDescriptor(process, "platform");
    Object.defineProperty(process, "platform", { ...descriptor, value: platform });
    try {
      // killProcessTree captures the platform before returning its promise, so
      // restoring it here cannot change the asynchronous half of the operation.
      return callback();
    } finally {
      Object.defineProperty(process, "platform", descriptor);
    }
  }

  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "jupyter-repl-launch-")));
    savedRuntimeDir = process.env.JUPYTER_RUNTIME_DIR;
    // Point the runtime directory at a path that does not exist yet, so the
    // specs also cover creating it.
    process.env.JUPYTER_RUNTIME_DIR = path.join(root, "runtime");
    savedRunAsNode = process.env.ELECTRON_RUN_AS_NODE;
    process.env.ELECTRON_RUN_AS_NODE = "1";
  });

  afterEach(() => {
    if (savedRuntimeDir === undefined) {
      delete process.env.JUPYTER_RUNTIME_DIR;
    } else {
      process.env.JUPYTER_RUNTIME_DIR = savedRuntimeDir;
    }
    if (savedRunAsNode === undefined) {
      delete process.env.ELECTRON_RUN_AS_NODE;
    } else {
      process.env.ELECTRON_RUN_AS_NODE = savedRunAsNode;
    }
    // Retries because Windows keeps a directory non-empty until the last handle on a child
    // closes, and `force` swallows only ENOENT.
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });

  describe("writeConnectionFile", () => {
    it("creates the runtime directory and writes the connection info to it", async () => {
      const { config, connectionFile } = await writeConnectionFile();

      expect(fs.existsSync(connectionFile)).toBe(true);
      expect(path.dirname(connectionFile)).toBe(process.env.JUPYTER_RUNTIME_DIR);
      expect(JSON.parse(fs.readFileSync(connectionFile, "utf8"))).toEqual(config);
    });

    it("describes all five channels on distinct ports", async () => {
      const { config } = await writeConnectionFile();

      const ports = [
        config.hb_port,
        config.control_port,
        config.shell_port,
        config.stdin_port,
        config.iopub_port,
      ];
      for (const port of ports) {
        expect(typeof port).toBe("number");
        expect(port).toBeGreaterThan(0);
      }
      // Distinctness is the whole reason the probes are held open together.
      expect(new Set(ports).size).toBe(5);
    });

    it("carries the signing key and transport the kernel protocol requires", async () => {
      const { config } = await writeConnectionFile();

      expect(config.version).toBe(5);
      expect(typeof config.key).toBe("string");
      expect(config.key.length).toBeGreaterThan(0);
      expect(config.signature_scheme).toBe("hmac-sha256");
      expect(config.transport).toBe("tcp");
      expect(config.ip).toBe("127.0.0.1");
    });

    it("gives each kernel its own connection file", async () => {
      const first = await writeConnectionFile();
      const second = await writeConnectionFile();

      expect(first.connectionFile).not.toBe(second.connectionFile);
      expect(first.config.key).not.toBe(second.config.key);
    });
  });

  describe("launchSpecFromConnectionInfo", () => {
    it("substitutes the connection file into argv, even through regexp-special paths", async () => {
      const report = path.join(root, "argv.txt");
      // `$&` is meaningful to String.replace's replacement string; a path
      // containing one must still arrive at the kernel verbatim.
      const connectionFile = path.join(root, "conn$&ection.json");
      fs.writeFileSync(connectionFile, "{}");

      const spec = nodeSpec(
        "require('fs').writeFileSync(process.argv[1], process.argv[2])",
        report,
        "{connection_file}",
      );
      const { spawn } = launchSpecFromConnectionInfo(spec, {}, connectionFile, {
        cleanupConnectionFile: false,
      });
      await waitForExit(spawn);

      expect(fs.readFileSync(report, "utf8")).toBe(connectionFile);
    });

    it("returns the process synchronously once connection info exists", () => {
      const connectionFile = path.join(root, "sync.json");
      fs.writeFileSync(connectionFile, "{}");
      const config = { key: "abc" };

      const result = launchSpecFromConnectionInfo(nodeSpec(""), config, connectionFile, {
        cleanupConnectionFile: false,
      });

      expect(typeof result.spawn.kill).toBe("function");
      expect(result.connectionFile).toBe(connectionFile);
      expect(result.config).toBe(config);
      return waitForExit(result.spawn);
    });

    it("removes the connection file once the kernel exits", async () => {
      const connectionFile = path.join(root, "cleaned.json");
      fs.writeFileSync(connectionFile, "{}");

      const { spawn } = launchSpecFromConnectionInfo(nodeSpec(""), {}, connectionFile);
      await waitForExit(spawn);

      expect(fs.existsSync(connectionFile)).toBe(false);
    });

    it("keeps the connection file when cleanup is owned by the caller", async () => {
      const connectionFile = path.join(root, "kept.json");
      fs.writeFileSync(connectionFile, "{}");

      const { spawn } = launchSpecFromConnectionInfo(nodeSpec(""), {}, connectionFile, {
        cleanupConnectionFile: false,
      });
      await waitForExit(spawn);

      expect(fs.existsSync(connectionFile)).toBe(true);
    });

    it("does not leak the cleanup flag into the child process options", async () => {
      const report = path.join(root, "env.txt");
      const connectionFile = path.join(root, "env.json");
      fs.writeFileSync(connectionFile, "{}");

      const spec = nodeSpec(
        "require('fs').writeFileSync(process.argv[1], process.env.JUPYTER_SPEC_VAR || '')",
        report,
      );
      const { spawn } = launchSpecFromConnectionInfo(spec, {}, connectionFile, {
        cleanupConnectionFile: false,
        env: { ...process.env, JUPYTER_SPEC_VAR: "from-caller" },
      });
      await waitForExit(spawn);

      expect(fs.readFileSync(report, "utf8")).toBe("from-caller");
    });

    it("passes the kernelspec's own env to the kernel", async () => {
      const report = path.join(root, "spec-env.txt");
      const connectionFile = path.join(root, "spec-env.json");
      fs.writeFileSync(connectionFile, "{}");

      const spec = nodeSpec(
        "require('fs').writeFileSync(process.argv[1], process.env.JUPYTER_SPEC_FROM_KERNEL || '')",
        report,
      );
      spec.env = { JUPYTER_SPEC_FROM_KERNEL: "from-kernelspec" };
      const { spawn } = launchSpecFromConnectionInfo(spec, {}, connectionFile, {
        cleanupConnectionFile: false,
      });
      await waitForExit(spawn);

      expect(fs.readFileSync(report, "utf8")).toBe("from-kernelspec");
    });
  });

  // The kernelspec's `env` beating the caller's is what Jupyter's own client
  // does, and is the opposite of what spawnteract did.
  describe("environment precedence", () => {
    // Reports one variable as the kernel sees it.
    function report(name) {
      const file = path.join(root, `${name}.txt`);
      const spec = nodeSpec(
        "require('fs').writeFileSync(process.argv[1], process.env[process.argv[2]] || '')",
        file,
        name,
      );
      return { spec, read: () => fs.readFileSync(file, "utf8") };
    }

    async function launch(spec, callerEnv) {
      const connectionFile = path.join(root, "env-precedence.json");
      fs.writeFileSync(connectionFile, "{}");
      const { spawn } = launchSpecFromConnectionInfo(spec, {}, connectionFile, {
        cleanupConnectionFile: false,
        env: { ...process.env, ...callerEnv },
      });
      await waitForExit(spawn);
    }

    it("lets the kernelspec override a variable the caller set", async () => {
      const { spec, read } = report("JUPYTER_SPEC_CONTESTED");
      spec.env = { JUPYTER_SPEC_CONTESTED: "from-kernelspec" };

      await launch(spec, { JUPYTER_SPEC_CONTESTED: "from-caller" });

      expect(read()).toBe("from-kernelspec");
    });

    it("expands ${VAR} in kernelspec values, so a spec can extend rather than clobber", async () => {
      const { spec, read } = report("JUPYTER_SPEC_EXTENDED");
      spec.env = { JUPYTER_SPEC_EXTENDED: "prefix:${JUPYTER_SPEC_EXTENDED}:suffix" };

      await launch(spec, { JUPYTER_SPEC_EXTENDED: "from-caller" });

      expect(read()).toBe("prefix:from-caller:suffix");
    });

    it("expands the bare $VAR form too", async () => {
      const { spec, read } = report("JUPYTER_SPEC_BARE");
      spec.env = { JUPYTER_SPEC_BARE: "$JUPYTER_SPEC_SOURCE/lib" };

      await launch(spec, { JUPYTER_SPEC_SOURCE: "/opt/env" });

      expect(read()).toBe("/opt/env/lib");
    });

    it("leaves unknown names and escaped dollars as written", async () => {
      const { spec, read } = report("JUPYTER_SPEC_LITERAL");
      spec.env = { JUPYTER_SPEC_LITERAL: "$$5 ${JUPYTER_SPEC_NOT_SET} 100$" };

      await launch(spec, {});

      expect(read()).toBe("$5 ${JUPYTER_SPEC_NOT_SET} 100$");
    });

    if (process.platform === "win32") {
      it("treats differently-cased names as the same variable", async () => {
        const { spec, read } = report("JUPYTER_SPEC_CASED");
        // Windows resolves env names case-insensitively, so this must replace
        // the caller's entry rather than sit beside it.
        spec.env = { jupyter_spec_cased: "from-kernelspec" };

        await launch(spec, { JUPYTER_SPEC_CASED: "from-caller" });

        expect(read()).toBe("from-kernelspec");
      });
    }
  });

  describe("launchSpec", () => {
    it("allocates a connection file and starts the kernel against it", async () => {
      const report = path.join(root, "launched.txt");
      const spec = nodeSpec(
        "require('fs').writeFileSync(process.argv[1], process.argv[2])",
        report,
        "{connection_file}",
      );

      const { spawn, connectionFile, config } = await launchSpec(spec, {
        cleanupConnectionFile: false,
      });
      await waitForExit(spawn);

      expect(fs.readFileSync(report, "utf8")).toBe(connectionFile);
      expect(JSON.parse(fs.readFileSync(connectionFile, "utf8")).key).toBe(config.key);
    });
  });

  describe("killProcessTree", () => {
    it("kills a POSIX process with SIGKILL and waits for its exit", async () => {
      const child = fakeProcess();
      let settled = false;
      const termination = onPlatform("linux", () => killProcessTree(child));
      termination.then(() => {
        settled = true;
      });

      expect(child.kill).toHaveBeenCalledOnceWith("SIGKILL");
      expect(settled).toBe(false);

      child.exit(null, "SIGKILL");
      await termination;
      expect(settled).toBe(true);
    });

    it("sweeps a Windows process tree before falling back to the parent handle", async () => {
      const child = fakeProcess(4321);
      const sweep = fakeProcess(9876);
      const spawnProcess = spyOn(ChildProcess, "spawn").and.returnValue(sweep);

      child.kill.and.callFake(() => {
        child.exit(null, "SIGTERM");
        return true;
      });

      const termination = onPlatform("win32", () => killProcessTree(child));

      expect(spawnProcess).toHaveBeenCalledOnceWith("taskkill", ["/PID", "4321", "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
      expect(child.kill).not.toHaveBeenCalled();

      sweep.exitCode = 0;
      sweep.emit("close", 0, null);
      await termination;
      expect(child.kill).toHaveBeenCalledOnceWith();
    });

    it("joins concurrent termination calls", async () => {
      const child = fakeProcess();
      child.kill.and.callFake(() => {
        child.exit(null, "SIGKILL");
        return true;
      });

      const first = onPlatform("linux", () => killProcessTree(child));
      const second = killProcessTree(child);

      expect(second).toBe(first);
      await first;
      expect(child.kill).toHaveBeenCalledTimes(1);
    });

    it("does not signal a process that has already exited", async () => {
      const child = fakeProcess();
      child.exitCode = 0;
      const spawnProcess = spyOn(ChildProcess, "spawn");

      await onPlatform("win32", () => killProcessTree(child));

      expect(spawnProcess).not.toHaveBeenCalled();
      expect(child.kill).not.toHaveBeenCalled();
    });

    it("does not kill the parent after it exits while taskkill is running", async () => {
      const child = fakeProcess();
      const sweep = fakeProcess();
      spyOn(ChildProcess, "spawn").and.returnValue(sweep);

      const termination = onPlatform("win32", () => killProcessTree(child));
      child.exit(0);
      sweep.exitCode = 0;
      sweep.emit("close", 0, null);
      await termination;

      expect(child.kill).not.toHaveBeenCalled();
    });

    it("refuses to report success when taskkill and the fallback leave the tree alive", async () => {
      const child = fakeProcess();
      const sweep = fakeProcess();
      spyOn(ChildProcess, "spawn").and.returnValue(sweep);
      let rejection = null;

      const termination = onPlatform("win32", () => killProcessTree(child));
      termination.catch((error) => {
        rejection = error;
      });
      window.advanceClock(PROCESS_TREE_KILL_TIMEOUT_MS);
      window.advanceClock(PROCESS_TREE_EXIT_GRACE_MS);
      await termination.catch(() => {});

      expect(sweep.kill).toHaveBeenCalledOnceWith();
      expect(child.kill).toHaveBeenCalledOnceWith();
      expect(rejection?.message).toContain("did not terminate");
    });

    it("falls back when taskkill cannot be started", async () => {
      const child = fakeProcess();
      const sweep = fakeProcess();
      spyOn(ChildProcess, "spawn").and.returnValue(sweep);
      child.kill.and.callFake(() => {
        child.exit(null, "SIGTERM");
        return true;
      });

      const termination = onPlatform("win32", () => killProcessTree(child));
      sweep.emit("error", new Error("taskkill unavailable"));
      await termination;

      expect(child.kill).toHaveBeenCalledOnceWith();
    });
  });
});
