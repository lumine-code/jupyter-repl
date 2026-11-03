const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { afterEach, beforeEach, test } = require("node:test");
const { updateBundleNotices } = require("./bundle-notices");

let root;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lumine-bundle-notices-"));
  fs.writeFileSync(path.join(root, "THIRD_PARTY_NOTICES"), "Inherited notice.\n");
});
afterEach(() => {
  assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
  assert.ok(path.basename(root).startsWith("lumine-bundle-notices-"));
  fs.rmSync(root, { recursive: true, force: true });
});

function dependency(directory, name, license) {
  const location = path.join(root, "node_modules", directory);
  fs.mkdirSync(location, { recursive: true });
  fs.writeFileSync(
    path.join(location, "package.json"),
    JSON.stringify({ name, version: "1.2.3", repository: "https://example.com/source" }),
  );
  if (license) fs.writeFileSync(path.join(location, "LICENSE"), license);
  return path.relative(root, path.join(location, "index.js"));
}

test("collects the actual nested bundled packages and preserves existing notices", () => {
  const first = dependency("parent", "parent", "Copyright parent.\nFull parent license.");
  const nested = dependency(
    "parent/node_modules/child",
    "child",
    "Copyright child.\nFull child license.",
  );
  dependency("external", "external", "External license.");
  updateBundleNotices(root, "lib/vendor/chart.js", { inputs: { [first]: {}, [nested]: {} } });
  const output = fs.readFileSync(path.join(root, "THIRD_PARTY_NOTICES"), "utf8");
  assert.ok(output.startsWith("Inherited notice.\n"));
  assert.match(output, /Affected component: lib\/vendor\/chart.js/);
  assert.match(output, /Component: child\nRevision: 1.2.3/);
  assert.match(output, /Full parent license./);
  assert.match(output, /Full child license./);
  assert.doesNotMatch(output, /External license/);
});

test("replaces one bundle deterministically while retaining another bundle's notices", () => {
  const input = dependency("parent", "parent", "Copyright parent.\nFull license.");
  const metadata = { inputs: { [input]: {} } };
  updateBundleNotices(root, "first.js", metadata);
  updateBundleNotices(root, "second.js", metadata);
  const noticePath = path.join(root, "THIRD_PARTY_NOTICES");
  const first = fs.readFileSync(noticePath, "utf8");
  updateBundleNotices(root, "first.js", metadata);
  assert.equal(fs.readFileSync(noticePath, "utf8"), first);
});

test("requires a retained upstream notice when a published archive omits its license", () => {
  const input = dependency("parent", "parent");
  const metadata = { inputs: { [input]: {} } };
  assert.throws(() => updateBundleNotices(root, "chart.js", metadata), /Missing bundled license/);
  fs.appendFileSync(
    path.join(root, "THIRD_PARTY_NOTICES"),
    "\n----- BEGIN THIRD-PARTY LICENSE: upstream:parent -----\nCopyright parent.\nFull license.\n----- END THIRD-PARTY LICENSE: upstream:parent -----\n",
  );
  updateBundleNotices(root, "chart.js", metadata, [], { parent: "upstream:parent" });
  const output = fs.readFileSync(path.join(root, "THIRD_PARTY_NOTICES"), "utf8");
  assert.match(output, /License: See the upstream:parent section/);
  assert.match(output, /Full license/);
});
