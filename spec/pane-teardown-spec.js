const BasePane = require("../lib/panes/base-pane");

// A pane drops an item only when the item tells it so. Every path that ends a
// panel by calling `item.destroy()` rather than `pane.destroyItem(item)` — the
// deactivation disposable does exactly that — would otherwise leave the tab
// behind, holding an element that has already been emptied.

function newPane(config = {}) {
  return new BasePane({
    title: "Test",
    uri: "lumine://jupyter-repl/spec-pane",
    defaultLocation: "bottom",
    allowedLocations: ["bottom"],
    ...config,
  });
}

describe("BasePane teardown", () => {
  it("leaves no tab behind when destroyed directly", () => {
    const item = newPane();
    const pane = lumine.workspace.getCenter().getActivePane();
    pane.addItem(item);

    expect(pane.getItems()).toContain(item);

    item.destroy();

    expect(pane.getItems()).not.toContain(item);
  });

  it("tears its component down exactly once", () => {
    let destroyed = 0;
    const item = newPane({
      component: { element: document.createElement("div"), destroy: () => destroyed++ },
    });

    item.destroy();
    item.destroy();

    expect(destroyed).toBe(1);
  });

  it("announces its destruction to a subscriber", () => {
    const item = newPane();
    let called = 0;
    item.onDidDestroy(() => called++);

    item.destroy();

    expect(called).toBe(1);
  });
});
