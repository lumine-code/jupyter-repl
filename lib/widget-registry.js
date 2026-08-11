// Which widget manager owns a given model.
//
// A widget-view output names a model id and nothing else, and there is no path
// from an output back to the kernel that produced it: an OutputStore holds no
// kernel, `renderDisplay` takes only the output, and one kernel serves every
// editor mapped to it. A model id is a kernel-minted uuid, so it names its
// owner uniquely across every kernel, editor and restored document in the
// window — which makes an index the whole answer, and keeps the renderer's
// signature and the jupyter.output service surface unchanged.
//
// This module is deliberately tiny and dependency-free. It sits on the eager
// activation path so that the renderer can ask its question without loading the
// widget stack; the manager it hands back is what carries that weight.

// modelId -> manager. Claimed synchronously when a comm_open arrives, before
// the model itself exists — the open precedes the view-bearing display_data on
// the same iopub stream, so the claim has to be in place by the time the bundle
// renders.
const managersByModelId = new Map();

// hostId -> manager. A live kernel's id, or a restored document's uri. Nothing
// downstream can tell the two apart, which is the point.
const managersByHostId = new Map();

/**
 * The manager that owns — or is in the middle of creating — this model.
 * @param {String} modelId
 * @returns {Object|null}
 */
function managerForModelId(modelId) {
  return managersByModelId.get(modelId) ?? null;
}

/**
 * Claim a model id for a manager, before the model exists.
 * @param {String} modelId
 * @param {Object} manager
 */
function claimModel(modelId, manager) {
  managersByModelId.set(modelId, manager);
}

/**
 * Release a claim — the model was closed, or creating it failed.
 * @param {String} modelId
 */
function releaseModel(modelId) {
  managersByModelId.delete(modelId);
}

/** Release every claim held by a manager. */
function releaseModelsOf(manager) {
  for (const [modelId, owner] of managersByModelId) {
    if (owner === manager) {
      managersByModelId.delete(modelId);
    }
  }
}

function registerHost(hostId, manager) {
  managersByHostId.set(hostId, manager);
}

function managerForHost(hostId) {
  return managersByHostId.get(hostId) ?? null;
}

/**
 * Release a host and everything its manager holds — every model, every view,
 * and the DOM hanging off them.
 *
 * The manager comes out of the map rather than from `require`ing the widget
 * module, which is what lets a kernel be torn down without loading the widget
 * bundle to do it.
 */
function releaseHost(hostId) {
  const manager = managersByHostId.get(hostId);
  managersByHostId.delete(hostId);
  if (!manager) {
    return;
  }

  releaseModelsOf(manager);
  try {
    // Drops the models ipywidgets itself is holding, and the comm-reset
    // subscription. A manager that fails to come apart must not stop the
    // kernel from doing so.
    manager.disconnect?.();
  } catch (error) {
    console.error("[jupyter-repl] Error disconnecting a widget manager:", error);
  }
}

module.exports = {
  managerForModelId,
  claimModel,
  releaseModel,
  releaseModelsOf,
  registerHost,
  managerForHost,
  releaseHost,
};
