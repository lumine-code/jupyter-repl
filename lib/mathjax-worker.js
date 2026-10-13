/** Node-enabled browser worker; no editor runtime or DOM is loaded here. */
function start(idPrefix) {
  const { createMathJaxRenderer } = require("./mathjax-runtime");
  const renderer = createMathJaxRenderer(idPrefix);

  self.onmessage = async ({ data: { id, type, source } }) => {
    try {
      if (type === "warm") {
        await renderer.warm();
        self.postMessage({ id });
      } else if (type === "render") {
        const runs = await renderer.render(source);
        self.postMessage({ id, runs });
      } else {
        throw new Error(`Unknown MathJax request: ${type}`);
      }
    } catch (error) {
      self.postMessage({ id, error: { message: error.message, stack: error.stack } });
    }
  };
}

module.exports = { start };
