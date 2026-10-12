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
  constructor() {
    this.signalLists = new Map();
    this.signalListView = null;
  }

  dispose() {
    for (const { view, lease } of this.signalLists.values()) {
      lease.dispose();
      view.destroy();
    }
    this.signalLists.clear();
    this.signalListView = null;
  }

  addStatusBar(store, statusBar, options = {}) {
    const window = options.window ?? lumine.workspace.getMainWindow();
    let component = null;
    let statusBarTile = null;
    let statusBarTooltip = null;
    let clickElement = null;
    let clickHandler = null;

    const mount = () => {
      // With no kernel the component renders an empty, hidden tile. Avoid
      // loading Etch and constructing that tree until there is something for
      // the user to see.
      if (component || !store.kernel) return;

      const statusBarElement = window.getDocument().createElement("status-bar-tile");
      statusBarElement.classList.add("jupyter-repl");
      // On the tile, never on the text inside it — the way every other tile in
      // the fleet wires its click. A tile is a 30px line box with the theme's
      // horizontal padding, while the inline span holding the text is only the
      // 16px font box: listening on the span left better than half the tile
      // dead, so a click that visibly landed on it did nothing.
      // Keep mouse and keyboard activation on the same command path, including
      // its context guard and user-facing warning.
      clickHandler = (event) => {
        event.preventDefault();
        lumine.commands.dispatch(window.getElement(), "jupyter-repl:toggle-kernel-commands");
      };
      statusBarElement.addEventListener("click", clickHandler);
      clickElement = statusBarElement;
      statusBarTooltip = lumine.tooltips.add(statusBarElement, {
        title: "Kernel commands",
        keyBindingCommand: "jupyter-repl:toggle-kernel-commands",
        keyBindingTarget: window.getElement(),
      });
      // Language-tooling band, see the priority convention in the status-bar
      // package README.
      statusBarTile = statusBar.addLeftTile({
        item: statusBarElement,
        priority: 410,
      });

      options?.beforeRender?.();
      const StatusBarComponent = getStatusBar();
      component = new StatusBarComponent({
        store,
        container: statusBarElement,
      });
      statusBarElement.appendChild(component.element);
    };

    const kernelSubscription = store.onDidChangeCurrentKernel(mount);
    mount();

    const disposable = new Disposable(() => {
      store.subscriptions.remove?.(disposable);
      kernelSubscription.dispose();
      clickElement?.removeEventListener("click", clickHandler);
      component?.destroy();
      statusBarTooltip?.dispose();
      statusBarTile?.destroy();
    });
    store.subscriptions.add(disposable);
    return disposable;
  }

  showKernelCommands(store, handleKernelCommand, window = lumine.workspace.getMainWindow()) {
    let record = this.signalLists.get(window);
    if (!record) {
      const SignalList = getSignalListView();
      const view = new SignalList(store, handleKernelCommand, window);
      const lease = window.onWillDestroy(() => {
        this.signalLists.delete(window);
        if (this.signalListView === view) this.signalListView = null;
        view.destroy();
        lease.dispose();
      });
      record = { view, lease };
      this.signalLists.set(window, record);
      if (window.isMain()) this.signalListView = view;
    } else record.view.store = store;
    return record.view.toggle();
  }
}

const statusBarConsumer = new StatusBarConsumer();

module.exports = { statusBarConsumer, StatusBarConsumer };
