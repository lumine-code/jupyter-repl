const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

describe("the browser HTML sanitizer", () => {
  it("loads and parses styles without attempting runtime code generation", () => {
    const attempts = [];
    function blockedCodeGeneration(...args) {
      attempts.push(args);
      throw new Error("Runtime code generation is blocked");
    }
    const filename = path.join(__dirname, "..", "lib", "vendor", "sanitize-html.js");
    const context = {
      module: { exports: {} },
      console,
      Function: blockedCodeGeneration,
      eval: blockedCodeGeneration,
    };
    // A fresh context avoids require.cache hiding an import-time CSP probe.
    // Count caught attempts too: catching an exception still logs a violation
    // in Chromium, so successful sanitization alone would miss the regression.
    vm.runInNewContext(fs.readFileSync(filename, "utf8"), context, {
      filename,
      contextCodeGeneration: { strings: false, wasm: false },
    });
    const sanitize = context.module.exports;

    expect(
      sanitize(
        '<span style="color:red;position:fixed" onclick="bad()">safe</span>' +
          '<script>bad()</script><a href="javascript:bad()">link</a>',
        {
          allowedAttributes: { span: ["style"], a: ["href"] },
          allowedStyles: { "*": { color: [/^red$/] } },
        },
      ),
    ).toBe('<span style="color:red">safe</span><a>link</a>');
    expect(attempts).toEqual([]);
  });
});
