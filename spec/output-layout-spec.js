describe("output data and presentation layout", () => {
  let etch, OutputStore, OutputLayout, Component, components, layouts, stores;

  const wide = { editorWidth: 800, lineLength: 40, charWidth: 8, lineHeight: 16 };
  const narrow = { editorWidth: 80, lineLength: 64, charWidth: 8, lineHeight: 24 };
  const stream = (text) => ({ output_type: "stream", name: "stdout", text });

  function data(text = "shared") {
    const store = new OutputStore();
    if (text != null) store.appendOutput(stream(text));
    stores.push(store);
    return store;
  }

  function layout(store, position = wide) {
    const presentation = new OutputLayout(store);
    presentation.updatePosition(position);
    layouts.push(presentation);
    return presentation;
  }

  function view(store, presentation) {
    const component = new Component({
      store,
      layout: presentation,
      editor: null,
      showResult: true,
    });
    components.push(component);
    etch.updateSync(component);
    return component;
  }

  beforeEach(() => {
    etch = require("@lumine-code/etch");
    OutputStore = require("../lib/store/output");
    OutputLayout = require("../lib/components/result-view/output-layout");
    Component = require("../lib/components/result-view/result-view");
    components = [];
    layouts = [];
    stores = [];
  });

  afterEach(() => {
    for (const component of components) component.destroy();
    for (const presentation of layouts) presentation.destroy();
    for (const store of stores) store.emitter.dispose();
  });

  it("renders independent positions and inline choices for two views of the same data", () => {
    const store = data();
    const firstLayout = layout(store, wide);
    const secondLayout = layout(store, narrow);
    const first = view(store, firstLayout);
    const second = view(store, secondLayout);

    expect(first.layout).toBe(firstLayout);
    expect(second.layout).toBe(secondLayout);
    expect(firstLayout.isPlain).toBe(true);
    expect(secondLayout.isPlain).toBe(false);
    expect(first.element.classList.contains("inline-container")).toBe(true);
    expect(second.element.classList.contains("multiline-container")).toBe(true);
    expect(first.element.style.marginLeft).toBe("48px");
    expect(second.element.style.maxWidth).toBe("64px");
    expect(first.element.textContent).toContain("shared");
    expect(second.element.textContent).toContain("shared");
    expect("position" in store).toBe(false);
    expect("isPlain" in store).toBe(false);
    expect("updatePosition" in store).toBe(false);
  });

  it("updates only the affected presentation without mutating or announcing output data", () => {
    const store = data();
    const firstLayout = layout(store, wide);
    const secondLayout = layout(store, narrow);
    const first = view(store, firstLayout);
    const second = view(store, secondLayout);
    const snapshot = JSON.stringify({
      outputs: store.outputs,
      status: store.status,
      executionCount: store.executionCount,
      index: store.index,
      lastCode: store.lastCode,
    });
    const dataChanged = jasmine.createSpy("output data changed");
    const subscription = store.onDidUpdate(dataChanged);
    const updates = spyOn(etch, "update").and.resolveTo();
    secondLayout.updatePosition({ editorWidth: 800, lineLength: 80 });

    expect(dataChanged).not.toHaveBeenCalled();
    expect(updates).toHaveBeenCalled();
    expect(updates.calls.allArgs().every(([component]) => component === second)).toBe(true);
    expect(firstLayout.position).toEqual(wide);
    expect(
      JSON.stringify({
        outputs: store.outputs,
        status: store.status,
        executionCount: store.executionCount,
        index: store.index,
        lastCode: store.lastCode,
      }),
    ).toBe(snapshot);
    etch.updateSync(second);
    expect(second.element.classList.contains("inline-container")).toBe(true);
    expect(second.element.style.marginLeft).toBe("88px");
    expect(first.element.style.marginLeft).toBe("48px");
    subscription.dispose();
  });

  it("announces one local layout change and ignores identical measurements", () => {
    const store = data();
    const presentation = layout(store);
    const changed = jasmine.createSpy("layout changed");
    const dataChanged = jasmine.createSpy("data changed");
    const layoutSubscription = presentation.onDidUpdate(changed);
    const dataSubscription = store.onDidUpdate(dataChanged);

    expect(presentation.updatePosition(wide)).toBe(false);
    expect(changed).not.toHaveBeenCalled();
    expect(presentation.updatePosition({ lineLength: 48 })).toBe(true);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(presentation.updatePosition({ lineLength: 48 })).toBe(false);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(dataChanged).not.toHaveBeenCalled();
    layoutSubscription.dispose();
    dataSubscription.dispose();
  });

  it("refreshes both views when shared data changes and keeps their geometry separate", () => {
    const store = data();
    const firstLayout = layout(store, wide);
    const secondLayout = layout(store, narrow);
    const first = view(store, firstLayout);
    const second = view(store, secondLayout);
    const updates = spyOn(etch, "update").and.resolveTo();
    store.appendOutput(stream(" data"));

    expect(updates.calls.allArgs().filter(([component]) => component === first).length).toBe(1);
    expect(updates.calls.allArgs().filter(([component]) => component === second).length).toBe(1);
    etch.updateSync(first);
    etch.updateSync(second);
    expect(first.element.textContent).toContain("shared data");
    expect(second.element.textContent).toContain("shared data");
    expect(firstLayout.position).toEqual(wide);
    expect(secondLayout.position).toEqual(narrow);
    expect(first.element.classList.contains("inline-container")).toBe(true);
    expect(second.element.classList.contains("multiline-container")).toBe(true);
  });

  it("recomputes inline fit when a merged stream grows without replacing its output record", () => {
    const store = data("12");
    const presentation = layout(store, { ...wide, editorWidth: 80, lineLength: 48 });
    const component = view(store, presentation);
    const output = store.outputs[0];
    const id = output._id;
    expect(component.element.classList.contains("inline-container")).toBe(true);

    store.appendOutput(stream("34567"));
    etch.updateSync(component);

    expect(store.outputs.length).toBe(1);
    expect(store.outputs[0]).toBe(output);
    expect(store.outputs[0]._id).toBe(id);
    expect(store.outputs[0].text).toBe("1234567");
    expect(presentation.isPlain).toBe(false);
    expect(component.element.classList.contains("multiline-container")).toBe(true);
  });

  for (const [name, bundle, inline] of [
    ["text/plain", { "text/plain": "42" }, true],
    ["a known rich MIME", { "text/plain": "42", "application/json": { value: 42 } }, false],
    [
      "an unsupported MIME with a plain fallback",
      { "text/plain": "42", "application/x-lumine-spec-unsupported": "unhandled" },
      true,
    ],
  ]) {
    it(`chooses presentation using renderable media for ${name}`, () => {
      const store = data(null);
      store.appendOutput({ output_type: "display_data", data: bundle, metadata: {} });
      const presentation = layout(store);
      const component = view(store, presentation);

      expect(presentation.isPlain).toBe(inline);
      expect(component.element.classList.contains("inline-container")).toBe(inline);
      expect(component.element.classList.contains("multiline-container")).toBe(!inline);
    });
  }

  it("rebinds data and layout subscriptions without keeping the old sources alive", () => {
    const previousStore = data("before");
    const nextStore = data("after");
    const previousLayout = layout(previousStore, wide);
    const nextLayout = layout(nextStore, narrow);
    const component = view(previousStore, previousLayout);
    component.update({ ...component.props, store: nextStore, layout: nextLayout });
    etch.updateSync(component);
    const updates = spyOn(etch, "update").and.resolveTo();

    previousStore.appendOutput(stream(" stale"));
    previousLayout.updatePosition({ lineLength: 100 });
    expect(updates).not.toHaveBeenCalled();
    nextStore.appendOutput(stream(" live"));
    expect(updates).toHaveBeenCalledTimes(1);
    nextLayout.updatePosition({ editorWidth: 600 });
    expect(updates).toHaveBeenCalledTimes(2);
    etch.updateSync(component);
    expect(component.layout).toBe(nextLayout);
    expect(component.element.textContent).toContain("after live");
    expect(component.element.textContent).not.toContain("before");
  });

  it("rebinds an owned default layout when its component changes stores", () => {
    const previous = data("before");
    const next = data("after");
    const component = view(previous);
    const owned = component.layout;
    owned.updatePosition(wide);
    component.update({ ...component.props, store: next });
    etch.updateSync(component);

    expect(component.layout).toBe(owned);
    expect(component.layout.store).toBe(next);
    expect(component.element.textContent).toContain("after");
    expect(component.element.classList.contains("inline-container")).toBe(true);
  });

  it("disposes component subscriptions without destroying a borrowed layout", () => {
    const store = data();
    const presentation = layout(store);
    const component = view(store, presentation);
    const destroyLayout = spyOn(presentation, "destroy").and.callThrough();
    component.destroy();
    components.splice(components.indexOf(component), 1);
    const updates = spyOn(etch, "update").and.resolveTo();
    presentation.updatePosition({ lineLength: 100 });
    store.appendOutput(stream(" later"));

    expect(destroyLayout).not.toHaveBeenCalled();
    expect(updates).not.toHaveBeenCalled();
    expect(presentation.destroyed).toBe(false);
  });

  it("destroys its owned fallback layout and refuses later measurements", () => {
    const component = view(data());
    const owned = component.layout;
    const destroyLayout = spyOn(owned, "destroy").and.callThrough();
    component.destroy();
    components.splice(components.indexOf(component), 1);
    const position = { ...owned.position };

    expect(destroyLayout).toHaveBeenCalledTimes(1);
    expect(owned.destroyed).toBe(true);
    expect(owned.updatePosition(wide)).toBe(false);
    expect(owned.position).toEqual(position);
  });
});

describe("result view layout observer lifetime", () => {
  let ResultView, MarkerStore, editor, view, observers, previousObserver, markerCallbacks;

  beforeEach(async () => {
    ResultView = require("../lib/components/result-view");
    MarkerStore = require("../lib/store/markers");
    observers = [];
    markerCallbacks = [];
    previousObserver = global.ResizeObserver;
    global.ResizeObserver = class {
      constructor(callback) {
        this.callback = callback;
        this.targets = [];
        this.disconnected = false;
        observers.push(this);
      }
      observe(target) {
        this.targets.push(target);
      }
      unobserve(target) {
        this.targets = this.targets.filter((item) => item !== target);
      }
      disconnect() {
        this.disconnected = true;
      }
    };
    editor = await lumine.workspace.open();
    editor.setText("value()");
    const mark = editor.markBufferPosition.bind(editor);
    spyOn(editor, "markBufferPosition").and.callFake((...args) => {
      const marker = mark(...args);
      const subscribe = marker.onDidChange.bind(marker);
      spyOn(marker, "onDidChange").and.callFake((callback) => {
        markerCallbacks.push(callback);
        return subscribe(callback);
      });
      return marker;
    });
    view = new ResultView(new MarkerStore(), editor, 0, true);
  });

  afterEach(() => {
    view?.destroy();
    editor?.destroy();
    global.ResizeObserver = previousObserver;
  });

  it("disconnects its observer and ignores queued geometry callbacks after destroy", () => {
    const presentation = view.layout;
    const observer = view.resizeObserver;
    const measure = spyOn(presentation, "updatePosition").and.callThrough();
    const dataChanged = jasmine.createSpy("output data changed");
    const subscription = view.outputStore.onDidUpdate(dataChanged);
    view.destroy();
    measure.calls.reset();
    const position = { ...presentation.position };
    observer.callback([{ target: view.element, borderBoxSize: [{ blockSize: 100 }] }]);
    markerCallbacks.at(-1)({ isValid: true, textChanged: false });

    expect(observer.disconnected).toBe(true);
    expect(measure).not.toHaveBeenCalled();
    expect(presentation.position).toEqual(position);
    expect(dataChanged).not.toHaveBeenCalled();
    subscription.dispose();
  });
});
