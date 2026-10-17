const { log } = require("../../../utils");
const kernelCommandItems = require("./kernel-command-items");

class SignalListView {
  constructor(store, handleKernelCommand, window = lumine.workspace.getMainWindow()) {
    this.store = store;
    this.handleKernelCommand = handleKernelCommand;
    this.destroyed = false;

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
          isAvailable: ({ detail }) => this.isCommandAvailable(detail?.item),
          didDispatch: ({ detail }) => this.runCommand(detail.item, detail),
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

  async runCommand(item, context = this.selectList.getActionContext("api")) {
    if (!this.isCommandAvailable(item)) return false;
    log("Selected command:", item);
    const store = this.store;
    const result = await this.handleKernelCommand?.(item, store);
    if (
      !this.destroyed &&
      this.selectListHost.isVisible() &&
      this.store === store &&
      this.selectList.getActionContext().sessionId === context.sessionId
    )
      await this.selectList.setItems(kernelCommandItems(store?.kernel));
    return result;
  }

  isCommandAvailable(item) {
    return Boolean(
      !this.destroyed &&
      item &&
      kernelCommandItems(this.store?.kernel).some(({ command }) => command === item.command),
    );
  }

  destroy() {
    this.destroyed = true;
    this.selectListHost.destroy();
  }

  toggle() {
    if (this.selectListHost.isVisible()) return this.selectListHost.cancel();
    return this.selectListHost.show();
  }
}

module.exports = SignalListView;
