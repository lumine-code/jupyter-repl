const { Emitter, CompositeDisposable, Disposable } = require("lumine");
const { setCellsService } = require("./code-manager-state");
let debounce;
let storeInstance;
const getStore = () => (storeInstance ||= require("./store"));
// Keep the package entry point independent of the store's workspace observers,
// marker registry and utility graph. The first editor/kernel operation crosses
// this boundary; property reads retain the old synchronous service shape.
const store = new Proxy(
  {},
  {
    get(_target, property) {
      const value = getStore()[property];
      return typeof value === "function" ? value.bind(getStore()) : value;
    },
    set(_target, property, value) {
      getStore()[property] = value;
      return true;
    },
  },
);
const OUTPUT_AREA_URI = "lumine://jupyter-repl/output-area";

function getUtils() {
  return require("./utils");
}

const log = (...args) => getUtils().log(...args);
const isMultilanguageGrammar = (...args) => getUtils().isMultilanguageGrammar(...args);
const hotReloadPackage = (...args) => getUtils().hotReloadPackage(...args);
const kernelSpecProvidesGrammar = (...args) => getUtils().kernelSpecProvidesGrammar(...args);
const terminateEditorPendingState = (...args) => getUtils().terminateEditorPendingState(...args);
const cancelAutocomplete = (...args) => getUtils().cancelAutocomplete(...args);
const observeDebugSetting = (...args) => getUtils().observeDebugSetting(...args);
const getDebounce = () => (debounce ||= require("lodash/debounce"));

let Config;
let adapterIntegration;
let etchConfigured = false;
let adapterIntegrationActivated = false;
let kernelClassUpdateScheduled = false;
let pendingKernelClassEditors = new Set();
let kernelClassUpdateAll = false;
let resultContextMenuDisposable = null;
let activationGeneration = 0;
let bootstrapSubscriptions = null;
let autocompleteImplementation = null;
let hyperclickImplementation = null;
let hyperclickServiceFacade = null;
let ipythonSourceRegistration = null;

function getConfig() {
  return (Config ||= require("./config"));
}

function getAdapterIntegration() {
  return (adapterIntegration ||= require("./adapter-integration"));
}

function initialPackageBatchPending() {
  const packages = lumine.packages;
  return Boolean(
    packages?.activatePromise ||
    (packages?.hasLoadedInitialPackages?.() && !packages?.hasActivatedInitialPackages?.()),
  );
}

function getAutocompleteImplementation() {
  return (autocompleteImplementation ||=
    require("./services/provided/autocomplete").provideAutocomplete(store));
}

function createAutocompleteFacade() {
  const facade = {
    scopeSelector: ".source",
    disableForScopeSelector: ".comment",
    // The built-in provider has an inclusion priority of 0.
    inclusionPriority: 1,
    excludeLowerPriority: false,
    getSuggestions(...args) {
      return getAutocompleteImplementation().getSuggestions(...args);
    },
    getSuggestionDetailsOnSelect(...args) {
      return getAutocompleteImplementation().getSuggestionDetailsOnSelect(...args);
    },
    timeout(...args) {
      return getAutocompleteImplementation().timeout(...args);
    },
  };

  // ProviderManager reads these fields while registering and sorting providers.
  // Keep them as cheap live config views so metadata inspection never forces
  // the implementation module (or the Jupyter store) into the activation path.
  for (const [property, keyPath] of [
    ["enabled", "jupyter-repl.autocomplete"],
    ["suggestionPriority", "jupyter-repl.autocompleteSuggestionPriority"],
    ["suggestionDetailsEnabled", "jupyter-repl.showInspectorResultsInAutocomplete"],
  ]) {
    Object.defineProperty(facade, property, {
      configurable: true,
      enumerable: true,
      get: () => lumine.config.get(keyPath),
    });
  }
  return facade;
}

function ensureEtch() {
  if (etchConfigured) return;
  // Etch holds its scheduler per copy of the library, and this package
  // resolves its own copy. Configure it immediately before the first view is
  // created, keeping the renderer out of the bootstrap path.
  require("@lumine-code/etch").setScheduler(lumine.views);
  etchConfigured = true;
}

function ensureResultContextMenu() {
  if (resultContextMenuDisposable) return resultContextMenuDisposable;
  resultContextMenuDisposable = registerResultContextMenu();
  return resultContextMenuDisposable;
}

function getOutputServiceFacade() {
  if (outputServiceFacade) return outputServiceFacade;
  const service = () => require("./output-service").outputService;
  outputServiceFacade = new Proxy(
    {},
    {
      get(_target, property) {
        return service()[property];
      },
      has(_target, property) {
        return property in service();
      },
      ownKeys() {
        return Reflect.ownKeys(service());
      },
      getOwnPropertyDescriptor(_target, property) {
        const descriptor = Object.getOwnPropertyDescriptor(service(), property);
        return descriptor ? { ...descriptor, configurable: true } : undefined;
      },
    },
  );
  return outputServiceFacade;
}

function createLazyService(load) {
  let value = null;
  const get = () => (value ||= load());
  return new Proxy(
    {},
    {
      get(_target, property) {
        return get()[property];
      },
      has(_target, property) {
        return property in get();
      },
      ownKeys() {
        return Reflect.ownKeys(get());
      },
      getOwnPropertyDescriptor(_target, property) {
        const descriptor = Object.getOwnPropertyDescriptor(get(), property);
        return descriptor ? { ...descriptor, configurable: true } : undefined;
      },
    },
  );
}

/**
 * Jupyter Package
 * Provides interactive computing within Lumine using Jupyter kernels.
 * Supports code execution, watches, variable explorer, and notebook import.
 */

let emitter;
let kernelPicker;
let kernelPickerRequest = 0;
let existingKernelPicker;
let wsKernelPicker;
let jupyterProvider;
let outputPane = null;
let imageEditorService = null;
let terminalService = null;
let terminalSpawnService = null;
let jupyterAdapterServices = [];
let jupyterCellsService = null;
let kernelManagerInstance = null;
let outputServiceFacade = null;
let kernelServiceFacade = null;
let autocompleteServiceFacade = null;
let executionServiceFacade = null;
let mcpToolsProvider = null;
let notebookService = null;
const getKernelManager = () => {
  if (kernelManagerInstance == null) {
    const { KernelManager } = require("./kernel-manager");
    kernelManagerInstance = new KernelManager();
  }
  return kernelManagerInstance;
};
const kernelManager = new Proxy(
  {},
  {
    get(_target, property) {
      const manager = getKernelManager();
      const value = manager[property];
      return typeof value === "function" ? value.bind(manager) : value;
    },
    set(_target, property, value) {
      getKernelManager()[property] = value;
      return true;
    },
  },
);

function adoptOutputPane(item) {
  outputPane = item;
  item.onDidDestroy(() => {
    if (outputPane === item) {
      outputPane = null;
    }
  });
  return item;
}

function getOutputPane() {
  if (outputPane && !outputPane.destroyed) {
    return outputPane;
  }

  const existing = lumine.workspace
    .getPaneItems()
    .find((item) => item.getURI?.() === OUTPUT_AREA_URI);
  if (existing) {
    return adoptOutputPane(existing);
  }

  ensureEtch();
  const OutputPane = require("./panes/output-area");
  return adoptOutputPane(new OutputPane(store));
}

function destroyOutputPanes() {
  const items = lumine.workspace
    .getPaneItems()
    .filter((item) => item.getURI?.() === OUTPUT_AREA_URI);
  if (outputPane && !items.includes(outputPane)) {
    items.push(outputPane);
  }
  for (const item of items) {
    item.destroy();
  }
  outputPane = null;
}

function deserializeOutputPane() {
  return getOutputPane();
}

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

function scheduleKernelClassUpdate(editor = null) {
  if (editor) pendingKernelClassEditors.add(editor);
  else kernelClassUpdateAll = true;
  if (kernelClassUpdateScheduled) return;
  kernelClassUpdateScheduled = true;
  const generation = activationGeneration;
  queueMicrotask(() => {
    if (generation !== activationGeneration) return;
    kernelClassUpdateScheduled = false;
    const updateAll = kernelClassUpdateAll;
    kernelClassUpdateAll = false;
    const editors = pendingKernelClassEditors;
    pendingKernelClassEditors = new Set();
    if (updateAll) {
      updateEditorKernelClasses();
    } else {
      const liveFiles = filesWithLiveKernels();
      for (const editor of editors) {
        if (!editor.isDestroyed?.()) applyKernelClass(editor, liveFiles);
      }
    }
  });
}

/**
 * Activates the package and registers kernel execution commands.
 */
function activate() {
  const generation = ++activationGeneration;
  emitter = new Emitter();
  jupyterProvider = null;
  bootstrapSubscriptions?.dispose();
  bootstrapSubscriptions = new CompositeDisposable();
  adapterIntegrationActivated = false;
  if (jupyterAdapterServices.length > 0) {
    // A provider can arrive before this package's activation hook (service
    // delivery is synchronous). The integration module performs a workspace
    // sweep and is not part of the bootstrap contract, so let the current
    // package batch finish before starting it.
    const activateIntegration = () => {
      if (generation !== activationGeneration || adapterIntegrationActivated) return;
      if (jupyterAdapterServices.length === 0) return;
      getAdapterIntegration().activateAdapterIntegration();
      adapterIntegrationActivated = true;
    };
    if (initialPackageBatchPending()) queueMicrotask(activateIntegration);
    else activateIntegration();
  }
  // Store construction installs workspace observers and reads the active
  // pane/editor. Those observers are not needed to publish commands or lazy
  // services, so keep them out of the activation stopwatch. The microtask runs
  // before the next render while still allowing the whole package batch to
  // finish first.
  queueMicrotask(() => {
    if (generation !== activationGeneration) return;
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
        mcpToolsProvider?.dispose();
        // The UI goes first, and the order is load-bearing. Destroying a kernel
        // changes the current one, which the status bar answers with an
        // `etch.update` — and that only renders on the next animation frame, by
        // which time core's `destroy()` has run on past this emit and nulled
        // `lumine.workspace`. The queued render then reads `store.kernel`, which
        // asks `lumine.workspace.isTextEditor(...)`, and throws. Destroying the
        // component afterwards cannot undo it either: `etch.destroy` goes through
        // the same scheduler and never cancels an update already queued. Dropping
        // the subscriptions first means the update is never scheduled at all.
        store._activeItemKernelSubscription?.dispose();
        store._activeItemKernelSubscription = null;
        store.subscriptions.dispose();
        // `CompositeDisposable#add` is a silent no-op once disposed, and the
        // store outlives the window, so hand it a fresh one — see `Store#dispose`.
        store.subscriptions = new CompositeDisposable();

        // A transport still starting has no Kernel facade in runningKernels.
        // Its observers need the same immediate renderer-unload close path.
        kernelManagerInstance?.dispose(true);

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
  });

  bootstrapSubscriptions.add(
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
        didDispatch: () =>
          withAttachableKernel(async () => {
            await ensureTerminalService();
            return require("./launch-jupyter").openJupyterConsole(terminalService);
          }),
      },
      "jupyter-repl:spawn-terminal": {
        description: "Open a terminal running a new console for this kernel.",
        didDispatch: () =>
          withAttachableKernel(async () => {
            await ensureTerminalSpawnService();
            return require("./launch-jupyter").spawnJupyterConsole(terminalSpawnService);
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
    bootstrapSubscriptions.add(
      lumine.commands.add("lumine-workspace", {
        "jupyter-repl:hot-reload-package": {
          description: "Reload this package's code without restarting the editor.",
          didDispatch: () => hotReloadPackage(),
        },
      }),
    );
  }

  bootstrapSubscriptions.add(
    lumine.workspace.addOpener((uri) => {
      if (uri === OUTPUT_AREA_URI) return getOutputPane();
    }),
    // Destroy any panes when the package deactivates.
    new Disposable(() => destroyOutputPanes()),
  );

  // The remaining registrations observe the current workspace and therefore
  // can wait until after commands and the opener are published.
  queueMicrotask(() => {
    if (generation !== activationGeneration) return;
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
            if (store.editor === editor) store.setGrammar(editor);
          }),
        );

        if (isMultilanguageGrammar(editor.getGrammar())) {
          const updateGrammar = getDebounce()(() => {
            if (store.editor === editor && !editor.isDestroyed?.()) store.setGrammar(editor);
          }, 75);
          editorSubscriptions.add(
            editor.onDidChangeCursorPosition(updateGrammar),
            new Disposable(() => updateGrammar.cancel()),
          );
        }

        editorSubscriptions.add(
          editor.onDidDestroy(() => {
            editorSubscriptions.dispose();
            store.subscriptions.remove(editorSubscriptions);
            // We keep the last editor sticky (see observeActiveTextEditor), so when
            // that editor is destroyed fall back to the current active editor to
            // avoid holding a stale reference.
            if (store.editor === editor) {
              store.updateEditor(lumine.workspace.getActiveTextEditor() || null);
            }
          }),
        );
        editorSubscriptions.add(
          editor.onDidChangeTitle(() => {
            if (store.editor === editor) store.forceEditorUpdate();
          }),
        );
        // Apply the `jupyter-kernel` class to this editor in case its file already
        // has a running kernel (e.g. reopened in a new pane), and keep it current
        // when the editor's path changes on save.
        scheduleKernelClassUpdate(editor);
        editorSubscriptions.add(editor.onDidChangePath(() => updateEditorKernelClass(editor)));

        store.subscriptions.add(editorSubscriptions);
      }),
    );
    store.subscriptions.add(
      store.onDidChangeCurrentKernel((kernel) => emitter.emit("did-change-kernel", kernel)),
      // Keep the `jupyter-kernel` editor class in sync as kernels start and stop.
      // Saving an unsaved file remaps its kernelMapping key, which the same event
      // covers; newly opened editors are handled in observeTextEditors.
      store.onDidChangeKernels(() => updateEditorKernelClasses()),
    );
    // Marking every already-open editor is intentionally outside the activation
    // critical path. The observer above queues individual editors; this sweep
    // covers an editor list that changed while activation was registering it.
    scheduleKernelClassUpdate();

    // Result bubbles are not part of the bootstrap surface. Register their
    // context menu after the activation batch, when the result-view modules are
    // actually allowed to enter the module cache without charging this package.
    queueMicrotask(() => {
      if (generation !== activationGeneration || store.subscriptions.disposed) return;
      store.subscriptions.add(observeDebugSetting());
      const disposable = ensureResultContextMenu();
      store.subscriptions.add(disposable);
    });
  });
}

function deactivate() {
  activationGeneration++;
  hyperclickServiceFacade?.dispose();
  hyperclickImplementation?.dispose();
  hyperclickServiceFacade = null;
  hyperclickImplementation = null;
  ipythonSourceRegistration = null;
  mcpToolsProvider?.dispose();
  mcpToolsProvider = null;
  notebookService = null;
  bootstrapSubscriptions?.dispose();
  bootstrapSubscriptions = null;
  // Also cover a pane made by the startup deserializer if activation did not
  // finish far enough to register its teardown disposable.
  destroyOutputPanes();
  adapterIntegration?.disposeAdapterIntegration();
  adapterIntegration = null;
  adapterIntegrationActivated = false;
  jupyterAdapterServices = [];
  etchConfigured = false;
  kernelClassUpdateScheduled = false;
  kernelClassUpdateAll = false;
  pendingKernelClassEditors.clear();
  kernelPickerRequest++;
  kernelPicker?.destroy?.();
  existingKernelPicker?.destroy?.();
  wsKernelPicker?.destroy?.();
  kernelPicker = null;
  existingKernelPicker = null;
  wsKernelPicker = null;
  resultContextMenuDisposable = null;
  outputServiceFacade = null;
  kernelServiceFacade = null;
  autocompleteServiceFacade = null;
  autocompleteImplementation = null;
  executionServiceFacade = null;
  kernelManagerInstance?.dispose();
  kernelManagerInstance = null;
  require("./services/consumed/status-bar/status-bar").statusBarConsumer.dispose();
  storeInstance?.dispose();
  for (const editor of lumine.workspace.getTextEditors()) {
    editor.element?.classList.remove("jupyter-kernel");
  }
  emitter?.dispose();
  emitter = null;
  jupyterProvider = null;
  imageEditorService = null;
  terminalService = null;
  terminalSpawnService = null;
  jupyterCellsService = null;
  setCellsService(null);
}

function provideJupyterKernel() {
  if (!kernelServiceFacade) {
    kernelServiceFacade = createLazyService(() => {
      if (!jupyterProvider) {
        const JupyterProvider = require("./plugin-api/jupyter-provider");
        jupyterProvider = new JupyterProvider(emitter, () => jupyterAdapterServices);
      }
      return jupyterProvider;
    });
  }
  return kernelServiceFacade;
}

function provideAutocomplete() {
  autocompleteServiceFacade ||= createAutocompleteFacade();
  return autocompleteServiceFacade;
}

function provideHyperclick() {
  if (!hyperclickServiceFacade) {
    let retired = false;
    hyperclickServiceFacade = {
      priority: 5,
      providerName: "jupyter-repl",
      disableForSelector:
        ".comment, .string, .constant.numeric, .keyword, .storage, .variable.parameter",
      getSuggestionForWord(editor, text, range) {
        if (
          retired ||
          !bootstrapSubscriptions ||
          !/^source\.python(?:\.|$)/.test(editor?.getGrammar?.().scopeName || "")
        )
          return;
        hyperclickImplementation ||=
          require("./services/provided/hyperclick").createHyperclickProvider({
            getStore,
            getAdapterServices: () => jupyterAdapterServices,
            getIPythonSource: () => ipythonSourceRegistration?.service || null,
          });
        return hyperclickImplementation.getSuggestionForWord(editor, text, range);
      },
      dispose() {
        retired = true;
      },
    };
  }
  return hyperclickServiceFacade;
}

function consumeIPythonSource(service) {
  const registration = { service };
  ipythonSourceRegistration = registration;
  return new Disposable(() => {
    if (ipythonSourceRegistration === registration) ipythonSourceRegistration = null;
  });
}

function provideJupyterExecution() {
  // The adapter list is handed over as a getter: adapters register and retire
  // while the service object lives on.
  executionServiceFacade ||= createLazyService(() =>
    require("./services/provided/execution").provideJupyterExecution({
      store,
      kernelManager,
      getAdapterServices: () => jupyterAdapterServices,
    }),
  );
  return executionServiceFacade;
}

function consumeJupyterCells(service) {
  jupyterCellsService = service;
  // The block detector holds its own reference: it clips blocks at cell
  // boundaries. Keep that reference in a tiny state module; requiring the
  // large code-manager implementation here used to add ~9ms to activation.
  setCellsService(service);
  return new Disposable(() => {
    if (jupyterCellsService !== service) return;
    jupyterCellsService = null;
    setCellsService(null);
  });
}

function getJupyterCellsService() {
  return jupyterCellsService;
}

function provideJupyterOutput() {
  // Required lazily: the render tree behind it is most of this package's UI
  // code, and nothing needs it until a consumer connects or a result renders.
  return getOutputServiceFacade();
}

function consumeJupyterNotebook(service) {
  notebookService = service;
  return new Disposable(() => {
    if (notebookService === service) notebookService = null;
  });
}

function provideMcpTools() {
  mcpToolsProvider ||= require("./services/provided/mcp-tools").createMcpTools({
    getStore: () => store,
    getNotebookService: () => notebookService,
    getAdapterServices: () => jupyterAdapterServices,
    getIntegration: () => {
      const integration = getAdapterIntegration();
      if (!adapterIntegrationActivated && jupyterAdapterServices.length > 0) {
        integration.activateAdapterIntegration();
        adapterIntegrationActivated = true;
      }
      return integration;
    },
  });
  return mcpToolsProvider.tools;
}

function consumeStatusBar(statusBar) {
  let disposed = false;
  let registration = null;
  queueMicrotask(() => {
    if (disposed) return;
    registration =
      require("./services/consumed/status-bar/status-bar").statusBarConsumer.addStatusBar(
        getStore(),
        statusBar,
      );
  });
  return new Disposable(() => {
    disposed = true;
    registration?.dispose();
  });
}

function consumeImageEditor(service) {
  imageEditorService = service;
  return new Disposable(() => {
    if (imageEditorService === service) imageEditorService = null;
  });
}

function consumeJupyterAdapter(service) {
  const generation = activationGeneration;
  jupyterAdapterServices.push(service);
  const activateIntegration = () => {
    if (
      generation !== activationGeneration ||
      adapterIntegrationActivated ||
      !jupyterAdapterServices.includes(service)
    )
      return;
    getAdapterIntegration().activateAdapterIntegration();
    adapterIntegrationActivated = true;
  };
  // The adapter facade is available synchronously; the integration module's
  // workspace sweep can wait one microtask. This keeps the provider's
  // activation stopwatch free of the optional kernel-routing graph while
  // preserving the service edge immediately.
  if (initialPackageBatchPending()) queueMicrotask(activateIntegration);
  else activateIntegration();
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
    if (terminalService === service) terminalService = null;
  });
}

async function ensureTerminalService() {
  if (!terminalService) {
    await lumine.packages.requestService("terminal", "^1.0.0");
  }
  return terminalService;
}

function consumeTerminalSpawn(service) {
  terminalSpawnService = service;
  return new Disposable(() => {
    if (terminalSpawnService === service) terminalSpawnService = null;
  });
}

async function ensureTerminalSpawnService() {
  if (!terminalSpawnService) {
    await lumine.packages.requestService("terminal-spawn", "^1.0.0");
  }
  return terminalSpawnService;
}

function connectToExistingKernel() {
  const integration = getAdapterIntegration();
  const adapterContext = integration.captureAdapterKernelContext(jupyterAdapterServices);
  if (adapterContext && !integration.canChangeAdapterKernel(adapterContext)) return;
  if (!existingKernelPicker) {
    const ExistingKernelPicker = require("./existing-kernel-picker");
    existingKernelPicker = new ExistingKernelPicker();
  }

  existingKernelPicker.toggle(
    adapterContext || {
      filePath: store.filePath,
      editor: store.editor,
      grammar: store.grammar,
      markers: store.markers,
    },
  );
}

async function handleKernelCommand({ command, payload }, { kernel, markers }) {
  log("handleKernelCommand:", [
    { command, payload },
    { kernel, markers },
  ]);

  if (!kernel) {
    const message = "No running kernel for grammar or editor found";
    lumine.notifications.addError(message);
    return;
  }

  if (
    ["open-jupyter-console", "spawn-jupyter-console"].includes(command) &&
    isKernelConnectionQuarantined(kernel)
  ) {
    notifyKernelConnectionUnavailable();
    return;
  }

  if (command === "open-jupyter-console") {
    await ensureTerminalService();
    await require("./launch-jupyter").openJupyterConsole(terminalService);
    return;
  }

  if (command === "spawn-jupyter-console") {
    await ensureTerminalSpawnService();
    require("./launch-jupyter").spawnJupyterConsole(terminalSpawnService);
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

function isKernelConnectionQuarantined(kernel) {
  const state = kernel?.transport?.lifecycle ?? kernel?.executionState;
  return ["loading", "recovering", "unresponsive", "restarting", "shutting-down"].includes(state);
}

function notifyKernelConnectionUnavailable() {
  lumine.notifications.addWarning("Jupyter console connection blocked", {
    detail:
      "Opening another client could release an uncertain execution. Restart or shut down the kernel first.",
    dismissable: true,
  });
}

function withAttachableKernel(action) {
  const kernel = store.kernel;
  if (!kernel) {
    lumine.notifications.addWarning("No running kernel for the current editor");
    return;
  }
  if (isKernelConnectionQuarantined(kernel)) {
    notifyKernelConnectionUnavailable();
    return;
  }
  return action(kernel);
}

function handleKernelSignal(command) {
  if (handleAdapterKernelSignal(command)) {
    return;
  }
  return handleKernelCommand({ command }, store);
}

function toggleKernelCommands() {
  if (!store.kernel) {
    lumine.notifications.addWarning("No running kernel for the current editor");
    return;
  }

  require("./services/consumed/status-bar/status-bar").statusBarConsumer.showKernelCommands(
    getStore(),
    handleKernelCommand,
  );
}

function handleAdapterKernelSignal(command) {
  const handled = getAdapterIntegration().handleAdapterKernelCommand(
    jupyterAdapterServices,
    command,
  );
  return handled;
}

function runAdapterCommand(scope, moveDown = false) {
  const handled = getAdapterIntegration().runAdapterTargets(jupyterAdapterServices, kernelManager, {
    scope,
    moveDown,
  });
  return handled;
}

function terminateCommandEditorPendingState(event = null) {
  terminateEditorPendingState(
    lumine.workspace.getTextEditorForElement(event?.target, { includeMini: false }) ?? store.editor,
  );
}

function clearAdapterResults() {
  const handled = getAdapterIntegration().clearAdapterResults(jupyterAdapterServices);
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

async function run(moveDown = false, event = null) {
  terminateCommandEditorPendingState(event);

  if (runAdapterCommand("editor", moveDown)) {
    return;
  }

  const { editor } = store;
  if (!editor) {
    return;
  }
  cancelAutocomplete(editor);
  const codeManager = require("./code-manager");
  const codeBlocks = await require("./run-source").selectionBlocks(editor, getJupyterCellsService);
  if (codeBlocks.length === 0) {
    return;
  }
  if (moveDown) {
    const lastRow = codeBlocks[codeBlocks.length - 1].row;
    codeManager.moveDown(editor, lastRow);
  }
  return provideJupyterExecution().runBlocks(editor, codeBlocks);
}

function startAdapterLocalKernel() {
  const handled = getAdapterIntegration().startAdapterKernel(jupyterAdapterServices, kernelManager);
  return handled;
}

async function refreshKernelPickerSpecs(grammar) {
  const kernelSpecs = await kernelManager.updateKernelSpecs(grammar, true);
  return grammar
    ? kernelSpecs.filter((kernelSpec) => kernelSpecProvidesGrammar(kernelSpec, grammar))
    : [];
}

function startZMQKernel() {
  if (startAdapterLocalKernel()) {
    return;
  }

  if (kernelPicker?.selectListHost?.isVisible()) {
    kernelPickerRequest++;
    kernelPicker.selectListHost.cancel();
    return;
  }
  const context = {
    editor: store.editor,
    grammar: store.grammar,
    filePath: store.filePath,
    markers: store.markers,
  };
  if (!context.editor || !context.grammar || !context.filePath || !context.markers) return;
  const request = ++kernelPickerRequest;

  kernelManager.getAllKernelSpecsForGrammar(context.grammar).then((kernelSpecs) => {
    if (request !== kernelPickerRequest || context.editor.isDestroyed?.()) return;
    if (kernelPicker) {
      kernelPicker.kernelSpecs = kernelSpecs;
    } else {
      const KernelPicker = require("./kernel-picker");
      kernelPicker = new KernelPicker(kernelSpecs);
    }
    kernelPicker.onConfirmed = (kernelSpec) => {
      if (request !== kernelPickerRequest || context.editor.isDestroyed?.()) return;
      context.markers.clear();
      const filePath = context.editor.getPath?.() || context.filePath;
      kernelManager.startKernel(kernelSpec, context.grammar, context.editor, filePath);
    };
    kernelPicker.onUpdate = () => refreshKernelPickerSpecs(context.grammar);
    kernelPicker.toggle(context);
  });
}

function connectToWSKernel() {
  const integration = getAdapterIntegration();
  const adapterContext = integration.captureAdapterKernelContext(jupyterAdapterServices);
  if (adapterContext && !integration.canChangeAdapterKernel(adapterContext)) return;
  const context = adapterContext || {
    filePath: store.filePath,
    editor: store.editor,
    grammar: store.grammar,
    markers: store.markers,
  };
  if (!wsKernelPicker) {
    const WSKernelPicker = require("./ws-kernel-picker");
    wsKernelPicker = new WSKernelPicker((transport, chosenContext) => {
      const Kernel = require("./kernel");
      const kernel = new Kernel(transport);
      if (chosenContext?.adapter) {
        return integration.bindAdapterKernel(chosenContext, kernel, { owned: true });
      }
      const { editor, grammar, filePath, markers } = chosenContext || {};
      if (!editor || !grammar || !filePath || !markers) {
        if (transport.ownsKernelProcess === false) kernel.destroy();
        else kernel.shutdownAndDestroy();
        return;
      }
      markers.clear();
      store.newKernel(kernel, editor.getPath?.() || filePath, editor, grammar);
    });
  }
  wsKernelPicker.toggle(
    adapterContext ? null : (kernelSpec) => kernelSpecProvidesGrammar(kernelSpec, context.grammar),
    context,
  );
}

// Accepts store as an arg
function restartKernel(onRestarted) {
  if (store.kernel) {
    return store.kernel.restart(onRestarted);
  } else if (onRestarted) {
    // No kernel - call callback immediately
    onRestarted();
  }
  return Promise.resolve(true);
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

async function runInlineRange(editor, startRow, endRow) {
  cancelAutocomplete(editor);
  const blocks = await require("./run-source").inlineBlocks(
    editor,
    startRow,
    endRow,
    getJupyterCellsService,
  );
  return provideJupyterExecution().runBlocks(editor, blocks);
}

async function runAllInline(event = null) {
  terminateCommandEditorPendingState(event);

  if (runAdapterCommand("all", false)) {
    return;
  }

  const { editor } = store;
  if (!editor) {
    return;
  }
  return runInlineRange(editor, 0, editor.getLastBufferRow());
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

async function runAllAboveInline(event = null) {
  terminateCommandEditorPendingState(event);

  if (runAdapterCommand("above", false)) {
    return;
  }

  const { editor } = store;
  if (!editor) {
    return;
  }
  return runInlineRange(editor, 0, editor.getCursorBufferPosition().row);
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

async function runAllBelowInline(event = null) {
  terminateCommandEditorPendingState(event);

  if (runAdapterCommand("below", false)) {
    return;
  }

  const { editor } = store;
  if (!editor) {
    return;
  }
  return runInlineRange(editor, editor.getCursorBufferPosition().row, editor.getLastBufferRow());
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
  provideBackgroundTips() {
    return {
      packageName: "jupyter-repl",
      tips: [
        "You can run the line or the selection under the cursor in a Jupyter kernel with {{ 'jupyter-repl:run' | keystroke }}",
      ],
    };
  },

  activate,
  deactivate,
  deserializeOutputPane,
  provideJupyterKernel,
  provideAutocomplete,
  provideHyperclick,
  provideJupyterOutput,
  provideJupyterExecution,
  provideMcpTools,
  consumeJupyterNotebook,
  consumeStatusBar,
  consumeImageEditor,
  consumeJupyterAdapter,
  consumeJupyterCells,
  consumeIPythonSource,
  getImageEditorService,
  getJupyterCellsService,
  consumeTerminal,
  consumeTerminalSpawn,
  run,
  runAllInline,
};
