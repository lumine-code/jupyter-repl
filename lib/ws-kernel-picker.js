const { v4: uuidv4 } = require("uuid");
const http = require("http");
const https = require("https");
const ws = require("ws");
const { XMLHttpRequest: NodeXMLHttpRequest } = require("xmlhttprequest");
const { URL } = require("url");
const path = require("path");
const {
  SessionAPI,
  KernelSpecAPI,
  KernelManager,
  SessionManager,
  ServerConnection,
} = require("@jupyterlab/services");
const Config = require("./config");
const WSKernel = require("./ws-kernel");
const store = require("./store");
const { tildify } = require("./utils");

const KERNEL_INFO_TIMEOUT_MS = 3000;

const AUTH_METHODS = [
  { name: "No credentials", action: "none" },
  { name: "Authenticate with a token", action: "token" },
  { name: "Authenticate with a cookie", action: "cookie" },
];

// Connects to a kernel on a remote gateway through a chain of modal steps:
// gateway, credentials when the gateway needs them, then a running session or
// a kernel spec for a new one. Every step shows itself on the workspace's
// modal breadcrumb trail, so Shift-Escape retries the previous step — a wrong
// token backs up to the token prompt, not out of the flow — while Escape
// abandons the whole thing.
class WSKernelPicker {
  constructor(onChosen) {
    this._onChosen = onChosen;
    this._flowGeneration = 0;
    this._flow = null;

    const renderItem = (item, { filterKey, highlight }) => ({
      primary: highlight(filterKey),
    });

    const gatewayListOptions = {
      items: [],
      emptyMessage: "No gateways available",
      infoMessage: "Select a gateway",
      getItemId: (item) => item.name,
      search: { getFilterText: (item) => item.name },
      renderItem,
      commands: {
        "jupyter-repl:select-gateway": {
          description: "Connect through the selected Jupyter gateway.",
          didDispatch: ({ detail }) => this.onGateway(detail.item),
        },
      },
      actions: [
        {
          command: "jupyter-repl:select-gateway",
          context: "item",
          primary: true,
          disposition: "push",
        },
      ],
    };
    this.gatewayListHost = lumine.workspace.addSelectList(gatewayListOptions, {
      className: "jupyter-repl ws-kernel-picker",
      crumb: "Gateways",
    });
    this.gatewayList = this.gatewayListHost.getModel();

    const authListOptions = {
      items: AUTH_METHODS,
      getItemId: (item) => item.action,
      search: { getFilterText: (item) => item.name },
      renderItem,
      commands: {
        "jupyter-repl:select-gateway-authentication": {
          description: "Use the selected authentication method for this gateway.",
          didDispatch: ({ detail }) => this.onAuthMethod(detail.item.action),
        },
      },
      actions: [
        {
          command: "jupyter-repl:select-gateway-authentication",
          context: "item",
          primary: true,
          disposition: "push",
        },
      ],
    };
    this.authListHost = lumine.workspace.addSelectList(authListOptions, {
      className: "jupyter-repl ws-kernel-picker",
    });
    this.authList = this.authListHost.getModel();

    const credentialDialogOptions = {
      commands: {
        "jupyter-repl:submit-credential": {
          description: "Authenticate with the entered gateway token or cookie.",
          didDispatch: () => this.onCredential(this.credentialDialog.getQuery()),
        },
      },
      actions: [
        {
          command: "jupyter-repl:submit-credential",
          context: "dialog",
          primary: true,
          // A valid credential advances to the session picker as the next
          // breadcrumb step; validation leaves this step visible.
          disposition: "push",
          dispatch: "local",
        },
      ],
    };
    this.credentialDialogHost = lumine.workspace.addInputDialog(credentialDialogOptions, {
      className: "jupyter-repl ws-kernel-picker",
    });
    this.credentialDialog = this.credentialDialogHost.getModel();
    // Password mode: only show dots when there's actual text.
    const queryEditor = this.credentialDialog.getQueryEditor();
    this.credentialDialog.onDidChangeQuery(({ query }) => {
      const hasText = query.length > 0;
      queryEditor.element.style.webkitTextSecurity = hasText ? "disc" : "none";
    });

    const sessionListOptions = {
      items: [],
      emptyMessage: "No sessions available",
      getItemId: (item) => item.id,
      search: { getFilterText: (item) => item.name },
      renderItem,
      commands: {
        "jupyter-repl:connect-gateway-session": {
          description: "Connect to the selected running Jupyter session.",
          didDispatch: ({ detail }) => this.connectToSession(detail.item),
        },
        "jupyter-repl:create-gateway-session": {
          description: "Choose a kernel specification for a new Jupyter session.",
          didDispatch: ({ detail }) => this.showSpecList(detail.item),
        },
      },
      actions: [
        {
          command: "jupyter-repl:connect-gateway-session",
          context: "item",
          when: ({ item }) => Boolean(item.model),
          primary: true,
          disposition: "close",
        },
        {
          command: "jupyter-repl:create-gateway-session",
          context: "item",
          when: ({ item }) => !item.model,
          primary: true,
          disposition: "push",
        },
      ],
    };
    this.sessionListHost = lumine.workspace.addSelectList(sessionListOptions, {
      className: "jupyter-repl ws-kernel-picker",
    });
    this.sessionList = this.sessionListHost.getModel();

    const specListOptions = {
      items: [],
      emptyMessage: "No kernel specs available",
      infoMessage: "Select a kernel spec",
      getItemId: (item) => item.id,
      search: { getFilterText: (item) => item.name },
      renderItem,
      commands: {
        "jupyter-repl:start-gateway-session": {
          description: "Start a Jupyter session with the selected kernel specification.",
          didDispatch: ({ detail }) => this.startSession(detail.item),
        },
      },
      actions: [
        {
          command: "jupyter-repl:start-gateway-session",
          context: "item",
          primary: true,
          disposition: "close",
        },
      ],
    };
    this.specListHost = lumine.workspace.addSelectList(specListOptions, {
      className: "jupyter-repl ws-kernel-picker",
    });
    this.specList = this.specListHost.getModel();

    this._flowSubscriptions = [
      this.gatewayListHost,
      this.authListHost,
      this.credentialDialogHost,
      this.sessionListHost,
      this.specListHost,
    ].map((host) =>
      host.onDidCancel(() => {
        const flow = this._flow;
        if (flow && !flow.committing) this._invalidateFlow(flow);
      }),
    );
  }

  _beginFlow(kernelSpecFilter, context) {
    if (this._flow) this._invalidateFlow(this._flow);
    const contextPath = context?.filePath || store.filePath;
    const fileName = contextPath ? path.basename(contextPath) : "unsaved";
    const flow = {
      generation: ++this._flowGeneration,
      context,
      kernelSpecFilter: kernelSpecFilter || (() => true),
      path: `${fileName}-${uuidv4()}`,
      committing: false,
      cancelled: false,
    };
    this._flow = flow;
    return flow;
  }

  _invalidateFlow(flow) {
    if (!flow || flow.cancelled) return;
    flow.cancelled = true;
    if (this._flow === flow) this._flow = null;
  }

  _isCurrentFlow(flow) {
    return Boolean(flow && !flow.cancelled && this._flow === flow);
  }

  _flowFor(item = null) {
    return item?._jupyterFlow || this._flow;
  }

  async toggle(_kernelSpecFilter, context = null) {
    const flow = this._beginFlow(_kernelSpecFilter, context);
    const gateways = Config.getJson("gateways") || [];

    if (!gateways.length) {
      lumine.notifications.addError("No remote kernel gateways available", {
        description:
          "Use Jupyter: Open Gateways Config to edit gateways.json. Jupyter can use remote kernels on either a Jupyter Kernel Gateway or Jupyter notebook server.",
      });
      this._invalidateFlow(flow);
      return;
    }

    await this.gatewayList.setItems(
      gateways.map((gateway) => ({ ...gateway, _jupyterFlow: flow })),
    );
    if (!this._isCurrentFlow(flow)) return;
    await this.gatewayListHost.show();
  }

  async onGateway(gatewayInfo) {
    const flow = this._flowFor(gatewayInfo);
    if (!this._isCurrentFlow(flow)) return;
    flow.gatewayName = gatewayInfo.name;
    // Spread gateway config first; auth steps and factories build on a copy.
    flow.gatewayOptions = { ...gatewayInfo.options };

    if (!flow.gatewayOptions.token) {
      await this.showAuthList(flow);
      return;
    }
    await this.finishAuth(flow);
  }

  async showAuthList(flow = this._flow) {
    if (!this._isCurrentFlow(flow)) return;
    await this.authList.setInfoMessage(`Authenticate with ${flow.gatewayName}`);
    if (!this._isCurrentFlow(flow)) return;
    await this.authListHost.show({ crumb: "Authentication" });
  }

  async onAuthMethod(action) {
    const flow = this._flow;
    if (!this._isCurrentFlow(flow)) return;
    if (action === "none") {
      await this.finishAuth(flow);
      return;
    }
    flow.credentialKind = action;
    const label = action === "token" ? "Token" : "Cookie";
    await this.credentialDialog.setInfoMessage(`${label} for ${flow.gatewayName}`);
    await this.credentialDialog.clearStatus();
    if (!this._isCurrentFlow(flow)) return;
    await this.credentialDialog.setPlaceholderText(label);
    if (!this._isCurrentFlow(flow)) return;
    this.credentialDialogHost.show({
      crumb: label,
      query: "",
      selectQuery: true,
    });
  }

  async onCredential(value) {
    const flow = this._flow;
    if (!this._isCurrentFlow(flow)) return;
    if (!value) {
      await this.credentialDialog.setStatus({
        type: "error",
        message: `Enter a ${flow.credentialKind}.`,
      });
      return;
    }

    const options = flow.gatewayOptions;
    if (flow.credentialKind === "token") {
      options.token = value;
    } else {
      if (!options.requestHeaders) {
        options.requestHeaders = {};
      }
      options.requestHeaders.Cookie = value;

      options.xhrFactory = () => {
        const request = new NodeXMLHttpRequest();
        request.setDisableHeaderCheck(true);
        return request;
      };

      options.wsFactory = (url, protocol) => {
        const parsedUrl = new URL(url);
        parsedUrl.protocol = parsedUrl.protocol === "wss:" ? "https:" : "http:";
        return new ws(url, protocol, {
          headers: { Cookie: value },
          origin: parsedUrl.origin,
          host: parsedUrl.host,
        });
      };
    }
    await this.finishAuth(flow);
  }

  // Set default factories only if not already configured (e.g. by cookie auth)
  async finishAuth(flow = this._flow) {
    if (!this._isCurrentFlow(flow)) return;
    const options = flow.gatewayOptions;
    if (!options.xhrFactory) {
      options.xhrFactory = () => new XMLHttpRequest();
    }
    if (!options.wsFactory) {
      options.wsFactory = (url, protocol) => {
        if (options.token) {
          const urlObj = new URL(url);
          urlObj.searchParams.set("token", options.token);
          url = urlObj.toString();
        }
        return new ws(url, protocol);
      };
    }
    await this.loadSessions(flow);
  }

  // An authentication failure backs up one step so the credentials can be
  // corrected and retried; every other failure abandons the flow with a
  // notification that explains it.
  handleAuthFailure(status, flow = this._flow) {
    if (!this._isCurrentFlow(flow)) return;
    lumine.notifications.addError("Authentication failed", {
      detail: `Server returned ${status || "Forbidden"}. Check your credentials and try again.`,
      dismissable: true,
    });
    if (!lumine.workspace.popModal()) {
      this.sessionListHost.cancel();
    }
  }

  async loadSessions(flow = this._flow) {
    if (!this._isCurrentFlow(flow)) return;
    const gatewayOptions = flow.gatewayOptions;
    await this.sessionList.setItems([]);
    await this.sessionList.setLoadingState({ message: "Loading sessions…" });
    if (!this._isCurrentFlow(flow)) return;
    this.sessionListHost.show({ crumb: flow.gatewayName });

    try {
      await this.checkGatewayReachable(gatewayOptions);
    } catch (error) {
      if (!this._isCurrentFlow(flow)) return;
      this.showGatewayConnectionError(error, gatewayOptions);
      this.sessionListHost.cancel();
      return;
    }

    const serverSettings = ServerConnection.makeSettings(gatewayOptions);
    let specModels;

    try {
      specModels = await this.fetchSpecs(serverSettings);
    } catch (error) {
      if (!this._isCurrentFlow(flow)) return;
      const errorMessage = error.message || error.xhr?.responseText || "";
      const status = error.response?.status || error.xhr?.status;
      if (status === 403 || status === 401 || errorMessage.includes("Forbidden")) {
        this.handleAuthFailure(status, flow);
      } else {
        this.showGatewayConnectionError(error, gatewayOptions);
        this.sessionListHost.cancel();
      }
      return;
    }
    if (!this._isCurrentFlow(flow)) return;

    const kernelSpecs = Object.values(specModels.kernelspecs)
      .filter(Boolean)
      .filter((spec) => flow.kernelSpecFilter(spec));

    if (kernelSpecs.length === 0) {
      this.sessionListHost.cancel();
      lumine.notifications.addError(
        "There are no kernels that match the grammar of the currently open file.",
      );
      return;
    }

    const kernelNames = kernelSpecs.map((specModel) => specModel.name);

    let sessionModels;
    try {
      sessionModels = await this.fetchSessions(serverSettings);
    } catch (error) {
      if (!this._isCurrentFlow(flow)) return;
      const status = error.response?.status || error.xhr?.status;
      if (status === 403 || status === 401) {
        this.handleAuthFailure(status, flow);
      } else {
        this.showGatewayConnectionError(error, gatewayOptions);
        this.sessionListHost.cancel();
      }
      return;
    }
    if (!this._isCurrentFlow(flow)) return;

    sessionModels = sessionModels.filter((model) => {
      const name = model.kernel ? model.kernel.name : null;
      return name ? kernelNames.includes(name) : true;
    });

    const items = sessionModels.map((model) => {
      const name = model.path
        ? tildify(model.path)
        : model.notebook?.path
          ? tildify(model.notebook.path)
          : `Session ${model.id}`;

      return {
        id: `session:${model.id}`,
        name,
        model,
        options: serverSettings,
        _jupyterFlow: flow,
      };
    });

    items.unshift({
      id: "new-session",
      name: "[new session]",
      model: null,
      options: serverSettings,
      kernelSpecs,
      _jupyterFlow: flow,
    });

    // The fetches were slow enough for the user to have left the flow.
    if (!this._isCurrentFlow(flow) || !this.sessionListHost.isVisible()) return;
    await this.sessionList.setItems(items);
    await this.sessionList.clearLoadingState();
  }

  // Thin wrappers so the network edge stays in one spyable place.
  fetchSpecs(serverSettings) {
    return KernelSpecAPI.getSpecs(serverSettings);
  }

  fetchSessions(serverSettings) {
    return SessionAPI.listRunning(serverSettings);
  }

  showGatewayConnectionError(error, gatewayOptions) {
    const errorMessage = error.message || error.xhr?.responseText || String(error);
    const networkErrors = [
      "Failed to fetch",
      "ETIMEDOUT",
      "ECONNREFUSED",
      "ECONNRESET",
      "Connection timed out",
    ];
    const isNetworkError = networkErrors.some((message) => errorMessage.includes(message));

    if (isNetworkError) {
      lumine.notifications.addError("Gateway server is not reachable", {
        description:
          "Check that the Jupyter server is running and that the gateway baseUrl, port, and protocol are correct.",
        detail: `Gateway: ${gatewayOptions.baseUrl}\nError: ${errorMessage}`,
        dismissable: true,
      });
      return;
    }

    lumine.notifications.addError("Connection to gateway failed", {
      description: "Jupyter could not load kernel specs from the selected gateway.",
      detail: `Gateway: ${gatewayOptions.baseUrl}\nError: ${errorMessage}`,
      dismissable: true,
    });
  }

  checkGatewayReachable(gatewayOptions) {
    return new Promise((resolve, reject) => {
      let requestUrl;
      try {
        requestUrl = new URL("api/kernelspecs", gatewayOptions.baseUrl.replace(/\/?$/, "/"));
      } catch (error) {
        reject(error);
        return;
      }

      const requestLibrary = requestUrl.protocol === "https:" ? https : http;
      const request = requestLibrary.get(requestUrl, (response) => {
        response.resume();
        resolve();
      });

      request.on("error", reject);
      request.setTimeout(5000, () => {
        request.destroy(new Error(`Connection timed out: ${requestUrl.toString()}`));
      });
    });
  }

  async connectToSession(sessionInfo) {
    const flow = this._flowFor(sessionInfo);
    if (!this._isCurrentFlow(flow)) return;
    flow.committing = true;
    const kernelManager = new KernelManager({
      serverSettings: sessionInfo.options,
    });
    const sessionManager = new SessionManager({
      serverSettings: sessionInfo.options,
      kernelManager,
    });

    let session = null;
    let handedOff = false;
    try {
      const model = await sessionInfo.model;
      await sessionManager.refreshRunning();
      if (!this._isCurrentFlow(flow)) return;
      session = sessionManager.connectTo({
        serverSettings: sessionInfo.options,
        model,
        // Stated rather than inherited. The default is "handle comms unless
        // another connection on this manager already does", and a fresh manager
        // per connection is the only reason that lands on true today — widgets
        // would stop working the moment that stopped being accidental.
        kernelConnectionOptions: { handleComms: true },
      });
      handedOff = true;
      await this.onSessionChosen(session, { sessionManager, kernelManager }, flow, false);
    } finally {
      if (!handedOff) {
        try {
          await this._disposeSession(session, { sessionManager, kernelManager }, false);
        } finally {
          this._invalidateFlow(flow);
        }
      }
    }
  }

  async showSpecList(sessionInfo) {
    const flow = this._flowFor(sessionInfo);
    if (!this._isCurrentFlow(flow)) return;
    const items = sessionInfo.kernelSpecs.map((spec) => ({
      id: `kernel-spec:${spec.name}`,
      name: spec.display_name,
      options: {
        serverSettings: sessionInfo.options,
        kernelName: spec.name,
        path: flow.path,
      },
      _jupyterFlow: flow,
    }));

    await this.specList.setItems(items);
    if (!this._isCurrentFlow(flow)) return;
    await this.specListHost.show({ crumb: "New session" });
  }

  async startSession(sessionInfo) {
    const flow = this._flowFor(sessionInfo);
    if (!this._isCurrentFlow(flow)) return;
    flow.committing = true;
    const kernelManager = new KernelManager({
      serverSettings: sessionInfo.options.serverSettings,
    });
    const sessionManager = new SessionManager({
      serverSettings: sessionInfo.options.serverSettings,
      kernelManager,
    });

    let session = null;
    let model = null;
    let handedOff = false;
    try {
      model = await SessionAPI.startSession(
        {
          ...sessionInfo.options,
          type: "notebook",
          name: "none",
          kernel: {
            name: sessionInfo.options.kernelName,
          },
          path: sessionInfo.options.path,
        },
        sessionInfo.options.serverSettings,
      );

      await sessionManager.refreshRunning();
      if (!this._isCurrentFlow(flow)) return;
      session = sessionManager.connectTo({
        model,
        // See connectToSession: the comm-handling default is positional, not a
        // guarantee.
        kernelConnectionOptions: { handleComms: true },
      });
      handedOff = true;
      await this.onSessionChosen(session, { sessionManager, kernelManager }, flow, true);
    } finally {
      if (!handedOff) {
        if (!session && model?.id) {
          try {
            await SessionAPI.shutdownSession(model.id, sessionInfo.options.serverSettings);
          } catch {
            // Manager disposal below must still run against a lost gateway.
          }
        }
        try {
          await this._disposeSession(session, { sessionManager, kernelManager }, Boolean(session));
        } finally {
          this._invalidateFlow(flow);
        }
      }
    }
  }

  async _disposeSession(session, managers = {}, ownsKernelProcess = false) {
    if (ownsKernelProcess && session) {
      try {
        if (typeof session.shutdown === "function") {
          await session.shutdown();
        } else {
          await session.kernel?.shutdown?.();
        }
      } catch {
        // Disposal below is mandatory even when the remote server is gone.
      }
    }
    try {
      session?.dispose?.();
    } finally {
      managers.sessionManager?.dispose?.();
      managers.kernelManager?.dispose?.();
    }
  }

  async onSessionChosen(session, managers = {}, flow = this._flow, ownsKernelProcess = false) {
    let handedOff = false;
    const contextWasDestroyed = () => {
      const context = flow.context;
      return context?.adapter
        ? Boolean(context.owner?.isDestroyed?.())
        : Boolean(context?.editor?.isDestroyed?.());
    };
    try {
      await session.kernel.ready;
      if (!this._isCurrentFlow(flow) || contextWasDestroyed()) return false;
      const kernelSpec = await session.kernel.spec;
      if (!kernelSpec) throw new Error("The remote kernel did not provide a kernelspec.");
      if (!this._isCurrentFlow(flow) || contextWasDestroyed()) return false;
      let languageInfo = null;
      let kernelInfoTimer = null;
      try {
        const reply = await Promise.race([
          session.kernel.requestKernelInfo(),
          new Promise((resolve) => {
            kernelInfoTimer = setTimeout(() => resolve(null), KERNEL_INFO_TIMEOUT_MS);
          }),
        ]);
        languageInfo = reply?.content?.language_info || null;
      } catch {
        // The kernelspec is still a valid fallback. A gateway that does not
        // answer this optional refresh must not strand an otherwise ready session.
      } finally {
        clearTimeout(kernelInfoTimer);
      }
      if (!this._isCurrentFlow(flow) || contextWasDestroyed()) return false;

      const effectiveKernelSpec = {
        ...kernelSpec,
        language: languageInfo?.name || kernelSpec.language,
      };
      const grammar =
        flow.context?.adapter?.getKernelGrammar(effectiveKernelSpec) || flow.context?.grammar;
      if (!grammar) throw new Error("The current file has no language grammar.");

      const kernel = new WSKernel(
        flow.gatewayName,
        kernelSpec,
        grammar,
        session,
        managers,
        languageInfo,
        ownsKernelProcess,
      );
      await this._onChosen(kernel, flow.context);
      handedOff = true;
      this._invalidateFlow(flow);
      return true;
    } finally {
      if (!handedOff) {
        await this._disposeSession(session, managers, ownsKernelProcess);
        this._invalidateFlow(flow);
      }
    }
  }

  destroy() {
    this._invalidateFlow(this._flow);
    for (const subscription of this._flowSubscriptions) subscription.dispose();
    this.gatewayListHost.destroy();
    this.authListHost.destroy();
    this.credentialDialogHost.destroy();
    this.sessionListHost.destroy();
    this.specListHost.destroy();
  }
}

module.exports = WSKernelPicker;
