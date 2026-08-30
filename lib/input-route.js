"use strict";

/**
 * Kernel input is asynchronous, so its eventual modal cannot infer a useful
 * destination from whatever happens to be focused when stdin arrives. Every
 * execution captures one explicit route before it is sent to the kernel:
 *
 * - an owner route follows a workspace pane item through detach/attach;
 * - a surface route remains in the native window that initiated ownerless
 *   plugin or adapter work.
 */

function workspace() {
  const workspace = globalThis.lumine?.workspace;
  if (!workspace) throw new Error("A live Lumine workspace is required for kernel input");
  return workspace;
}

function assertLiveSurface(surface) {
  const currentWorkspace = workspace();
  if (!surface || typeof surface !== "object") {
    throw new TypeError("An input surface route requires a window surface");
  }
  if (currentWorkspace.getWindowSurface(surface) !== surface) {
    throw new TypeError("An input surface must be registered with this workspace");
  }
  if (surface.isDestroyed?.() || !surface.document?.defaultView || surface.window?.closed) {
    throw new Error("Cannot route kernel input to a destroyed window surface");
  }
  return surface;
}

function validateInputRoute(route) {
  if (!route || typeof route !== "object" || Array.isArray(route)) {
    throw new TypeError("Kernel input requires an explicit route object");
  }

  const keys = Object.keys(route);
  if (keys.length !== 1 || (keys[0] !== "owner" && keys[0] !== "surface")) {
    throw new TypeError("An input route must contain exactly one of owner or surface");
  }

  const currentWorkspace = workspace();
  if (keys[0] === "owner") {
    const owner = route.owner;
    if (!owner || !currentWorkspace.paneForItem(owner)) {
      throw new TypeError("An input owner must be a workspace pane item");
    }
    assertLiveSurface(currentWorkspace.getWindowSurface(owner));
    return Object.freeze({ owner });
  }

  return Object.freeze({ surface: assertLiveSurface(route.surface) });
}

function surfaceForInputRoute(route) {
  const normalized = validateInputRoute(route);
  return normalized.owner
    ? assertLiveSurface(workspace().getWindowSurface(normalized.owner))
    : normalized.surface;
}

function activeSurfaceInputRoute() {
  return validateInputRoute({ surface: workspace().getActiveWindowSurface() });
}

function ownerOrActiveSurfaceInputRoute(owner) {
  return owner == null ? activeSurfaceInputRoute() : validateInputRoute({ owner });
}

function activePaneInputRoute() {
  const currentWorkspace = workspace();
  return ownerOrActiveSurfaceInputRoute(currentWorkspace.getActivePaneItem());
}

function editorInputRoute(editor) {
  return ownerOrActiveSurfaceInputRoute(workspace().getPaneItemForTextEditor(editor));
}

module.exports = {
  activePaneInputRoute,
  activeSurfaceInputRoute,
  editorInputRoute,
  ownerOrActiveSurfaceInputRoute,
  surfaceForInputRoute,
  validateInputRoute,
};
