const etch = require("@lumine-code/etch");
const StatusBar = require("../lib/services/consumed/status-bar/status-bar-component");
const { StatusBarConsumer } = require("../lib/services/consumed/status-bar/status-bar");

// The tile used to re-render through mobx observation of the store. It now
// subscribes to the store's kernel event and to each kernel's status event, so
// these specs pin that wiring: a tile that silently stopped following the
// kernel would still look right on its first paint.

// Etch batches updates onto an animation frame, and the spec runner freezes
// timers, so read the DOM only after forcing the pending update out.
const flush = (component) => etch.updateSync(component);

function fakeKernel(overrides = {}) {
  const listeners = [];
  return {
    displayName: "Python 3",
    executionState: "idle",
    executionCount: 0,
    lastExecutionTime: "No execution",
    executionStartTime: null,
    onDidChangeStatus(callback) {
      listeners.push(callback);
      return {
        dispose() {
          const index = listeners.indexOf(callback);
          if (index > -1) listeners.splice(index, 1);
        },
      };
    },
    emitStatus() {
      listeners.slice().forEach((callback) => callback());
    },
    listenerCount: () => listeners.length,
    ...overrides,
  };
}

// A stand-in for the parts of the store the tile reads, with the same event.
function fakeStore(kernel) {
  const callbacks = [];
  return {
    kernel,
    markers: null,
    onDidChangeCurrentKernel(callback) {
      callbacks.push(callback);
      return { dispose() {} };
    },
    setKernel(next) {
      this.kernel = next;
      callbacks.slice().forEach((callback) => callback(next));
    },
  };
}

describe("status bar tile", () => {
  let container;
  let component;

  beforeEach(() => {
    lumine.config.set("jupyter-repl.statusBarDisable", false);
    lumine.config.set("jupyter-repl.statusBarKernelInfo", true);
    container = document.createElement("div");
  });

  afterEach(() => {
    component?.destroy();
    component = null;
  });

  const mount = (store) => {
    component = new StatusBar({ store, container, onClick: () => {} });
    container.appendChild(component.element);
    flush(component);
    return component;
  };

  it("hides the tile when no kernel is running", () => {
    mount(fakeStore(null));

    expect(container.style.display).toBe("none");
    expect(component.element.textContent).toBe("");
  });

  it("shows the kernel name, state, count and last execution time", () => {
    mount(fakeStore(fakeKernel({ executionCount: 3, lastExecutionTime: "1.500 sec" })));

    expect(container.style.display).toBe("");
    expect(component.element.textContent).toBe("Python 3 | idle | 3 | 1.500 sec");
  });

  it("omits the count and timing when detailed info is off", () => {
    lumine.config.set("jupyter-repl.statusBarKernelInfo", false);
    mount(fakeStore(fakeKernel({ executionCount: 3, lastExecutionTime: "1.500 sec" })));

    expect(component.element.textContent).toBe("Python 3 | idle");
  });

  it("redraws when the kernel reports a status change", () => {
    const kernel = fakeKernel();
    mount(fakeStore(kernel));
    expect(component.element.textContent).toBe("Python 3 | idle | 0");

    kernel.executionState = "busy";
    kernel.executionStartTime = Date.now();
    kernel.emitStatus();
    flush(component);

    expect(component.element.textContent).toContain("busy");
  });

  it("follows the store to a new kernel and drops the old subscription", () => {
    const first = fakeKernel({ displayName: "Python 3" });
    const second = fakeKernel({ displayName: "R" });
    const store = fakeStore(first);
    mount(store);
    expect(first.listenerCount()).toBe(1);

    store.setKernel(second);
    flush(component);

    expect(component.element.textContent).toContain("R");
    expect(first.listenerCount()).toBe(0);
    expect(second.listenerCount()).toBe(1);
  });

  it("hides the tile when the status bar is disabled in config", () => {
    mount(fakeStore(fakeKernel()));
    expect(container.style.display).toBe("");

    lumine.config.set("jupyter-repl.statusBarDisable", true);
    flush(component);

    expect(container.style.display).toBe("none");
  });

  it("stops its timer when destroyed", () => {
    const kernel = fakeKernel({ executionState: "busy", executionStartTime: Date.now() });
    mount(fakeStore(kernel));
    expect(component.timerId).not.toBe(null);

    component.destroy();
    component = null;

    expect(kernel.listenerCount()).toBe(0);
  });
});

describe("status bar consumer", () => {
  it("does not create a tile until a kernel exists", () => {
    const store = fakeStore(null);
    store.subscriptions = { add: jasmine.createSpy("add") };
    const tile = { destroy: jasmine.createSpy("destroy") };
    const statusBar = {
      addLeftTile: jasmine.createSpy("addLeftTile").and.returnValue(tile),
    };
    const consumer = new StatusBarConsumer();

    const disposable = consumer.addStatusBar(store, statusBar, () => {});
    expect(statusBar.addLeftTile).not.toHaveBeenCalled();
    expect(store.subscriptions.add).toHaveBeenCalledWith(disposable);

    store.setKernel(fakeKernel());
    expect(statusBar.addLeftTile).toHaveBeenCalled();

    disposable.dispose();
    expect(tile.destroy).toHaveBeenCalled();
  });

  it("dispatches the kernel commands command from the tile and advertises its keybinding", () => {
    const store = fakeStore(fakeKernel());
    store.subscriptions = { add: jasmine.createSpy("add") };
    const tile = { destroy: jasmine.createSpy("destroy") };
    const statusBar = {
      addLeftTile: jasmine.createSpy("addLeftTile").and.returnValue(tile),
    };
    const tooltip = { dispose: jasmine.createSpy("dispose") };
    const tooltipSpy = spyOn(lumine.tooltips, "add").and.returnValue(tooltip);
    const dispatchSpy = spyOn(lumine.commands, "dispatch");
    const consumer = new StatusBarConsumer();

    const disposable = consumer.addStatusBar(store, statusBar);
    const statusBarElement = statusBar.addLeftTile.calls.mostRecent().args[0].item;

    const [tooltipElement, tooltipOptions] = tooltipSpy.calls.mostRecent().args;
    expect(tooltipElement).toBe(statusBarElement);
    expect(tooltipOptions.title).toBe("Kernel commands");
    expect(tooltipOptions.keyBindingCommand).toBe("jupyter-repl:toggle-kernel-commands");
    expect(tooltipOptions.keyBindingTarget).toBe(lumine.views.getView(lumine.workspace));

    statusBarElement.querySelector("span").click();

    expect(dispatchSpy).toHaveBeenCalledWith(
      lumine.views.getView(lumine.workspace),
      "jupyter-repl:toggle-kernel-commands",
    );

    disposable.dispose();
    expect(tooltip.dispose).toHaveBeenCalled();
  });
});
