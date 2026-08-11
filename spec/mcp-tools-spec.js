const { provideMcpTools } = require("../lib/services/provided/mcp-tools");

// These tools exist for what an assistant cannot reach on its own: the session
// the user is sitting in. Everything they return crosses to a model as text,
// so the flattening — ANSI out of tracebacks, images named rather than pasted —
// is most of what there is to get wrong.

function fakeKernel(id, overrides = {}) {
  return {
    id,
    displayName: "Python 3",
    language: "python",
    executionState: "idle",
    executionCount: 4,
    lastExecutionTime: "1.23s",
    interrupt() {
      this.interrupted = true;
    },
    restart() {
      this.restarted = true;
    },
    execute: async () => ({ status: "ok", outputs: [], executionCount: 1 }),
    inspect: async () => ({ data: {}, found: false }),
    ...overrides,
  };
}

function fakeProvider(kernels, activeKernel = kernels[0] || null) {
  return {
    getActiveKernel: () => activeKernel,
    getRunningKernels: () => kernels,
    getFilesForKernel: (kernel) => [`/project/${kernel.id}.py`],
  };
}

describe("the Jupyter MCP tools", () => {
  let kernel, provider, tools;

  const toolNamed = (name) => tools.find((tool) => tool.name === name);
  const run = (name, args = {}) => toolNamed(name).execute(args);

  const build = (kernels, active) => {
    provider = fakeProvider(kernels, active);
    tools = provideMcpTools(() => provider);
  };

  beforeEach(() => {
    kernel = fakeKernel("kernel-1");
    build([kernel]);
  });

  it("declares every tool it publishes", () => {
    expect(tools.map((tool) => tool.name)).toEqual([
      "JupyterListKernels",
      "JupyterExecute",
      "JupyterInspect",
      "JupyterInterrupt",
      "JupyterRestart",
    ]);

    for (const tool of tools) {
      expect(typeof tool.title).toBe("string");
      expect(typeof tool.description).toBe("string");
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.annotations.openWorldHint).toBe(false);
      if (tool.annotations.readOnlyHint) continue;
      expect(typeof tool.annotations.destructiveHint).toBe("boolean");
      expect(typeof tool.annotations.idempotentHint).toBe("boolean");
    }
  });

  // Discovering what is running is the one thing running code cannot do.
  describe("JupyterListKernels", () => {
    it("reports every kernel, which is active, and what each serves", () => {
      const second = fakeKernel("kernel-2", { executionState: "busy" });
      build([kernel, second], second);

      expect(run("JupyterListKernels")).toEqual({
        activeKernelId: "kernel-2",
        kernels: [
          {
            id: "kernel-1",
            displayName: "Python 3",
            language: "python",
            executionState: "idle",
            executionCount: 4,
            lastExecutionTime: "1.23s",
            files: ["/project/kernel-1.py"],
            active: false,
          },
          {
            id: "kernel-2",
            displayName: "Python 3",
            language: "python",
            executionState: "busy",
            executionCount: 4,
            lastExecutionTime: "1.23s",
            files: ["/project/kernel-2.py"],
            active: true,
          },
        ],
      });
    });

    it("says nothing is running rather than failing", () => {
      build([], null);
      expect(run("JupyterListKernels")).toEqual({ activeKernelId: null, kernels: [] });
    });
  });

  describe("JupyterExecute", () => {
    it("returns what the code printed", async () => {
      kernel.execute = async (code) => ({
        status: "ok",
        executionCount: 9,
        outputs: [
          { output_type: "stream", name: "stdout", text: `ran ${code}\n` },
          { output_type: "execute_result", data: { "text/plain": "42" } },
        ],
      });

      const answer = await run("JupyterExecute", { code: "1 + 41" });
      expect(answer.kernelId).toBe("kernel-1");
      expect(answer.status).toBe("ok");
      expect(answer.executionCount).toBe(9);
      expect(answer.text).toBe("ran 1 + 41\n\n42");
      expect(answer.truncated).toBe(false);
      expect(answer.media).toEqual([]);
    });

    // A traceback arrives wrapped in the escapes that colour it in a terminal,
    // and a model reads those as noise.
    it("strips the colour out of a traceback", async () => {
      kernel.execute = async () => ({
        status: "error",
        executionCount: 2,
        outputs: [
          {
            output_type: "error",
            ename: "ValueError",
            evalue: "no",
            traceback: ["[0;31mValueError[0m: no"],
          },
        ],
        error: { ename: "ValueError", evalue: "no", traceback: ["[0;31mValueError[0m"] },
      });

      const answer = await run("JupyterExecute", { code: "raise ValueError('no')" });
      expect(answer.status).toBe("error");
      expect(answer.text).toBe("ValueError: no");
      expect(answer.error.ename).toBe("ValueError");
    });

    // A base64 PNG spends thousands of tokens to say "there was a picture".
    it("names an image instead of returning it", async () => {
      kernel.execute = async () => ({
        status: "ok",
        executionCount: 3,
        outputs: [
          {
            output_type: "display_data",
            data: { "image/png": "iVBORw0KGgo=", "text/plain": "<Figure size 640x480>" },
          },
        ],
      });

      const answer = await run("JupyterExecute", { code: "plt.show()" });
      expect(answer.media).toEqual(["image/png"]);
      expect(answer.text).toBe("<Figure size 640x480>");
      expect(answer.text).not.toContain("iVBOR");
    });

    it("truncates a cell that prints too much", async () => {
      kernel.execute = async () => ({
        status: "ok",
        executionCount: 1,
        outputs: [{ output_type: "stream", name: "stdout", text: "x".repeat(500) }],
      });

      const answer = await run("JupyterExecute", { code: "print('x' * 500)", maxLength: 50 });
      expect(answer.truncated).toBe(true);
      expect(answer.text.length).toBeLessThan(500);
    });

    // Stripping the colour out walks the whole string several times, so a cell
    // that printed megabytes used to be converted in full to produce twenty
    // kilobytes — half a second of blocked renderer for text already destined
    // for the bin. The answer has to stay exactly what it was.
    it("bounds a huge output before it converts it, not after", async () => {
      const coloured = "value [31m42[0m for this row\n";
      const huge = coloured.repeat(40000);
      kernel.execute = async () => ({
        status: "ok",
        executionCount: 1,
        outputs: [{ output_type: "stream", name: "stdout", text: huge }],
      });

      const answer = await run("JupyterExecute", { code: "print(df)", maxLength: 2000 });

      expect(answer.truncated).toBe(true);
      expect(answer.text.length).toBe(2000);
      expect(answer.text).not.toContain("[");
      // The same first 2000 characters converting the whole thing would give.
      const { ansiToText } = require("../lib/output-service").outputService;
      expect(answer.text).toBe(ansiToText(huge).slice(0, 2000));
    });

    it("passes the timeout down and reports one plainly", async () => {
      let seen = null;
      kernel.execute = async (code, options) => {
        seen = options;
        return { status: "timeout", executionCount: 5, outputs: [] };
      };

      const answer = await run("JupyterExecute", { code: "while True: pass", timeoutMs: 250 });
      expect(seen).toEqual({ timeoutMs: 250 });
      expect(answer.status).toBe("timeout");
    });

    it("asks for a timeout even when the caller does not", async () => {
      let seen = null;
      kernel.execute = async (code, options) => {
        seen = options;
        return { status: "ok", executionCount: 1, outputs: [] };
      };

      await run("JupyterExecute", { code: "1" });
      expect(seen.timeoutMs).toBeGreaterThan(0);
    });

    it("refuses a call with no code", () => {
      expect(() => run("JupyterExecute", {})).toThrowError(/code is required/);
    });
  });

  describe("JupyterInspect", () => {
    it("returns the kernel's own description of a name", async () => {
      kernel.inspect = async (code, cursorPos) => ({
        found: true,
        data: { "text/plain": `[1mdocs for ${code}@${cursorPos}[0m` },
      });

      expect(await run("JupyterInspect", { code: "df" })).toEqual({
        kernelId: "kernel-1",
        found: true,
        text: "docs for df@2",
        truncated: false,
      });
    });

    it("says so when the kernel knows nothing", async () => {
      const answer = await run("JupyterInspect", { code: "nope" });
      expect(answer.found).toBe(false);
      expect(answer.text).toBe("");
    });
  });

  describe("control", () => {
    it("interrupts the kernel", async () => {
      expect(await run("JupyterInterrupt")).toEqual({ kernelId: "kernel-1", interrupted: true });
      expect(kernel.interrupted).toBe(true);
    });

    it("restarts the kernel", async () => {
      expect(await run("JupyterRestart")).toEqual({ kernelId: "kernel-1", restarted: true });
      expect(kernel.restarted).toBe(true);
    });
  });

  describe("choosing a kernel", () => {
    it("uses the active one when none is named", async () => {
      const second = fakeKernel("kernel-2");
      build([kernel, second], second);
      expect((await run("JupyterInterrupt")).kernelId).toBe("kernel-2");
    });

    it("uses the one it is given", async () => {
      const second = fakeKernel("kernel-2");
      build([kernel, second], second);
      expect((await run("JupyterInterrupt", { kernelId: "kernel-1" })).kernelId).toBe("kernel-1");
      expect(kernel.interrupted).toBe(true);
    });

    // Every one of these answers rather than throwing, and says what to do
    // next: a model that gets an exception has nowhere to go.
    it("explains itself when nothing is running", async () => {
      build([], null);
      for (const name of [
        "JupyterExecute",
        "JupyterInspect",
        "JupyterInterrupt",
        "JupyterRestart",
      ]) {
        const answer = await run(name, { code: "1" });
        expect(answer.error).toBe("no_kernel");
        expect(answer.message).toContain("JupyterListKernels");
      }
    });

    it("explains itself when the named kernel is gone", async () => {
      const answer = await run("JupyterExecute", { code: "1", kernelId: "kernel-99" });
      expect(answer.error).toBe("unknown_kernel");
      expect(answer.message).toContain("kernel-99");
    });
  });
});
