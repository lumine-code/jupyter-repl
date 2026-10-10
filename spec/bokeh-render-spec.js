describe("isolated Bokeh and Panel output", () => {
  let etch, Emitter, Session, renderDisplay, MEDIA_RENDERERS, captureExecution;
  let BokehView, BOKEH_LOAD, BOKEH_EXEC, PANEL_LOAD, PANEL_EXEC;
  let component, sessions;
  beforeEach(() => {
    // Lifecycle suites may have unloaded the package since these specs were
    // registered. Keep the renderer, public Session and output context together.
    etch = require("@lumine-code/etch");
    ({ Emitter } = require("lumine"));
    Session = require("../lib/plugin-api/jupyter-kernel");
    ({ renderDisplay, MEDIA_RENDERERS } = require("../lib/components/result-view/display"));
    ({ captureExecution } = require("../lib/traceback-context"));
    ({
      BokehView,
      BOKEH_LOAD,
      BOKEH_EXEC,
      PANEL_LOAD,
      PANEL_EXEC,
    } = require("../lib/components/result-view/bokeh"));
    sessions = [];
  });
  afterEach(async () => {
    await component?.destroy();
    component = null;
    for (const { emitter, resets } of sessions) {
      emitter.emit("did-destroy");
      emitter.dispose();
      resets.dispose();
    }
  });

  function sessionFor(transport = {}, id = "k") {
    const emitter = new Emitter();
    const resets = new Emitter();
    const session = new Session({
      id,
      emitter,
      transport: {
        lifecycle: "ready",
        onDidResetComms: (callback) => resets.on("reset", callback),
        ...transport,
      },
    });
    sessions.push({ emitter, resets });
    return {
      session,
      reset: () => resets.emit("reset", "Kernel restarted"),
      destroy: () => emitter.emit("did-destroy"),
    };
  }

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
    const first = sessionFor({}, "first").session;
    const second = sessionFor({}, "second").session;
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
      kernel: sessionFor(transport).session,
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
      kernel: sessionFor(transport).session,
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
    const kernel = sessionFor().session;
    const bundle = { "text/html": '<div id="plot">plot</div>' };
    component = new BokehView({ bundle, kernel });
    const frame = component.frame;
    const channel = { comm_id: "c", close: jasmine.createSpy("close") };
    component.comms.set("c", channel);
    await component.update({ bundle: { ...bundle }, kernel });
    expect(component.frame).toBe(frame);
    expect(channel.close).not.toHaveBeenCalled();
  });

  it("remounts identical output produced by a new session generation", async () => {
    const channel = {
      comm_id: "c",
      open: jasmine.createSpy("open"),
      close: () => {},
      on_msg: () => {},
      on_close: () => {},
    };
    const transport = {
      createComm: jasmine.createSpy("createComm").and.returnValue(channel),
      getComm: () => null,
    };
    const fixture = sessionFor(transport);
    const bundle = { "text/html": '<div id="plot">plot</div>' };
    component = new BokehView({ bundle, kernel: fixture.session, kernelGeneration: 0 });
    const frame = component.frame;
    fixture.reset();

    await component.update({ bundle: { ...bundle }, kernel: fixture.session, kernelGeneration: 1 });

    expect(component.frame).not.toBe(frame);
    expect(component.error).toBeNull();
    component.receive({ type: "plot-comm", operation: "open", id: "c", target: "bokeh" });
    expect(transport.createComm).toHaveBeenCalledTimes(1);
    expect(channel.open).toHaveBeenCalledTimes(1);
    expect(component.error).toBeNull();
  });

  it("keeps an old output disconnected when a redraw follows a session reset", async () => {
    const transport = { createComm: jasmine.createSpy("createComm"), getComm: () => null };
    const fixture = sessionFor(transport);
    const bundle = { "text/html": '<div id="plot">plot</div>' };
    component = new BokehView({ bundle, kernel: fixture.session, kernelGeneration: 0 });
    const frame = component.frame;
    fixture.reset();

    await component.update({ bundle: { ...bundle }, kernel: fixture.session, kernelGeneration: 0 });

    expect(component.frame).toBe(frame);
    expect(component.error).toContain("kernel session changed");
    component.receive({ type: "plot-comm", operation: "open", id: "c", target: "bokeh" });
    expect(transport.createComm).not.toHaveBeenCalled();
  });

  it("retains the output's captured generation through rendering and a later mount", () => {
    const transport = { createComm: jasmine.createSpy("createComm"), getComm: () => null };
    const fixture = sessionFor(transport);
    const output = {
      output_type: "display_data",
      data: { [BOKEH_EXEC]: "", "text/html": '<div id="plot">plot</div>' },
    };
    captureExecution(null, fixture.session, "plot()", 0)(output);
    fixture.reset();

    const vnode = renderDisplay(output);
    component = new BokehView(vnode.props);

    expect(vnode.props.kernelGeneration).toBe(0);
    expect(component.error).toContain("kernel session changed");
    component.receive({ type: "plot-comm", operation: "open", id: "c", target: "bokeh" });
    expect(transport.createComm).not.toHaveBeenCalled();
  });

  it("refuses live comms for historical output with an unknown generation", () => {
    const transport = { createComm: jasmine.createSpy("createComm"), getComm: () => null };
    const fixture = sessionFor(transport);
    const vnode = MEDIA_RENDERERS[BOKEH_EXEC](
      "",
      {},
      { "text/html": '<div id="plot">plot</div>' },
      { kernel: fixture.session, kernelGeneration: null },
    );
    component = new BokehView(vnode.props);

    expect(component.props.kernelGeneration).toBeNull();
    component.receive({ type: "plot-comm", operation: "open", id: "c", target: "bokeh" });
    expect(transport.createComm).not.toHaveBeenCalled();
  });

  for (const transition of ["reset", "destroy"]) {
    it(`closes its comms and refuses old frame messages when the session ${transition}s`, () => {
      const channel = {
        comm_id: "c",
        open: () => {},
        close: jasmine.createSpy("close"),
        on_msg: () => {},
        on_close: () => {},
      };
      const target = { dispose: jasmine.createSpy("dispose target") };
      const transport = {
        createComm: jasmine.createSpy("createComm").and.returnValue(channel),
        getComm: () => null,
        registerCommTarget: jasmine.createSpy("registerCommTarget").and.returnValue(target),
      };
      const fixture = sessionFor(transport);
      component = new BokehView({
        bundle: { "text/html": '<div id="plot">plot</div>' },
        kernel: fixture.session,
      });
      expect(fixture.session.transport).toBeUndefined();
      component.receive({ type: "plot-comm", operation: "register", target: "bokeh" });
      component.receive({ type: "plot-comm", operation: "open", id: "c", target: "bokeh" });

      fixture[transition]();

      expect(target.dispose).toHaveBeenCalledTimes(1);
      expect(channel.close).toHaveBeenCalledTimes(1);
      expect(component.error).toContain("kernel session changed");
      component.receive({ type: "plot-comm", operation: "open", id: "next", target: "bokeh" });
      expect(transport.createComm).toHaveBeenCalledTimes(1);
    });
  }

  it("executes notebook HTML only inside an opaque-origin frame", async () => {
    component = new BokehView({ bundle: { "text/html": "<div>safe</div>" } });
    etch.updateSync(component);
    const iframe = component.element.querySelector("iframe");
    expect(iframe.getAttribute("sandbox")).toBe("allow-scripts");
    expect(component.element.querySelectorAll("script").length).toBe(0);
    expect(iframe.src).toContain("isolated-frame.html");
  });
});
