describe("Notebook kernel discovery error lifetime", () => {
  let integration, editor, service, manager, rejectDiscovery, notifications;
  const settle = async () => {
    for (let index = 0; index < 20; index++) await Promise.resolve();
  };
  beforeEach(async () => {
    await lumine.packages.activatePackage("jupyter-repl");
    integration = require("../lib/adapter-integration");
    integration.activateAdapterIntegration();
    editor = await lumine.workspace.open();
    const adapter = {
      getPaneItem: () => editor,
      getKernelOwner: () => editor,
      getPath: () => editor.getPath(),
      getMetadata: () => ({}),
      getKernelLanguage: () => "python",
      getKernelGrammar: () => editor.getGrammar(),
      getRunTargets: () => [],
      getRunTarget: () => null,
    };
    service = {
      getActiveAdapter: () => adapter,
      getAdapterForItem: (item) => (item === editor ? adapter : null),
    };
    manager = {
      getAllKernelSpecs: jasmine.createSpy("controlled kernel discovery").and.callFake(
        () =>
          new Promise((_resolve, reject) => {
            rejectDiscovery = reject;
          }),
      ),
    };
    notifications = spyOn(lumine.notifications, "addError");
  });
  afterEach(async () => {
    integration.disposeAdapterIntegration();
    await lumine.packages.deactivatePackage("jupyter-repl");
    editor.destroy();
  });
  for (const route of ["start", "run"]) {
    const begin = () =>
      route === "start"
        ? integration.startAdapterKernel([service], manager)
        : integration.runAdapterTargets([service], manager);
    it(`ignores a retired ${route} discovery rejection after a replacement integration becomes active`, async () => {
      begin();
      await settle();
      expect(manager.getAllKernelSpecs).toHaveBeenCalledTimes(1);
      integration.disposeAdapterIntegration();
      integration.activateAdapterIntegration();
      rejectDiscovery(new Error("Obsolete kernel discovery"));
      await settle();
      expect(notifications).not.toHaveBeenCalled();
    });
    it(`still reports the current ${route} discovery error`, async () => {
      begin();
      await settle();
      rejectDiscovery(new Error("Current kernel discovery"));
      await settle();
      expect(notifications).toHaveBeenCalledTimes(1);
      expect(notifications.calls.mostRecent().args[1].description).toBe("Current kernel discovery");
    });
  }
});
