// The ipywidgets manager, and the only module that loads the widget stack.
//
// Nothing here may be reached by a top-level require from main.js or
// output-service.js: spec/manifest-services-spec.js walks that graph and fails
// on a column-0 require of this file, because the bundle below is most of a
// megabyte and a window that never opens a kernel should never parse it. The
// two entry points — `managerFor` and `staticManagerFor` — are called from
// inside a function body, and the registry the renderer consults is a separate,
// dependency-free module for the same reason.

const {
  managerForHost,
  registerHost,
  claimModel,
  releaseModel,
  releaseModelsOf,
} = require("./widget-registry");
const { log } = require("./utils");

// See script/build-widgets.js: these three publish ESM that only a bundler can
// resolve, so they are pre-bundled rather than required from node_modules.
const { base, baseManager, controls, matplotlib } = require("./vendor/jupyter-widgets");
const { createOutputModule, OUTPUT_MODULE } = require("./widget-output");
const { createAnywidgetModule, ANYWIDGET_MODULE } = require("./anywidget");
const { ensureWidgetStyles } = require("./components/result-view/widget-styles");

const WIDGET_TARGET = "jupyter.widget";
const WIDGET_CONTROL_TARGET = "jupyter.widget.control";
const VIEW_MIME = "application/vnd.jupyter.widget-view+json";
const STATE_MIME = "application/vnd.jupyter.widget-state+json";
const STATE_VERSION_MAJOR = 2;

// Bundled classes run in the parent. anywidget's front-end module runs only in
// an opaque-origin iframe, using the narrow trait/comm bridge in anywidget.js.
// Other third-party widget modules still fail visibly rather than fetching
// arbitrary code into the renderer with Node access.
const WIDGET_MODULES = {
  "@jupyter-widgets/base": base,
  "@jupyter-widgets/controls": controls,
  // Implemented here rather than taken from @jupyter-widgets/output, whose view
  // renders through JupyterLab's rendermime registry. See lib/widget-output.js.
  [OUTPUT_MODULE]: createOutputModule(base),
  [ANYWIDGET_MODULE]: createAnywidgetModule(base),
  "jupyter-matplotlib": matplotlib,
};

const SUPPORTED_MODULES = Object.keys(WIDGET_MODULES).join(", ");

class LumineWidgetManager extends baseManager.ManagerBase {
  /**
   * @param {Object} options
   * @param {String} options.hostId - A kernel id, or a document uri.
   * @param {Object} [options.transport] - Null for a restored document, which
   *   has models but no kernel to change them through.
   */
  constructor({ hostId, transport = null }) {
    super();
    this.hostId = hostId;
    this._modelGeneration = 0;
    this._cleanup = Promise.resolve();
    this._disconnected = false;
    this._transportRef = transport ? new WeakRef(transport) : null;
    registerHost(hostId, this);
    // Here rather than at render time, where the renderer also asks for it: the
    // first call reads four stylesheets off disk, rewrites them and installs a
    // sheet the whole document restyles against, and the render-time call
    // happens inside an animation frame, which that reliably overruns. A
    // manager exists because a comm opened, which is always before the
    // display_data that draws the widget — and the call is idempotent, so the
    // one on the render path becomes free rather than going away.
    ensureWidgetStyles();

    // The manager watches the connection itself, so nothing in the kernel
    // facade has to know widgets exist. One subscription, disposed with the
    // transport's emitter.
    this._resetSubscription = transport?.onDidResetComms?.((reason) => {
      log("widgets: dropping every model:", reason);
      this.clear_state(true);
    });
  }

  /** The live transport, or null once it is gone or was never there. */
  _transport() {
    return this._transportRef?.deref() ?? null;
  }

  /**
   * Whether this manager can still change anything. False for a document
   * restored from saved state: its models exist and render, but a WidgetModel
   * with no comm is read-only by construction, and a slider that looks
   * draggable and silently ignores the drag is worse than one that says so.
   */
  get isLive() {
    return Boolean(this._transport());
  }

  /**
   * Resolve a widget class from the bundled modules. `moduleVersion` is a
   * semver range the kernel asked for; a mismatch is logged rather than
   * enforced, since failing a widget over a kernel-side minor bump is worse
   * than rendering it, and matching would cost a semver dependency to prevent
   * nothing.
   */
  async loadClass(className, moduleName, moduleVersion) {
    const module = WIDGET_MODULES[moduleName];
    if (!module) {
      throw new Error(
        `The widget module "${moduleName}" is not bundled with jupyter-repl. ` +
          `Only ${SUPPORTED_MODULES} are available.`,
      );
    }
    const widgetClass = module[className];
    if (!widgetClass) {
      throw new Error(`"${className}" is not exported by ${moduleName}.`);
    }
    if (moduleVersion && !_versionLooksCompatible(moduleName, moduleVersion)) {
      log(`widgets: ${moduleName} wants ${moduleVersion}; using the bundled copy`);
    }
    return widgetClass;
  }

  async _create_comm(targetName, modelId, data, metadata, buffers) {
    const transport = this._transport();
    if (!transport) {
      // A restored document. ManagerBase never reaches here through set_state,
      // so this is a front-end-initiated widget, which a static document
      // cannot honour.
      throw new Error("This widget has no kernel, so it cannot be changed.");
    }
    const comm = transport.createComm(targetName, modelId);
    if (data !== undefined) {
      comm.open(data, undefined, metadata, buffers);
    }
    return comm;
  }

  async _get_comm_info() {
    const generation = this._modelGeneration;
    const transport = this._transport();
    if (!transport) {
      return {};
    }
    try {
      const comms = await transport.requestCommInfo(WIDGET_TARGET);
      return generation === this._modelGeneration && !this._disconnected ? comms : {};
    } catch (error) {
      log("widgets: comm_info failed:", error);
      return {};
    }
  }

  /**
   * Handle a comm the kernel opened.
   *
   * The model id is claimed before anything is awaited. `handle_comm_open` is
   * async — it waits for the widget class — but the display_data carrying the
   * view can be the very next message on the same iopub stream, and the
   * renderer resolves through the registry. The claim therefore has to be true
   * by then, not merely on its way.
   */
  handleCommOpen(comm, message) {
    const generation = this._modelGeneration;
    const modelId = message?.content?.comm_id;
    if (modelId) {
      claimModel(modelId, this);
    }
    return Promise.resolve(this.handle_comm_open(comm, message)).catch((error) => {
      if (modelId && generation === this._modelGeneration) {
        releaseModel(modelId);
      }
      log("widgets: comm_open failed:", error);
    });
  }

  /**
   * The control comm carries bulk state requests rather than one model, so
   * there is nothing to claim; ipywidgets registers its own handlers on it.
   */
  handleControlCommOpen(comm, message) {
    return Promise.resolve(this.handle_comm_open(comm, message)).catch((error) => {
      log("widgets: control comm_open failed:", error);
    });
  }

  /**
   * Adopt whatever the kernel already has open. This is what makes a kernel
   * attached through connect-to-existing-kernel, or one that outlived a window
   * reload, show its widgets instead of dead placeholders.
   */
  async adoptExistingComms() {
    const generation = this._modelGeneration;
    const transport = this._transport();
    if (!transport) {
      return;
    }
    const comms = await this._get_comm_info();
    if (generation !== this._modelGeneration || this._disconnected) return;
    for (const commId of Object.keys(comms)) {
      if (this.has_model(commId) || transport.getComm(commId)) {
        continue;
      }
      try {
        const comm = transport.createComm(WIDGET_TARGET, commId);
        claimModel(commId, this);
        // No comm_open: the comm already exists kernel-side. Asking for the
        // state is what fills the model in.
        comm.send({ method: "request_state" });
      } catch (error) {
        releaseModel(commId);
        log("widgets: could not adopt comm", commId, error);
      }
    }
  }

  // ManagerBase registers before awaiting its model class. Keep each close
  // listener with the table that owned that promise, so an old comm closing
  // after reset cannot remove a new model that reused its id.
  register_model(modelId, modelPromise) {
    const models = this._models;
    models[modelId] = modelPromise;
    modelPromise
      .then((model) => {
        model.once("comm:close", () => {
          if (models[modelId] === modelPromise) delete models[modelId];
        });
      })
      .catch((error) => log("widgets: model registration failed:", error));
  }

  async new_model(options, state) {
    if (this._disconnected || options.comm?._closed) {
      throw new Error("The widget's kernel session changed before its model was created.");
    }
    const generation = this._modelGeneration;
    const model = await super.new_model(options, state);
    // A class or child-state deserializer can finish after clear_state. Its
    // model belongs to the detached table and must never adopt live resources.
    if (generation !== this._modelGeneration || this._disconnected) {
      model.comm_live = false;
      await model.close(true);
    }
    return model;
  }

  clear_state(commClosed = false) {
    this._modelGeneration++;
    releaseModelsOf(this);
    const models = this._models;
    this._models = Object.create(null);
    // The upstream clear_state waits first and then replaces this._models,
    // which erases comms opened by the replacement process during that wait.
    // Detach synchronously and await only the snapshot's models and views.
    const closing = Object.values(models).map(async (pending) => {
      const model = await pending;
      // Disconnecting or resetting only releases this window's resources.
      // The shared kernel's comm must not receive a close from local teardown.
      if (commClosed) model.comm_live = false;
      await model.close(commClosed);
    });
    this._cleanup = Promise.allSettled([this._cleanup, ...closing]).then((results) => {
      for (const result of results) {
        if (result.status === "rejected") log("widgets: model cleanup failed:", result.reason);
      }
    });
    return this._cleanup;
  }

  disconnect() {
    if (this._disconnected) return this._cleanup;
    this._disconnected = true;
    this._transportRef = null;
    this._resetSubscription?.dispose();
    this._resetSubscription = null;
    return this.clear_state(true);
  }
}

// One manager per kernel, like the kernel's own output store. It lives on the
// facade rather than the transport because a widget model is session state: a
// ZMQ restart keeps the same transport object across a process swap, and the
// facade is what the store holds and what a second editor is handed.
const managersByKernel = new WeakMap();

/**
 * The widget manager for a kernel, built on first use.
 * @param {Object} kernel - The Kernel facade.
 * @returns {LumineWidgetManager}
 */
function managerFor(kernel) {
  const { getInternalKernel, isSession } = require("./plugin-api/jupyter-kernel");
  const internal = getInternalKernel(kernel);
  if (isSession(kernel) && !internal) return null;
  kernel = internal || kernel;
  let manager = managersByKernel.get(kernel);
  if (!manager) {
    manager = new LumineWidgetManager({ hostId: kernel.id, transport: kernel.transport });
    managersByKernel.set(kernel, manager);
    // Fire and forget: a kernel with nothing open answers with nothing, and a
    // failure here must not stop the comm that triggered this from opening.
    manager.adoptExistingComms().catch((error) => log("widgets: adoption failed:", error));
  }
  return manager;
}

/**
 * A manager over saved state, with no kernel behind it — the seam notebook
 * restore hangs off. ManagerBase.set_state creates models with no comm, and a
 * WidgetModel with no comm is read-only by construction, so nothing else is
 * needed to make a stored document render.
 *
 * A restored document that later gets a kernel discards this manager rather
 * than rebinding it: ipywidgets has no rebinding path, and the live kernel's
 * own comm_info adoption builds the models properly.
 *
 * @param {String} hostId - The document's uri, prefixed so it cannot collide
 *   with a kernel id.
 * @param {Object} widgetState - The `state` object from a notebook's
 *   application/vnd.jupyter.widget-state+json metadata.
 * @returns {Promise<LumineWidgetManager>}
 */
async function staticManagerFor(hostId, widgetState) {
  const existing = managerForHost(hostId);
  if (existing) {
    return existing;
  }
  const manager = new LumineWidgetManager({ hostId, transport: null });
  const models = await manager.set_state(widgetState);
  for (const model of models) {
    claimModel(model.model_id, manager);
  }
  return manager;
}

/**
 * Pull widget state out of a notebook's metadata, in the shape set_state wants.
 * @param {Object} notebook
 * @returns {Object|null}
 */
function widgetStateOfNotebook(notebook) {
  const state = notebook?.metadata?.widgets?.[STATE_MIME];
  if (!state || typeof state !== "object" || !state.state) {
    return null;
  }
  if (state.version_major !== STATE_VERSION_MAJOR) {
    log("widgets: unsupported saved state version", state.version_major);
    return null;
  }
  return state;
}

/** Whether a bundled module's version satisfies the range the kernel named. */
function _versionLooksCompatible(moduleName, range) {
  // Only the major is compared, and only well enough to log. See loadClass.
  const bundled = _bundledMajor(moduleName);
  const wanted = String(range).match(/(\d+)/);
  return bundled == null || !wanted || Number(wanted[1]) === bundled;
}

function _bundledMajor(moduleName) {
  const module = WIDGET_MODULES[moduleName];
  const version = module?.JUPYTER_WIDGETS_VERSION || module?.version;
  const match = version && String(version).match(/^(\d+)/);
  return match ? Number(match[1]) : null;
}

module.exports = {
  LumineWidgetManager,
  managerFor,
  staticManagerFor,
  widgetStateOfNotebook,
  WIDGET_TARGET,
  WIDGET_CONTROL_TARGET,
  VIEW_MIME,
  STATE_MIME,
};
