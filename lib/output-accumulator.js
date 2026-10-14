// Keep the data-only factory available when services connect without loading
// the output renderer. Both service surfaces share this exact function.
module.exports = function createOutputAccumulator(...args) {
  return require("./output-utils").createOutputAccumulator(...args);
};
