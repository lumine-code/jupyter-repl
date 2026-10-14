const fs = require("fs");
const path = require("path");

const EXAMPLES_DIRECTORY = path.join(__dirname, "..", "examples");

module.exports = class ExampleList {
  constructor(window = lumine.workspace.getMainWindow()) {
    this.window = window;
    this.destroyed = false;
    this.selectListHost = lumine.workspace.addSelectList(
      {
        emptyMessage: "No examples found",
        getItemId: (item) => item.filePath,
        search: {
          algorithm: "command-t",
          getFilterText: (item) => item.fileName,
        },
        source: { mode: "snapshot", load: () => this.loadItems() },
        renderItem: (_item, { filterKey, highlight }) => ({ primary: highlight(filterKey) }),
        commands: {
          "jupyter-repl:open-example": {
            description: "Open the selected example file in this editor window.",
            didDispatch: ({ detail }) => this.openExample(detail.item),
          },
        },
        actions: [
          {
            command: "jupyter-repl:open-example",
            context: "item",
            primary: true,
            disposition: "close",
            dispatch: "local",
          },
        ],
      },
      { window, className: "jupyter-repl example-list", crumb: "Examples" },
    );
    this.selectList = this.selectListHost.getModel();
  }

  async loadItems() {
    const files = await fs.promises.readdir(EXAMPLES_DIRECTORY, { withFileTypes: true });
    return files
      .filter((file) => file.isFile())
      .map((file) => ({
        fileName: file.name,
        filePath: path.join(EXAMPLES_DIRECTORY, file.name),
      }))
      .sort((a, b) => a.fileName.localeCompare(b.fileName, undefined, { numeric: true }));
  }

  async openExample(item) {
    if (!item || this.destroyed || this.window.isDestroyed()) return;
    const editor = await lumine.workspace.open(item.filePath, {
      opener: "text-editor",
      pane: this.window.getEditorContainer().getActivePane(),
    });
    editor?.setSaveConfirmation({
      message: `Save changes to ${item.fileName}?`,
      detail:
        "Saving will overwrite the original Jupyter example shipped with the package. Use Save As to keep a separate copy.",
    });
    return editor;
  }

  show() {
    return this.selectListHost.show();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.selectListHost.destroy();
  }
};
