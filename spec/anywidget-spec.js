let LumineWidgetManager;
let registry;
let canWriteTrait;
let references;
let validBuffers;

describe("isolated anywidget", () => {
  let manager;
  let model;
  let view;
  let component;
  let sent;
  let counter = 0;

  beforeEach(async () => {
    jasmine.useRealClock();
    ({ LumineWidgetManager } = require("../lib/widget-manager"));
    ({ canWriteTrait, references, validBuffers } = require("../lib/anywidget"));
    registry = require("../lib/widget-registry");
    sent = [];
    manager = new LumineWidgetManager({ hostId: `anywidget-spec-${++counter}` });
    await manager.new_model(
      {
        model_id: "layout",
        model_name: "LayoutModel",
        model_module: "@jupyter-widgets/base",
        model_module_version: "2.0.0",
      },
      {},
    );
    model = await manager.new_model(
      {
        model_id: "aw",
        model_name: "AnyModel",
        model_module: "anywidget",
        model_module_version: "0.11.0",
        comm: {
          comm_id: "aw",
          on_msg() {},
          on_close() {},
          close() {},
          send(data, _callbacks, _metadata, buffers) {
            sent.push({ data, buffers });
            return "msg";
          },
        },
      },
      {
        value: 1,
        layout: "IPY_MODEL_layout",
        _data: new DataView(Uint8Array.from([7, 8, 9]).buffer),
        _esm: `export default {
        initialize({ model, signal }) {
          model.send({ phase: "initialize", node: typeof require, value: model.get("value") });
          signal.addEventListener("abort", () => model.send({ phase: "aborted" }));
          return { initialized: true };
        },
        render({ model, el, signal }) {
          el.textContent = "Counter: " + model.get("value");
          model.on("change:value", () => model.send({ phase: "change", value: model.get("value") }));
          model.on("msg:custom", (content, buffers) => model.send({ phase: "custom", content, bytes: [...new Uint8Array(buffers[0].buffer, buffers[0].byteOffset, buffers[0].byteLength)] }, undefined, buffers));
          model.set("value", 2);
          model.set("_data", new DataView(new Uint8Array([1, 2]).buffer));
          model.save_changes();
          model.send({ phase: "render", binary: model.get("_data") instanceof DataView });
          return () => model.send({ phase: "cleanup", aborted: signal.aborted });
        }
      };`,
      },
    );
  });

  afterEach(async () => {
    const frame = view?.frame;
    component?.destroy();
    component = null;
    view?.remove();
    await frame?.destroy();
    await manager?.clear_state();
    manager?.disconnect();
    registry.releaseHost(manager?.hostId);
    manager = model = view = null;
  });

  function waitFor(predicate) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const poll = () => {
        if (predicate()) resolve();
        else if (view?.el.querySelector(".output-widget-error"))
          reject(new Error(view.el.querySelector(".output-widget-error").textContent));
        else if (Date.now() - start > 8000)
          reject(new Error("The isolated widget did not respond."));
        else setTimeout(poll, 10);
      };
      poll();
    });
  }

  async function mount() {
    view = await manager.create_view(model);
    document.body.appendChild(view.el);
    await waitFor(() => sent.some((message) => message.data.content?.phase === "render"));
  }

  it("loads the AFM factory in a sandbox and synchronizes traits and binary buffers", async () => {
    await mount();
    await waitFor(() => model.get("value") === 2);
    expect(
      sent.find((message) => message.data.content?.phase === "initialize").data.content.node,
    ).toBe("undefined");
    expect(sent.filter((message) => message.data.content?.phase === "initialize").length).toBe(1);
    expect(
      sent.find((message) => message.data.content?.phase === "render").data.content.binary,
    ).toBe(true);
    expect([...new Uint8Array(model.get("_data").buffer)]).toEqual([1, 2]);
    expect(
      sent.some((message) => message.data.method === "update" && message.buffers?.length === 1),
    ).toBe(true);

    model.set_state({ value: 4 });
    await waitFor(() =>
      sent.some(
        (message) => message.data.content?.phase === "change" && message.data.content.value === 4,
      ),
    );
    model.trigger("msg:custom", { action: "echo" }, [new DataView(Uint8Array.from([5, 6]).buffer)]);
    await waitFor(() => sent.some((message) => message.data.content?.phase === "custom"));
    const custom = sent.find((message) => message.data.content?.phase === "custom");
    expect(custom.data.content.bytes).toEqual([5, 6]);
    expect(custom.buffers[0] instanceof DataView).toBe(true);
  });

  it("allows existing private user traits but protects framework and prototype keys", () => {
    expect(canWriteTrait(model, "_data")).toBe(true);
    expect(canWriteTrait(model, "_esm")).toBe(false);
    expect(canWriteTrait(model, "_model_name")).toBe(false);
    expect(canWriteTrait(model, "constructor")).toBe(false);
    expect(canWriteTrait(model, "nonexistent")).toBe(false);
    expect(validBuffers([new DataView(new ArrayBuffer(1))])).toBe(true);
    expect(validBuffers([{}])).toBe(false);
    expect(references({ child: ["anywidget:child"] }, "child")).toBe(true);
    expect(references({ child: "anywidget:other" }, "child")).toBe(false);
  });

  it("shares a child factory and initialization exports across composed views", async () => {
    await manager.new_model(
      {
        model_id: "child",
        model_name: "AnyModel",
        model_module: "anywidget",
        model_module_version: "0.11.0",
        comm: {
          comm_id: "child",
          on_msg() {},
          on_close() {},
          close() {},
          send(data) {
            sent.push({ data });
            return "child-msg";
          },
        },
      },
      {
        value: 9,
        _esm: `export default async () => {
        let count = 0;
        return {
          async initialize({model}) { model.send({phase:"child-initialize"}); return { read: () => model.get("value") }; },
          async render({model,el}) { el.textContent = "Child"; model.send({phase:"child-render", count: ++count}); }
        };
      };`,
      },
    );
    model.set_state({
      child: "anywidget:child",
      _esm: `export default async () => ({
        async initialize({model}) { return {ready:true}; },
        async render({model,el,host,signal}) {
          const child = await host.getWidget(model.get("child"));
          const same = await host.getWidget(model.get("child"));
          const low = await host.getModel(model.get("child"));
          const a = document.createElement("div"), b = document.createElement("div");
          el.append(a,b);
          await Promise.all([child.render({el:a,signal}), same.render({el:b,signal})]);
          model.send({phase:"render", read:child.exports.read(), value:low.get("value")});
        }
      });`,
    });
    await mount();
    expect(
      sent.filter((message) => message.data.content?.phase === "child-initialize").length,
    ).toBe(1);
    expect(
      sent
        .filter((message) => message.data.content?.phase === "child-render")
        .map((message) => message.data.content.count),
    ).toEqual([1, 2]);
    const result = sent.find((message) => message.data.content?.phase === "render").data.content;
    expect(result.read).toBe(9);
    expect(result.value).toBe(9);
  });

  it("blocks forged trait writes and unreferenced child models", async () => {
    await mount();
    await view._receive(
      { type: "anywidget-set", id: "aw", key: "_esm", value: "bad" },
      view._generation,
    );
    expect(model.get("_esm")).not.toBe("bad");
    expect(view.el.querySelector(".output-widget-error").textContent).toContain(
      "cannot be changed",
    );
    spyOn(view.frame, "postMessage");
    await view._receive(
      { type: "anywidget-get-model", ref: "anywidget:unrelated", request: 7 },
      view._generation,
    );
    expect(view.frame.postMessage).toHaveBeenCalledWith({
      type: "anywidget-model",
      request: 7,
      error: "The child widget is not referenced by this output.",
    });
  });

  it("aborts and cleans the AFM without closing the shared model comm", async () => {
    await mount();
    const frame = view.frame;
    spyOn(model.comm, "close");
    view.remove();
    await frame.destroy();
    expect(model.comm.close).not.toHaveBeenCalled();
    expect(frame.port).toBe(null);
    expect(view._models.size).toBe(0);
    // Cleanup executes in the iframe. The parent has revoked its authority,
    // so cleanup cannot send new kernel messages through the removed view.
    const count = sent.length;
    model.set_state({ value: 8 });
    await Promise.resolve();
    expect(sent.length).toBe(count);
  });

  it("finishes async AFM cleanup when the real output component detaches the view first", async () => {
    model.set_state({
      _esm: `export default {
        initialize({signal}) {
          signal.addEventListener("abort", () => window.lumineOutput.send({type:"initialize-aborted"}));
        },
        render({model,signal}) {
          model.send({phase:"render"});
          return async () => {
            await new Promise(resolve => setTimeout(resolve, 20));
            window.lumineOutput.send({type:"view-cleanup", aborted:signal.aborted});
          };
        }
      };`,
    });
    const { WidgetView } = require("../lib/components/result-view/widget");
    component = new WidgetView({ modelId: model.model_id, manager });
    document.body.appendChild(component.element);
    await waitFor(() => sent.some((message) => message.data.content?.phase === "render"));
    view = component.view;
    const frame = view.frame;
    const iframe = frame.refs.frame;
    expect(iframe.isConnected).toBe(true);
    const received = [];
    const original = frame._receive.bind(frame);
    frame._receive = (data) => {
      received.push(data);
      original(data);
    };

    component.destroy();
    component = null;
    await frame.destroy();

    expect(received.some((data) => data.type === "initialize-aborted")).toBe(true);
    expect(received.some((data) => data.type === "view-cleanup" && data.aborted)).toBe(true);
    expect(received.some((data) => data.type === "lumine-output-disposed")).toBe(true);
    expect(iframe.isConnected).toBe(false);
    expect(frame.port).toBe(null);
    expect(view.el.isConnected).toBe(false);
    expect(view._models.size).toBe(0);
  });
});
