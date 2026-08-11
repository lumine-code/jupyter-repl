const etch = require("@lumine-code/etch");
const { WidgetView, widgetRenderer } = require("../lib/components/result-view/widget");
const { MEDIA_RENDERERS } = require("../lib/components/result-view/display");
const registry = require("../lib/widget-registry");

// A widget view is the first thing this package renders that is alive: a DOM
// node bound to a kernel-side object, which keeps receiving updates until it is
// explicitly disposed. Everything here is about identity and disposal, because
// the render path works against both — every output re-renders on every store
// update, including the one a buffer edit causes by moving the marker, and the
// history slider hands one component instance a different payload rather than
// building a new one.

/** A manager whose views record whether they were disposed. */
function fakeManager({ failWith = null, defer = false } = {}) {
  const views = [];
  let release;
  const gate = defer
    ? new Promise((resolve) => {
        release = resolve;
      })
    : Promise.resolve();

  return {
    views,
    release: () => release?.(),
    async get_model(modelId) {
      await gate;
      if (failWith) {
        throw new Error(failWith);
      }
      return { model_id: modelId };
    },
    async create_view(model) {
      const el = document.createElement("div");
      el.className = "fake-widget";
      el.textContent = model.model_id;
      const view = { el, model, removed: 0, remove: () => view.removed++ };
      views.push(view);
      return view;
    },
  };
}

/** Let the component's async mount settle. */
async function settle() {
  for (let i = 0; i < 12; i++) {
    await Promise.resolve();
  }
}

describe("rendering a widget view", () => {
  let component;

  afterEach(() => {
    component?.destroy();
    component = null;
    registry.releaseModelsOf(undefined);
  });

  it("shows a loading state before the view exists", () => {
    component = new WidgetView({ modelId: "m1", manager: fakeManager({ defer: true }) });

    expect(component.element.querySelector(".output-widget-loading")).not.toBeNull();
  });

  it("mounts the view once the manager resolves", async () => {
    const manager = fakeManager();
    component = new WidgetView({ modelId: "m1", manager });
    await settle();
    etch.updateSync(component);

    const host = component.element.querySelector(".output-widget-host");
    expect(host).not.toBeNull();
    expect(host.querySelector(".fake-widget")).toBe(manager.views[0].el);
  });

  it("keeps its root element across every state", async () => {
    // An enclosing etch tree records this element, and this component
    // re-renders on its own schedule — possibly driven by another package's
    // copy of etch — so a root swap would leave that tree pointing at a
    // removed node.
    const manager = fakeManager();
    component = new WidgetView({ modelId: "m1", manager });
    const root = component.element;

    await settle();
    etch.updateSync(component);
    expect(component.element).toBe(root);

    await component.update({ modelId: "m2", manager: fakeManager({ failWith: "no such class" }) });
    await settle();
    etch.updateSync(component);
    expect(component.element).toBe(root);
    expect(component.element.querySelector(".output-widget-error")).not.toBeNull();
  });

  describe("updating", () => {
    it("builds nothing new for the same model and manager", async () => {
      // Without this guard the live view would be torn down and rebuilt on
      // every keystroke that moves the marker.
      const manager = fakeManager();
      component = new WidgetView({ modelId: "m1", manager });
      await settle();

      await component.update({ modelId: "m1", manager });
      await settle();

      expect(manager.views.length).toBe(1);
      expect(manager.views[0].removed).toBe(0);
    });

    it("disposes the old view before building the new one", async () => {
      // The history slider scrubbing from one output to another: etch keeps
      // this instance and hands it a different payload.
      const manager = fakeManager();
      component = new WidgetView({ modelId: "m1", manager });
      await settle();

      await component.update({ modelId: "m2", manager });
      await settle();

      expect(manager.views.length).toBe(2);
      expect(manager.views[0].removed).toBe(1);
      expect(manager.views[1].removed).toBe(0);
    });

    it("rebuilds when the manager changes under the same id", async () => {
      // A restart replaces the manager while model ids can repeat.
      const first = fakeManager();
      component = new WidgetView({ modelId: "m1", manager: first });
      await settle();

      const second = fakeManager();
      await component.update({ modelId: "m1", manager: second });
      await settle();

      expect(first.views[0].removed).toBe(1);
      expect(second.views.length).toBe(1);
    });
  });

  describe("disposal", () => {
    it("disposes the view it holds", async () => {
      const manager = fakeManager();
      component = new WidgetView({ modelId: "m1", manager });
      await settle();

      component.destroy();
      const view = manager.views[0];
      component = null;

      expect(view.removed).toBe(1);
    });

    it("disposes a view that arrived after it was destroyed", async () => {
      // The one place a view is created and never adopted. The model holds a
      // reference to it until told otherwise, so it cannot simply be dropped.
      const manager = fakeManager({ defer: true });
      const doomed = new WidgetView({ modelId: "m1", manager });

      doomed.destroy();
      manager.release();
      await settle();

      expect(manager.views.length).toBe(1);
      expect(manager.views[0].removed).toBe(1);
    });

    it("touches no DOM after it was destroyed", async () => {
      const manager = fakeManager({ defer: true });
      const doomed = new WidgetView({ modelId: "m1", manager });
      const root = doomed.element;

      doomed.destroy();
      manager.release();
      await settle();

      expect(root.querySelector(".fake-widget")).toBeNull();
    });
  });

  describe("failing", () => {
    it("shows what went wrong, with the kernel's own repr beneath it", async () => {
      const manager = fakeManager({ failWith: "jupyter-leaflet is not bundled" });
      component = new WidgetView({ modelId: "m1", manager, fallback: "Map(center=[0, 0])" });
      await settle();
      etch.updateSync(component);

      expect(component.element.textContent).toContain("jupyter-leaflet is not bundled");
      expect(component.element.textContent).toContain("Map(center=[0, 0])");
    });

    it("says so when the output names no widget", async () => {
      component = new WidgetView({ modelId: undefined, manager: null });
      await settle();
      etch.updateSync(component);

      expect(component.element.querySelector(".output-widget-error")).not.toBeNull();
    });
  });

  describe("the renderer", () => {
    it("declines a model nothing owns", () => {
      // A stored notebook, or a kernel that has since died: renderRichMedia
      // falls through to the repr the kernel sent in the same bundle.
      expect(widgetRenderer({ model_id: "never-seen" }, {}, { "text/plain": "IntSlider()" })).toBe(
        null,
      );
    });

    it("renders a model a manager owns", () => {
      const manager = fakeManager();
      registry.claimModel("m1", manager);

      const vnode = widgetRenderer({ model_id: "m1" }, {}, { "text/plain": "IntSlider()" });

      expect(vnode).not.toBe(null);
      expect(vnode.tag).toBe(WidgetView);
      registry.releaseModel("m1");
    });

    it("returns a real element vnode for an empty bundle", () => {
      // manifest-services-spec calls every registered renderer with ({}, {})
      // and reads vnode.tag, so declining there would throw rather than fail.
      const vnode = MEDIA_RENDERERS["application/vnd.jupyter.widget-view+json"]({}, {});

      expect(vnode).not.toBe(null);
      expect(vnode.tag).not.toBe(etch.Fragment);
    });
  });
});
