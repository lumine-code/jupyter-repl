/** @jsx etch.dom */
/**
 * Markdown rendered by the editor's own markdown-it based renderer.
 */

const etch = require("@lumine-code/etch"); // JSX factory
function markdownRenderer(data) {
  const html = lumine.tools.markdown.render(data || "", {
    sanitize: true,
    breaks: true,
    handleFrontMatter: false,
    transformImageLinks: false,
    transformLegacyLinks: false,
    transformNonFqdnLinks: false,
  });

  return <div className="output-markdown" innerHTML={html} />;
}

module.exports = { markdownRenderer };
