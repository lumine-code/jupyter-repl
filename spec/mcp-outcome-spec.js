const { randomUUID } = require("node:crypto");

describe("MCP typed execution outcomes", () => {
  for (const [status, code, unknown] of [
    ["unknown", "execution_outcome_unknown", true],
    ["cancelled", "execution_cancelled", true],
    ["unavailable", "kernel_unavailable", false],
    ["timeout", "execution_observation_timeout", true],
  ]) {
    it(`preserves ${status} when no error output was observed`, async () => {
      const { McpExecutionRuntime, createLedger } = require("../lib/mcp-execution");
      const kernel = { id: "typed-kernel", executionState: "idle" };
      const runtime = new McpExecutionRuntime(
        {
          getStore: () => ({ runningKernels: [kernel] }),
          runCode: async () => ({
            status,
            success: false,
            error: { ename: "TypedFailure", evalue: "Precise outcome." },
          }),
        },
        createLedger(),
      );
      try {
        const receipt = await runtime.executeCode({
          kernelId: kernel.id,
          operationId: randomUUID(),
          code: "side_effect()",
        });
        for (let turn = 0; turn < 8; turn++) await Promise.resolve();
        const result = await runtime.getExecution({ executionId: receipt.executionId });
        expect(result.state).toBe("error");
        expect(result.error.code).toBe(code);
        expect(result.error.outcomeUnknown).toBe(unknown);
        expect(result.error.message).toBe("Precise outcome.");
      } finally {
        runtime.dispose();
      }
    });
  }
});
