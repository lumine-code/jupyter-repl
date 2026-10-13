const path = require("node:path");
const vm = require("node:vm");
const { prepareGenerationImports } = require("../script/prepare-original-view-fixture");

describe("original regression control generation fixtures", () => {
  it("refreshes constructors and helper aliases while retaining explicitly captured old references", async () => {
    const parser = require(
      require.resolve("@babel/parser", { paths: [lumine.keymaps.resourcePath] }),
    );
    const root = path.resolve(__dirname, "fixtures/original-generation");
    const source = `
      const Box = require("../lib/box");
      const { owner } = Box;
      describe("original cases", () => {
        let created;
        beforeEach(async () => {
          await lumine.packages.activatePackage();
          created = new Box();
        });
        it("keeps the original assertions", async () => {
          if (created.owner !== owner) throw new Error("constructor and helper generations differ");
          const previous = Box;
          await lumine.packages.activatePackage();
          if (previous === Box) throw new Error("old reference was revived");
          if (new Box().owner !== owner) throw new Error("helper alias was not refreshed");
        });
      });
    `;
    const prepared = prepareGenerationImports(
      source,
      path.join(root, "spec/example-spec.js"),
      root,
      parser,
    );
    const hooks = { before: [], after: [], cases: [] };
    const listeners = new Set();
    let currentPackage;
    let currentOwner = {};
    let CurrentBox = class {
      static owner = currentOwner;
      owner = currentOwner;
    };
    const packages = {
      getLoadedPackage: () => currentPackage,
      onDidActivatePackage(callback) {
        listeners.add(callback);
        return { dispose: () => listeners.delete(callback) };
      },
      async activatePackage() {
        currentOwner = {};
        CurrentBox = class {
          static owner = currentOwner;
          owner = currentOwner;
        };
        currentPackage = { name: "jupyter-repl", path: root };
        for (const callback of listeners) callback(currentPackage);
      },
    };
    vm.runInNewContext(prepared, {
      require(request) {
        if (request === "node:path") return path;
        if (request === "node:module") return { createRequire: () => () => CurrentBox };
        throw new Error(`Unexpected fixture import: ${request}`);
      },
      lumine: { packages },
      describe: (_name, callback) => callback(),
      beforeEach: (callback) => hooks.before.push(callback),
      afterEach: (callback) => hooks.after.push(callback),
      it: (_name, callback) => hooks.cases.push(callback),
    });
    expect(hooks.cases.length).toBe(1);
    for (const callback of hooks.before) await callback();
    await hooks.cases[0]();
    for (const callback of hooks.after.reverse()) await callback();
    expect(listeners.size).toBe(0);
    expect(prepared).toContain('it("keeps the original assertions"');
  });

  it("leaves fixtures without package library imports byte-identical", () => {
    const parser = require(
      require.resolve("@babel/parser", { paths: [lumine.keymaps.resourcePath] }),
    );
    const root = path.resolve(__dirname, "fixtures/original-generation");
    const source =
      'const helper = require("./helper");\ndescribe("original", () => it("case", helper));\n';
    expect(
      prepareGenerationImports(source, path.join(root, "spec/example-spec.js"), root, parser),
    ).toBe(source);
  });
});
