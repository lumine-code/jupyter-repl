const { OUTPUT_AREA_URI, openOrShowDock } = require("./utils");
const OutputPane = require("./panes/output-area");

function toggleOutputMode() {
  // There should never be more than one instance of OutputArea
  const outputArea = lumine.workspace
    .getPaneItems()
    .find((paneItem) => paneItem instanceof OutputPane);
  if (outputArea) {
    return outputArea.destroy();
  } else {
    openOrShowDock(OUTPUT_AREA_URI);
  }
}

module.exports = {
  toggleOutputMode,
};
