const path = require("path");

const EXAMPLES_DIRECTORY = path.join(__dirname, "..", "examples");

function protectExampleEditor(editor) {
  if (typeof editor?.setSaveConfirmation !== "function" || editor.isDestroyed?.()) return;
  const filePath = editor.getPath?.();
  if (typeof filePath !== "string" || path.dirname(filePath) !== EXAMPLES_DIRECTORY) return;
  editor.setSaveConfirmation({
    message: `Save changes to ${path.basename(filePath)}?`,
    detail:
      "Saving will overwrite the original Jupyter example shipped with the package. Use Save As to keep a separate copy.",
  });
}

module.exports = { EXAMPLES_DIRECTORY, protectExampleEditor };
