const fs = require("node:fs");
const path = require("node:path");

// Keep the original runtime's assertions and implementation. Its global view
// mock must not replace the workspace DOM now created during environment reset.
function prepare(source) {
  const original = '    spyOn(lumine.views, "getView").and.returnValue({ focus() {} });';
  if (source.split(original).length !== 2) {
    throw new Error("Expected exactly one original executed-source view mock.");
  }
  return source.replace(
    original,
    "    const actualGetView = lumine.views.getView.bind(lumine.views);\n" +
      '    const sourceView = document.createElement("div");\n' +
      '    spyOn(lumine.views, "getView").and.callFake((candidate) =>\n' +
      "      candidate === editor ? sourceView : actualGetView(candidate),\n" +
      "    );",
  );
}

if (require.main === module) {
  if (!process.argv[2]) throw new Error("Pass the original runtime checkout.");
  const file = path.join(path.resolve(process.argv[2]), "spec/runtime-source-provenance-spec.js");
  fs.writeFileSync(file, prepare(fs.readFileSync(file, "utf8")));
}

module.exports = { prepare };
