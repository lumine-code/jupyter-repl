const { grammarToLanguage, kernelSpecProvidesGrammar } = require("../lib/utils");

// Lumine ships a dedicated IPython tree-sitter grammar for .ipy files
// (scope source.python.ipy). It is a dialect of python, so jupyter-repl must
// map it to python kernels via the builtin grammar-language alias.
describe("IPython grammar language mapping", () => {
  const ipythonGrammar = { name: "IPython", scopeName: "source.python.ipy" };
  const pythonGrammar = { name: "Python", scopeName: "source.python" };

  beforeEach(() => {
    lumine.config.set("jupyter-repl.languageMappings", "");
  });

  it("maps the IPython grammar to the python kernel language", () => {
    expect(grammarToLanguage(ipythonGrammar)).toBe("python");
    expect(grammarToLanguage(pythonGrammar)).toBe("python");
  });

  it("matches python kernelspecs to the IPython grammar", () => {
    const spec = { name: "python3", language: "python" };
    expect(kernelSpecProvidesGrammar(spec, ipythonGrammar)).toBe(true);
    expect(kernelSpecProvidesGrammar(spec, pythonGrammar)).toBe(true);
  });

  it("does not match unrelated kernelspecs", () => {
    const spec = { name: "ir", language: "r" };
    expect(kernelSpecProvidesGrammar(spec, ipythonGrammar)).toBe(false);
  });

  it("lets user languageMappings override the builtin alias", () => {
    lumine.config.set("jupyter-repl.languageMappings", JSON.stringify({ julia: "IPython" }));
    expect(grammarToLanguage(ipythonGrammar)).toBe("julia");
  });
});
