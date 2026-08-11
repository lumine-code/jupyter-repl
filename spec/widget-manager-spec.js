const { LumineWidgetManager, staticManagerFor } = require("../lib/widget-manager");
const registry = require("../lib/widget-registry");

// The manager is the only thing that loads the widget bundle, and the only
// place that decides what a widget is allowed to be. Two of the assertions here
// are about what it refuses: a third-party widget module is not fetched from a
// CDN, because that would be arbitrary remote code chosen by whatever the
// kernel printed, running in a renderer with full Node access — and a manager
// with no kernel behind it says so rather than silently swallowing a change.

/** A transport that satisfies the comm contract and records what it was asked. */
function fakeTransport() {
  const comms = new Map();
  return {
    supportsComms: true,
    commInfo: {},
    created: [],
    resetHandlers: [],
    onDidResetComms(callback) {
      this.resetHandlers.push(callback);
      return { dispose: () => {} };
    },
    reset(reason) {
      for (const handler of [...this.resetHandlers]) handler(reason);
    },
    createComm(targetName, commId) {
      const comm = {
        comm_id: commId,
        target_name: targetName,
        sent: [],
        opened: null,
        open(data) {
          this.opened = data;
          return "open-id";
        },
        send(data) {
          this.sent.push(data);
          return "send-id";
        },
        close() {
          return "close-id";
        },
        on_msg() {},
        on_close() {},
      };
      comms.set(commId, comm);
      this.created.push(comm);
      return comm;
    },
    getComm(commId) {
      return comms.get(commId);
    },
    async requestCommInfo() {
      return this.commInfo;
    },
  };
}

let hostCounter = 0;
function build(transport) {
  const hostId = `spec-host-${++hostCounter}`;
  return new LumineWidgetManager({ hostId, transport });
}

describe("the widget manager", () => {
  let transport;
  let manager;

  beforeEach(() => {
    transport = fakeTransport();
    manager = build(transport);
  });

  afterEach(() => {
    manager?.disconnect();
    registry.releaseHost(manager?.hostId);
    manager = null;
  });

  describe("loadClass", () => {
    it("resolves a bundled control", async () => {
      const model = await manager.loadClass("IntSliderModel", "@jupyter-widgets/controls", "2.0.0");
      const view = await manager.loadClass("IntSliderView", "@jupyter-widgets/controls", "2.0.0");

      expect(typeof model).toBe("function");
      expect(typeof view).toBe("function");
    });

    it("resolves from the base module too", async () => {
      const layout = await manager.loadClass("LayoutModel", "@jupyter-widgets/base", "2.0.0");

      expect(typeof layout).toBe("function");
    });

    it("refuses an unbundled module, naming it and what is available", async () => {
      // This message is what a user sees for ipyleaflet, bqplot and everything
      // else outside the core set, so it is pinned rather than left to drift.
      await expectAsync(
        manager.loadClass("LeafletMapModel", "jupyter-leaflet", "0.19.0"),
      ).toBeRejectedWithError(
        /The widget module "jupyter-leaflet" is not bundled with jupyter-repl\. Only .*@jupyter-widgets\/base.*@jupyter-widgets\/controls/,
      );
    });

    it("refuses a class the bundled module does not export", async () => {
      await expectAsync(
        manager.loadClass("NoSuchModel", "@jupyter-widgets/controls", "2.0.0"),
      ).toBeRejectedWithError(/"NoSuchModel" is not exported by @jupyter-widgets\/controls/);
    });

    it("resolves anyway when the kernel asks for another version", async () => {
      // Failing a widget over a kernel-side minor bump is worse than rendering
      // it with the bundled copy.
      const model = await manager.loadClass("IntSliderModel", "@jupyter-widgets/controls", "1.5.0");

      expect(typeof model).toBe("function");
    });
  });

  describe("comms", () => {
    it("opens a comm carrying the initial state", async () => {
      await manager._create_comm("jupyter.widget", "m1", { state: { value: 1 } });

      expect(transport.created.length).toBe(1);
      expect(transport.created[0].comm_id).toBe("m1");
      expect(transport.created[0].opened).toEqual({ state: { value: 1 } });
    });

    it("sends no open when there is no state to send", async () => {
      await manager._create_comm("jupyter.widget", "m1");

      expect(transport.created[0].opened).toBe(null);
    });

    it("reports the comms the kernel already has", async () => {
      transport.commInfo = { c9: { target_name: "jupyter.widget" } };

      expect(await manager._get_comm_info()).toEqual({ c9: { target_name: "jupyter.widget" } });
    });

    it("reports none when the kernel cannot be asked", async () => {
      transport.requestCommInfo = () => Promise.reject(new Error("gone"));

      expect(await manager._get_comm_info()).toEqual({});
    });
  });

  describe("claiming a model", () => {
    it("claims the id before anything is awaited", () => {
      // handle_comm_open waits for the widget class, but the display_data
      // carrying the view can be the very next iopub message and the renderer
      // resolves through the registry. The claim has to be true by then, not
      // merely on its way.
      const comm = transport.createComm("jupyter.widget", "m1");

      manager.handleCommOpen(comm, {
        // The version metadata is what ipywidgets checks first; without it the
        // open is refused before it gets anywhere, and every run logs about it.
        metadata: { version: "2.1.0" },
        content: {
          comm_id: "m1",
          target_name: "jupyter.widget",
          data: {
            state: { _model_module: "@jupyter-widgets/controls", _model_name: "IntSliderModel" },
            buffer_paths: [],
          },
        },
      });

      // No await anywhere above this line.
      expect(registry.managerForModelId("m1")).toBe(manager);
    });

    it("keeps the claim for an unbundled module, so the refusal renders in place", async () => {
      // ipywidgets does not reject an unknown module: _make_model catches the
      // loadClass failure and substitutes an error widget carrying the message.
      // Releasing the claim here would make the renderer decline instead, and
      // the user would see the repr rather than the reason.
      const comm = transport.createComm("jupyter.widget", "m1");

      await manager.handleCommOpen(comm, {
        metadata: { version: "2.1.0" },
        content: {
          comm_id: "m1",
          target_name: "jupyter.widget",
          data: { state: { _model_module: "jupyter-leaflet", _model_name: "LeafletMapModel" } },
        },
      });

      expect(registry.managerForModelId("m1")).toBe(manager);
      await expectAsync(manager.get_model("m1")).toBeResolved();
    });

    it("releases the claim when the open cannot be processed at all", async () => {
      // A protocol version this front end does not speak is refused before any
      // model exists, so there is nothing for the renderer to resolve.
      const comm = transport.createComm("jupyter.widget", "m1");

      await manager.handleCommOpen(comm, {
        metadata: { version: "1.0.0" },
        content: {
          comm_id: "m1",
          target_name: "jupyter.widget",
          data: { state: {} },
        },
      });

      expect(registry.managerForModelId("m1")).toBe(null);
    });
  });

  describe("adopting what is already open", () => {
    it("asks a kernel's existing comms for their state", async () => {
      transport.commInfo = { c9: { target_name: "jupyter.widget" } };

      await manager.adoptExistingComms();

      const adopted = transport.created.find((comm) => comm.comm_id === "c9");
      expect(adopted).toBeDefined();
      // Not comm_open: the comm already exists kernel-side.
      expect(adopted.opened).toBe(null);
      expect(adopted.sent).toEqual([{ method: "request_state" }]);
      expect(registry.managerForModelId("c9")).toBe(manager);
    });

    it("leaves a comm it already knows alone", async () => {
      transport.commInfo = { c9: { target_name: "jupyter.widget" } };
      transport.createComm("jupyter.widget", "c9");
      transport.created.length = 0;

      await manager.adoptExistingComms();

      expect(transport.created).toEqual([]);
    });
  });

  describe("a reset", () => {
    it("drops every model the manager held", async () => {
      registry.claimModel("m1", manager);

      transport.reset("Kernel restarted");
      await Promise.resolve();

      expect(registry.managerForModelId("m1")).toBe(null);
    });
  });

  describe("a real control", () => {
    // Everything else here runs against fakes. This builds an actual
    // IntSliderModel from the bundle and renders its actual view, which is the
    // only assertion that the bundled stack works in this renderer at all —
    // Backbone, Lumino and jQuery included.
    async function slider() {
      const model = await manager.new_model(
        {
          model_id: "slider1",
          model_name: "IntSliderModel",
          model_module: "@jupyter-widgets/controls",
          model_module_version: "2.0.0",
        },
        { value: 7, min: 0, max: 10, _view_name: "IntSliderView" },
      );
      return { model, view: await manager.create_view(model) };
    }

    it("builds a model carrying the kernel's state", async () => {
      const { model } = await slider();

      expect(model.get("value")).toBe(7);
      expect(model.get("max")).toBe(10);
    });

    it("renders a slider into a real element", async () => {
      const { view } = await slider();
      jasmine.attachToDOM(view.el);

      expect(view.el.classList.contains("widget-slider")).toBe(true);
      expect(view.el.querySelector(".slider-container")).not.toBeNull();

      view.remove();
    });

    it("shows the value the model holds", async () => {
      const { view } = await slider();
      jasmine.attachToDOM(view.el);

      expect(view.el.textContent).toContain("7");

      view.remove();
    });

    it("follows the model when the kernel changes it", async () => {
      const { model, view } = await slider();
      jasmine.attachToDOM(view.el);

      model.set("value", 9);

      expect(view.el.textContent).toContain("9");

      view.remove();
    });

    it("lays a box out through Lumino's attach messages", async () => {
      // A box view is a Lumino panel: without the attach messages the
      // renderer sends by hand, it renders collapsed.
      const { attachWidget, detachWidget } = require("../lib/components/result-view/widget");
      await manager.new_model(
        {
          model_id: "child1",
          model_name: "LabelModel",
          model_module: "@jupyter-widgets/controls",
          model_module_version: "2.0.0",
        },
        { value: "inside", _view_name: "LabelView" },
      );
      const box = await manager.new_model(
        {
          model_id: "box1",
          model_name: "VBoxModel",
          model_module: "@jupyter-widgets/controls",
          model_module_version: "2.0.0",
        },
        // Serialized state, so children are references the way the kernel
        // sends them, not model objects.
        { children: ["IPY_MODEL_child1"], _view_name: "VBoxView" },
      );
      const view = await manager.create_view(box);
      const host = document.createElement("div");
      jasmine.attachToDOM(host);

      attachWidget(view, host);
      // A box adds each child view asynchronously; tearing the box down before
      // that settles disposes the Lumino layout the child is still inserting
      // into. Real use never does that, and neither should this.
      await view.children_views.update(box.get("children"));

      expect(view.el.classList.contains("widget-vbox")).toBe(true);
      expect(host.contains(view.el)).toBe(true);
      // The child is really laid out inside the box, which is what the attach
      // messages buy: without them a Lumino panel renders collapsed.
      expect(view.el.textContent).toContain("inside");
      expect(view.luminoWidget.widgets.length).toBe(1);

      detachWidget(view);
      expect(host.contains(view.el)).toBe(false);
    });
  });

  describe("without a kernel", () => {
    it("is not live", async () => {
      const staticManager = await staticManagerFor("nb:spec", {
        version_major: 2,
        version_minor: 0,
        state: {},
      });

      expect(staticManager.isLive).toBe(false);
      registry.releaseHost("nb:spec");
    });

    it("says a widget cannot be changed rather than swallowing it", async () => {
      const staticManager = new LumineWidgetManager({ hostId: "nb:spec2", transport: null });

      await expectAsync(staticManager._create_comm("jupyter.widget", "m1")).toBeRejectedWithError(
        /has no kernel/,
      );

      registry.releaseHost("nb:spec2");
    });

    it("is live when a transport is behind it", () => {
      expect(manager.isLive).toBe(true);
    });
  });
});
