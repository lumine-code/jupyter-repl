const { Emitter, CompositeDisposable, Disposable } = require("lumine");
const { setCellsService } = require("./code-manager-state");
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
const hotReloadPackage = (...args) => getUtils().hotReloadPackage(...args);
const kernelSpecProvidesGrammar = (...args) => getUtils().kernelSpecProvidesGrammar(...args);

let Config;
let adapterIntegration;
let etchConfigured = false;
let adapterIntegrationActivated = false;
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

function autocompleteKernelAvailable() {
  // Metadata checks and ordinary typing must not initialize the store or the
  // completion/renderer graph when this package has no running kernel.
  if (!bootstrapSubscriptions || !storeInstance?.runningKernels.length) return false;
  const kernel = storeInstance.kernel;
  return Boolean(
    kernel &&
    !kernel._destroyed &&
    !kernel.destroyed &&
    !kernel.transport?._destroyed &&
    kernel.executionState === "idle" &&
    (!kernel.transport?.lifecycle || kernel.transport.lifecycle === "ready"),
  );
}

function createAutocompleteFacade() {
  let retired = false;
  const facade = {
    scopeSelector: ".source",
    disableForScopeSelector: ".comment",
    // The built-in provider has an inclusion priority of 0.
    inclusionPriority: 1,
    excludeLowerPriority: false,
    getSuggestions(...args) {
      if (!facade.enabled) {
        autocompleteImplementation?.cancelSuggestions(args[0]?.editor);
        return null;
      }
      return getAutocompleteImplementation().getSuggestions(...args);
    },
    getSuggestionDetailsOnSelect(...args) {
      if (!facade.suggestionDetailsEnabled) {
        autocompleteImplementation?.cancelDetails();
        return null;
      }
      return getAutocompleteImplementation().getSuggestionDetailsOnSelect(...args);
    },
    timeout(...args) {
      if (!facade.enabled) return Promise.resolve(null);
      return getAutocompleteImplementation().timeout(...args);
    },
    retire() {
      retired = true;
    },
  };

  // ProviderManager reads these fields while registering and sorting providers.
  // Keep them as cheap live config views so metadata inspection never forces
  // the implementation module (or the Jupyter store) into the activation path.
  for (const [property, keyPath] of [
    ["suggestionPriority", "jupyter-repl.autocompleteSuggestionPriority"],
  ]) {
    Object.defineProperty(facade, property, {
      configurable: true,
      enumerable: true,
      get: () => lumine.config.get(keyPath),
    });
  }
  for (const [property, keyPath] of [
    ["enabled", "jupyter-repl.autocomplete"],
    ["suggestionDetailsEnabled", "jupyter-repl.showInspectorResultsInAutocomplete"],
  ]) {
    Object.defineProperty(facade, property, {
      enumerable: true,
      get: () => Boolean(!retired && lumine.config.get(keyPath) && autocompleteKernelAvailable()),
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
  return (outputServiceFacade ||= createLazyService(
    () => require("./output-service").outputService,
  ));
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
let runCommands = null;

function getRunCommands() {
  if (!runCommands) {
    const generation = activationGeneration;
    runCommands = require("./run-commands").createRunCommands({
      store,
      kernelManager,
      getExecution: provideJupyterExecution,
      getCellsService: getJupyterCellsService,
      getIntegration: getAdapterIntegration,
      getAdapters: () => jupyterAdapterServices,
      isCurrent: () => generation === activationGeneration,
    });
  }
  return runCommands;
}

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
 * Activates the package and registers kernel execution commands.
 */
function activate() {
  const generation = ++activationGeneration;
  runCommands = null;
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
    require("./workspace-observers").observeRuntime({
      store,
      disposeMcp: () => mcpToolsProvider?.dispose(),
      getKernelManager: () => kernelManagerInstance,
    });
  });

  bootstrapSubscriptions.add(
    require("./workspace-commands").registerWorkspaceCommands({
      run,
      toggleKernelCommands,
      startZMQKernel,
      connectToWSKernel,
      connectToExistingKernel,
      updateKernels,
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
      getTerminalService: () => terminalService,
      getTerminalSpawnService: () => terminalSpawnService,
      withResultView,
      copyResult,
      openResultInEditor,
      debugToggle,
      openExamples,
      getConfig,
      shutdownAllKernels,
      hotReloadPackage,
    }),
  );

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
    bootstrapSubscriptions.add(
      require("./workspace-observers").observeEditors({
        store,
        isCurrent: () => generation === activationGeneration,
        onKernelChanged: (kernel) => emitter.emit("did-change-kernel", kernel),
        ensureResultContextMenu,
      }),
    );
  });
}

function deactivate() {
  activationGeneration++;
  autocompleteServiceFacade?.retire();
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
  runCommands = null;
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
        jupyterProvider = new JupyterProvider(emitter, {
          getStore,
          getCellsService: getJupyterCellsService,
          getAdapterServices: () => jupyterAdapterServices,
        });
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
      elementSelector: ".structured-traceback .traceback-location",
      getSuggestionForElement(element, { signal } = {}) {
        if (retired || !bootstrapSubscriptions) return;
        return require("./traceback-targets").getSuggestionForElement(element, {
          signal,
          isCurrent: () => !retired && Boolean(bootstrapSubscriptions),
        });
      },
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

function clearResults(event = null) {
  return getRunCommands().clearResults(event);
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
  const viewFor = (event) => require("./components/result-view").resultViewForNode(event.target);
  const copyable = (event) => {
    const view = viewFor(event);
    return Boolean(
      view &&
      require("./components/result-view/output-actions").hasCopyableContent(
        view.outputStore.outputs,
      ),
    );
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
  return getRunCommands().run(moveDown, event);
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

async function updateKernels() {
  await kernelManager.updateKernelSpecs();
}

function debugToggle() {
  lumine.config.set("jupyter-repl.debug", !lumine.config.get("jupyter-repl.debug"));
}

function clearAndRestart(event = null) {
  return getRunCommands().clearAndRestart(event);
}

function runAllInline(event = null, autocompleteCancelled = false) {
  return getRunCommands().runAllInline(event, autocompleteCancelled);
}

function recalculateAllInline(event = null) {
  return getRunCommands().recalculateAllInline(event);
}

function runAllAboveInline(event = null, autocompleteCancelled = false) {
  return getRunCommands().runAllAboveInline(event, autocompleteCancelled);
}

function recalculateAllAboveInline(event = null) {
  return getRunCommands().recalculateAllAboveInline(event);
}

function runAllBelowInline(event = null) {
  return getRunCommands().runAllBelowInline(event);
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
