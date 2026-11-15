#!/usr/bin/env node
// Build the sanitizer for the renderer's browser target. PostCSS's browser
// entry disables source-map-js, whose optional new Function probe otherwise
// reports a CSP violation even though the library catches the exception.
// Keep the browser bundle committed: installs in CI use --ignore-scripts.

const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");
const { updateBundleNotices } = require("./bundle-notices");

const PACKAGE_ROOT = path.join(__dirname, "..");
const OUTFILE = path.join(PACKAGE_ROOT, "lib", "vendor", "sanitize-html.js");

async function main() {
  const version = require("sanitize-html/package.json").version;
  const build = await esbuild.build({
    stdin: {
      contents: 'module.exports = require("sanitize-html");',
      resolveDir: PACKAGE_ROOT,
      sourcefile: "sanitize-html-entry.js",
      loader: "js",
    },
    bundle: true,
    metafile: true,
    format: "cjs",
    platform: "browser",
    outfile: OUTFILE,
    legalComments: "eof",
    banner: {
      js:
        "// GENERATED FILE — do not edit. Rebuild with `npm run build:sanitizer`.\n" +
        "// See script/build-sanitizer.js for why this uses the browser target.\n" +
        `// Built from sanitize-html@${version}.`,
    },
  });

  updateBundleNotices(PACKAGE_ROOT, "lib/vendor/sanitize-html.js", build.metafile);

  const { size } = fs.statSync(OUTFILE);
  console.log(`built lib/vendor/sanitize-html.js (${(size / 1024).toFixed(0)} KB)`);
}

main().catch((error) => {
  for (const message of error.errors || []) console.error("error:", message.text);
  if (!error.errors) console.error(error);
  process.exitCode = 1;
});
