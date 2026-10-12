const { test } = require("node:test");
const assert = require("node:assert/strict");
const { prepare } = require("./prepare-original-view-fixture");

test("changes only the original view mock and preserves both original navigation assertions", () => {
  const before =
    "    expect(editor.setSelectedBufferRange).toHaveBeenCalledWith([[1, 0], [1, 0]]);\n";
  const after =
    "    expect(editor.scrollToBufferPosition).toHaveBeenCalledWith([1, 0], { center: true });\n";
  const source =
    before + '    spyOn(lumine.views, "getView").and.returnValue({ focus() {} });\n' + after;
  const result = prepare(source);
  assert.ok(result.startsWith(before));
  assert.ok(result.endsWith(after));
  assert.ok(result.includes("candidate === editor ? sourceView : actualGetView(candidate)"));
  assert.ok(!result.includes("autoscroll: false"));
});

test("refuses changed or duplicated frozen mocks instead of silently changing unrelated cases", () => {
  assert.throws(() => prepare(""), /exactly one/);
  const mock = '    spyOn(lumine.views, "getView").and.returnValue({ focus() {} });';
  assert.throws(() => prepare(mock + mock), /exactly one/);
});
