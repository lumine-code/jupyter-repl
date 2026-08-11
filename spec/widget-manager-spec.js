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
        content: {
          comm_id: "m1",
          target_name: "jupyter.widget",
          data: { state: {}, buffer_paths: [] },
        },
      });

      // No await anywhere above this line.
      expect(registry.managerForModelId("m1")).toBe(manager);
    });

    it("releases the claim when the open fails", async () => {
      const comm = transport.createComm("jupyter.widget", "m1");

      await manager.handleCommOpen(comm, {
        content: {
          comm_id: "m1",
          target_name: "jupyter.widget",
          // No state at all: handle_comm_open cannot build a model from this.
          data: {},
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
