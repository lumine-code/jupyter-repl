describe("Gateway authentication current SDK boundary", () => {
  let picker, ServerConnection;
  beforeEach(async () => {
    await lumine.packages.activatePackage("jupyter-repl");
    const WSKernelPicker = require("../lib/ws-kernel-picker");
    ({ ServerConnection } = require("@jupyterlab/services"));
    picker = new WSKernelPicker(() => {});
    spyOn(picker, "loadSessions").and.resolveTo();
  });
  afterEach(async () => {
    picker.destroy();
    await lumine.packages.deactivatePackage("jupyter-repl");
  });
  for (const kind of ["cookie", "token"]) {
    it(`passes entered ${kind} authentication to the actual SDK request boundary without a transfer`, async () => {
      const flow = picker._beginFlow(null, { filePath: "controlled.py" });
      flow.gatewayOptions = { baseUrl: "https://controlled-gateway.invalid/" };
      flow.credentialKind = kind;
      await picker.onCredential(kind === "cookie" ? "scratch=1" : "scratch-token");
      const settings = ServerConnection.makeSettings(flow.gatewayOptions);
      // Stub the outermost fetch on this private settings object, regardless
      // of whether the SDK captured Node's or Chromium's default implementation.
      const fetched = (settings.fetch = jasmine
        .createSpy("controlled SDK fetch")
        .and.resolveTo({ ok: true }));
      await ServerConnection.makeRequest(
        "https://controlled-gateway.invalid/api/kernelspecs",
        { method: "GET" },
        settings,
      );
      const request = fetched.calls.mostRecent().args[0];
      expect(request.headers.get(kind === "cookie" ? "Cookie" : "Authorization")).toBe(
        kind === "cookie" ? "scratch=1" : "token scratch-token",
      );
      expect(picker.loadSessions).toHaveBeenCalledTimes(1);
    });
  }
});
