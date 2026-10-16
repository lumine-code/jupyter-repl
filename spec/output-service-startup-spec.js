const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

describe("the output service bootstrap", () => {
  let main, factory, renderer, data, rendererLoads, dataLoads;

  beforeEach(() => {
    rendererLoads = 0;
    dataLoads = 0;
    data = { createOutputAccumulator: jasmine.createSpy().and.returnValue({ outputs: [] }) };
    const accumulatorModule = { exports: {} };
    vm.runInNewContext(
      fs.readFileSync(path.join(__dirname, "../lib/output-accumulator.js"), "utf8"),
      {
        module: accumulatorModule,
        require: (request) => {
          if (request !== "./output-utils") throw new Error(`Unexpected module: ${request}`);
          dataLoads++;
          return data;
        },
      },
    );
    factory = accumulatorModule.exports;
    renderer = {
      createOutputAccumulator: factory,
      renderOutput: jasmine.createSpy(),
      dispose: jasmine.createSpy(),
    };
    const mainModule = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../lib/main.js"), "utf8"), {
      module: mainModule,
      __dirname: path.resolve(__dirname, "../lib"),
      require: (request) => {
        if (request === "lumine") return {};
        if (request === "./code-manager-state") return {};
        if (request === "node:path") return path;
        if (request === "./kernel-availability") return require("../lib/kernel-availability");
        if (request === "./output-accumulator") return factory;
        if (request === "./output-service") {
          rendererLoads++;
          return { outputService: renderer };
        }
        throw new Error(`Unexpected bootstrap module: ${request}`);
      },
    });
    main = mainModule.exports;
  });

  it("keeps a cold kernel availability query independent of the runtime and session wrappers", () => {
    const service = main.provideJupyterKernel();
    expect(service.peekKernelState({ item: {} })).toBeNull();
    expect(rendererLoads).toBe(0);
    expect(dataLoads).toBe(0);
  });

  it("connects the accumulator factory without loading data or renderer modules", () => {
    const service = main.provideJupyterOutput();
    expect(main.provideJupyterOutput() === service).toBe(true);
    expect(service.createOutputAccumulator).toBe(factory);
    expect("createOutputAccumulator" in service).toBe(true);
    expect(Object.getOwnPropertyDescriptor(service, "createOutputAccumulator").value).toBe(factory);
    expect(rendererLoads).toBe(0);
    expect(dataLoads).toBe(0);

    const accumulator = service.createOutputAccumulator("initial");
    expect(data.createOutputAccumulator).toHaveBeenCalledOnceWith("initial");
    expect(accumulator).toEqual({ outputs: [] });
    expect(rendererLoads).toBe(0);
    expect(dataLoads).toBe(1);
  });

  it("keeps the factory identity when rendering first loads the implementation", () => {
    const service = main.provideJupyterOutput();
    const captured = service.createOutputAccumulator;
    expect(service.renderOutput).toBe(renderer.renderOutput);
    expect(service.createOutputAccumulator).toBe(captured);
    expect(captured).toBe(renderer.createOutputAccumulator);
    expect(rendererLoads).toBe(1);
    service.retire();
    service.retire();
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
  });

  it("retires an unused facade without loading either implementation", () => {
    const service = main.provideJupyterOutput();
    service.retire();
    expect(() => service.createOutputAccumulator).toThrowError(/retired/);
    expect(() => "createOutputAccumulator" in service).toThrowError(/retired/);
    expect(() => Object.getOwnPropertyDescriptor(service, "createOutputAccumulator")).toThrowError(
      /retired/,
    );
    expect(rendererLoads).toBe(0);
    expect(dataLoads).toBe(0);
  });
});

describe("the output data bootstrap", () => {
  it("accumulates terminal text without loading JSX, Etch or ANSI rendering", () => {
    const requested = [];
    const isolatedModule = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../lib/output-utils.js"), "utf8"), {
      module: isolatedModule,
      require: (request) => {
        requested.push(request);
        if (request === "path" || request === "url") return require(request);
        if (request === "./stream-text") return require("../lib/stream-text");
        throw new Error(`Unexpected output data dependency: ${request}`);
      },
    });
    const accumulator = isolatedModule.exports.createOutputAccumulator();
    accumulator.append({ output_type: "stream", name: "stdout", text: "progress 0%\r" });
    accumulator.append({ output_type: "stream", name: "stdout", text: "done\n" });
    expect(accumulator.outputs.map(({ text }) => text)).toEqual(["doneress 0%\n"]);
    expect(requested).toEqual(["path", "url", "./stream-text"]);
  });
});
