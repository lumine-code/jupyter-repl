const fs = require("fs");
const path = require("path");
const { EXAMPLES_DIRECTORY, protectExampleEditor } = require("./example-save-confirmation");

module.exports = class ExampleList {
  constructor(window = lumine.workspace.getMainWindow()) {
    this.window = window;
    this.destroyed = false;
    this.openingPane = null;
    this.selectListHost = lumine.workspace.addSelectList(
      {
        emptyMessage: "No examples found",
        getItemId: (item) => item.filePath,
        search: {
          algorithm: "command-t",
          getFilterText: (item) => item.fileName,
        },
        source: { mode: "snapshot", load: () => this.loadItems() },
        renderItem: (item, { filterKey, highlight }) => ({
          primary: highlight(filterKey),
        }),
        commands: {
          "jupyter-repl:open-example": {
            description: "Open the selected example with its default file opener.",
            didDispatch: ({ detail }) => this.openExample(detail.item, "open", detail.signal),
          },
          "jupyter-repl:open-example-with": {
            description: "Choose how and where to open the selected example.",
            didDispatch: ({ detail }) => this.openExample(detail.item, "open-with", detail.signal),
          },
          "jupyter-repl:open-example-external": {
            description: "Open the selected example in its default external program.",
            didDispatch: ({ detail }) => this.openExample(detail.item, "external", detail.signal),
          },
          "jupyter-repl:show-example-in-folder": {
            description: "Show the selected example in the system file manager.",
            didDispatch: ({ detail }) => this.openExample(detail.item, "reveal", detail.signal),
          },
        },
        actions: [
          {
            command: "jupyter-repl:open-example",
            context: "item",
            primary: true,
            group: "Open",
            disposition: "close",
            dispatch: "local",
          },
          ...[
            "jupyter-repl:open-example-with",
            "jupyter-repl:open-example-external",
            "jupyter-repl:show-example-in-folder",
          ].map((command) => ({
            command,
            context: "item",
            group: "Open",
            disposition: "close",
            dispatch: "local",
          })),
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

  async openExample(item, mode = "open", signal) {
    if (!item || this.destroyed || this.window.isDestroyed()) return;
    signal?.throwIfAborted();
    const pane = this.openingPane ?? this.window.getEditorContainer().getActivePane();
    if (pane.isDestroyed()) return;
    if (mode === "open-with") {
      const opened = await lumine.commands.dispatch(this.window.getElement(), "open-with:toggle", {
        path: item.filePath,
        pane,
      });
      if (!opened) throw new Error("The Open With package is not available.");
      return opened;
    }
    if (mode === "external" || mode === "reveal") {
      const opener = mode === "external" ? "open-external" : "open-external:show";
      if (
        lumine.workspace
          .getAvailablePathOpeners(item.filePath, { pane, pathKind: "file" })
          .some((entry) => entry.id === opener)
      ) {
        return lumine.workspace.open(item.filePath, { pane, pathKind: "file", opener, signal });
      }
      return mode === "external"
        ? lumine.shell.openPath(item.filePath)
        : lumine.shell.showItemInFolder(item.filePath);
    }
    if (mode !== "open") return;
    const editor = await lumine.workspace.open(item.filePath, {
      pane,
      signal,
      pending: lumine.config.get("core.allowPendingPaneItems"),
    });
    if (this.destroyed || this.window.isDestroyed() || signal?.aborted) return editor;
    if (editor?.getPath?.() === item.filePath) protectExampleEditor(editor);
    return editor;
  }

  show() {
    if (this.destroyed || this.window.isDestroyed()) return;
    this.openingPane = this.window.getEditorContainer().getActivePane();
    return this.selectListHost.show();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.selectListHost.destroy();
  }
};
