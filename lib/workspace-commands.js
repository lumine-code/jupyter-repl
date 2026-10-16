const { CompositeDisposable, Disposable } = require("lumine");

function createInputController({ getProvider }) {
  let subscriptions = null;
  let generation = 0;
  const sessions = new Map();
  const inputViews = new Map();

  function closeInput(request) {
    const record = inputViews.get(request);
    if (!record) return;
    inputViews.delete(request);
    record.subscription?.dispose();
    record.view.close();
  }

  function closeSessionInputs(session) {
    for (const [request, record] of inputViews) {
      if (record.session === session) closeInput(request);
    }
  }

  function showInput(session, request) {
    if (!subscriptions || session.isDestroyed()) return;
    const InputView = require("./input-view");
    const view = new InputView(
      {
        prompt: request.prompt,
        password: request.password,
        defaultText: request.defaultText,
        allowCancel: request.allowCancel,
      },
      (value) => {
        closeInput(request);
        request.reply(value);
      },
    );
    const record = { session, view, subscription: null };
    const close = view.close.bind(view);
    view.close = () => {
      if (inputViews.get(request) === record) {
        inputViews.delete(request);
        record.subscription?.dispose();
      }
      close();
    };
    inputViews.set(request, record);
    record.subscription = request.onDidClose(() => closeInput(request));
    view.attach();
  }

  function releaseSession(session) {
    const subscription = sessions.get(session);
    sessions.delete(session);
    closeSessionInputs(session);
    subscription?.dispose();
  }

  function followSessions(provider) {
    const running = new Set(provider.getRunningKernels());
    for (const session of sessions.keys()) {
      if (!running.has(session)) releaseSession(session);
    }
    for (const session of running) {
      if (sessions.has(session)) continue;
      const ownership = new CompositeDisposable();
      sessions.set(session, ownership);
      if (session.onDidRequestInput)
        ownership.add(session.onDidRequestInput((request) => showInput(session, request)));
      if (session.onDidChangeGeneration)
        ownership.add(session.onDidChangeGeneration(() => closeSessionInputs(session)));
      if (session.onDidDestroy) ownership.add(session.onDidDestroy(() => releaseSession(session)));
    }
  }

  function dispose() {
    generation++;
    const previous = subscriptions;
    subscriptions = null;
    previous?.dispose();
    for (const session of sessions.keys()) releaseSession(session);
    for (const request of inputViews.keys()) closeInput(request);
  }

  function activate() {
    const activeGeneration = ++generation;
    subscriptions?.dispose();
    const owned = (subscriptions = new CompositeDisposable());
    queueMicrotask(() => {
      if (subscriptions !== owned || generation !== activeGeneration) return;
      const provider = getProvider();
      if (!provider) return;
      followSessions(provider);
      if (provider.onDidChangeKernels)
        owned.add(provider.onDidChangeKernels(() => followSessions(provider)));
    });
    return new Disposable(() => {
      if (subscriptions === owned) dispose();
    });
  }

  function renameSession(session) {
    if (!session?.capabilities.rename || session.isDestroyed()) return;
    showInput(session, {
      prompt: "Name your current session",
      defaultText: session.name,
      allowCancel: true,
      reply: (name) =>
        Promise.resolve(session.rename(name)).catch((error) =>
          lumine.notifications.addError("Unable to rename the Jupyter session", {
            detail: error.message || String(error),
          }),
        ),
      onDidClose: (callback) => session.onDidChangeGeneration(callback),
    });
  }

  return {
    activate,
    renameSession,
    dispose,
  };
}

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
    runtime ||= new (require("./mcp-execution").McpExecutionRuntime)(context);
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

function registerWorkspaceCommands({
  run,
  canRunSource,
  toggleKernelCommands,
  startZMQKernel,
  connectToWSKernel,
  connectToExistingKernel,
  handleKernelSignal,
  handleKernelCommand,
  kernelContextForEvent,
  getKernelState,
  runKernelCommand,
  clearResults,
  clearAndRestart,
  runAllInline,
  recalculateAllInline,
  runAllAboveInline,
  runAllBelowInline,
  recalculateAllAboveInline,
  withAttachableKernel,
  ensureTerminalService,
  ensureTerminalSpawnService,
  getTerminalService,
  getTerminalSpawnService,
  withResultView,
  resultAvailable,
  copyResult,
  openResultInEditor,
  debugToggle,
  showExamples,
  getConfig,
  shutdownAllKernels,
  hotReloadPackage,
}) {
  const subscriptions = new CompositeDisposable();
  const kernelAvailable = (event, capability) => {
    const state = getKernelState(event);
    if (!state) return false;
    if (["restart", "shutdown"].includes(capability)) return true;
    if (
      ["loading", "recovering", "unresponsive", "restarting", "shutting-down"].includes(
        state.connectionState ?? state.executionState,
      )
    )
      return false;
    return capability ? state.capabilities[capability] === true : true;
  };
  subscriptions.add(
    // Application menus dispatch at any focused surface. Register every
    // package command once; handlers resolve their editor or adapter context.
    lumine.commands.add("lumine-workspace", {
      "jupyter-repl:run": {
        description: "Run the code at the cursor and leave the cursor where it is.",
        isAvailable: (event) => canRunSource(event),
        didDispatch: (event) => run(false, event),
      },
      "jupyter-repl:run-and-move-down": {
        description: "Run the code at the cursor and move on to the next block.",
        isAvailable: (event) => canRunSource(event),
        didDispatch: (event) => run(true, event),
      },
      "jupyter-repl:toggle-output-area": {
        description: "Show the results in a panel instead of beside the code.",
        didDispatch: () => require("./commands").toggleOutputMode(),
      },
      "jupyter-repl:toggle-kernel-commands": {
        description: "List what can be done to the kernel serving this file.",
        isAvailable: (event) => Boolean(getKernelState(event)),
        didDispatch: (event) => toggleKernelCommands(event),
      },
      "jupyter-repl:run-kernel-command": {
        description: "Run an action against the kernel selected in this window.",
        hiddenInCommandPalette: true,
        didDispatch: (event) => runKernelCommand(event),
      },
      "jupyter-repl:start-local-kernel": {
        description: "Start a kernel from the specs installed on this machine.",
        didDispatch: (event) => startZMQKernel(event),
      },
      "jupyter-repl:connect-to-remote-kernel": {
        description: "Connect to a kernel running on a Jupyter gateway.",
        didDispatch: (event) => connectToWSKernel(event),
      },
      "jupyter-repl:connect-to-existing-kernel": {
        description: "Attach this file to a kernel already running here.",
        didDispatch: (event) => connectToExistingKernel(event),
      },
      "jupyter-repl:interrupt-kernel": {
        description: "Stop what the kernel is running, keeping its variables.",
        isAvailable: (event) => kernelAvailable(event),
        didDispatch: (event) => handleKernelSignal("interrupt-kernel", event),
      },
      "jupyter-repl:restart-kernel": {
        description: "Start the kernel over, losing every variable it held.",
        isAvailable: (event) => kernelAvailable(event, "restart"),
        didDispatch: (event) => handleKernelSignal("restart-kernel", event),
      },
      "jupyter-repl:shutdown-kernel": {
        description: "Stop the kernel serving this file.",
        isAvailable: (event) => kernelAvailable(event, "shutdown"),
        didDispatch: (event) => handleKernelSignal("shutdown-kernel", event),
      },
      "jupyter-repl:rename-remote-session": {
        description: "Give this gateway session a name you will recognise.",
        isAvailable: (event) => kernelAvailable(event, "rename"),
        didDispatch: (event) =>
          handleKernelCommand({ command: "rename-kernel" }, kernelContextForEvent(event)),
      },
      "jupyter-repl:disconnect-remote-session": {
        description: "Detach from the gateway session, leaving it running.",
        isAvailable: (event) => kernelAvailable(event, "disconnect"),
        didDispatch: (event) =>
          handleKernelCommand({ command: "disconnect-kernel" }, kernelContextForEvent(event)),
      },
      "jupyter-repl:clear-results": {
        description: "Remove the results shown beside the code.",
        isAvailable: (event) => canRunSource(event),
        didDispatch: (event) => clearResults(event),
      },
      "jupyter-repl:clear-and-restart": {
        description: "Remove the results and start the kernel over.",
        isAvailable: (event) => canRunSource(event),
        didDispatch: (event) => clearAndRestart(event),
      },
      "jupyter-repl:run-all-inline": {
        description: "Run every inline code block rather than the cells.",
        isAvailable: (event) => canRunSource(event),
        didDispatch: (event) => runAllInline(event),
      },
      "jupyter-repl:recalculate-all-inline": {
        description: "Restart the kernel and run every inline code block.",
        isAvailable: (event) => canRunSource(event),
        didDispatch: (event) => recalculateAllInline(event),
      },
      "jupyter-repl:run-all-above-inline": {
        description: "Run the inline code blocks above the cursor.",
        isAvailable: (event) => canRunSource(event),
        didDispatch: (event) => runAllAboveInline(event),
      },
      "jupyter-repl:run-all-below-inline": {
        description: "Run the inline code blocks below the cursor.",
        isAvailable: (event) => canRunSource(event),
        didDispatch: (event) => runAllBelowInline(event),
      },
      "jupyter-repl:recalculate-all-above-inline": {
        description: "Restart the kernel and run the inline blocks above.",
        isAvailable: (event) => canRunSource(event),
        didDispatch: (event) => recalculateAllAboveInline(event),
      },
      "jupyter-repl:open-terminal": {
        description: "Open a terminal attached to this file's kernel.",
        isAvailable: (event) => kernelAvailable(event, "console"),
        didDispatch: (event) =>
          withAttachableKernel(async (context) => {
            await ensureTerminalService();
            return require("./launch-jupyter").openJupyterConsole(getTerminalService(), context);
          }, event),
      },
      "jupyter-repl:spawn-terminal": {
        description: "Open a terminal running a new console for this kernel.",
        isAvailable: (event) => kernelAvailable(event, "console"),
        didDispatch: (event) =>
          withAttachableKernel(async (context) => {
            await ensureTerminalSpawnService();
            return require("./launch-jupyter").spawnJupyterConsole(
              getTerminalSpawnService(),
              context,
            );
          }, event),
      },
      "jupyter-repl:copy-console-command": {
        description: "Copy the command that attaches a console to this kernel.",
        isAvailable: (event) => kernelAvailable(event, "console"),
        didDispatch: (event) =>
          withAttachableKernel(
            (context) => require("./launch-jupyter").copyJupyterConsoleCommand(context),
            event,
          ),
      },
      // Result-bubble actions. A context-menu or overlay dispatch carries the
      // clicked bubble in its target; the palette falls back to the bubble on
      // the active editor's cursor row.
      "jupyter-repl:copy-result": {
        description: "Copy the selected result's text to the clipboard.",
        isAvailable: (event) => resultAvailable(event),
        didDispatch: (event) => withResultView(event, copyResult),
      },
      "jupyter-repl:open-result-in-editor": {
        description: "Open the selected result's text in a new editor.",
        isAvailable: (event) => resultAvailable(event),
        didDispatch: (event) => withResultView(event, openResultInEditor),
      },
      "jupyter-repl:save-result-image": {
        description: "Save the selected result's image to a file.",
        isAvailable: (event) => resultAvailable(event, "image"),
        didDispatch: (event) => withResultView(event, (view) => view.component.saveImage()),
      },
      "jupyter-repl:toggle-result-expansion": {
        description: "Expand the selected result, or shrink it back again.",
        isAvailable: (event) => resultAvailable(event, "expand"),
        didDispatch: (event) => withResultView(event, (view) => view.component.toggleExpand()),
      },
      "jupyter-repl:reset-result-size": {
        description: "Put the selected result back to its default size.",
        isAvailable: (event) => resultAvailable(event, "resize"),
        didDispatch: (event) => withResultView(event, (view) => view.component.resetSize()),
      },
      "jupyter-repl:close-result": {
        description: "Dismiss the selected result.",
        isAvailable: (event) => resultAvailable(event),
        didDispatch: (event) =>
          withResultView(event, (view) => view.destroy({ focusEditor: true })),
      },
    }),
    lumine.commands.add("lumine-workspace", {
      "jupyter-repl:debug-toggle": {
        description: "Turn the package's debug logging on or off.",
        didDispatch: () => debugToggle(),
      },
      "jupyter-repl:show-examples": {
        description: "Choose an example file to open in this editor window.",
        didDispatch: (event) => showExamples(event),
      },
      "jupyter-repl:edit-gateways": {
        description: "Open the list of Jupyter gateways to connect to.",
        didDispatch: () => getConfig().openGateways(),
      },
      "jupyter-repl:shutdown-all-kernels": {
        description: "Stop every kernel this window is running.",
        didDispatch: () => shutdownAllKernels(),
      },
    }),
  );

  if (lumine.window.isDevMode()) {
    subscriptions.add(
      lumine.commands.add("lumine-workspace", {
        "jupyter-repl:hot-reload-package": {
          description: "Reload this package's code without restarting the editor.",
          didDispatch: () => hotReloadPackage(),
        },
      }),
    );
  }

  return subscriptions;
}

module.exports = {
  registerWorkspaceCommands,
  inputController: { createInputController },
  mcpTools: { createMcpTools },
};
