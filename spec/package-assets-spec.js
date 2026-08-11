const fs = require("fs");
const path = require("path");

// Guards for the CSON -> JSON and Less -> CSS migrations. If someone
// reintroduces a CSON keymap/menu or a Less stylesheet, these fail.
describe("jupyter-repl package assets", () => {
  const root = path.join(__dirname, "..");

  it("provides keymaps and menus as JSON, not CSON", () => {
    expect(fs.existsSync(path.join(root, "keymaps/jupyter-repl.json"))).toBe(true);
    expect(fs.existsSync(path.join(root, "menus/jupyter-repl.json"))).toBe(true);
    expect(fs.existsSync(path.join(root, "keymaps/jupyter-repl.cson"))).toBe(false);
    expect(fs.existsSync(path.join(root, "menus/jupyter-repl.cson"))).toBe(false);
  });

  it("ships keymap and menu JSON that parse", () => {
    // The editor loads keymaps through season, which tolerates comments, so
    // JSON.parse alone is the wrong reader.
    const keymap = JSON.parse(
      fs
        .readFileSync(path.join(root, "keymaps/jupyter-repl.json"), "utf8")
        .replace(/^\s*\/\/.*$/gm, ""),
    );
    expect(keymap["lumine-workspace"]).toBeDefined();
    // alt-enter belongs to intentions, whose only command it is; a more
    // specific block here took it silently in every non-dock editor.
    const editorBlock =
      keymap["lumine-workspace lumine-text-editor:not([mini]):not(lumine-dock lumine-text-editor)"];
    expect(editorBlock["alt-enter"]).toBeUndefined();
    expect(editorBlock["alt-shift-enter"]).toBe("jupyter-repl:run-cell");
    expect(keymap["lumine-workspace"]["alt-j k m"]).toBe("jupyter-repl:toggle-kernel-commands");

    const menu = JSON.parse(fs.readFileSync(path.join(root, "menus/jupyter-repl.json"), "utf8"));
    expect(Array.isArray(menu.menu)).toBe(true);
    // Every menu entry must use the valid `command` key, never the `commands`
    // typo that silently disabled two entries in the old CSON menu.
    expect(JSON.stringify(menu)).not.toContain('"commands"');
    expect(JSON.stringify(menu)).toContain('"jupyter-repl:toggle-kernel-commands"');
  });

  it("ships a CSS stylesheet built on custom properties, not Less", () => {
    expect(fs.existsSync(path.join(root, "styles/jupyter-repl.css"))).toBe(true);
    expect(fs.existsSync(path.join(root, "styles/jupyter-repl.less"))).toBe(false);

    const css = fs.readFileSync(path.join(root, "styles/jupyter-repl.css"), "utf8");
    expect(css).toContain("var(--");
    expect(css).not.toContain('@import "ui-variables"');
    expect(css).not.toContain('@import "syntax-variables"');
    // No leftover Less color functions (ignore prose in comments).
    const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(cssWithoutComments).not.toMatch(
      /\blighten\(|\bfadein\(|\bcontrast\(|\baverage\(|\bfade\(/,
    );
  });

  it("takes the select list from the editor, not from a dependency", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    // The editor provides the list through lumine.workspace.buildSelectList, so
    // there is nothing to declare and nothing to keep pinned.
    expect(pkg.dependencies["@lumine-code/select-list"]).toBeUndefined();
    expect(pkg.dependencies["@asiloisad/select-list"]).toBeUndefined();

    const sources = [];
    const collect = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          collect(full);
        } else if (entry.name.endsWith(".js")) {
          sources.push(full);
        }
      }
    };
    collect(path.join(root, "lib"));

    for (const file of sources) {
      const source = fs.readFileSync(file, "utf8");
      expect(source.includes("@asiloisad")).toBe(
        false,
        `${path.relative(root, file)} still points at the personal fork`,
      );
      expect(
        /require\(.@lumine-code\/select-list.\)|from ".@lumine-code\/select-list"/.test(source),
      ).toBe(false, `${path.relative(root, file)} still imports the list instead of building it`);
    }
  });
});
