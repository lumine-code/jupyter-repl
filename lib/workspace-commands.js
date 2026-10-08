const { CompositeDisposable } = require("lumine");

function registerWorkspaceCommands({
  run,
  toggleKernelCommands,
  startZMQKernel,
  connectToWSKernel,
  connectToExistingKernel,
  handleKernelSignal,
  handleKernelCommand,
  store,
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
  copyResult,
  openResultInEditor,
  debugToggle,
  openExamples,
  getConfig,
  shutdownAllKernels,
  hotReloadPackage,
}) {
  const subscriptions = new CompositeDisposable();
  subscriptions.add(
    // Application menus dispatch at any focused surface. Register every
    // package command once; handlers resolve their editor or adapter context.
    lumine.commands.add("lumine-workspace", {
      "jupyter-repl:run": {
        description: "Run the code at the cursor and leave the cursor where it is.",
        didDispatch: (event) => run(false, event),
      },
      "jupyter-repl:run-and-move-down": {
        description: "Run the code at the cursor and move on to the next block.",
        didDispatch: (event) => run(true, event),
      },
      "jupyter-repl:toggle-output-area": {
        description: "Show the results in a panel instead of beside the code.",
        didDispatch: () => require("./commands").toggleOutputMode(),
      },
      "jupyter-repl:toggle-kernel-commands": {
        description: "List what can be done to the kernel serving this file.",
        didDispatch: () => toggleKernelCommands(),
      },
      "jupyter-repl:start-local-kernel": {
        description: "Start a kernel from the specs installed on this machine.",
        didDispatch: () => startZMQKernel(),
      },
      "jupyter-repl:connect-to-remote-kernel": {
        description: "Connect to a kernel running on a Jupyter gateway.",
        didDispatch: () => connectToWSKernel(),
      },
      "jupyter-repl:connect-to-existing-kernel": {
        description: "Attach this file to a kernel already running here.",
        didDispatch: () => connectToExistingKernel(),
      },
      "jupyter-repl:interrupt-kernel": {
        description: "Stop what the kernel is running, keeping its variables.",
        didDispatch: () => handleKernelSignal("interrupt-kernel"),
      },
      "jupyter-repl:restart-kernel": {
        description: "Start the kernel over, losing every variable it held.",
        didDispatch: () => handleKernelSignal("restart-kernel"),
      },
      "jupyter-repl:shutdown-kernel": {
        description: "Stop the kernel serving this file.",
        didDispatch: () => handleKernelSignal("shutdown-kernel"),
      },
      "jupyter-repl:rename-remote-session": {
        description: "Give this gateway session a name you will recognise.",
        didDispatch: () => handleKernelCommand({ command: "rename-kernel" }, store),
      },
      "jupyter-repl:disconnect-remote-session": {
        description: "Detach from the gateway session, leaving it running.",
        didDispatch: () => handleKernelCommand({ command: "disconnect-kernel" }, store),
      },
      "jupyter-repl:clear-results": {
        description: "Remove the results shown beside the code.",
        didDispatch: (event) => clearResults(event),
      },
      "jupyter-repl:clear-and-restart": {
        description: "Remove the results and start the kernel over.",
        didDispatch: (event) => clearAndRestart(event),
      },
      "jupyter-repl:run-all-inline": {
        description: "Run every inline code block rather than the cells.",
        didDispatch: (event) => runAllInline(event),
      },
      "jupyter-repl:recalculate-all-inline": {
        description: "Restart the kernel and run every inline code block.",
        didDispatch: (event) => recalculateAllInline(event),
      },
      "jupyter-repl:run-all-above-inline": {
        description: "Run the inline code blocks above the cursor.",
        didDispatch: (event) => runAllAboveInline(event),
      },
      "jupyter-repl:run-all-below-inline": {
        description: "Run the inline code blocks below the cursor.",
        didDispatch: (event) => runAllBelowInline(event),
      },
      "jupyter-repl:recalculate-all-above-inline": {
        description: "Restart the kernel and run the inline blocks above.",
        didDispatch: (event) => recalculateAllAboveInline(event),
      },
      "jupyter-repl:open-terminal": {
        description: "Open a terminal attached to this file's kernel.",
        didDispatch: () =>
          withAttachableKernel(async () => {
            await ensureTerminalService();
            return require("./launch-jupyter").openJupyterConsole(getTerminalService());
          }),
      },
      "jupyter-repl:spawn-terminal": {
        description: "Open a terminal running a new console for this kernel.",
        didDispatch: () =>
          withAttachableKernel(async () => {
            await ensureTerminalSpawnService();
            return require("./launch-jupyter").spawnJupyterConsole(getTerminalSpawnService());
          }),
      },
      "jupyter-repl:copy-console-command": {
        description: "Copy the command that attaches a console to this kernel.",
        didDispatch: () =>
          withAttachableKernel(() => require("./launch-jupyter").copyJupyterConsoleCommand()),
      },
      // Result-bubble actions. A context-menu or overlay dispatch carries the
      // clicked bubble in its target; the palette falls back to the bubble on
      // the active editor's cursor row.
      "jupyter-repl:copy-result": {
        description: "Copy the selected result's text to the clipboard.",
        didDispatch: (event) => withResultView(event, copyResult),
      },
      "jupyter-repl:open-result-in-editor": {
        description: "Open the selected result's text in a new editor.",
        didDispatch: (event) => withResultView(event, openResultInEditor),
      },
      "jupyter-repl:save-result-image": {
        description: "Save the selected result's image to a file.",
        didDispatch: (event) => withResultView(event, (view) => view.component.saveImage()),
      },
      "jupyter-repl:toggle-result-expansion": {
        description: "Expand the selected result, or shrink it back again.",
        didDispatch: (event) => withResultView(event, (view) => view.component.toggleExpand()),
      },
      "jupyter-repl:reset-result-size": {
        description: "Put the selected result back to its default size.",
        didDispatch: (event) => withResultView(event, (view) => view.component.resetSize()),
      },
      "jupyter-repl:close-result": {
        description: "Dismiss the selected result.",
        didDispatch: (event) => withResultView(event, (view) => view.destroy()),
      },
    }),
    lumine.commands.add("lumine-workspace", {
      "jupyter-repl:debug-toggle": {
        description: "Turn the package's debug logging on or off.",
        didDispatch: () => debugToggle(),
      },
      "jupyter-repl:open-examples": {
        description: "Browse the example notebooks shipped with the package.",
        didDispatch: () => openExamples(),
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

module.exports = { registerWorkspaceCommands };
