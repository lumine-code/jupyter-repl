const { test } = require("node:test");
const assert = require("node:assert/strict");
const { prepare, prepareKernelPickerActions } = require("./prepare-original-view-fixture");

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

test("adds only the known core dialog action to the frozen empty-kernel assertion", () => {
  for (const newline of ["\n", "\r\n"]) {
    const assertion = [
      "    expect(picker.selectList.getAvailableActions().map((action) => action.command)).toEqual([",
      '      "jupyter-repl:refresh-kernel-list",',
      "    ]);",
    ].join(newline);
    const prefix = `    await picker.selectList.setItems([]);${newline}`;
    const suffix = `${newline}    expect(picker.onConfirmed).not.toHaveBeenCalled();`;
    const expected = assertion.replace(
      `${newline}    ]);`,
      `${newline}      "select-list:toggle-keep-open",${newline}    ]);`,
    );
    assert.equal(
      prepareKernelPickerActions(prefix + assertion + suffix),
      prefix + expected + suffix,
    );
  }
});

test("rejects drifted or duplicated frozen action assertions instead of relaxing the control", () => {
  const assertion = [
    "    expect(picker.selectList.getAvailableActions().map((action) => action.command)).toEqual([",
    '      "jupyter-repl:refresh-kernel-list",',
    "    ]);",
  ].join("\n");
  assert.throws(() => prepareKernelPickerActions(""), /exactly one/);
  assert.throws(() => prepareKernelPickerActions(assertion + assertion), /exactly one/);
  assert.throws(
    () => prepareKernelPickerActions(assertion.replace("refresh-kernel-list", "other-action")),
    /exactly one/,
  );
  assert.throws(
    () => prepareKernelPickerActions(prepareKernelPickerActions(assertion)),
    /exactly one/,
  );
});
