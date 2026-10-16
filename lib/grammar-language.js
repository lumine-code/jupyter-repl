// User mappings precede the built-in dialect aliases. This helper reads only
// grammar metadata and a configuration object already parsed by its caller.
const aliases = Object.freeze({ ipython: "python" });
module.exports = function grammarLanguage(grammar, mappings = {}) {
  if (typeof grammar?.name !== "string") return null;
  const name = grammar.name.toLowerCase();
  const mapped = Object.keys(mappings).find((key) => mappings[key]?.toLowerCase?.() === name);
  return mapped ? mapped.toLowerCase() : aliases[name] || name;
};
module.exports.aliases = aliases;
