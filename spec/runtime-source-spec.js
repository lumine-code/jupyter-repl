const { Emitter } = require("lumine");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  parseSymbol,
  queryRuntimeSource,
  buildSourceQuery,
  MAX_STDOUT_BYTES,
} = require("../lib/runtime-source");

function kernel() {
  const events = new Emitter();
  const lifecycle = new Emitter();
  return {
    language: "python",
    executionState: "idle",
    destroyed: false,
    requests: [],
    events,
    lifecycle,
    transport: {
      lifecycle: "ready",
      _connectionGeneration: 1,
      onDidChangeLifecycle: (callback) => lifecycle.on("change", callback),
    },
    onDidDestroy: (callback) => events.on("destroy", callback),
    onDidChangeExecutionState: (callback) => events.on("state", callback),
    executeWatch(code, receive) {
      this.requests.push({ code, receive });
    },
  };
}

function marker(request) {
  return JSON.parse(/"_marker":\s*("(?:\\.|[^"\\])*")/.exec(request.code)[1]);
}

const target = () => ({
  filename: "/workspace/source.py",
  line: 4,
  source: "def target():\n    return 42\n",
  executionCount: 3,
  rawSource: "def target():\n    return 42\n",
});

function answer(request, value = target(), idleFirst = false) {
  const frame = marker(request) + JSON.stringify(value) + "\n";
  request.receive({
    output_type: "stream",
    name: "stdout",
    text: "unrelated stdout\n" + frame.slice(0, 25),
  });
  request.receive({
    output_type: "stream",
    name: "stdout",
    text: [frame.slice(25, 70), frame.slice(70)],
  });
  const idle = { output_type: "status", execution_state: "idle" };
  const reply = { stream: "status", data: "ok" };
  request.receive(idleFirst ? idle : reply);
  request.receive(idleFirst ? reply : idle);
}

describe("runtime source symbol parsing", () => {
  it("accepts Unicode identifiers and static dotted attributes", () => {
    expect(parseSymbol("对象.μέθοδος")).toEqual(["对象", "μέθοδος"]);
    expect(parseSymbol("  data._method  ")).toEqual(["data", "_method"]);
    expect(parseSymbol("match.type")).toEqual(["match", "type"]);
  });

  it("declines expressions, calls, subscripts, literals and keywords", () => {
    for (const text of [
      "fn()",
      "items[0]",
      "a + b",
      "x; y",
      "obj..field",
      ".field",
      "obj.",
      "'x'",
      "None",
      "class",
      "a\nb",
      "1x",
      "a".repeat(513),
    ]) {
      expect(parseSymbol(text)).withContext(text).toBeNull();
    }
  });
});

describe("runtime source request lifetime", () => {
  let source;
  beforeEach(() => (source = kernel()));
  afterEach(() => {
    source.events.emit("destroy");
    source.events.dispose();
    source.lifecycle.dispose();
  });

  it("assembles the marked payload and waits for both channels in either order", async () => {
    for (const idleFirst of [false, true]) {
      const result = queryRuntimeSource(source, "data.method");
      answer(source.requests.at(-1), target(), idleFirst);
      expect(await result).toEqual(target());
    }
  });

  it("declines unavailable, busy, non-Python and invalid-symbol requests without sending", async () => {
    expect(await queryRuntimeSource(null, "target")).toBeNull();
    source.executionState = "busy";
    expect(await queryRuntimeSource(source, "target")).toBeNull();
    source.executionState = "idle";
    source.language = "julia";
    expect(await queryRuntimeSource(source, "target")).toBeNull();
    source.language = "python";
    expect(await queryRuntimeSource(source, "target()")).toBeNull();
    expect(source.requests.length).toBe(0);
  });

  it("keeps only one physical request and does not share another caller's lifetime", async () => {
    const first = queryRuntimeSource(source, "target");
    expect(await queryRuntimeSource(source, "target", { isCurrent: () => true })).toBeNull();
    expect(await queryRuntimeSource(source, "other")).toBeNull();
    answer(source.requests[0]);
    expect(await first).toEqual(target());
    const second = queryRuntimeSource(source, "other");
    answer(source.requests[1]);
    expect(await second).toEqual(target());
  });

  it("settles a timeout while blocking additional queued work until the backend finishes", async () => {
    const first = queryRuntimeSource(source, "target", { timeoutMs: 100 });
    window.advanceClock(100);
    expect(await first).toBeNull();
    expect(await queryRuntimeSource(source, "other")).toBeNull();
    answer(source.requests[0]);
    const next = queryRuntimeSource(source, "target");
    answer(source.requests[1]);
    expect(await next).toEqual(target());
  });

  it("settles deactivation aborts immediately and ignores their later answers", async () => {
    const controller = new AbortController();
    const result = queryRuntimeSource(source, "target", { signal: controller.signal });
    controller.abort();
    expect(await result).toBeNull();
    answer(source.requests[0]);
    expect(source.events.getTotalListenerCount()).toBe(0);
    expect(source.lifecycle.getTotalListenerCount()).toBe(0);
  });

  it("rejects changed editor lifetimes and reused post-restart counts", async () => {
    let current = true;
    const result = queryRuntimeSource(source, "target", { isCurrent: () => current });
    current = false;
    answer(source.requests[0]);
    expect(await result).toBeNull();
    const restarting = queryRuntimeSource(source, "target");
    source.events.emit("state", "restarting");
    expect(await restarting).toBeNull();
    const next = queryRuntimeSource(source, "target");
    answer(source.requests[1], { ...target(), source: "old process" });
    answer(source.requests[2]);
    expect(await next).toEqual(target());
  });

  it("cancels transport lifecycle changes and generation replacement", async () => {
    const recovering = queryRuntimeSource(source, "target");
    source.lifecycle.emit("change", "recovering");
    expect(await recovering).toBeNull();
    const replaced = queryRuntimeSource(source, "target");
    source.transport._connectionGeneration++;
    answer(source.requests[1]);
    expect(await replaced).toBeNull();
  });

  it("bounds stdout and rejects unmarked or malformed data", async () => {
    const oversized = queryRuntimeSource(source, "target");
    source.requests[0].receive({
      output_type: "stream",
      name: "stdout",
      text: "x".repeat(MAX_STDOUT_BYTES + 1),
    });
    expect(await oversized).toBeNull();
    answer(source.requests[0]);
    const unmarked = queryRuntimeSource(source, "target");
    source.requests[1].receive({
      output_type: "stream",
      name: "stdout",
      text: JSON.stringify(target()),
    });
    source.requests[1].receive({ stream: "status", data: "ok" });
    source.requests[1].receive({ output_type: "status", execution_state: "idle" });
    expect(await unmarked).toBeNull();
    const invalid = queryRuntimeSource(source, "target");
    answer(source.requests[2], { filename: "/source.py", line: 0, source: "bad" });
    expect(await invalid).toBeNull();
  });

  it("contains send errors and releases its request slot", async () => {
    spyOn(source, "executeWatch").and.throwError("gone");
    expect(await queryRuntimeSource(source, "target")).toBeNull();
    source.executeWatch.and.callThrough();
    const next = queryRuntimeSource(source, "target");
    answer(source.requests[0]);
    expect(await next).toEqual(target());
  });
});

function findPython() {
  for (const candidate of ["python", "python3"]) {
    try {
      if (
        /Python 3/.test(
          execFileSync(candidate, ["--version"], { encoding: "utf8", timeout: 10000 }),
        )
      )
        return candidate;
    } catch {}
  }
  return null;
}
const python = findPython();
const pythonSuite = python ? describe : () => {};

pythonSuite("static Python runtime source lookup", () => {
  let directory;
  let filename;
  let setup;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "jupyter-runtime-source-"));
    filename = path.join(directory, "fixture.py");
    fs.writeFileSync(
      filename,
      `import functools\nclass Example:\n    def method(self):\n        return 42\n    @property\n    def dangerous(self):\n        raise RuntimeError("property was executed")\n    @staticmethod\n    def static():\n        return 1\n    @classmethod\n    def class_method(cls):\n        return 2\n@functools.lru_cache()\ndef decorated():\n    return 3\ndef μέθοδος():\n    return 4\n`,
    );
    setup = `import importlib.util, json\nspec = importlib.util.spec_from_file_location('fixture', ${JSON.stringify(filename)})\nfixture = importlib.util.module_from_spec(spec)\n__import__('sys').modules['fixture'] = fixture\nspec.loader.exec_module(fixture)\nobj = fixture.Example()\ntarget = fixture.decorated\n`;
  });
  afterEach(() => {
    fs.rmSync(filename, { force: true });
    fs.rmdirSync(directory);
  });

  function lookup(symbol, extra = "", checks = "") {
    const { code, marker: prefix } = buildSourceQuery(parseSymbol(symbol), "python-spec");
    const harness = `${setup}\n${extra}\n${code}\n${checks}\n`;
    const output = execFileSync(python, ["-B", "-c", harness], {
      encoding: "utf8",
      timeout: 15000,
    });
    return JSON.parse(output.slice(output.lastIndexOf(prefix) + prefix.length).split("\n", 1)[0]);
  }

  it("locates functions, instance/static/class methods, classes and modules", () => {
    for (const [symbol, line] of [
      ["obj.method", 3],
      ["obj.static", 8],
      ["obj.class_method", 11],
      ["fixture.Example", 2],
      ["fixture", 1],
      ["fixture.μέθοδος", 17],
    ]) {
      const found = lookup(symbol);
      expect(found.filename).withContext(symbol).toBe(filename);
      expect(found.line).withContext(symbol).toBe(line);
    }
  });

  it("unwraps decorators and reads property getter metadata without invoking it", () => {
    expect(lookup("target").line).toBe(14);
    const property = lookup("obj.dangerous");
    expect(property.line).toBe(5);
    expect(property.source).toContain("def dangerous");
    expect(lookup("obj.dangerous.value")).toBeNull();
  });

  it("never invokes __getattr__, __getattribute__ or fake __class__ properties", () => {
    const extra = `_touched = []\nclass Bomb:\n    def __getattribute__(self, name):\n        _touched.append(name)\n        raise RuntimeError('attribute hook executed')\n    def __getattr__(self, name):\n        _touched.append(name)\n        raise RuntimeError('missing attribute hook executed')\n    @property\n    def __class__(self):\n        _touched.append('__class__')\n        raise RuntimeError('class property executed')\nbomb = Bomb()\n`;
    expect(lookup("bomb.missing", extra, "assert _touched == []")).toBeNull();
    expect(lookup("bomb", extra, "assert _touched == []")).toBeNull();
  });

  it("declines builtins and unknown names while preserving the user namespace", () => {
    expect(lookup("len")).toBeNull();
    expect(lookup("missing")).toBeNull();
    const { code, marker: prefix } = buildSourceQuery(["target"], "python-spec");
    const harness = `${setup}\nexec = globals = inspect = print = 123\nbefore = set((lambda: None).__globals__)\n${code}\nassert set((lambda: None).__globals__) - {'before'} == before\n`;
    const output = execFileSync(python, ["-B", "-c", harness], {
      encoding: "utf8",
      timeout: 15000,
    });
    expect(
      JSON.parse(output.slice(output.lastIndexOf(prefix) + prefix.length).split("\n", 1)[0])
        .filename,
    ).toBe(filename);
  });
});
