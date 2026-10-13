const { log } = require("../../../utils");
const kernelCommandItems = require("./kernel-command-items");

class SignalListView {
  constructor(store, handleKernelCommand, window = lumine.workspace.getMainWindow()) {
    this.store = store;
    this.handleKernelCommand = handleKernelCommand;

    const selectListOptions = {
      items: [],
      getItemId: (item) => item.command,
      search: { getFilterText: (item) => item.name },
      source: {
        mode: "snapshot",
        load: () => {
          if (!this.store) return [];
          const kernel = this.store.kernel;
          if (!kernel) return [];
          return kernelCommandItems(kernel);
        },
      },
      renderItem: (item, { filterKey, highlight }) => {
        return { primary: highlight(filterKey) };
      },
      commands: {
        "jupyter-repl:run-selected-kernel-command": {
          description: "Run the selected command against the current kernel.",
          didDispatch: ({ detail }) => this.runCommand(detail.item),
        },
      },
      actions: [
        {
          command: "jupyter-repl:run-selected-kernel-command",
          context: "item",
          primary: true,
          disposition: "close",
        },
      ],
      emptyMessage: "No running kernels for this file type",
    };
    this.selectListHost = lumine.workspace.addSelectList(selectListOptions, {
      window,
      className: "jupyter-repl signal-list",
      crumb: "Kernel Commands",
    });
    this.selectList = this.selectListHost.getModel();
  }

  runCommand(item) {
    log("Selected command:", item);
    if (this.handleKernelCommand) this.handleKernelCommand(item, this.store);
  }

  destroy() {
    this.selectListHost.destroy();
  }

  toggle() {
    if (this.selectListHost.isVisible()) return this.selectListHost.cancel();
    return this.selectListHost.show();
  }
}

module.exports = SignalListView;
