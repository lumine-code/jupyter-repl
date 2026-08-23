const { Emitter, CompositeDisposable, Disposable, Point } = require("lumine");
const debounce = require("lodash/debounce");
const Config = require("./config");
const store = require("./store");
const { KernelManager } = require("./kernel-manager");
const services = require("./services");
const {
  log,
  isMultilanguageGrammar,
  OUTPUT_AREA_URI,
  hotReloadPackage,
  kernelSpecProvidesGrammar,
  terminateEditorPendingState,
  cancelAutocomplete,
  observeDebugSetting,
} = require("./utils");
const etch = require("@lumine-code/etch");

// Etch holds its scheduler per copy of the library, and this package resolves
// its own copy — so the assignment the editor makes on core's copy never
// reaches it. Point it at the view registry before anything renders, or this
// package's DOM writes land on an animation frame of their own alongside the
// editor's and force a synchronous reflow.
etch.setScheduler(lumine.views);

/**
 * Jupyter Package
 * Provides interactive computing within Lumine using Jupyter kernels.
 * Supports code execution, watches, variable explorer, and notebook import.
 */

let emitter;
let kernelPicker;
let existingKernelPicker;
let wsKernelPicker;
let jupyterProvider;
let imageEditorService = null;
let terminalService = null;
let terminalSpawnService = null;
let jupyterAdapterServices = [];
let jupyterCellsService = null;
const kernelManager = new KernelManager();

/**
 * Adds/removes the `jupyter-kernel` class on every open text editor whose file
 * currently has a running kernel, so users can scope keymaps and styles to
 * Reads the store directly, so it is called whenever the kernel set changes.
 */
function filesWithLiveKernels() {
  const liveFiles = new Set();
  for (const kernel of store.runningKernels) {
    for (const file of store.getFilesForKernel(kernel)) {
      liveFiles.add(file);
    }
  }
  return liveFiles;
}

function applyKernelClass(editor, liveFiles) {
  const element = editor.element;
  if (!element) {
    return;
  }
  const filePath = editor.getPath() || `Unsaved Editor ${editor.id}`;
  element.classList.toggle("jupyter-kernel", liveFiles.has(filePath));
}

/**
 * The same, for one editor. `observeTextEditors` fires once per editor already
 * open, so sweeping the whole workspace from there made opening a project cost
 * one pass over every editor for every editor.
 */
function updateEditorKernelClass(editor) {
  applyKernelClass(editor, filesWithLiveKernels());
}

function updateEditorKernelClasses() {
  const liveFiles = filesWithLiveKernels();
  for (const editor of lumine.workspace.getTextEditors()) {
    applyKernelClass(editor, liveFiles);
  }
}

/**
 * Activates the package and registers kernel execution commands.
 */
function activate() {
  emitter = new Emitter();
  store.subscriptions.add(observeDebugSetting());
  // The widget stylesheets are injected on the first widget render; this is
  // what takes them away again on deactivation.
  store.subscriptions.add(
    new Disposable(() => require("./components/result-view/widget-styles").disposeWidgetStyles()),
  );
  // The net under a teardown that never reached `deactivate` — a crashed
  // renderer being reloaded. A live zmq socket left for Node's environment
  // teardown makes zeromq fire callbacks into the dying environment, and libzmq
  // then aborts the whole renderer ("The editor has crashed"), so every kernel
  // connection is closed while JS can still run. An orderly unload deactivates
  // first, which destroys the kernels and leaves this loop nothing to do.
  store.subscriptions.add(
    lumine.window.onWillDestroy(() => {
      // The UI goes first, and the order is load-bearing. Destroying a kernel
      // changes the current one, which the status bar answers with an
      // `etch.update` — and that only renders on the next animation frame, by
      // which time core's `destroy()` has run on past this emit and nulled
      // `lumine.workspace`. The queued render then reads `store.kernel`, which
      // asks `lumine.workspace.isTextEditor(...)`, and throws. Destroying the
      // component afterwards cannot undo it either: `etch.destroy` goes through
      // the same scheduler and never cancels an update already queued. Dropping
      // the subscriptions first means the update is never scheduled at all.
      store.subscriptions.dispose();
      // `CompositeDisposable#add` is a silent no-op once disposed, and the
      // store outlives the window, so hand it a fresh one — see `Store#dispose`.
      store.subscriptions = new CompositeDisposable();

      for (const kernel of store.runningKernels.slice()) {
        try {
          // Unload teardown: observers close immediately — nothing will run
          // later to self-close them, and one left armed aborts the renderer.
          kernel.destroy(true);
        } catch (error) {
          console.error("[jupyter-repl] Error destroying kernel on unload:", error);
        }
      }
    }),
  );
  let skipLanguageMappingsChange = false;
  store.subscriptions.add(
    lumine.config.onDidChange("jupyter-repl.languageMappings", ({ oldValue }) => {
      if (skipLanguageMappingsChange) {
        skipLanguageMappingsChange = false;
        return;
      }

      if (store.runningKernels.length !== 0) {
        skipLanguageMappingsChange = true;
        lumine.config.set("jupyter-repl.languageMappings", oldValue);
        lumine.notifications.addError("jupyter-repl", {
          description: "`languageMappings` cannot be updated while kernels are running",
          dismissable: false,
        });
      }
    }),
  );
  store.subscriptions.add(
    // One registration on the workspace. These used to be split across
    // lumine-text-editor:not([mini]) and .jupyter-notebook, which overlapped on
    // fourteen names — and a notebook contains non-mini cell editors, so both
    // fired for every dispatch from one, held apart only by the
    // stopPropagation() the adapter helpers used to call. The .jupyter-notebook
    // block was redundant anyway: run, clearResults, handleKernelSignal and
    // startZMQKernel each try the adapter first and fall back.
    //
    // Packages > Jupyter REPL is always visible and the application menu
    // dispatches at whatever holds focus, so the editor scope left
    // twenty-eight of its thirty-two items dead. Each handler reads
    // store.editor, which is the active editor either way.
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
        modal: "Gateways",
        didDispatch: () => connectToWSKernel(),
      },
      "jupyter-repl:connect-to-existing-kernel": {
        description: "Attach this file to a kernel already running here.",
        didDispatch: () => connectToExistingKernel(),
      },
      "jupyter-repl:update-kernels": {
        description: "Scan the machine for installed kernel specs again.",
        didDispatch: () => updateKernels(),
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
        didDispatch: () => clearResults(),
      },
      "jupyter-repl:clear-and-restart": {
        description: "Remove the results and start the kernel over.",
        didDispatch: () => clearAndRestart(),
      },
      "jupyter-repl:run-all-inline": {
        description: "Run every inline code block rather than the cells.",
        didDispatch: (event) => runAllInline(event),
      },
      "jupyter-repl:recalculate-all-inline": {
        description: "Restart the kernel and run every inline code block.",
        didDispatch: () => recalculateAllInline(),
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
        didDispatch: () => recalculateAllAboveInline(),
      },
      "jupyter-repl:open-terminal": {
        description: "Open a terminal attached to this file's kernel.",
        didDispatch: () => require("./launch-jupyter").openJupyterConsole(terminalService),
      },
      "jupyter-repl:spawn-terminal": {
        description: "Open a terminal running a new console for this kernel.",
        didDispatch: () => require("./launch-jupyter").spawnJupyterConsole(terminalSpawnService),
      },
      "jupyter-repl:copy-console-command": {
        description: "Copy the command that attaches a console to this kernel.",
        didDispatch: () => require("./launch-jupyter").copyJupyterConsoleCommand(),
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
    registerResultContextMenu(),
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
        didDispatch: () => Config.openGateways(),
      },
      "jupyter-repl:shutdown-all-kernels": {
        description: "Stop every kernel this window is running.",
        didDispatch: () => shutdownAllKernels(),
      },
    }),
  );

  if (lumine.window.isDevMode()) {
    store.subscriptions.add(
      lumine.commands.add("lumine-workspace", {
        "jupyter-repl:hot-reload-package": {
          description: "Reload this package's code without restarting the editor.",
          didDispatch: () => hotReloadPackage(),
        },
      }),
    );
  }

  store.subscriptions.add(
    // Track only the center container, so activating a dock (e.g. tree-view)
    // does not clear the external kernel context of a notebook pane item.
    lumine.workspace.getCenter().onDidChangeActivePaneItem((item) => {
      store.updateActivePaneItem(item);
    }),
    lumine.workspace.observeActiveTextEditor((editor) => {
      // Keep the last source editor as the active context when focus moves to a
      // non-editor center item (e.g. the jupyter-explorer pane). Otherwise the
      // active editor (and therefore store.kernel) would become null and panels
      // like jupyter-variables / jupyter-explorer would lose the running kernel.
      if (editor) {
        store.updateEditor(editor);
      }
    }),
  );
  store.subscriptions.add(
    lumine.workspace.observeTextEditors((editor) => {
      const editorSubscriptions = new CompositeDisposable();
      editorSubscriptions.add(
        editor.onDidChangeGrammar(() => {
          store.setGrammar(editor);
        }),
      );

      if (isMultilanguageGrammar(editor.getGrammar())) {
        editorSubscriptions.add(
          editor.onDidChangeCursorPosition(
            debounce(() => {
              store.setGrammar(editor);
            }, 75),
          ),
        );
      }

      editorSubscriptions.add(
        editor.onDidDestroy(() => {
          editorSubscriptions.dispose();
          // We keep the last editor sticky (see observeActiveTextEditor), so when
          // that editor is destroyed fall back to the current active editor to
          // avoid holding a stale reference.
          if (store.editor === editor) {
            store.updateEditor(lumine.workspace.getActiveTextEditor() || null);
          }
        }),
      );
      editorSubscriptions.add(editor.onDidChangeTitle(() => store.forceEditorUpdate()));
      // Apply the `jupyter-kernel` class to this editor in case its file already
      // has a running kernel (e.g. reopened in a new pane), and keep it current
      // when the editor's path changes on save.
      updateEditorKernelClass(editor);
      editorSubscriptions.add(editor.onDidChangePath(() => updateEditorKernelClass(editor)));

      store.subscriptions.add(editorSubscriptions);
    }),
  );
  jupyterProvider = null;
  store.subscriptions.add(
    lumine.workspace.addOpener((uri) => {
      switch (uri) {
        case OUTPUT_AREA_URI: {
          const OutputPane = require("./panes/output-area");
          return new OutputPane(store);
        }

        default: {
          return;
        }
      }
    }),
  );
  store.subscriptions.add(
    // Destroy any Panes when the package is deactivated.
    new Disposable(() => {
      lumine.workspace.getPaneItems().forEach((item) => {
        const OutputPane = require("./panes/output-area");
        if (item instanceof OutputPane) {
          item.destroy();
        }
      });
    }),
  );
  store.subscriptions.add(
    store.onDidChangeCurrentKernel((kernel) => emitter.emit("did-change-kernel", kernel)),
    // Keep the `jupyter-kernel` editor class in sync as kernels start and stop.
    // Saving an unsaved file remaps its kernelMapping key, which the same event
    // covers; newly opened editors are handled in observeTextEditors.
    store.onDidChangeKernels(() => updateEditorKernelClasses()),
  );
  updateEditorKernelClasses();
}

function deactivate() {
  store.dispose();
}

function provideJupyterKernel() {
  if (!jupyterProvider) {
    const JupyterProvider = require("./plugin-api/jupyter-provider");
    jupyterProvider = new JupyterProvider(emitter, () => jupyterAdapterServices);
  }

  return jupyterProvider;
}

function provideAutocomplete() {
  return services.provided.autocomplete.provideAutocomplete(store);
}

function provideMcpTools() {
  // The provider is handed over as a getter, not as a value: it is built
  // lazily on first request, and a host listing tools must not be what forces
  // that at startup.
  return services.provided.mcpTools.provideMcpTools(provideJupyterKernel);
}

function provideJupyterExecution() {
  // The adapter list is handed over as a getter: adapters register and retire
  // while the service object lives on.
  return services.provided.execution.provideJupyterExecution({
    store,
    kernelManager,
    getAdapterServices: () => jupyterAdapterServices,
  });
}

function consumeJupyterCells(service) {
  jupyterCellsService = service;
  // The block detector holds its own reference: it clips blocks at cell
  // boundaries, and requiring main from there would close a load cycle.
  require("./code-manager").setCellsService(service);
  return new Disposable(() => {
    jupyterCellsService = null;
    require("./code-manager").setCellsService(null);
  });
}

function getJupyterCellsService() {
  return jupyterCellsService;
}

function provideJupyterOutput() {
  // Required lazily: the render tree behind it is most of this package's UI
  // code, and nothing needs it until a consumer connects or a result renders.
  return require("./output-service").outputService;
}

function consumeStatusBar(statusBar) {
  return services.consumed.statusBar.addStatusBar(store, statusBar);
}

function consumeImageEditor(service) {
  imageEditorService = service;
  return new Disposable(() => {
    imageEditorService = null;
  });
}

function consumeJupyterAdapter(service) {
  jupyterAdapterServices.push(service);
  return new Disposable(() => {
    jupyterAdapterServices = jupyterAdapterServices.filter((candidate) => candidate !== service);
  });
}

function getImageEditorService() {
  return imageEditorService;
}

function consumeTerminal(service) {
  terminalService = service;
  return new Disposable(() => {
    terminalService = null;
  });
}

function consumeTerminalSpawn(service) {
  terminalSpawnService = service;
  return new Disposable(() => {
    terminalSpawnService = null;
  });
}

function connectToExistingKernel() {
  if (!existingKernelPicker) {
    const ExistingKernelPicker = require("./existing-kernel-picker");
    existingKernelPicker = new ExistingKernelPicker();
  }

  existingKernelPicker.toggle();
}

function handleKernelCommand({ command, payload }, { kernel, markers }) {
  log("handleKernelCommand:", [
    { command, payload },
    { kernel, markers },
  ]);

  if (command === "open-jupyter-console") {
    require("./launch-jupyter").openJupyterConsole(terminalService);
    return;
  }

  if (command === "spawn-jupyter-console") {
    require("./launch-jupyter").spawnJupyterConsole(terminalSpawnService);
    return;
  }

  if (!kernel) {
    const message = "No running kernel for grammar or editor found";
    lumine.notifications.addError(message);
    return;
  }

  if (command === "interrupt-kernel") {
    kernel.interrupt();
  } else if (command === "restart-kernel") {
    kernel.restart();
  } else if (command === "shutdown-kernel") {
    if (markers) {
      markers.clear();
    }
    // Note that destroy alone does not shut down a WSKernel
    kernel.shutdownAndDestroy();
  } else if (command === "rename-kernel") {
    if (kernel.transport instanceof require("./ws-kernel")) {
      kernel.transport.promptRename();
    } else {
      lumine.notifications.addWarning("Rename is only available for remote kernels");
    }
  } else if (command === "disconnect-kernel") {
    if (kernel.transport instanceof require("./ws-kernel")) {
      if (markers) {
        markers.clear();
      }
      kernel.destroy();
    } else {
      lumine.notifications.addWarning(
        "Disconnect is only available for remote kernels. Use 'Shutdown Kernel' for local kernels.",
      );
    }
  }
}

function handleKernelSignal(command) {
  if (handleAdapterKernelSignal(command)) {
    return;
  }
  handleKernelCommand({ command }, store);
}

function toggleKernelCommands() {
  if (!store.kernel) {
    lumine.notifications.addWarning("No running kernel for the current editor");
    return;
  }

  services.consumed.statusBar.showKernelCommands(store, handleKernelCommand);
}

function handleAdapterKernelSignal(command) {
  const handled = require("./adapter-integration").handleAdapterKernelCommand(
    jupyterAdapterServices,
    command,
  );
  return handled;
}

function runAdapterCommand(scope, moveDown = false) {
  const handled = require("./adapter-integration").runAdapterTargets(
    jupyterAdapterServices,
    kernelManager,
    { scope, moveDown },
  );
  return handled;
}

function terminateCommandEditorPendingState(event = null) {
  terminateEditorPendingState(
    event?.target?.closest?.("lumine-text-editor")?.getModel?.() || store.editor,
  );
}

function clearAdapterResults() {
  const handled = require("./adapter-integration").clearAdapterResults(jupyterAdapterServices);
  return handled;
}

function clearResults() {
  if (clearAdapterResults()) {
    return;
  }
  require("./result").clearResults(store);
}

/**
 * Run an action against the result bubble a command means. A dispatch from
 * the bubble's own context menu or close overlay carries the bubble in its
 * target; the command palette falls back to the bubble on the active
 * editor's cursor row. No editor at all fails silently — that absence is on
 * screen — while an editor whose cursor line has no result says so, since
 * the palette gave no other clue.
 */
function withResultView(event, action) {
  const { resultViewForNode } = require("./components/result-view");
  const direct = resultViewForNode(event?.target);
  if (direct) {
    action(direct);
    return;
  }
  const editor = lumine.workspace.getActiveTextEditor();
  if (!editor) {
    return;
  }
  const markers = store.markersMapping.get(editor.id);
  const row = editor.getCursorBufferPosition().row;
  let onRow = null;
  markers?.markers.forEach((view) => {
    if (!view.destroyed && view.marker.getStartBufferPosition().row === row) {
      onRow = view;
    }
  });
  if (!onRow) {
    lumine.notifications.addWarning("No result on the current line");
    return;
  }
  action(onRow);
}

function copyResult(view) {
  const actions = require("./components/result-view/output-actions");
  actions.copyToClipboard(view.component.refs.display, view.outputStore.outputs);
}

function openResultInEditor(view) {
  const actions = require("./components/result-view/output-actions");
  actions.openInEditor(view.component.refs.display, view.outputStore.outputs);
}

/**
 * The bubble's actions, offered where the bubble is: its context menu. Every
 * item resolves the clicked bubble and shows itself only when it applies —
 * no image, no save; nothing scrollable, no expand — which is what the
 * toolbar's conditional buttons used to express with permanent height.
 */
function registerResultContextMenu() {
  const { resultViewForNode } = require("./components/result-view");
  const { hasCopyableContent } = require("./components/result-view/output-actions");
  const viewFor = (event) => resultViewForNode(event.target);
  const copyable = (event) => {
    const view = viewFor(event);
    return Boolean(view && hasCopyableContent(view.outputStore.outputs));
  };
  return lumine.contextMenu.add({
    ".jupyter-repl.marker": [
      { type: "separator" },
      {
        label: "Copy Result",
        command: "jupyter-repl:copy-result",
        shouldDisplay: copyable,
      },
      {
        label: "Open Result in Editor",
        command: "jupyter-repl:open-result-in-editor",
        shouldDisplay: copyable,
      },
      {
        label: "Save Image As…",
        command: "jupyter-repl:save-result-image",
        shouldDisplay: (event) => Boolean(viewFor(event)?.component.hasImage),
      },
      {
        label: "Expand Result",
        command: "jupyter-repl:toggle-result-expansion",
        shouldDisplay: (event) => {
          const component = viewFor(event)?.component;
          return Boolean(component && component.showExpandButton && !component.expanded);
        },
      },
      {
        label: "Collapse Result",
        command: "jupyter-repl:toggle-result-expansion",
        shouldDisplay: (event) => Boolean(viewFor(event)?.component.expanded),
      },
      {
        // The only way back from the grip: a dragged size is deliberately not
        // remembered anywhere, but the bubble it was dragged on outlives the
        // drag, and a result pulled down to nothing needs an undo.
        label: "Reset Result Size",
        command: "jupyter-repl:reset-result-size",
        shouldDisplay: (event) => {
          const component = viewFor(event)?.component;
          return Boolean(
            component && (component.resizedWidth != null || component.resizedHeight != null),
          );
        },
      },
      {
        label: "Close Result",
        command: "jupyter-repl:close-result",
      },
      { type: "separator" },
    ],
  });
}

function run(moveDown = false, event = null) {
  terminateCommandEditorPendingState(event);

  if (runAdapterCommand("editor", moveDown)) {
    return;
  }

  const { editor, grammar, filePath } = store;
  if (!editor || !grammar || !filePath) {
    return;
  }
  cancelAutocomplete(editor);
  // Capture code blocks before checkForKernel to avoid cursor movement during kernel selection
  const codeManager = require("./code-manager");
  const codeBlocks = [];
  for (const selection of editor.getSelections()) {
    const codeBlock = codeManager.findCodeBlock(editor, selection);
    if (!codeBlock || codeBlock.code === null) {
      continue;
    }
    const { row, code: codeNullable } = codeBlock;
    // The cell model lives in the jupyter-cells package now. Without it no
    // marker is recognized, so no block can be a markdown cell — assuming
    // codecell is the degradation, not a guess.
    const cellType =
      jupyterCellsService?.getMetadataForRow(editor, new Point(row, 0)) ?? "codecell";
    const code =
      cellType === "markdown"
        ? jupyterCellsService.removeCommentsMarkdownCell(editor, codeNullable)
        : codeNullable;
    codeBlocks.push({ code, row, cellType });
  }
  if (codeBlocks.length === 0) {
    return;
  }
  if (moveDown) {
    const lastRow = codeBlocks[codeBlocks.length - 1].row;
    codeManager.moveDown(editor, lastRow);
  }
  checkForKernel(store, async (kernel) => {
    const result = require("./result");
    const executionContext = { editor, kernel, markers: store.markers };
    if (codeBlocks.length === 1) {
      result.createResult(executionContext, codeBlocks[0]);
      return;
    }
    await result.createResultBatch(executionContext, codeBlocks);
  });
}

function startAdapterLocalKernel() {
  const handled = require("./adapter-integration").startAdapterKernel(
    jupyterAdapterServices,
    kernelManager,
  );
  return handled;
}

async function refreshKernelPickerSpecs() {
  const kernelSpecs = await kernelManager.updateKernelSpecs(store.grammar, true);
  return store.grammar
    ? kernelSpecs.filter((kernelSpec) => kernelSpecProvidesGrammar(kernelSpec, store.grammar))
    : [];
}

function startZMQKernel() {
  if (startAdapterLocalKernel()) {
    return;
  }

  kernelManager.getAllKernelSpecsForGrammar(store.grammar).then((kernelSpecs) => {
    if (kernelPicker) {
      kernelPicker.kernelSpecs = kernelSpecs;
    } else {
      const KernelPicker = require("./kernel-picker");
      kernelPicker = new KernelPicker(kernelSpecs);
      kernelPicker.onConfirmed = (kernelSpec) => {
        const { editor, grammar, filePath, markers } = store;
        if (!editor || !grammar || !filePath || !markers) {
          return;
        }
        markers.clear();
        kernelManager.startKernel(kernelSpec, grammar, editor, filePath);
      };
    }
    kernelPicker.onUpdate = refreshKernelPickerSpecs;
    kernelPicker.toggle();
  });
}

function connectToWSKernel() {
  if (!wsKernelPicker) {
    const WSKernelPicker = require("./ws-kernel-picker");
    wsKernelPicker = new WSKernelPicker((transport) => {
      const Kernel = require("./kernel");
      const kernel = new Kernel(transport);
      const { editor, grammar, filePath, markers } = store;
      if (!editor || !grammar || !filePath || !markers) {
        return;
      }
      markers.clear();
      const ZMQKernel = require("./zmq-kernel");
      if (kernel.transport instanceof ZMQKernel) {
        kernel.destroy();
      }
      store.newKernel(kernel, filePath, editor, grammar);
    });
  }
  wsKernelPicker.toggle((kernelSpec) => kernelSpecProvidesGrammar(kernelSpec, store.grammar));
}

// Accepts store as an arg
function checkForKernel({ editor, grammar, filePath, kernel }, callback) {
  if (!filePath || !grammar) {
    return lumine.notifications.addError(
      "The language grammar must be set in order to start a kernel. The easiest way to do this is to save the file.",
    );
  }
  if (kernel) {
    callback(kernel);
    return;
  }
  kernelManager.startKernelFor(grammar, editor, filePath, (newKernel) => callback(newKernel));
}

function restartKernel(onRestarted) {
  if (store.kernel) {
    store.kernel.restart(onRestarted);
  } else if (onRestarted) {
    // No kernel - call callback immediately
    onRestarted();
  }
}

async function updateKernels() {
  await kernelManager.updateKernelSpecs();
}

function debugToggle() {
  lumine.config.set("jupyter-repl.debug", !lumine.config.get("jupyter-repl.debug"));
}

function clearAndRestart() {
  let editor = store.editor;
  if (!editor) {
    return;
  }
  clearResults();
  restartKernel();
}

function getInlineCodeBlocks(editor, startRow, endRow) {
  const codeManager = require("./code-manager");
  const codeBlocks = [];

  for (let currentRow = startRow; currentRow <= endRow;) {
    const codeBlock = codeManager.findCodeBlockAtRow(editor, currentRow);
    if (!codeBlock || codeBlock.code === null) {
      currentRow++;
      continue;
    }

    const { code, row } = codeBlock;
    if (row > endRow) {
      break;
    }
    // The cell model lives in the jupyter-cells package now; without it no
    // marker is recognized, so no block can be a markdown cell.
    const cellType =
      jupyterCellsService?.getMetadataForRow(editor, new Point(row, 0)) ?? "codecell";
    const processedCode =
      cellType === "markdown" ? jupyterCellsService.removeCommentsMarkdownCell(editor, code) : code;
    codeBlocks.push({ code: processedCode, row, cellType });

    currentRow = row + 1;
    while (currentRow <= endRow && codeManager.isBlank(editor, currentRow)) {
      currentRow++;
    }
  }

  return codeBlocks;
}

function runAllInline(event = null) {
  terminateCommandEditorPendingState(event);

  if (runAdapterCommand("all", false)) {
    return;
  }

  const { editor, grammar, filePath } = store;
  if (!editor || !grammar || !filePath) {
    return;
  }
  checkForKernel(store, async (kernel) => {
    cancelAutocomplete(editor);
    const result = require("./result");
    const lastRow = editor.getLastBufferRow();
    const codeBlocks = getInlineCodeBlocks(editor, 0, lastRow);
    await result.createResultBatch({ editor, kernel, markers: store.markers }, codeBlocks);
  });
}

function recalculateAllInline() {
  let editor = store.editor;
  if (!editor) {
    return;
  }
  terminateEditorPendingState(editor);
  clearResults();
  restartKernel(() => {
    runAllInline();
  });
}

function runAllAboveInline(event = null) {
  terminateCommandEditorPendingState(event);

  if (runAdapterCommand("above", false)) {
    return;
  }

  const { editor, grammar, filePath } = store;
  if (!editor || !grammar || !filePath) {
    return;
  }
  checkForKernel(store, async (kernel) => {
    cancelAutocomplete(editor);
    const result = require("./result");
    const targetRow = editor.getCursorBufferPosition().row;
    const codeBlocks = getInlineCodeBlocks(editor, 0, targetRow);
    await result.createResultBatch({ editor, kernel, markers: store.markers }, codeBlocks);
  });
}

function recalculateAllAboveInline() {
  let editor = store.editor;
  if (!editor) {
    return;
  }
  terminateEditorPendingState(editor);
  clearResults();
  restartKernel(() => {
    runAllAboveInline();
  });
}

function runAllBelowInline(event = null) {
  terminateCommandEditorPendingState(event);

  if (runAdapterCommand("below", false)) {
    return;
  }

  const { editor, grammar, filePath } = store;
  if (!editor || !grammar || !filePath) {
    return;
  }
  checkForKernel(store, async (kernel) => {
    cancelAutocomplete(editor);
    const result = require("./result");
    const lastRow = editor.getLastBufferRow();
    const startRow = editor.getCursorBufferPosition().row;
    const codeBlocks = getInlineCodeBlocks(editor, startRow, lastRow);
    await result.createResultBatch({ editor, kernel, markers: store.markers }, codeBlocks);
  });
}

function openExamples() {
  lumine.application.openWindow({ pathsToOpen: __dirname + "/../examples" });
}

function shutdownAllKernels() {
  for (let kernel of store.runningKernels) {
    kernel.shutdownAndDestroy();
  }
}

module.exports = {
  activate,
  deactivate,
  provideJupyterKernel,
  provideAutocomplete,
  provideJupyterOutput,
  provideJupyterExecution,
  provideMcpTools,
  consumeStatusBar,
  consumeImageEditor,
  consumeJupyterAdapter,
  consumeJupyterCells,
  getImageEditorService,
  getJupyterCellsService,
  consumeTerminal,
  consumeTerminalSpawn,
  run,
  runAllInline,
};
