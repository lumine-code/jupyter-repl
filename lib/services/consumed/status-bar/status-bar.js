const { Disposable } = require("lumine");

let StatusBar;
let SignalListView;

function getStatusBar() {
  if (!StatusBar) StatusBar = require("./status-bar-component");
  return StatusBar;
}

function getSignalListView() {
  if (!SignalListView) SignalListView = require("./signal-list-view");
  return SignalListView;
}

class StatusBarConsumer {
  addStatusBar(store, statusBar, handleKernelCommand) {
    let component = null;
    let statusBarTile = null;

    const mount = () => {
      // With no kernel the component renders an empty, hidden tile. Avoid
      // loading Etch and constructing that tree until there is something for
      // the user to see.
      if (component || !store.kernel) return;

      const statusBarElement = document.createElement("div");
      statusBarElement.classList.add("inline-block", "jupyter-repl");
      // Language-tooling band, see the priority convention in the status-bar
      // package README.
      statusBarTile = statusBar.addLeftTile({
        item: statusBarElement,
        priority: 410,
      });

      const StatusBarComponent = getStatusBar();
      component = new StatusBarComponent({
        store,
        container: statusBarElement,
        // The click hands on a { kernel, markers } context, not the store itself:
        // that is the shape the signal list and handleKernelCommand read.
        onClick: (context) => this.showKernelCommands(context, handleKernelCommand),
      });
      statusBarElement.appendChild(component.element);
    };

    const kernelSubscription = store.onDidChangeCurrentKernel(mount);
    mount();

    const disposable = new Disposable(() => {
      kernelSubscription.dispose();
      component?.destroy();
      statusBarTile?.destroy();
    });
    store.subscriptions.add(disposable);
    return disposable;
  }

  showKernelCommands(store, handleKernelCommand) {
    let signalListView = this.signalListView;

    if (!signalListView) {
      const SignalList = getSignalListView();
      signalListView = new SignalList(store, handleKernelCommand);
      this.signalListView = signalListView;
    } else {
      signalListView.store = store;
    }

    signalListView.toggle();
  }
}

const statusBarConsumer = new StatusBarConsumer();

module.exports = { statusBarConsumer, StatusBarConsumer };
