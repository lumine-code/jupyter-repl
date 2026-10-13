describe("gateway native runtime ownership", () => {
  let runtime, picker;
  const deferred = () => {
    let resolve;
    const promise = new Promise((complete) => {
      resolve = complete;
    });
    return { promise, resolve };
  };
  beforeEach(async () => {
    jasmine.useRealClock();
    await lumine.packages.activatePackage("jupyter-repl");
    runtime = require("../lib/gateway-runtime");
    const Picker = require("../lib/ws-kernel-picker");
    picker = new Picker(() => {});
    spyOn(picker, "loadSessions").and.resolveTo();
  });
  afterEach(async () => {
    picker.destroy();
    await lumine.packages.deactivatePackage("jupyter-repl");
  });
  function begin() {
    const flow = picker._beginFlow(null, null);
    flow.gatewayOptions = { baseUrl: "https://controlled-gateway.invalid/", token: "controlled" };
    return flow;
  }
  it("shares concurrent imports and preserves SDK CommonJS identity", async () => {
    const first = runtime.load();
    expect(runtime.load()).toBe(first);
    const gateway = await first;
    expect(gateway.KernelManager).toBe(require("@jupyterlab/services").KernelManager);
    expect(gateway.WebSocket).toBe(require("ws"));
    expect((await runtime.loadCookieTransport()).Request).toBe(require("node-fetch").Request);
  });
  it("does not configure or contact a gateway abandoned during import", async () => {
    const pending = deferred();
    const gateway = await runtime.load();
    spyOn(runtime, "load").and.returnValue(pending.promise);
    const flow = begin();
    const request = picker.finishAuth(flow);
    picker.destroy();
    pending.resolve(gateway);
    await request;
    expect(flow.gatewayOptions.wsFactory).toBeUndefined();
    expect(picker.loadSessions).not.toHaveBeenCalled();
  });
  it("lets the current flow win when an old import finishes late", async () => {
    const gateway = await runtime.load();
    const pending = deferred();
    spyOn(runtime, "load").and.returnValue(pending.promise);
    const original = begin();
    const earlier = picker.finishAuth(original);
    const current = begin();
    const later = picker.finishAuth(current);
    pending.resolve(gateway);
    await Promise.all([earlier, later]);
    expect(picker.loadSessions).toHaveBeenCalledTimes(1);
    expect(picker.loadSessions).toHaveBeenCalledWith(current);
    expect(original.gatewayOptions.wsFactory).toBeUndefined();
  });
  it("keeps the flow available for retry when a runtime import fails", async () => {
    const gateway = await runtime.load();
    spyOn(runtime, "load").and.returnValues(
      Promise.reject(new Error("Cannot import gateway runtime")),
      Promise.resolve(gateway),
    );
    const notification = spyOn(lumine.notifications, "addError");
    const flow = begin();
    await picker.finishAuth(flow);
    expect(picker.loadSessions).not.toHaveBeenCalled();
    expect(notification).toHaveBeenCalled();
    expect(picker._isCurrentFlow(flow)).toBe(true);
    await picker.finishAuth(flow);
    expect(picker.loadSessions).toHaveBeenCalledWith(flow);
  });
});
