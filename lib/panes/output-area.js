const { OUTPUT_AREA_URI } = require("../utils");
const OutputArea = require("../components/output-area");
const BasePane = require("./base-pane");

class OutputPane extends BasePane {
  constructor(store) {
    super({
      title: "Output Area",
      iconName: "terminal",
      uri: OUTPUT_AREA_URI,
      defaultLocation: "right",
      allowedLocations: ["left", "right", "bottom"],
      component: new OutputArea({ store }),
      onDispose: () => {
        if (store.kernel) {
          store.kernel.outputStore.clear();
        }
      },
    });
  }

  destroy() {
    super.destroy();
    // When a user manually clicks the close icon, the pane holding the OutputArea
    // is destroyed along with the OutputArea item. We mimic this here so that we can call
    // outputArea.destroy() and fully clean up the OutputArea without user clicking
    const pane = lumine.workspace.paneForURI(OUTPUT_AREA_URI);
    if (pane) {
      pane.destroyItem(this);
    }
  }
}

module.exports = OutputPane;
