const { log } = require("../../../utils");

const basicCommands = [
  {
    name: "Interrupt kernel",
    value: "interrupt-kernel",
  },
  {
    name: "Restart kernel",
    value: "restart-kernel",
  },
  {
    name: "Shut down kernel",
    value: "shutdown-kernel",
  },
];
const wsKernelCommands = [
  {
    name: "Rename session",
    value: "rename-kernel",
  },
  {
    name: "Disconnect kernel",
    value: "disconnect-kernel",
  },
];
const terminalCommands = [
  {
    name: "Open Jupyter console in terminal",
    value: "open-jupyter-console",
  },
  {
    name: "Spawn Jupyter console terminal",
    value: "spawn-jupyter-console",
  },
];

class SignalListView {
  constructor(store, handleKernelCommand) {
    this.store = store;
    this.handleKernelCommand = handleKernelCommand;

    this.selectList = lumine.workspace.buildSelectList({
      className: "jupyter-repl signal-list",
      crumb: "Kernel Commands",
      items: [],
      getItemId: (item) => item.command,
      search: { getFilterText: (item) => item.name },
      source: {
        mode: "snapshot",
        load: () => {
          if (!this.store) return [];
          const kernel = this.store.kernel;
          if (!kernel) return [];
          const commands =
            kernel.transport instanceof require("../../../ws-kernel")
              ? [...basicCommands, ...wsKernelCommands, ...terminalCommands]
              : [...basicCommands, ...terminalCommands];
          return commands.map((command) => ({
            name: command.name,
            command: command.value,
          }));
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
    });
  }

  runCommand(item) {
    log("Selected command:", item);
    if (this.handleKernelCommand) this.handleKernelCommand(item, this.store);
  }

  destroy() {
    this.selectList.destroy();
  }

  toggle() {
    if (this.selectList.isVisible()) this.selectList.cancel();
    else this.selectList.show();
  }
}

module.exports = SignalListView;
