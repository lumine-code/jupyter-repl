describe("ANSI output theme colors", () => {
  let etch, ansiNodes, host;
  beforeEach(() => {
    etch = require("@lumine-code/etch");
    ({ ansiNodes } = require("../lib/ansi-utils"));
  });
  afterEach(() => {
    if (host) {
      etch.destroySync(host);
      host = null;
    }
  });

  function render(text) {
    host = {
      render: () => etch.dom.div({}, ...ansiNodes(text)),
      update: () => etch.update(host),
    };
    etch.initialize(host);
    jasmine.attachToDOM(host.element);
    return host.element;
  }

  it("updates basic ANSI colors with the active palette without rendering again", () => {
    const element = render("\u001b[31mred\u001b[0m \u001b[94mblue");
    element.style.setProperty("--terminal-color-red", "rgb(120,30,40)");
    element.style.setProperty("--terminal-color-bright-blue", "rgb(50,60,200)");
    expect(getComputedStyle(element.children[0]).color).toBe("rgb(120, 30, 40)");
    expect(getComputedStyle(element.children[1]).color).toBe("rgb(50, 60, 200)");
    element.style.setProperty("--terminal-color-red", "rgb(220,80,90)");
    expect(getComputedStyle(element.children[0]).color).toBe("rgb(220, 80, 90)");
  });

  it("preserves explicit RGB, indexed cube and indexed grayscale output", () => {
    const element = render("\u001b[38;2;187;0;0mRGB\u001b[38;5;196mcube\u001b[38;5;244mgray");
    element.style.setProperty("--terminal-color-red", "rgb(1,2,3)");
    expect(Array.from(element.children, (node) => getComputedStyle(node).color)).toEqual([
      "rgb(187, 0, 0)",
      "rgb(255, 0, 0)",
      "rgb(128, 128, 128)",
    ]);
  });

  it("keeps identical foreground and background colors readable after a theme change", () => {
    const element = render("\u001b[31;41mreadable");
    const span = element.firstElementChild;
    element.style.setProperty("--terminal-color-red", "rgb(240,240,240)");
    const lightForeground = getComputedStyle(span).color;
    expect(lightForeground).not.toBe(getComputedStyle(span).backgroundColor);
    element.style.setProperty("--terminal-color-red", "rgb(20,20,20)");
    expect(getComputedStyle(span).color).not.toBe(lightForeground);
    expect(getComputedStyle(span).color).not.toBe(getComputedStyle(span).backgroundColor);
  });
});
