const { Disposable } = require("lumine");
const StatusBar = require("./status-bar-component");
const SignalListView = require("./signal-list-view");

class StatusBarConsumer {
  addStatusBar(store, statusBar, handleKernelCommand) {
    const statusBarElement = document.createElement("div");
    statusBarElement.classList.add("inline-block", "jupyter-repl");
    // Language-tooling band, see the priority convention in the status-bar
    // package README.
    const statusBarTile = statusBar.addLeftTile({
      item: statusBarElement,
      priority: 410,
    });

    const component = new StatusBar({
      store,
      container: statusBarElement,
      // The click hands on a { kernel, markers } context, not the store itself:
      // that is the shape the signal list and handleKernelCommand read.
      onClick: (context) => this.showKernelCommands(context, handleKernelCommand),
    });
    statusBarElement.appendChild(component.element);

    const disposable = new Disposable(() => {
      component.destroy();
      statusBarTile.destroy();
    });
    store.subscriptions.add(disposable);
    return disposable;
  }

  showKernelCommands(store, handleKernelCommand) {
    let signalListView = this.signalListView;

    if (!signalListView) {
      signalListView = new SignalListView(store, handleKernelCommand);
      this.signalListView = signalListView;
    } else {
      signalListView.store = store;
    }

    signalListView.toggle();
  }
}

const statusBarConsumer = new StatusBarConsumer();

module.exports = { statusBarConsumer, StatusBarConsumer };
