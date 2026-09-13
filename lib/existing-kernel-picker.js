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
    const selectListOptions = {
      items: [],
      getItemId: (kernel) => kernel.id,
      search: { getFilterText: (kernel) => getName(kernel) },
      source: {
        mode: "snapshot",
        load: () => {
          const grammar = this._context?.grammar || store.grammar;
          const items = this._context?.adapter
            ? store.runningKernels
            : store.runningKernels.filter((kernel) =>
                kernelSpecProvidesGrammar(kernel.kernelSpec, grammar),
              );
          const markers = this._context?.markers || store.markers;
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
    };
    this.selectListHost = lumine.workspace.addSelectList(selectListOptions, {
      className: "jupyter-repl existing-kernel-picker",
      crumb: "Running Kernels",
    });
    this.selectList = this.selectListHost.getModel();
    this.cancelSubscription = this.selectListHost.onDidCancel(() => {
      this._context = null;
    });
  }

  selectKernel(kernel) {
    log("Selected kernel:", kernel);
    const context = this._context;
    this._context = null;
    if (context?.adapter) {
      require("./adapter-integration").bindAdapterKernel(context, kernel);
      return;
    }
    const { filePath, editor, grammar } = context || store;
    if (!filePath || !editor || editor.isDestroyed?.() || !grammar) return;
    store.newKernel(kernel, editor.getPath?.() || filePath, editor, grammar);
  }

  destroy() {
    this._context = null;
    this.cancelSubscription.dispose();
    this.selectListHost.destroy();
  }

  toggle(context = null) {
    if (this.selectListHost.isVisible()) {
      this.selectListHost.cancel();
    } else {
      this._context = context;
      this.selectListHost.show();
    }
  }
}

module.exports = ExistingKernelPicker;
