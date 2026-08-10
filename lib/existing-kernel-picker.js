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
      filterKeyForItem: (kernel) => getName(kernel),
      willShow: async () => {
        await this.selectList.update({
          items: store.runningKernels.filter((kernel) =>
            kernelSpecProvidesGrammar(kernel.kernelSpec, store.grammar),
          ),
        });
        const markers = store.markers;
        if (markers) {
          markers.clear();
        }
      },
      elementForItem: (kernel, { filterKey, highlight }) => {
        const element = document.createElement("li");
        element.appendChild(highlight(filterKey));
        return element;
      },
      didConfirmSelection: (kernel) => {
        log("Selected kernel:", kernel);
        this.selectList.hide();
        const { filePath, editor, grammar } = store;
        if (!filePath || !editor || !grammar) {
          return;
        }
        store.newKernel(kernel, filePath, editor, grammar);
      },
      didCancelSelection: () => this.selectList.hide(),
      emptyMessage: "No running kernels for this language",
    });
  }

  destroy() {
    this.selectList.destroy();
  }

  toggle() {
    this.selectList.toggle();
  }
}

module.exports = ExistingKernelPicker;
