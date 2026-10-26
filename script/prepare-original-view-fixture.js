const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

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

// The frozen picker contributes refresh, while the current core also supplies
// its dialog-level keep-open control. Preserve the exact empty-list assertion
// and explicitly include that one core contribution, without allowing extras.
function prepareKernelPickerActions(source) {
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const original = [
    "    expect(picker.selectList.getAvailableActions().map((action) => action.command)).toEqual([",
    '      "jupyter-repl:refresh-kernel-list",',
    "    ]);",
  ].join(newline);
  if (source.split(original).length !== 2) {
    throw new Error("Expected exactly one frozen empty-kernel action assertion.");
  }
  return source.replace(
    original,
    original.replace(
      `${newline}    ]);`,
      `${newline}      "select-list:toggle-keep-open",${newline}    ]);`,
    ),
  );
}

// The frozen runtime consumes v1 string targets. Current notebook providers
// advertise v2 and carry that same source in an immutable snapshot. Translate
// only this wire shape; keep the historical implementation and assertions.
function prepareAdapterTargets(source) {
  const original = 'const code = target.source || "";';
  if (source.split(original).length !== 2)
    throw new Error("Expected exactly one frozen target source read.");
  return source.replace(
    original,
    'const code = target.source ?? target.sourceSnapshot?.toString() ?? "";',
  );
}

function prepareAdapterManifest(manifest) {
  const versions = manifest.consumedServices?.["jupyter.adapter"]?.versions;
  if (
    !versions ||
    Object.keys(versions).length !== 1 ||
    versions["^1.0.0"] !== "consumeJupyterAdapter"
  )
    throw new Error("Expected the frozen v1 adapter service declaration.");
  manifest.consumedServices["jupyter.adapter"].versions = {
    "^2.0.0": "consumeJupyterAdapter",
  };
  return manifest;
}

// The frozen suite predates package module generations. Refresh its imported
// constructors and helper singletons after activation, without changing any
// original implementation or assertion. Relative fixture imports stay intact.
function prepareGenerationImports(source, file, root, parser) {
  const ast = parser.parse(source, { sourceType: "unambiguous", plugins: ["jsx"] });
  const nodes = [];
  function walk(node, parent = null) {
    if (!node || typeof node !== "object") return;
    if (typeof node.type === "string") nodes.push({ node, parent });
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach((child) => walk(child, node));
      else if (value && typeof value === "object") walk(value, node);
    }
  }
  walk(ast.program);
  const libraryDirectory = path.join(root, "lib");
  const imports = new Map();
  for (const { node } of nodes) {
    if (
      node.type !== "CallExpression" ||
      node.callee.type !== "Identifier" ||
      node.callee.name !== "require" ||
      node.arguments.length !== 1 ||
      node.arguments[0].type !== "StringLiteral"
    )
      continue;
    const request = node.arguments[0].value;
    if (!request.startsWith(".")) continue;
    const resolved = path.resolve(path.dirname(file), request);
    if (resolved !== libraryDirectory && !resolved.startsWith(libraryDirectory + path.sep))
      continue;
    imports.set(node, resolved);
  }
  if (imports.size === 0) return source;

  const edits = [];
  const wrappedImports = new Set();
  const declarations = new Set();
  const importedNames = new Set();
  const topLevelDeclarations = new Set(
    ast.program.body.filter((statement) => statement.type === "VariableDeclaration"),
  );
  function libraryReference(node) {
    if (!node) return false;
    if (imports.has(node)) return true;
    return node.type === "MemberExpression" && libraryReference(node.object);
  }
  function importedReference(node) {
    if (!node) return false;
    if (node.type === "Identifier") return importedNames.has(node.name);
    return node.type === "MemberExpression" && importedReference(node.object);
  }
  function expressionFor(node) {
    let text = source.slice(node.start, node.end);
    const replacements = [...imports]
      .filter(([call]) => call.start >= node.start && call.end <= node.end)
      .sort(([a], [b]) => b.start - a.start);
    for (const [call, resolved] of replacements) {
      text =
        text.slice(0, call.start - node.start) +
        `__lumineOriginalRequire(${JSON.stringify(resolved)})` +
        text.slice(call.end - node.start);
      wrappedImports.add(call);
    }
    return text;
  }
  for (const { node, parent } of nodes) {
    if (
      node.type === "VariableDeclarator" &&
      (libraryReference(node.init) ||
        (topLevelDeclarations.has(parent) && importedReference(node.init)))
    ) {
      const binding = source.slice(node.id.start, node.id.end);
      if (node.id.type === "Identifier") importedNames.add(node.id.name);
      edits.push({
        start: node.init.start,
        end: node.init.end,
        text: `__lumineOriginalImport(() => ${expressionFor(node.init)}, (__next) => (${binding} = __next))`,
      });
      if (parent.kind === "const") declarations.add(parent);
    } else if (node.type === "AssignmentExpression" && libraryReference(node.right)) {
      const binding = source.slice(node.left.start, node.left.end);
      edits.push({
        start: node.right.start,
        end: node.right.end,
        text: `__lumineOriginalImport(() => ${expressionFor(node.right)}, (__next) => (${binding} = __next))`,
      });
    }
  }
  for (const declaration of declarations) {
    edits.push({ start: declaration.start, end: declaration.start + 5, text: "let" });
  }
  for (const [node, resolved] of imports) {
    if (!wrappedImports.has(node)) {
      edits.push({
        start: node.start,
        end: node.end,
        text: `__lumineOriginalRequire(${JSON.stringify(resolved)})`,
      });
    }
  }
  for (const statement of ast.program.body) {
    if (statement.type === "ClassDeclaration" && importedReference(statement.superClass)) {
      const definition = expressionFor(statement);
      for (let index = edits.length - 1; index >= 0; index--) {
        if (edits[index].start >= statement.start && edits[index].end <= statement.end)
          edits.splice(index, 1);
      }
      edits.push({
        start: statement.start,
        end: statement.end,
        text: `let ${statement.id.name} = __lumineOriginalImport(() => (${definition}), (__next) => (${statement.id.name} = __next));`,
      });
    }
    if (
      statement.type !== "ExpressionStatement" ||
      statement.expression.type !== "CallExpression" ||
      statement.expression.callee.type !== "Identifier" ||
      !["describe", "fdescribe", "xdescribe"].includes(statement.expression.callee.name)
    )
      continue;
    const callback = statement.expression.arguments.at(-1);
    if (callback.body?.type !== "BlockStatement") continue;
    edits.push({
      start: callback.body.start + 1,
      end: callback.body.start + 1,
      text: "\n  beforeEach(__lumineOriginalBeginCase);\n  afterEach(__lumineOriginalEndCase);\n",
    });
  }
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  }
  const prefix = `
const __lumineOriginalCreateRequire = require("node:module").createRequire;
const __lumineOriginalRoot = ${JSON.stringify(root)};
const __lumineOriginalPersistentImports = [];
let __lumineOriginalCaseImports = [];
let __lumineOriginalInCase = false;
let __lumineOriginalActivationSubscription;
function __lumineOriginalRequire(request) {
  return __lumineOriginalCreateRequire(require("node:path").join(__lumineOriginalRoot, "package.json"))(request);
}
function __lumineOriginalImport(read, replace) {
  const imports = __lumineOriginalInCase ? __lumineOriginalCaseImports : __lumineOriginalPersistentImports;
  imports.push({ read, replace });
  return read();
}
function __lumineOriginalRefresh(pack) {
  if (pack?.name !== "jupyter-repl" || require("node:path").resolve(pack.path) !== __lumineOriginalRoot) return;
  for (const imported of [...__lumineOriginalPersistentImports, ...__lumineOriginalCaseImports]) imported.replace(imported.read());
}
function __lumineOriginalBeginCase() {
  __lumineOriginalCaseImports = [];
  __lumineOriginalInCase = true;
  __lumineOriginalActivationSubscription = lumine.packages.onDidActivatePackage(__lumineOriginalRefresh);
  const pack = lumine.packages.getLoadedPackage("jupyter-repl");
  __lumineOriginalRefresh(pack ?? { name: "jupyter-repl", path: __lumineOriginalRoot });
}
function __lumineOriginalEndCase() {
  __lumineOriginalActivationSubscription?.dispose();
  __lumineOriginalActivationSubscription = null;
  __lumineOriginalCaseImports = [];
  __lumineOriginalInCase = false;
}
`;
  const directiveEnd = ast.program.directives.at(-1)?.end ?? 0;
  return source.slice(0, directiveEnd) + prefix + source.slice(directiveEnd);
}

function prepareGenerationFixtures(root, parser) {
  let changed = 0;
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.name.endsWith("-spec.js")) {
        const source = fs.readFileSync(file, "utf8");
        const prepared = prepareGenerationImports(source, file, root, parser);
        if (prepared !== source) {
          fs.writeFileSync(file, prepared);
          changed++;
        }
      }
    }
  }
  visit(path.join(root, "spec"));
  return changed;
}

if (require.main === module) {
  if (!process.argv[2]) throw new Error("Pass the original runtime checkout.");
  const root = path.resolve(process.argv[2]);
  const file = path.join(root, "spec/runtime-source-provenance-spec.js");
  fs.writeFileSync(file, prepare(fs.readFileSync(file, "utf8")));
  const pickerFile = path.join(root, "spec/item-actions-spec.js");
  fs.writeFileSync(pickerFile, prepareKernelPickerActions(fs.readFileSync(pickerFile, "utf8")));
  const manifestFile = path.join(root, "package.json");
  fs.writeFileSync(
    manifestFile,
    JSON.stringify(
      prepareAdapterManifest(JSON.parse(fs.readFileSync(manifestFile, "utf8"))),
      null,
      2,
    ) + "\n",
  );
  const targetsFile = path.join(root, "lib/adapter-target-execution.js");
  fs.writeFileSync(targetsFile, prepareAdapterTargets(fs.readFileSync(targetsFile, "utf8")));
  // The CI control runs from the editor checkout, which owns its parser.
  const parser = createRequire(path.join(process.cwd(), "package.json"))("@babel/parser");
  console.log(
    `Refreshed generation imports in ${prepareGenerationFixtures(root, parser)} original fixtures.`,
  );
}

module.exports = {
  prepare,
  prepareKernelPickerActions,
  prepareAdapterTargets,
  prepareAdapterManifest,
  prepareGenerationImports,
  prepareGenerationFixtures,
};
