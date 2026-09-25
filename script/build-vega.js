#!/usr/bin/env node
// Build lib/vendor/vega-embed.js.
//
// Vega Embed 7 and its current Vega-Lite graph publish ESM with top-level
// await. Lumine's package compiler turns a dynamic import in CommonJS package
// code into require(), which cannot load that graph. Bundle the official
// runtime into CommonJS once instead, commit it, and require it lazily on the
// first chart. The editor's CI installs with --ignore-scripts, so the generated
// file cannot be left to an install hook.

const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

const PACKAGE_ROOT = path.join(__dirname, "..");
const OUTFILE = path.join(PACKAGE_ROOT, "lib", "vendor", "vega-embed.js");
const ENTRY = 'export { default } from "vega-embed";';

function versionOf(name) {
  const manifest = path.join(PACKAGE_ROOT, "node_modules", ...name.split("/"), "package.json");
  return JSON.parse(fs.readFileSync(manifest, "utf8")).version;
}

async function main() {
  const versions = ["vega", "vega-lite", "vega-embed"]
    .map((name) => `//   ${name}@${versionOf(name)}`)
    .join("\n");

  await esbuild.build({
    stdin: {
      contents: ENTRY,
      resolveDir: PACKAGE_ROOT,
      sourcefile: "vega-embed-entry.js",
      loader: "js",
    },
    bundle: true,
    format: "cjs",
    platform: "browser",
    outfile: OUTFILE,
    legalComments: "eof",
    banner: {
      js:
        "// GENERATED FILE — do not edit. Rebuild with `npm run build:vega`.\n" +
        "// See script/build-vega.js for why this is bundled.\n" +
        "// Built from:\n" +
        versions,
    },
  });

  const { size } = fs.statSync(OUTFILE);
  console.log(`built lib/vendor/vega-embed.js (${(size / 1024).toFixed(0)} KB)`);
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
