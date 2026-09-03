const store = require("./store");
const { log, kernelSpecProvidesGrammar, tildify } = require("./utils");

function getName(kernel) {
  const prefix = kernel.transport.gatewayName ? `${kernel.transport.gatewayName}: ` : "";
  return `${prefix + kernel.displayName} - ${store
    .getFilesForKernel(kernel)
    .map(tildify)
    .join(", ")}`;
}

class ExistingKernelPicker {
  constructor() {
    this.selectList = lumine.workspace.buildSelectList({
      className: "jupyter-repl existing-kernel-picker",
      crumb: "Running Kernels",
      items: [],
      getItemId: (kernel) => kernel.id,
      search: { getFilterText: (kernel) => getName(kernel) },
      source: {
        mode: "snapshot",
        load: () => {
          const items = store.runningKernels.filter((kernel) =>
            kernelSpecProvidesGrammar(kernel.kernelSpec, store.grammar),
          );
          const markers = store.markers;
          if (markers) markers.clear();
          return items;
        },
      },
      renderItem: (kernel, { filterKey, highlight }) => {
        return { primary: highlight(filterKey) };
      },
      commands: {
        "jupyter-repl:connect-existing-kernel": {
          description: "Connect the current file to the selected running kernel.",
          didDispatch: ({ detail }) => this.selectKernel(detail.item),
        },
      },
      actions: [
        {
          command: "jupyter-repl:connect-existing-kernel",
          context: "item",
          primary: true,
          disposition: "close",
        },
      ],
      emptyMessage: "No running kernels for this language",
    });
  }

  selectKernel(kernel) {
    log("Selected kernel:", kernel);
    const { filePath, editor, grammar } = store;
    if (!filePath || !editor || !grammar) return;
    store.newKernel(kernel, filePath, editor, grammar);
  }

  destroy() {
    this.selectList.destroy();
  }

  toggle() {
    if (this.selectList.isVisible()) this.selectList.cancel();
    else this.selectList.show();
  }
}

module.exports = ExistingKernelPicker;
