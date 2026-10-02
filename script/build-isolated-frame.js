#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const prettier = require("prettier");

async function main() {
  const root = path.join(__dirname, "..", "lib", "components", "result-view");
  const output = path.join(root, "isolated-frame.html");
  const runtime = fs.readFileSync(path.join(root, "isolated-frame-runtime.js"), "utf8");
  // The sandbox's opaque origin cannot fetch a second local file. Bake our
  // trusted bootstrap into the standalone document, whose own CSP permits it.
  const html = `<!doctype html>
<!-- GENERATED FILE: rebuild with node script/build-isolated-frame.js. -->
<html>
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' https: blob:; style-src 'unsafe-inline' https:; img-src https: data: blob:; font-src https: data:; connect-src https: wss:; media-src https: data: blob:; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none';" />
    <style>html,body{margin:0;padding:0;background:transparent}body{font:13px sans-serif}#output{display:flow-root;min-height:24px}pre.output-error{white-space:pre-wrap;color:#b33}</style>
  </head>
  <body>
    <div id="output"></div>
    <script>${runtime.replace(/<\/script/gi, "<\\/script")}</script>
  </body>
</html>
`;
  fs.writeFileSync(
    output,
    await prettier.format(html, { ...(await prettier.resolveConfig(output)), filepath: output }),
  );
  console.log("built lib/components/result-view/isolated-frame.html");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
