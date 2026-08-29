#!/usr/bin/env node
// Build lib/vendor/jupyter-widgets.js.
//
// @jupyter-widgets/{base,base-manager,controls} and @lumino/widgets publish ESM
// whose relative specifiers carry no extension — `export * from './widget'`.
// Their manifests name a plain `main` and set no `type`, so they read as
// CommonJS, but nothing resolves those specifiers except a bundler with
// Node-style resolution, which is how JupyterLab consumes them. Node's ESM
// loader cannot, and neither can Lumine: src/babel.js only compiles files
// carrying an opt-in prefix, so a dependency goes straight to Node's loader and
// fails there exactly as it does under plain node.
//
// So they are bundled, and only they are: every other dependency in the widget
// stack — jquery, backbone, d3-color, d3-format, nouislider, sanitize-html,
// base64-js, the rest of @lumino — is ordinary CommonJS and stays an ordinary
// dependency, resolved from node_modules at runtime. That keeps the artifact to
// about 700 KB.
//
// The result is committed rather than built on install: the editor's CI runs
// `npm ci --ignore-scripts`, so a prepare script would leave the bundle missing
// exactly where the specs run. It is left unminified on purpose — a widget that
// throws in the renderer should produce a readable stack, and an ipywidgets
// upgrade should produce a diff someone can look at.
//
// Re-run with `npm run build:widgets` after changing any @jupyter-widgets
// version, and commit the result.

const path = require("path");
const esbuild = require("esbuild");

const PACKAGE_ROOT = path.join(__dirname, "..");
const OUTFILE = path.join(PACKAGE_ROOT, "lib", "vendor", "jupyter-widgets.js");
const REALM_OUTFILE = path.join(PACKAGE_ROOT, "lib", "vendor", "jupyter-widgets-realm.js");

// The entry names only what has to be bundled. Anything reachable from here
// that is already requireable is listed below instead.
const ENTRY = [
  'export * as base from "@jupyter-widgets/base";',
  'export * as baseManager from "@jupyter-widgets/base-manager";',
  'export * as controls from "@jupyter-widgets/controls";',
  // @lumino/widgets is in here anyway as a dependency of controls, and the
  // renderer needs its attach messages: a box, tab or accordion view lays
  // itself out only once Lumino tells it it is attached. Exporting the copy
  // already bundled costs nothing and avoids a second, unresolvable require.
  'export * as lumino from "@lumino/widgets";',
].join("\n");

// Left out of the bundle and required from node_modules at runtime. Every one
// of these is CommonJS already, so bundling them would only duplicate code —
// and @jupyterlab/services in particular must stay shared, since the transport
// layer talks to the same copy.
const EXTERNAL = [
  "@jupyterlab/services",
  "@lumino/algorithm",
  "@lumino/coreutils",
  "@lumino/disposable",
  "@lumino/domutils",
  "@lumino/messaging",
  "@lumino/properties",
  "@lumino/signaling",
  "@lumino/virtualdom",
  "backbone",
  "base64-js",
  "d3-color",
  "d3-format",
  "jquery",
  "nouislider",
  "sanitize-html",
  "underscore",
];

function versionOf(name) {
  return require(`${name}/package.json`).version;
}

async function main() {
  const versions = [
    "@jupyter-widgets/base",
    "@jupyter-widgets/base-manager",
    "@jupyter-widgets/controls",
  ]
    .map((name) => `//   ${name}@${versionOf(name)}`)
    .join("\n");

  const common = {
    stdin: {
      contents: ENTRY,
      resolveDir: PACKAGE_ROOT,
      sourcefile: "jupyter-widgets-entry.js",
      loader: "js",
    },
    bundle: true,
    // The renderer is a browser context; this must not resolve node builtins.
    platform: "browser",
    banner: {
      js:
        "// GENERATED FILE — do not edit. Rebuild with `npm run build:widgets`.\n" +
        "// See script/build-widgets.js for why this is bundled at all.\n" +
        "// Built from:\n" +
        versions,
    },
  };
  await esbuild.build({
    ...common,
    format: "cjs",
    external: EXTERNAL,
    outfile: OUTFILE,
  });
  // A detached surface deliberately has no Node integration. Its copy is a
  // self-contained browser global loaded through lumine.dom.loadScript().
  await esbuild.build({
    ...common,
    format: "iife",
    globalName: "LumineJupyterWidgets",
    outfile: REALM_OUTFILE,
  });

  const { size } = require("fs").statSync(OUTFILE);
  const { size: realmSize } = require("fs").statSync(REALM_OUTFILE);
  console.log(
    `built lib/vendor/jupyter-widgets.js (${(size / 1024).toFixed(0)} KB) and ` +
      `jupyter-widgets-realm.js (${(realmSize / 1024).toFixed(0)} KB)`,
  );
}

main().catch((error) => {
  for (const message of error.errors || []) {
    console.error("error:", message.text);
  }
  if (!error.errors) {
    console.error(error);
  }
  process.exit(1);
});
