const path = require("path");

describe("widget brand theme colors", () => {
  it("pairs filled widget colors independently of list selection and selected button overrides", () => {
    const stylesheet = lumine.themes.requireStylesheet(
      path.join(__dirname, "..", "styles", "main.css"),
    );
    const container = document.createElement("div");
    container.className = "jupyter-repl";
    container.style.cssText =
      "--accent-background-color: rgb(10,20,30); --accent-foreground-color: rgb(230,240,250); --button-background-color-selected: rgb(100,110,120); --background-color-selected: rgb(70,80,90); --text-color-selected: rgb(40,50,60);";
    const widget = document.createElement("button");
    widget.style.cssText =
      "background-color: var(--jp-brand-color1); color: var(--jp-inverse-ui-font-color1);";
    container.appendChild(widget);
    jasmine.attachToDOM(container);
    try {
      expect(getComputedStyle(widget).backgroundColor).toBe("rgb(10, 20, 30)");
      expect(getComputedStyle(widget).color).toBe("rgb(230, 240, 250)");
      widget.style.backgroundColor = "var(--jp-brand-color0)";
      widget.style.color = "var(--jp-ui-inverse-font-color0)";
      expect(getComputedStyle(widget).backgroundColor).toBe("rgb(10, 20, 30)");
      expect(getComputedStyle(widget).color).toBe("rgb(230, 240, 250)");
    } finally {
      container.remove();
      stylesheet.dispose();
    }
  });
});
