function documentFor(value) {
  if (value?.nodeType === 9) return value;
  if (value?.ownerDocument) return value.ownerDocument;
  if (value?.document?.nodeType === 9) return value.document;
  return globalThis.document;
}

function windowFor(value) {
  return documentFor(value)?.defaultView || globalThis.window;
}

function loadBundleFor(value, specifier, { global } = {}) {
  const domDocument = documentFor(value);
  const filename = require.resolve(specifier);
  if (!domDocument?.defaultView || domDocument === globalThis.document) {
    return Promise.resolve(require(filename));
  }
  if (!global) throw new TypeError("A secondary renderer bundle must declare its Window global");
  return lumine.dom.loadScript(domDocument, filename, { global });
}

module.exports = { documentFor, windowFor, loadBundleFor };
