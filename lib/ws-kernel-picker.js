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

    const listItem = (item, { filterKey, highlight }) => {
      const element = document.createElement("li");
      element.appendChild(highlight(filterKey));
      return element;
    };

    this.gatewayList = lumine.workspace.buildSelectList({
      className: "jupyter-repl ws-kernel-picker",
      crumb: "Gateways",
      items: [],
      emptyMessage: "No gateways available",
      infoMessage: "Select a gateway",
      filterKeyForItem: (item) => item.name,
      elementForItem: listItem,
      didConfirmSelection: (item) => this.onGateway(item),
      didCancelSelection: () => this.gatewayList.hide(),
    });

    this.authList = lumine.workspace.buildSelectList({
      className: "jupyter-repl ws-kernel-picker",
      items: AUTH_METHODS,
      filterKeyForItem: (item) => item.name,
      elementForItem: listItem,
      didConfirmSelection: (item) => this.onAuthMethod(item.action),
      didCancelSelection: () => this.authList.hide(),
    });

    this.credentialDialog = lumine.workspace.buildInputDialog({
      className: "jupyter-repl ws-kernel-picker",
      didConfirm: (value) => this.onCredential(value),
      didCancel: () => this.credentialDialog.hide(),
    });
    // Password mode: only show dots when there's actual text.
    const queryEditor = this.credentialDialog.getQueryEditor();
    queryEditor.onDidChange(() => {
      const hasText = queryEditor.getText().length > 0;
      queryEditor.element.style.webkitTextSecurity = hasText ? "disc" : "none";
    });

    this.sessionList = lumine.workspace.buildSelectList({
      className: "jupyter-repl ws-kernel-picker",
      items: [],
      emptyMessage: "No sessions available",
      filterKeyForItem: (item) => item.name,
      elementForItem: listItem,
      didConfirmSelection: (item) =>
        item.model ? this.connectToSession(item) : this.showSpecList(item),
      didCancelSelection: () => this.sessionList.hide(),
    });

    this.specList = lumine.workspace.buildSelectList({
      className: "jupyter-repl ws-kernel-picker",
      items: [],
      emptyMessage: "No kernel specs available",
      infoMessage: "Select a kernel spec",
      filterKeyForItem: (item) => item.name,
      elementForItem: listItem,
      didConfirmSelection: (item) => this.startSession(item),
      didCancelSelection: () => this.specList.hide(),
    });
  }

  async toggle(_kernelSpecFilter) {
    this._kernelSpecFilter = _kernelSpecFilter;
    const gateways = Config.getJson("gateways") || [];

    if (!gateways.length) {
      lumine.notifications.addError("No remote kernel gateways available", {
        description:
          "Use Jupyter: Open Gateways Config to edit gateways.json. Jupyter can use remote kernels on either a Jupyter Kernel Gateway or Jupyter notebook server.",
      });
      return;
    }

    // Use only filename for Jupyter API (requires relative path, not absolute)
    const fileName = store.filePath ? path.basename(store.filePath) : "unsaved";
    this._path = `${fileName}-${uuidv4()}`;
    await this.gatewayList.update({ items: gateways });
    this.gatewayList.show();
  }

  async onGateway(gatewayInfo) {
    this._gatewayName = gatewayInfo.name;
    // Spread gateway config first; auth steps and factories build on a copy.
    this._gatewayOptions = { ...gatewayInfo.options };

    if (!this._gatewayOptions.token) {
      await this.showAuthList();
      return;
    }
    await this.finishAuth();
  }

  async showAuthList() {
    await this.authList.update({
      infoMessage: `Authenticate with ${this._gatewayName}`,
    });
    this.authList.show({ crumb: "Authentication" });
  }

  async onAuthMethod(action) {
    if (action === "none") {
      await this.finishAuth();
      return;
    }
    this._credentialKind = action;
    const label = action === "token" ? "Token" : "Cookie";
    await this.credentialDialog.update({
      infoMessage: `${label} for ${this._gatewayName}`,
      status: null,
      placeholderText: label,
    });
    this.credentialDialog.show({ crumb: label });
  }

  async onCredential(value) {
    if (!value) {
      await this.credentialDialog.update({
        status: { type: "error", message: `Enter a ${this._credentialKind}.` },
      });
      return;
    }

    const options = this._gatewayOptions;
    if (this._credentialKind === "token") {
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
    await this.finishAuth();
  }

  // Set default factories only if not already configured (e.g. by cookie auth)
  async finishAuth() {
    const options = this._gatewayOptions;
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
    await this.loadSessions();
  }

  // An authentication failure backs up one step so the credentials can be
  // corrected and retried; every other failure abandons the flow with a
  // notification that explains it.
  handleAuthFailure(status) {
    lumine.notifications.addError("Authentication failed", {
      detail: `Server returned ${status || "Forbidden"}. Check your credentials and try again.`,
      dismissable: true,
    });
    if (!lumine.workspace.popModal()) {
      this.sessionList.hide();
    }
  }

  async loadSessions() {
    const gatewayOptions = this._gatewayOptions;
    await this.sessionList.update({
      items: [],
      loadingMessage: "Loading sessions…",
    });
    this.sessionList.show({ crumb: this._gatewayName });

    try {
      await this.checkGatewayReachable(gatewayOptions);
    } catch (error) {
      this.showGatewayConnectionError(error, gatewayOptions);
      this.sessionList.hide();
      return;
    }

    const serverSettings = ServerConnection.makeSettings(gatewayOptions);
    let specModels;

    try {
      specModels = await this.fetchSpecs(serverSettings);
    } catch (error) {
      const errorMessage = error.message || error.xhr?.responseText || "";
      const status = error.response?.status || error.xhr?.status;
      if (status === 403 || status === 401 || errorMessage.includes("Forbidden")) {
        this.handleAuthFailure(status);
      } else {
        this.showGatewayConnectionError(error, gatewayOptions);
        this.sessionList.hide();
      }
      return;
    }

    const kernelSpecs = Object.values(specModels.kernelspecs).filter((spec) =>
      this._kernelSpecFilter(spec),
    );

    if (kernelSpecs.length === 0) {
      this.sessionList.hide();
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
      const status = error.response?.status || error.xhr?.status;
      if (status === 403 || status === 401) {
        this.handleAuthFailure(status);
      } else {
        this.showGatewayConnectionError(error, gatewayOptions);
        this.sessionList.hide();
      }
      return;
    }

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
        name,
        model,
        options: serverSettings,
      };
    });

    items.unshift({
      name: "[new session]",
      model: null,
      options: serverSettings,
      kernelSpecs,
    });

    // The fetches were slow enough for the user to have left the flow.
    if (!this.sessionList.isVisible()) return;
    await this.sessionList.update({
      items,
      loadingMessage: null,
    });
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
    const kernelManager = new KernelManager({
      serverSettings: sessionInfo.options,
    });
    const sessionManager = new SessionManager({
      serverSettings: sessionInfo.options,
      kernelManager,
    });

    const model = await sessionInfo.model;
    await sessionManager.refreshRunning();
    const session = sessionManager.connectTo({
      serverSettings: sessionInfo.options,
      model,
      // Stated rather than inherited. The default is "handle comms unless
      // another connection on this manager already does", and a fresh manager
      // per connection is the only reason that lands on true today — widgets
      // would stop working the moment that stopped being accidental.
      kernelConnectionOptions: { handleComms: true },
    });

    this.onSessionChosen(session, { sessionManager, kernelManager });
  }

  async showSpecList(sessionInfo) {
    const items = sessionInfo.kernelSpecs.map((spec) => ({
      name: spec.display_name,
      options: {
        serverSettings: sessionInfo.options,
        kernelName: spec.name,
        path: this._path,
      },
    }));

    await this.specList.update({ items });
    this.specList.show({ crumb: "New session" });
  }

  async startSession(sessionInfo) {
    const kernelManager = new KernelManager({
      serverSettings: sessionInfo.options.serverSettings,
    });
    const sessionManager = new SessionManager({
      serverSettings: sessionInfo.options.serverSettings,
      kernelManager,
    });

    const model = await SessionAPI.startSession(
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
    const session = sessionManager.connectTo({
      model,
      // See connectToSession: the comm-handling default is positional, not a
      // guarantee.
      kernelConnectionOptions: { handleComms: true },
    });

    this.onSessionChosen(session, { sessionManager, kernelManager });
  }

  hide() {
    this.gatewayList.hide();
    this.authList.hide();
    this.credentialDialog.hide();
    this.sessionList.hide();
    this.specList.hide();
  }

  async onSessionChosen(session, managers = {}) {
    // Choosing a session completes the flow.
    this.hide();
    await session.kernel.ready;
    const kernelSpec = await session.kernel.spec;
    if (!store.grammar) return;

    const kernel = new WSKernel(this._gatewayName, kernelSpec, store.grammar, session, managers);
    this._onChosen(kernel);
  }

  destroy() {
    this.gatewayList.destroy();
    this.authList.destroy();
    this.credentialDialog.destroy();
    this.sessionList.destroy();
    this.specList.destroy();
  }
}

module.exports = WSKernelPicker;
