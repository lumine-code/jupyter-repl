describe("concurrent kernel pickers in editor windows", () => {
  beforeEach(async () => {
    jasmine.useRealClock();
    jasmine.attachToDOM(lumine.workspace.getElement());
    await lumine.packages.activatePackage("jupyter-repl");
  });
  afterEach(async () => {
    await lumine.packages.deactivatePackage("jupyter-repl");
    await lumine.workspace.discardEditorWindows();
  });
  it("keeps local kernel choices bound to each initiating editor", async () => {
    const { KernelManager } = require("../lib/kernel-manager");
    const KernelPicker = require("../lib/kernel-picker");
    const workspace = lumine.workspace;
    const first = await workspace.open();
    const extra = await workspace.openEditorWindow({ show: false });
    const second = workspace.buildTextEditor();
    extra.getEditorContainer().getActivePane().activateItem(second, { activatePane: true });
    const spec = { name: "python3", display_name: "Python 3", language: "python" };
    const specs = spyOn(KernelManager.prototype, "getAllKernelSpecsForGrammar").and.resolveTo([
      spec,
    ]);
    const start = spyOn(KernelManager.prototype, "startKernel");
    const pickers = [];
    const toggle = KernelPicker.prototype.toggle;
    spyOn(KernelPicker.prototype, "toggle").and.callFake(function (context) {
      pickers.push(this);
      return toggle.call(this, context);
    });
    const local = lumine.commands.dispatch(first.getElement(), "jupyter-repl:start-local-kernel");
    const remote = lumine.commands.dispatch(second.getElement(), "jupyter-repl:start-local-kernel");
    await Promise.all([local, remote]);
    expect(specs.calls.count()).toBe(2);
    expect(pickers.length).toBe(2);
    expect(pickers.every((picker) => picker.selectListHost.isVisible())).toBe(true);
    expect(pickers[0].selectList.getElement().ownerDocument).toBe(
      workspace.getMainWindow().getDocument(),
    );
    expect(pickers[1].selectList.getElement().ownerDocument).toBe(extra.getDocument());
    for (const picker of pickers) {
      await picker.selectList.selectItem(spec);
      await picker.selectList.confirmSelection();
    }
    expect(start.calls.allArgs().map((args) => args[2])).toEqual([first, second]);
  });
});
