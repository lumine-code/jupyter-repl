/**
 * Tools published to a connected MCP host through `mcp.tools`.
 *
 * An assistant already has the filesystem, ripgrep and a shell, so nothing here
 * repeats those. What it cannot reach on its own is the session the user is
 * sitting in: a dataframe that took twenty minutes to build, a traceback that
 * belongs to one particular run, a cell that is still going. These five tools
 * are the ones that answer only from a running kernel.
 *
 * Output crosses to the model as text. Everything the kernel sends is a MIME
 * bundle — ANSI escapes in tracebacks, base64 in images — and a model reads
 * none of that usefully, so it is flattened with the same helpers the panels
 * render with, and images are named rather than pasted.
 */

const { OUTPUT_TYPES } = require("../../output-utils");

// A cell can print a great deal, and every character of it lands in the
// assistant's context. Enough to debug with, not enough to drown in.
const DEFAULT_MAX_TEXT = 20000;
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * The output service, required at the point of use.
 *
 * Most of this package's UI code sits behind it, and a host listing tools must
 * not drag that in — the list is fetched whether or not a kernel is running.
 */
function outputHelpers() {
  return require("../../output-service").outputService;
}

/**
 * Flatten a run's outputs into what a model can actually read.
 *
 * @param {Array} outputs - notebook-format outputs, as `execute` returns them
 * @param {Number} maxLength
 * @returns {{text: String, truncated: Boolean, media: String[]}}
 */
function flatten(outputs, maxLength) {
  const { getOutputPlainText, ansiToText, truncateOutput, normalizeOutput } = outputHelpers();

  const normalized = outputs
    .filter((o) => OUTPUT_TYPES.includes(o.output_type))
    .map(normalizeOutput);

  // Media that carries no text of its own is reported by type. A base64 PNG
  // spends thousands of tokens to say "there was a picture".
  const media = [];
  for (const output of normalized) {
    for (const type of Object.keys(output.data || {})) {
      if (type !== "text/plain" && !media.includes(type)) media.push(type);
    }
  }

  const plain = getOutputPlainText(normalized);
  // Bound the text before converting it, not after. Stripping ANSI walks the
  // whole string several times over, so a cell that printed megabytes was
  // parsed in full to produce twenty kilobytes — seconds of blocked renderer
  // for output that was about to be thrown away. Escape sequences are short,
  // so a generous margin still leaves more than `maxLength` once they are
  // gone, and `truncateOutput` makes the real cut.
  const margin = maxLength > 0 ? maxLength * 2 : 0;
  const bounded = margin > 0 && plain.length > margin ? plain.slice(0, margin) : plain;

  const { text, truncated } = truncateOutput(ansiToText(bounded), maxLength);
  return { text, truncated: truncated || bounded.length < plain.length, media };
}

/**
 * Resolve the kernel a call is about: the one it named, or the active one.
 *
 * @returns {{kernel: Object}|{error: Object}}
 */
function resolveKernel(provider, kernelId) {
  if (!kernelId) {
    const active = provider.getActiveKernel();
    if (active) return { kernel: active };
    return {
      error: {
        error: "no_kernel",
        message:
          "No Jupyter kernel is running for the active editor. Call JupyterListKernels to see what is running, or ask the user to start one.",
      },
    };
  }

  const kernel = provider.getRunningKernels().find((candidate) => candidate.id === kernelId);
  if (kernel) return { kernel };
  return {
    error: {
      error: "unknown_kernel",
      message: `No running kernel has id ${kernelId}. Call JupyterListKernels for the ids that are live now.`,
    },
  };
}

const KERNEL_ID_SCHEMA = {
  type: "string",
  description:
    "Id of the kernel to use, from JupyterListKernels. Omit for the kernel serving the editor the user is in.",
};

/**
 * @param {Function} getProvider - Resolves the `jupyter.kernel` provider.
 *   Called per invocation rather than held, because the provider is built
 *   lazily on first request and publishing tools must not force it at startup.
 */
function provideMcpTools(getProvider) {
  // Runs `body` against a resolved kernel, or answers why it could not.
  const withKernel = (kernelId, body) => {
    const { kernel, error } = resolveKernel(getProvider(), kernelId);
    if (error) return error;
    return body(kernel);
  };

  return [
    {
      name: "JupyterListKernels",
      title: "List Jupyter Kernels",
      description:
        "List the Jupyter kernels running in the editor. Returns {kernels, activeKernelId} where each kernel is {id, displayName, language, executionState, executionCount, lastExecutionTime, files, active}. executionState is 'busy' while a cell is running. files are the paths the kernel serves; an unsaved editor appears as 'Unsaved Editor <n>'. Call this first to find the id the other Jupyter tools take.",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: { readOnlyHint: true, openWorldHint: false },
      execute() {
        const provider = getProvider();
        const active = provider.getActiveKernel();
        return {
          activeKernelId: active ? active.id : null,
          kernels: provider.getRunningKernels().map((kernel) => ({
            id: kernel.id,
            displayName: kernel.displayName,
            language: kernel.language,
            executionState: kernel.executionState,
            executionCount: kernel.executionCount,
            lastExecutionTime: kernel.lastExecutionTime,
            files: provider.getFilesForKernel(kernel),
            active: kernel === active,
          })),
        };
      },
    },

    {
      name: "JupyterExecute",
      title: "Run Code in a Jupyter Kernel",
      description:
        "Run code in a running Jupyter kernel and return what it printed. This is the user's own live session: it sees the variables they have built and changes them, exactly as if they had run a cell. Returns {kernelId, status, executionCount, text, truncated, media, error?}. status is 'ok', 'error' — with error {ename, evalue, traceback} — or 'timeout', which means the code is still running and JupyterInterrupt will stop it. text is the flattened output; images and other non-text results are named in media rather than returned.",
      inputSchema: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description: "The code to run, in the kernel's own language.",
          },
          kernelId: KERNEL_ID_SCHEMA,
          timeoutMs: {
            type: "number",
            description: `How long to wait before giving up and reporting status 'timeout' (default ${DEFAULT_TIMEOUT_MS}). The kernel keeps running either way.`,
            minimum: 1,
          },
          maxLength: {
            type: "number",
            description: `Truncate the returned text past this many characters (default ${DEFAULT_MAX_TEXT}).`,
            minimum: 1,
          },
        },
        required: ["code"],
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
      execute({ code, kernelId, timeoutMs = DEFAULT_TIMEOUT_MS, maxLength = DEFAULT_MAX_TEXT }) {
        if (typeof code !== "string") throw new Error("code is required");
        return withKernel(kernelId, async (kernel) => {
          const result = await kernel.execute(code, { timeoutMs });
          return {
            kernelId: kernel.id,
            status: result.status,
            executionCount: result.executionCount,
            ...flatten(result.outputs, maxLength),
            ...(result.error ? { error: result.error } : {}),
          };
        });
      },
    },

    {
      name: "JupyterInspect",
      title: "Inspect a Jupyter Expression",
      description:
        "Ask a running Jupyter kernel what it knows about an expression — the docstring, signature and type it would show on inspection. Returns {kernelId, found, text}. This does not run the code, so it is safe on an expression with side effects; use JupyterExecute when you need a value.",
      inputSchema: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description: "The expression to inspect, such as a name in the kernel's namespace.",
          },
          cursorPos: {
            type: "number",
            description: "Position in code to inspect at. Defaults to the end.",
            minimum: 0,
          },
          kernelId: KERNEL_ID_SCHEMA,
          maxLength: {
            type: "number",
            description: `Truncate the returned text past this many characters (default ${DEFAULT_MAX_TEXT}).`,
            minimum: 1,
          },
        },
        required: ["code"],
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      execute({ code, cursorPos, kernelId, maxLength = DEFAULT_MAX_TEXT }) {
        if (typeof code !== "string") throw new Error("code is required");
        return withKernel(kernelId, async (kernel) => {
          const { data, found } = await kernel.inspect(
            code,
            cursorPos === undefined ? code.length : cursorPos,
          );
          const { ansiToText, truncateOutput } = outputHelpers();
          const plain = ansiToText(data?.["text/plain"] || "");
          return {
            kernelId: kernel.id,
            found: Boolean(found),
            ...truncateOutput(plain, maxLength),
          };
        });
      },
    },

    {
      name: "JupyterInterrupt",
      title: "Interrupt a Jupyter Kernel",
      description:
        "Interrupt whatever a Jupyter kernel is currently running, as the user pressing stop would. This is the way out of code that will not finish — nothing else you send reaches a busy kernel. The kernel keeps its variables. Returns {kernelId, interrupted}.",
      inputSchema: {
        type: "object",
        properties: { kernelId: KERNEL_ID_SCHEMA },
        required: [],
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      execute({ kernelId } = {}) {
        return withKernel(kernelId, (kernel) => {
          kernel.interrupt();
          return { kernelId: kernel.id, interrupted: true };
        });
      },
    },

    {
      name: "JupyterRestart",
      title: "Restart a Jupyter Kernel",
      description:
        "Restart a Jupyter kernel. Every variable, import and definition in the session is lost and cannot be recovered — anything expensive the user built has to be rebuilt. Ask before calling this. Returns {kernelId, restarted}.",
      inputSchema: {
        type: "object",
        properties: { kernelId: KERNEL_ID_SCHEMA },
        required: [],
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      execute({ kernelId } = {}) {
        return withKernel(kernelId, (kernel) => {
          kernel.restart();
          return { kernelId: kernel.id, restarted: true };
        });
      },
    },
  ];
}

module.exports = { provideMcpTools, flatten, resolveKernel };
