const path = require("path");
const manifest = require(path.join(__dirname, "..", "package.json"));
const main = require(path.join(__dirname, "..", manifest.main));

// A service whose method has been renamed away is not an error anywhere: the
// editor logs a warning nobody reads and the other side simply never connects.
// Every panel that left this package depends on `jupyter.kernel`, so a typo
// here breaks four packages silently.

describe("the services this package declares", () => {
  it("exposes a method for each one", () => {
    const declared = [
      ...Object.values(manifest.providedServices || {}),
      ...Object.values(manifest.consumedServices || {}),
    ].flatMap((service) => Object.values(service.versions));

    expect(declared.length).toBeGreaterThan(0);
    for (const method of declared) {
      expect(typeof main[method]).toBe("function");
    }
  });

  it("still provides the kernel hub the extracted panels consume", () => {
    expect(manifest.providedServices["jupyter.kernel"].versions["1.0.0"]).toBe(
      "provideJupyterKernel",
    );
  });

  it("provides the output renderer the family renders with", () => {
    expect(manifest.providedServices["jupyter.output"].versions["1.0.0"]).toBe(
      "provideJupyterOutput",
    );
  });

  it("provides the execution pipeline the cell commands moved onto", () => {
    // Every jupyter-cells run command and jupyter-view's toolbar dispatch
    // through this; a typo here strands both packages silently.
    expect(manifest.providedServices["jupyter.execution"].versions["1.0.0"]).toBe(
      "provideJupyterExecution",
    );
    // The breakpoints service retired with the cell layer; the model is
    // jupyter-cells' to provide, under jupyter.cells.
    expect(manifest.providedServices["jupyter.breakpoints"]).toBeUndefined();
    expect(manifest.consumedServices["jupyter.cells"].versions["^1.0.0"]).toBe(
      "consumeJupyterCells",
    );
  });

  // `activateServices` runs inside `activateNow`, which a package waiting on an
  // activation command never reaches, so a lazy provider has published nothing.
  // This package used to defer — defensible while everything it provided was
  // only useful once a kernel ran — but `jupyter.output` is what jupyter-view
  // renders a stored notebook with, kernels or not, so it must exist at
  // startup. What stays lazy instead is everything heavy behind the surface.
  it("activates eagerly, because rendering must not wait for a kernel", () => {
    expect(manifest.activationCommands).toBeUndefined();
    expect(manifest.activationHooks).toBeUndefined();
  });
});

describe("what eager activation is allowed to load", () => {
  // The bargain that makes eager activation acceptable: activating and
  // providing the service parses only package-local code. The native kernel
  // transport and the heavy renderers must stay behind lazy, function-body
  // requires until something actually uses them.
  //
  // Checked statically, not through require.cache: other spec files load the
  // kernel stack legitimately, so the cache says nothing about activation. A
  // top-level require sits at column 0 in this codebase (prettier), and a
  // function-body require is indented — that distinction is the whole test.
  it("keeps the kernel transport and the heavy renderers off the startup path", () => {
    const fs = require("fs");
    const bannedExternals = new Set([
      "zeromq",
      "@nteract/any-vega",
      "plotly.js-dist",
      "@mathjax/src",
      // The widget stack. `jupyter-widgets` is the pre-bundled copy under
      // lib/vendor, about 700 KB; the scoped names are banned too so a direct
      // require of one is caught rather than resolving to the same weight by
      // another road.
      "@jupyter-widgets/base",
      "@jupyter-widgets/base-manager",
      "@jupyter-widgets/controls",
      "@jupyter-widgets/output",
      "@lumino/widgets",
    ]);
    const bannedLocals = new Set([
      "jmp",
      "zmq-kernel",
      "ws-kernel",
      "ws-kernel-picker",
      // Loads the widget bundle. widget-registry, which is what the renderer
      // actually consults, is dependency-free and deliberately not banned.
      "widget-manager",
      "widget-output",
      "jupyter-widgets",
    ]);
    const libRoot = path.join(__dirname, "..", "lib");

    const resolveLocal = (fromDir, specifier) => {
      const base = path.resolve(fromDir, specifier);
      for (const candidate of [
        base,
        `${base}.js`,
        `${base}.jsx`,
        path.join(base, "index.js"),
        path.join(base, "index.jsx"),
      ]) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return candidate;
        }
      }
      return null;
    };

    const seen = new Set();
    const queue = [path.join(libRoot, "main.js"), path.join(libRoot, "output-service.js")];
    const offences = [];

    while (queue.length > 0) {
      const file = queue.pop();
      if (seen.has(file)) continue;
      seen.add(file);

      for (const line of fs.readFileSync(file, "utf8").split("\n")) {
        // Only a top-level require loads at activation.
        if (/^\s/.test(line)) continue;
        const match = line.match(/require\("([^"]+)"\)/);
        if (!match) continue;
        const specifier = match[1];

        if (!specifier.startsWith(".")) {
          if (bannedExternals.has(specifier)) {
            offences.push(`${path.basename(file)} -> ${specifier}`);
          }
          continue;
        }

        const resolved = resolveLocal(path.dirname(file), specifier);
        if (!resolved) continue;
        if (bannedLocals.has(path.basename(resolved, ".js"))) {
          offences.push(`${path.basename(file)} -> ${specifier}`);
          continue;
        }
        queue.push(resolved);
      }
    }

    // Guard the guard: an empty walk would pass vacuously.
    expect(seen.size).toBeGreaterThan(20);
    expect(offences).toEqual([]);
  });
});

describe("the jupyter.output surface", () => {
  const service = main.provideJupyterOutput();

  it("exposes everything the contract documents", () => {
    const documented = [
      "renderDisplay",
      "renderOutput",
      "renderRichMedia",
      "renderStatus",
      "MEDIA_RENDERERS",
      "SUPPORTED_MEDIA_TYPES",
      "pickRenderers",
      "isTextOutputOnly",
      "ansiNodes",
      "ansiToText",
      "escapeCarriageReturn",
      "truncateOutput",
      "sanitizeHtml",
      "OutputStore",
      "reduceOutputs",
      "normalizeOutput",
      "msgSpecToNotebookFormat",
      "getOutputPlainText",
      "OUTPUT_TYPES",
      "History",
      "ScrollList",
      "getImage",
      "getAllText",
      "hasCopyableContent",
      "copyToClipboard",
      "saveImage",
      "openInEditor",
    ];

    for (const key of documented) {
      expect(service[key] ?? `missing: ${key}`).not.toBe(`missing: ${key}`);
    }
  });

  it("hands out vnodes that are elements, never bare fragments", () => {
    // A fragment is a Symbol private to one etch copy; it does not survive the
    // package boundary a service crosses. Every renderer must root its output
    // in a real element.
    const etch = require("@lumine-code/etch");
    const dummies = {
      "application/json": {},
      "application/javascript": "1 + 1",
      "text/html": "<b>x</b>",
      "text/markdown": "# x",
      "text/latex": "$x$",
      "image/svg+xml": "<svg xmlns='http://www.w3.org/2000/svg'></svg>",
      "text/plain": "x",
    };

    for (const mediaType of service.SUPPORTED_MEDIA_TYPES) {
      const data = mediaType in dummies ? dummies[mediaType] : {};
      const vnode = service.MEDIA_RENDERERS[mediaType](data, {});
      expect(vnode ?? `no vnode for ${mediaType}`).not.toBe(`no vnode for ${mediaType}`);
      expect(vnode.tag).not.toBe(etch.Fragment);
    }
  });
});
