const { randomUUID } = require("crypto");

const ELEMENT_SELECTOR = ".structured-traceback .traceback-location";
const targets = new WeakMap();
const generation = randomUUID();
let revision = 0;

/** Register an actual rendered span, never a filename parsed from DOM text. */
function registerTarget(element, resolve, { isCurrent } = {}) {
  if (!element || element.nodeType !== 1 || typeof resolve !== "function") {
    throw new TypeError("A traceback target needs an element and a resolver.");
  }
  const registration = { resolve, isCurrent, revision: `${generation}:${++revision}` };
  targets.set(element, registration);
  element.setAttribute("data-hyperclick-revision", registration.revision);
  return {
    dispose() {
      if (targets.get(element) !== registration) return;
      targets.delete(element);
      if (element.getAttribute("data-hyperclick-revision") === registration.revision) {
        element.removeAttribute("data-hyperclick-revision");
      }
    },
  };
}

function getSuggestionForElement(element, { signal, isCurrent: providerCurrent } = {}) {
  const registration = targets.get(element);
  if (!registration || !element.matches?.(ELEMENT_SELECTOR)) return null;
  const eligible = () =>
    !signal?.aborted &&
    element.isConnected &&
    element.matches(ELEMENT_SELECTOR) &&
    targets.get(element) === registration &&
    (!registration.isCurrent || registration.isCurrent()) &&
    (!providerCurrent || providerCurrent());
  const resolve = () => {
    try {
      if (!eligible()) return null;
      const link = registration.resolve();
      if (!link || typeof link.open !== "function" || (link.isCurrent && !link.isCurrent()))
        return null;
      return eligible() ? link : null;
    } catch {
      return null;
    }
  };
  if (!resolve()) return null;
  return {
    element,
    isCurrent: () => Boolean(resolve()),
    async callback() {
      // The target may have changed since hover, even with identical span text.
      // Resolve the current verified destination only after checking identity.
      const link = resolve();
      if (!link) return;
      try {
        return await link.open();
      } catch (error) {
        lumine.notifications.addWarning("Cannot open traceback source", { detail: error.message });
      }
    },
  };
}

module.exports = { ELEMENT_SELECTOR, registerTarget, getSuggestionForElement };
