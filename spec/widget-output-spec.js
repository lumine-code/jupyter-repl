const etch = require("@lumine-code/etch");
const { LumineWidgetManager } = require("../lib/widget-manager");
const { OutputList, OUTPUT_MODULE } = require("../lib/widget-output");
const registry = require("../lib/widget-registry");

// The Output widget is what interact(), interactive_output() and tqdm.notebook
// are built on, so without it the most common way anyone uses ipywidgets renders
// nothing. It is implemented in this package rather than taken from
// @jupyter-widgets/output, whose view draws through JupyterLab's rendermime
// registry — a renderer this package already owns.
//
// Its second half is the part with teeth: while Python is inside `with out:`,
// the widget claims the running request's id and everything that request prints
// belongs to the widget instead of the cell. Only the outputs move — the status
// and the reply still reach the cell, which is what lets it finish.

/** A transport that records the output routes taken out on it. */
function fakeTransport() {
  return {
    supportsComms: true,
    routes: new Map(),
    onDidResetComms() {
      return { dispose: () => {} };
    },
    createComm(targetName, commId) {
      return {
        comm_id: commId,
        target_name: targetName,
        open: () => "open",
        send: () => "send",
        close: () => "close",
        on_msg() {},
        on_close() {},
      };
    },
    getComm() {
      return undefined;
    },
    async requestCommInfo() {
      return {};
    },
    registerOutputRoute(msgId, handler) {
      this.routes.set(msgId, handler);
      return { dispose: () => this.routes.delete(msgId) };
    },
  };
}

function streamMessage(text, name = "stdout") {
  return {
    header: { msg_id: "s1", msg_type: "stream" },
    parent_header: { msg_id: "execute_1" },
    content: { name, text },
  };
}

let hostCounter = 0;

describe("the Output widget", () => {
  let transport;
  let manager;
  let model;

  beforeEach(async () => {
    transport = fakeTransport();
    manager = new LumineWidgetManager({
      hostId: `output-spec-${++hostCounter}`,
      transport,
    });
    model = await manager.new_model(
      {
        model_id: "out1",
        model_name: "OutputModel",
        model_module: OUTPUT_MODULE,
        model_module_version: "1.0.0",
      },
      {},
    );
  });

  afterEach(() => {
    manager?.disconnect();
    registry.releaseHost(manager?.hostId);
    manager = null;
    model = null;
  });

  it("resolves from the manager's module table", () => {
    expect(model).toBeDefined();
    expect(model.get("_view_name")).toBe("OutputView");
  });

  describe("claiming a request", () => {
    it("takes an output route when Python enters the block", () => {
      model.set("msg_id", "execute_1");

      expect(transport.routes.has("execute_1")).toBe(true);
    });

    it("gives it back when Python leaves the block", () => {
      model.set("msg_id", "execute_1");
      model.set("msg_id", "");

      expect(transport.routes.has("execute_1")).toBe(false);
    });

    it("moves the route when the id changes", () => {
      model.set("msg_id", "execute_1");
      model.set("msg_id", "execute_2");

      expect(transport.routes.has("execute_1")).toBe(false);
      expect(transport.routes.has("execute_2")).toBe(true);
    });

    it("gives it back when the widget closes", () => {
      model.set("msg_id", "execute_1");

      model.close();

      expect(transport.routes.has("execute_1")).toBe(false);
    });
  });

  describe("capturing", () => {
    beforeEach(() => {
      model.set("msg_id", "execute_1");
    });

    it("appends what the request printed", () => {
      transport.routes.get("execute_1")(streamMessage("hello\n"));

      const outputs = model.get("outputs");
      expect(outputs.length).toBe(1);
      expect(outputs[0].output_type).toBe("stream");
      expect(outputs[0].text).toBe("hello\n");
    });

    it("replaces the array rather than mutating it", () => {
      // Backbone compares by identity, so appending in place would render
      // nothing.
      const before = model.get("outputs");

      transport.routes.get("execute_1")(streamMessage("hello\n"));

      expect(model.get("outputs")).not.toBe(before);
    });

    it("merges consecutive stream chunks", () => {
      // A print loop is one output, not several thousand.
      const capture = transport.routes.get("execute_1");
      capture(streamMessage("one "));
      capture(streamMessage("two "));
      capture(streamMessage("three"));

      const outputs = model.get("outputs");
      expect(outputs.length).toBe(1);
      expect(outputs[0].text).toBe("one two three");
    });

    it("clears on clear_output", () => {
      const capture = transport.routes.get("execute_1");
      capture(streamMessage("hello\n"));

      capture({
        header: { msg_id: "c1", msg_type: "clear_output" },
        parent_header: { msg_id: "execute_1" },
        content: { wait: false },
      });

      expect(model.get("outputs")).toEqual([]);
    });

    it("defers a clear_output that asked to wait", () => {
      // What interact does on every re-run: clear, then draw, with no flicker
      // in between.
      const capture = transport.routes.get("execute_1");
      capture(streamMessage("old\n"));

      capture({
        header: { msg_id: "c1", msg_type: "clear_output" },
        parent_header: { msg_id: "execute_1" },
        content: { wait: true },
      });
      expect(model.get("outputs").length).toBe(1);

      capture(streamMessage("new\n"));

      const outputs = model.get("outputs");
      expect(outputs.length).toBe(1);
      expect(outputs[0].text).toBe("new\n");
    });

    it("ignores a message that is not output", () => {
      transport.routes.get("execute_1")({
        header: { msg_id: "st", msg_type: "status" },
        parent_header: { msg_id: "execute_1" },
        content: { execution_state: "busy" },
      });

      expect(model.get("outputs")).toEqual([]);
    });
  });

  describe("the view", () => {
    it("draws the outputs it is given", () => {
      const list = new OutputList({
        outputs: [{ _id: 1, output_type: "stream", name: "stdout", text: "hello" }],
      });
      etch.updateSync(list);

      expect(list.element.textContent).toContain("hello");
      list.destroy();
    });

    it("redraws when they change", async () => {
      const list = new OutputList({ outputs: [] });
      etch.updateSync(list);

      await list.update({
        outputs: [{ _id: 1, output_type: "stream", name: "stdout", text: "later" }],
      });
      etch.updateSync(list);

      expect(list.element.textContent).toContain("later");
      list.destroy();
    });

    it("mounts into a real widget view", async () => {
      const view = await manager.create_view(model);
      model.set("outputs", [{ _id: 1, output_type: "stream", name: "stdout", text: "captured" }]);
      etch.updateSync(view.list);

      expect(view.el.textContent).toContain("captured");
      view.remove();
    });
  });
});
