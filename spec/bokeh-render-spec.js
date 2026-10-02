const etch = require("@lumine-code/etch");
const { renderDisplay, MEDIA_RENDERERS } = require("../lib/components/result-view/display");
const {
  BokehView,
  BOKEH_LOAD,
  BOKEH_EXEC,
  PANEL_LOAD,
  PANEL_EXEC,
} = require("../lib/components/result-view/bokeh");

describe("isolated Bokeh and Panel output", () => {
  let component;
  afterEach(async () => {
    await component?.destroy();
    component = null;
  });

  it("prefers the marker renderer to the HTML and JavaScript fallbacks", () => {
    for (const mime of [BOKEH_EXEC, PANEL_EXEC]) {
      const vnode = renderDisplay({
        output_type: "display_data",
        data: {
          [mime]: "",
          "text/html": '<div id="plot"></div>',
          "application/javascript": "window.plot = true;",
        },
      });
      expect(vnode.tag).toBe(BokehView);
      expect(vnode.props.panel).toBe(mime === PANEL_EXEC);
    }
  });

  it("keeps loading resources scoped to their originating kernel", () => {
    const first = { id: "first" };
    const second = { id: "second" };
    const load = MEDIA_RENDERERS[BOKEH_LOAD];
    load("window.Bokeh = {};", null, {}, { kernel: first });
    const bundle = { "text/html": "<div>plot</div>" };
    const firstView = MEDIA_RENDERERS[BOKEH_EXEC]("", {}, bundle, { kernel: first });
    const secondView = MEDIA_RENDERERS[BOKEH_EXEC]("", {}, bundle, { kernel: second });
    expect(firstView.props.loadCode).toEqual(["window.Bokeh = {};"]);
    expect(secondView.props.loadCode).toEqual([]);
    const vnode = MEDIA_RENDERERS[PANEL_LOAD]("load panel", {}, {}, { kernel: first });
    expect(vnode.props.hidden).toBeTrue();
  });

  it("does not create comms or execute requests on an unrelated target", () => {
    const transport = { createComm: jasmine.createSpy("createComm"), getComm: () => null };
    component = new BokehView({
      bundle: { "text/html": '<div id="plot">plot</div>' },
      kernel: { id: "k", transport },
    });
    component.receive({
      type: "plot-comm",
      operation: "open",
      id: "c",
      target: "unrelated-target",
    });
    expect(transport.createComm).not.toHaveBeenCalled();
    expect(component.error).toContain("unrelated comm target");
  });

  it("forwards messages only for comms owned by this output and closes them", () => {
    const channel = {
      comm_id: "c",
      open: jasmine.createSpy("open"),
      send: jasmine.createSpy("send"),
      close: jasmine.createSpy("close"),
      on_msg: () => {},
      on_close: () => {},
    };
    const transport = { createComm: () => channel, getComm: () => null };
    component = new BokehView({
      bundle: { "text/html": '<div id="plot">plot</div>' },
      kernel: { id: "k", transport },
    });
    component.receive({
      type: "plot-comm",
      operation: "open",
      id: "c",
      target: "bokeh",
      data: { ready: true },
    });
    expect(channel.open).toHaveBeenCalledWith({ ready: true }, undefined, undefined, undefined);
    component.receive({ type: "plot-comm", operation: "send", id: "c", data: { patch: 1 } });
    expect(channel.send).toHaveBeenCalledWith({ patch: 1 }, undefined, undefined, undefined);
    component.receive({ type: "plot-comm", operation: "send", id: "other", data: { patch: 2 } });
    expect(channel.send.calls.count()).toBe(1);
    component.disposeComms();
    expect(channel.close).toHaveBeenCalled();
  });

  it("keeps its frame and comms when a notebook redraw normalizes a fresh bundle", async () => {
    const kernel = { id: "k" };
    const bundle = { "text/html": '<div id="plot">plot</div>' };
    component = new BokehView({ bundle, kernel });
    const frame = component.frame;
    const channel = { comm_id: "c", close: jasmine.createSpy("close") };
    component.comms.set("c", channel);
    await component.update({ bundle: { ...bundle }, kernel });
    expect(component.frame).toBe(frame);
    expect(channel.close).not.toHaveBeenCalled();
  });

  it("executes notebook HTML only inside an opaque-origin frame", async () => {
    component = new BokehView({ bundle: { "text/html": "<div>safe</div>" } });
    etch.updateSync(component);
    const iframe = component.element.querySelector("iframe");
    expect(iframe.getAttribute("sandbox")).toBe("allow-scripts");
    expect(component.element.querySelectorAll("script").length).toBe(0);
    expect(iframe.src).toContain("isolated-frame.html");
  });
});
