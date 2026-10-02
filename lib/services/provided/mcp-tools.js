// Descriptors are cheap and synchronous. Their execution implementation is
// loaded only when a connected MCP client actually invokes a Jupyter tool.
const string = { type: "string", minLength: 1, maxLength: 256 };
const kernel = { kernelId: string };
const operation = { ...kernel, operationId: { ...string, maxLength: 128 } };
const notebook = { ...operation, notebookId: string, expectedRevision: string };
const readonly = { readOnlyHint: true, openWorldHint: false };
const mutating = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: true,
};

function createMcpTools(context) {
  let active = true;
  let runtime;
  const invoke = (method, args, request) => {
    if (!active)
      throw new Error(
        "This Jupyter MCP provider was deactivated. Reconnect before invoking tools.",
      );
    runtime ||= new (require("../../mcp-execution").McpExecutionRuntime)(context);
    return runtime[method](args || {}, request || {});
  };
  function tool(name, description, properties, required, method, annotations = readonly) {
    return {
      name,
      description,
      annotations,
      inputSchema: { type: "object", properties, required, additionalProperties: false },
      execute: (args, request) => invoke(method, args, request),
    };
  }
  return {
    tools: [
      tool(
        "ListJupyterKernels",
        "List existing kernels in this Lumine window, with explicit kernelId and state. Does not start or select a kernel.",
        {},
        [],
        "listKernels",
      ),
      tool(
        "ExecuteJupyterCode",
        "Accept code once in an explicit existing kernel. Returns executionId immediately; results use that kernel's normal output log. Reuse operationId to recover a lost response; different arguments conflict and work is never replayed automatically.",
        { ...operation, code: { type: "string", maxLength: 262144 } },
        ["kernelId", "operationId", "code"],
        "executeCode",
        mutating,
      ),
      tool(
        "BindJupyterNotebookKernel",
        "Bind an explicit live notebook at expectedRevision to an existing kernelId through its normal metadata and binding transaction. Does not start a kernel or open a picker. Refuses replacing a busy binding; binding the same kernel is a no-op. Returns executionId; GetJupyterExecution includes the updated notebook revision.",
        notebook,
        ["kernelId", "operationId", "notebookId", "expectedRevision"],
        "bindNotebookKernel",
        mutating,
      ),
      tool(
        "RunJupyterCell",
        "Run the current source of an explicit live notebook cell through its normal UI pipeline. Read the notebook first and supply its expectedRevision and bound kernelId. Returns executionId; changed or closed source is refused.",
        { ...notebook, cellId: string },
        ["kernelId", "operationId", "notebookId", "expectedRevision", "cellId"],
        "runCell",
        mutating,
      ),
      tool(
        "RunJupyterNotebook",
        "Accept one sequential run of all code cells in an explicit live notebook at expectedRevision. Stops on the first failure; stable cell IDs and source snapshots are checked before each dispatch. Returns executionId without waiting for Python.",
        notebook,
        ["kernelId", "operationId", "notebookId", "expectedRevision"],
        "runNotebook",
        mutating,
      ),
      tool(
        "GetJupyterExecution",
        "Read execution state and bounded output summaries/MIME metadata. waitMs observes progress for at most 10 seconds. Cancelling this observation does not interrupt or replay kernel work.",
        {
          executionId: string,
          waitMs: { type: "integer", minimum: 0, maximum: 10000 },
          afterVersion: { type: "integer", minimum: 0 },
        },
        ["executionId"],
        "getExecution",
      ),
      tool(
        "InterruptJupyterKernel",
        "Explicitly request interruption of the named kernel, which may be shared by human runs. This can interrupt code with partial side effects. operationId makes request acceptance idempotent; returns an observable executionId.",
        operation,
        ["kernelId", "operationId"],
        "interruptKernel",
        mutating,
      ),
      tool(
        "RestartJupyterKernel",
        "Explicitly restart the named existing kernel, discarding its variables and cancelling pending executions. Does not rerun notebook cells. operationId prevents duplicate restarts; returns an observable executionId.",
        operation,
        ["kernelId", "operationId"],
        "restartKernel",
        mutating,
      ),
    ],
    dispose() {
      active = false;
      runtime?.dispose();
      runtime = null;
    },
  };
}

module.exports = { createMcpTools };
