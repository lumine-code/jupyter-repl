const { Emitter, Disposable } = require("lumine");
let createInputController;

function fakeProvider(kernels = []) {
  const emitter = new Emitter();
  return {
    emitter,
    getRunningKernels: () => kernels,
    getActiveKernel: () => kernels[0] || null,
    getFilesForKernel: () => [],
    observeActiveKernel(callback) {
      callback(kernels[0] || null);
      return new Disposable();
    },
    onDidChangeKernels: (callback) => emitter.on("did-change-kernels", callback),
  };
}

describe("UI ownership of kernel input", () => {
  let tools, provider, emitter, views;
  beforeEach(async () => {
    ({ createInputController } = require("../lib/ui/input-controller"));
    const InputView = require("../lib/input-view");
    views = [];
    emitter = new Emitter();
    const session = {
      id: "session-input",
      isDestroyed: () => false,
      onDidRequestInput: (callback) => emitter.on("input", callback),
      onDidChangeGeneration: (callback) => emitter.on("generation", callback),
      onDidDestroy: (callback) => emitter.on("destroy", callback),
    };
    provider = fakeProvider([session]);
    tools = createInputController({
      getProvider: () => provider,
    });
    spyOn(InputView.prototype, "attach").and.callFake(function () {
      views.push(this);
    });
    tools.activate();
    await Promise.resolve();
  });
  afterEach(() => {
    tools.dispose();
    emitter.dispose();
    provider.emitter.dispose();
  });

  function request() {
    const closed = new Emitter();
    const input = {
      prompt: "Name: ",
      password: true,
      reply: jasmine.createSpy("reply"),
      onDidClose: (callback) => closed.on("closed", callback),
    };
    emitter.emit("input", input);
    return { input, closed };
  }

  it("creates an input view only when requested and sends confirmation once", () => {
    expect(views).toEqual([]);
    const { input, closed } = request();
    views[0].miniEditor.setText("answer");
    views[0].confirm();
    views[0].confirm();
    expect(input.reply).toHaveBeenCalledOnceWith("answer");
    expect(views[0].closed).toBe(true);
    closed.dispose();
  });

  it("closes the view when its owning execution retires", () => {
    const { input, closed } = request();
    closed.emit("closed");
    views[0].confirm();
    expect(views[0].closed).toBe(true);
    expect(input.reply).not.toHaveBeenCalled();
    closed.dispose();
  });

  it("closes a pending prompt on generation replacement and controller disposal", () => {
    const first = request();
    emitter.emit("generation", 1);
    expect(views[0].closed).toBe(true);
    const second = request();
    tools.dispose();
    expect(views[1].closed).toBe(true);
    views[1].confirm();
    expect(first.input.reply).not.toHaveBeenCalled();
    expect(second.input.reply).not.toHaveBeenCalled();
    first.closed.dispose();
    second.closed.dispose();
  });
});
