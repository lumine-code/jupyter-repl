describe("adapter command ownership", () => {
  let capture, panes, activePane, liveProviders, provider, integration, allTargets;

  function pane(id, owner = { id, isDestroyed: () => false }) {
    const element = document.createElement("div");
    const item = {
      owner,
      element,
      targets: new Map(),
      activeId: `${id}-first`,
      getElement: () => element,
      isDestroyed: () => item.destroyed === true,
      getSourceEditor: () => item.source,
    };
    for (const name of ["first", "second"]) {
      const cell = document.createElement("div");
      const targetId = `${id}-${name}`;
      cell.setAttribute("data-cell-id", targetId);
      const editor = { element: document.createElement("div"), fragment: true };
      cell.appendChild(editor.element);
      element.appendChild(cell);
      item.targets.set(targetId, { id: targetId, editor });
    }
    item.source = {
      element: document.createElement("div"),
      isJupyterNotebookSourceEditor: true,
    };
    element.appendChild(item.source.element);
    return item;
  }

  function adapterFor(item) {
    if (!panes.includes(item) || item.isDestroyed()) return null;
    return {
      getPaneItem: () => item,
      getKernelOwner: () => item.owner,
      getElement: () => item.element,
      getActiveTargetId: () => item.activeId,
      getKernelTarget: (id = item.activeId) => item.targets.get(id) || null,
      getRunTarget: (id) => item.targets.get(id) || null,
      getRunTargetIds: () => [...item.targets.keys()],
      getRunTargets: (scope) => {
        if (scope === "all") allTargets();
        return scope === "active"
          ? [item.targets.get(item.activeId)].filter(Boolean)
          : [...item.targets.values()];
      },
    };
  }

  function newProvider() {
    return {
      getActiveAdapter: jasmine
        .createSpy("active adapter")
        .and.callFake(() => adapterFor(activePane)),
      getAdapterForItem: jasmine.createSpy("pane adapter").and.callFake(adapterFor),
    };
  }

  const getAdapters = () => liveProviders;
  const shim = (scope) => scope.services()[0];

  beforeEach(() => {
    ({ captureCommandAdapter: capture } = require("../lib/adapter-command-context"));
    allTargets = jasmine.createSpy("materialize all targets");
    panes = [pane("a"), pane("b")];
    activePane = panes[1];
    provider = newProvider();
    liveProviders = [provider];
    spyOn(lumine.workspace, "getPaneItems").and.callFake(() => panes);
    spyOn(lumine.textEditors, "roleFor").and.callFake((editor) =>
      editor.fragment ? "fragment" : "file",
    );
    integration = {
      captureAdapterKernelContext(services, explicit = null) {
        const adapter =
          explicit || services.map((entry) => entry.getActiveAdapter?.()).find(Boolean);
        if (!adapter) return null;
        const target = adapter.getKernelTarget?.(adapter.getActiveTargetId?.());
        return {
          adapter,
          paneItem: adapter.getPaneItem(),
          owner: adapter.getKernelOwner(),
          target,
          editor: target?.editor || null,
          integrationGeneration: 1,
        };
      },
    };
  });

  it("retains the real live services getter for menu dispatch", () => {
    const scope = capture(getAdapters, integration, null);
    expect(scope.services).toBe(getAdapters);
    expect(scope.context.owner).toBe(panes[1].owner);
    activePane = panes[0];
    expect(integration.captureAdapterKernelContext(scope.services()).owner).toBe(panes[0].owner);
  });

  it("routes a nonactive notebook's target instead of the active notebook", () => {
    const editor = panes[0].targets.get("a-first").editor;
    const scope = capture(getAdapters, integration, editor);

    expect(scope.context.owner).toBe(panes[0].owner);
    expect(scope.context.editor).toBe(editor);
    expect(shim(scope).getActiveAdapter().getPaneItem()).toBe(panes[0]);
    expect(allTargets).not.toHaveBeenCalled();
  });

  it("uses the addressed cell without changing the notebook's active cell", () => {
    activePane = panes[0];
    const editor = activePane.targets.get("a-second").editor;
    const scope = capture(getAdapters, integration, editor);
    const selected = shim(scope).getActiveAdapter();

    expect(scope.context.target.id).toBe("a-second");
    expect(selected.getActiveTargetId()).toBe("a-second");
    expect(selected.getKernelTarget().editor).toBe(editor);
    expect(selected.getRunTargets("active").map((target) => target.id)).toEqual(["a-second"]);
    expect(selected.getRunTargets("above").map((target) => target.id)).toEqual(["a-first"]);
    expect(activePane.activeId).toBe("a-first");
    expect(allTargets).not.toHaveBeenCalled();
  });

  it("recognizes the backing JSON editor and retains the adapter's active defaults", () => {
    const scope = capture(getAdapters, integration, panes[0].source);

    expect(scope.context.owner).toBe(panes[0].owner);
    expect(scope.context.target.id).toBe("a-first");
    expect(shim(scope).getActiveAdapter().getActiveTargetId()).toBe("a-first");
    expect(allTargets).not.toHaveBeenCalled();
  });

  it("does not use a fragment role as proof of notebook ownership", () => {
    const foreign = { element: document.createElement("div"), fragment: true };

    expect(capture(getAdapters, integration, foreign)).toEqual({ unowned: true });
    expect(allTargets).not.toHaveBeenCalled();
  });

  it("leaves an ordinary unowned editor on the text execution path", () => {
    const foreign = { element: document.createElement("div") };

    expect(capture(getAdapters, integration, foreign)).toBeNull();
  });

  it("revokes detached providers and reaches a replacement only through the live getter", () => {
    const scope = capture(getAdapters, integration, panes[0].targets.get("a-first").editor);
    const originalActiveCalls = provider.getActiveAdapter.calls.count();
    const originalItemCalls = provider.getAdapterForItem.calls.count();
    liveProviders = [];

    expect(shim(scope).getActiveAdapter()).toBeNull();
    expect(shim(scope).getAdapterForItem(panes[0])).toBeNull();
    const replacement = newProvider();
    liveProviders = [replacement];
    expect(shim(scope).getActiveAdapter().getKernelOwner()).toBe(panes[0].owner);
    expect(replacement.getAdapterForItem).toHaveBeenCalled();
    expect(provider.getActiveAdapter.calls.count()).toBe(originalActiveCalls);
    expect(provider.getAdapterForItem.calls.count()).toBe(originalItemCalls);
  });

  it("rehydrates a stable target in a surviving split of the same owner", () => {
    const first = panes[0];
    const scope = capture(getAdapters, integration, first.targets.get("a-second").editor);
    const split = pane("a", first.owner);
    first.destroyed = true;
    panes = [split, panes[1]];

    const current = shim(scope).getActiveAdapter();

    expect(current.getPaneItem()).toBe(split);
    expect(current.getKernelTarget().editor).toBe(split.targets.get("a-second").editor);
    expect(shim(scope).getAdapterForItem(split).getKernelOwner()).toBe(first.owner);
  });

  it("does not substitute the active cell after its addressed target is deleted", () => {
    const scope = capture(getAdapters, integration, panes[0].targets.get("a-second").editor);
    panes[0].targets.delete("a-second");

    expect(shim(scope).getActiveAdapter()).toBeNull();
    expect(shim(scope).getAdapterForItem(panes[0])).toBeNull();
  });
});
