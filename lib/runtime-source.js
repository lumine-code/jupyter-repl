const { randomUUID } = require("node:crypto");

const DEFAULT_TIMEOUT_MS = 1500;
const MAX_STDOUT_BYTES = 512 * 1024;
const MAX_SOURCE_CHARS = 8192;
const MAX_CELL_CHARS = 32768;
const pending = new WeakMap();
const IDENTIFIER = /^[\p{ID_Start}_][\p{ID_Continue}]*$/u;
const KEYWORDS = new Set(
  "False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield".split(
    " ",
  ),
);
const INVALID_STATES = new Set([
  "starting",
  "loading",
  "restarting",
  "autorestarting",
  "recovering",
  "unresponsive",
  "dead",
]);

function parseSymbol(text) {
  if (typeof text !== "string" || text.length > 512) return null;
  const parts = text.trim().split(".");
  return parts.length <= 16 && parts.every((part) => IDENTIFIER.test(part) && !KEYWORDS.has(part))
    ? parts
    : null;
}

// All imports, helpers and temporaries live in this anonymous exec dictionary.
// No expression supplied by an editor is evaluated; only identifier keys are
// read from the caller namespace and attributes are retrieved statically.
const HELPER_SOURCE = String.raw`
import ast, hashlib, inspect, json, linecache, sys, types, unicodedata, keyword, textwrap
_missing = object()

def _property(value):
    return issubclass(type(value), property)

def _unwrap(value):
    seen = set()
    for step in range(16):
        if id(value) in seen:
            return None
        seen.add(id(value))
        kind = type(value)
        if kind in (staticmethod, classmethod, types.MethodType):
            value = value.__func__
            continue
        if _property(value):
            if step != 0:
                return None
            value = property.__dict__["fget"].__get__(value)
            continue
        wrapped = inspect.getattr_static(value, "__wrapped__", _missing)
        if wrapped is _missing:
            return value
        if _property(wrapped):
            return None
        value = wrapped
    return None

def _class_dict(value):
    return type.__dict__["__dict__"].__get__(value)

def _cell(filename):
    try:
        if "IPython" not in sys.modules:
            return None
        from IPython import get_ipython
        shell = get_ipython()
        compiler = shell.compile
        count = dict.get(compiler._filename_map, filename)
        entry = dict.get(linecache.cache, filename)
        if type(count) is int and count >= 0 and entry and entry[1] is None:
            lines = entry[2]
            if type(lines) is list and all(type(line) is str for line in lines):
                raw = shell.history_manager.input_hist_raw
                raw = raw[count] if 0 <= count < len(raw) and type(raw[count]) is str else None
                return count, lines, raw
    except Exception:
        pass
    return None

def _lines(filename):
    if type(filename) is not str or not filename or "\x00" in filename:
        return [], None
    cell = _cell(filename)
    if cell:
        return cell[1], cell
    # Unproved execution filenames must not be read as local source files.
    if filename.startswith("<") or "/ipykernel_" in filename.replace("\\", "/"):
        return [], None
    return linecache.getlines(filename), None

def _result(filename, line, source, cell=None):
    if type(filename) is not str or not filename or len(filename) > 4096 or "\x00" in filename:
        return None
    if type(line) is not int or line < 1:
        return None
    result = {"filename": filename, "line": line, "source": source[:_max_source]}
    if source:
        result["sourceHash"] = hashlib.sha256(source.encode("utf8")).hexdigest()
        if len(source) > _max_source:
            result["sourceTruncated"] = True
    if cell:
        count, lines, raw = cell
        result["executionCount"] = count
        compiled = "".join(lines)
        if len(compiled) <= _max_cell:
            result["compiledSource"] = compiled
        if raw is not None and len(raw) <= _max_cell:
            result["rawSource"] = raw
    return result

def _class_nodes(nodes, prefix=()):
    for node in nodes:
        if isinstance(node, ast.ClassDef):
            qualified = prefix + (node.name,)
            yield ".".join(qualified), node
            yield from _class_nodes(node.body, qualified)
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            yield from _class_nodes(node.body, prefix + (node.name, "<locals>"))

def _class_source(value):
    namespace = _class_dict(value)
    module_name = namespace.get("__module__")
    qualified = type.__dict__["__qualname__"].__get__(value)
    if type(module_name) is not str or type(qualified) is not str:
        return None
    if module_name == "builtins":
        return None
    first_line = namespace.get("__firstlineno__")
    filenames = []
    anchors = []
    module = sys.modules.get(module_name) if type(module_name) is str else None
    if module is not None:
        filename = inspect.getattr_static(module, "__file__", None)
        if type(filename) is str and filename.endswith((".py", ".pyw")):
            filenames.append(filename)
    for member in namespace.values():
        function = _unwrap(member)
        if type(function) is types.FunctionType:
            code = function.__code__
            anchors.append((code.co_filename, code.co_firstlineno))
            if code.co_filename not in filenames:
                filenames.append(code.co_filename)
    for filename in filenames:
        lines, cell = _lines(filename)
        if not lines:
            continue
        try:
            tree = ast.parse("".join(lines))
        except (SyntaxError, ValueError):
            continue
        candidates = []
        for name, node in _class_nodes(tree.body):
            start = min([node.lineno] + [decorator.lineno for decorator in node.decorator_list])
            if name != qualified:
                continue
            if type(first_line) is int and first_line not in (start, node.lineno):
                continue
            if cell and not any(file == filename and start <= row <= node.end_lineno for file, row in anchors):
                continue
            candidates.append((start, node))
        if len(candidates) == 1:
            start, node = candidates[0]
            return _result(filename, start, "".join(lines[start - 1:node.end_lineno]), cell)
    return None

def _query():
    parts = [unicodedata.normalize("NFKC", part) for part in _parts]
    if not all(part.isidentifier() and not keyword.iskeyword(part) for part in parts):
        return None
    value = dict.get(_namespace, parts[0], _missing)
    if value is _missing:
        return None
    for part in parts[1:]:
        if _property(value):
            return None
        value = inspect.getattr_static(value, part, _missing)
        if value is _missing:
            return None
    value = _unwrap(value)
    kind = type(value)
    if issubclass(kind, types.ModuleType):
        filename = inspect.getattr_static(value, "__file__", None)
        if type(filename) is str and filename.endswith((".py", ".pyw")):
            return _result(filename, 1, "")
        return None
    if issubclass(kind, type):
        return _class_source(value)
    if kind is not types.FunctionType:
        return None
    code = value.__code__
    filename, line = code.co_filename, code.co_firstlineno
    lines, cell = _lines(filename)
    if not lines or line > len(lines):
        return None
    source = "".join(inspect.getblock(lines[line - 1:]))
    try:
        tree = ast.parse(textwrap.dedent(source))
        nodes = list(ast.walk(tree))
        if code.co_name == "<lambda>":
            matches = any(isinstance(node, ast.Lambda) for node in nodes)
        else:
            matches = any(isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == code.co_name for node in tree.body)
        if not matches:
            return None
    except (SyntaxError, ValueError):
        return None
    return _result(filename, line, source, cell)

try:
    _value = _query()
except Exception:
    _value = None
print(_marker + json.dumps(_value, ensure_ascii=True))
# This query is not a notebook cell. Drop its own ephemeral compile cache,
# leaving the definition's filename/count and the user's namespace untouched.
try:
    if "IPython" in sys.modules:
        from IPython import get_ipython
        _shell = get_ipython()
        _entry = dict.get(linecache.cache, _request_filename)
        if _entry and _entry[1] is None:
            linecache.cache.pop(_request_filename, None)
            _shell.compile._filename_map.pop(_request_filename, None)
except Exception:
    pass
`;

function buildSourceQuery(parts, token) {
  const marker = `\u001eLUMINE-RUNTIME-SOURCE:${token}:`;
  const code = `(lambda _ns, _builtins, _filename: _builtins["exec"](${JSON.stringify(HELPER_SOURCE)}, {"__builtins__": _builtins, "_namespace": _ns, "_parts": ${JSON.stringify(parts)}, "_marker": ${JSON.stringify(marker)}, "_max_source": ${MAX_SOURCE_CHARS}, "_max_cell": ${MAX_CELL_CHARS}, "_request_filename": _filename}))((lambda: None).__globals__, (lambda: None).__builtins__, (lambda: None).__code__.co_filename)`;
  return { code, marker };
}

function kernelUsable(kernel, initial = false) {
  try {
    return Boolean(
      kernel &&
      !kernel.destroyed &&
      !kernel._destroyed &&
      kernel.language?.toLowerCase() === "python" &&
      (!initial || kernel.executionState === "idle") &&
      (!kernel.transport?.lifecycle || kernel.transport.lifecycle === "ready"),
    );
  } catch {
    return false;
  }
}

function validateSource(value) {
  if (
    !value ||
    typeof value.filename !== "string" ||
    !value.filename ||
    value.filename.length > 4096 ||
    value.filename.includes("\0") ||
    !Number.isSafeInteger(value.line) ||
    value.line < 1 ||
    typeof value.source !== "string" ||
    value.source.length > MAX_SOURCE_CHARS * 2
  )
    return null;
  const result = { filename: value.filename, line: value.line, source: value.source };
  if (/^[a-f0-9]{64}$/.test(value.sourceHash)) result.sourceHash = value.sourceHash;
  if (value.sourceTruncated === true) result.sourceTruncated = true;
  if (Number.isSafeInteger(value.executionCount) && value.executionCount >= 0)
    result.executionCount = value.executionCount;
  for (const key of ["rawSource", "compiledSource"])
    if (typeof value[key] === "string" && value[key].length <= MAX_CELL_CHARS * 2)
      result[key] = value[key];
  return result;
}

function queryRuntimeSource(
  kernel,
  symbol,
  { isCurrent = () => true, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = {},
) {
  const parts = parseSymbol(symbol);
  const current = () => {
    try {
      return !signal?.aborted && isCurrent();
    } catch {
      return false;
    }
  };
  if (!parts || !kernelUsable(kernel, true) || !current() || pending.has(kernel))
    return Promise.resolve(null);
  const { code, marker } = buildSourceQuery(parts, randomUUID());
  const generation = kernel.transport?._connectionGeneration;
  const record = {
    reply: false,
    idle: false,
    cancelled: false,
    stdout: "",
    bytes: 0,
    disposables: [],
  };
  pending.set(kernel, record);
  return new Promise((resolve) => {
    let settled = false;
    const timeout = setTimeout(
      () => cancel(),
      Math.min(5000, Math.max(1, Number(timeoutMs) || DEFAULT_TIMEOUT_MS)),
    );
    const settle = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", cancel);
      resolve(value);
      // A physically outstanding request can outlive its hover/editor. Keep
      // the single-flight slot, but release the caller's lifetime captures.
      isCurrent = null;
      signal = null;
    };
    const release = () => {
      if (pending.get(kernel) === record) pending.delete(kernel);
      for (const disposable of record.disposables.splice(0)) disposable?.dispose();
    };
    function cancel() {
      record.cancelled = true;
      record.stdout = "";
      settle(null);
    }
    const invalidate = () => {
      cancel();
      release();
    };
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      record.disposables.push(kernel.onDidDestroy?.(invalidate));
      record.disposables.push(
        kernel.onDidChangeExecutionState?.((state) => {
          if (INVALID_STATES.has(state)) invalidate();
        }),
      );
      record.disposables.push(
        kernel.transport?.onDidChangeLifecycle?.((state) => {
          if (state !== "ready") invalidate();
        }),
      );
      kernel.executeWatch(code, (message) => {
        if (pending.get(kernel) !== record) return;
        if (!kernelUsable(kernel) || kernel.transport?._connectionGeneration !== generation) {
          invalidate();
          return;
        }
        if (!current()) cancel();
        if (message.output_type === "stream" && message.name === "stdout" && !record.cancelled) {
          const text =
            typeof message.text === "string"
              ? message.text
              : Array.isArray(message.text)
                ? message.text.join("")
                : "";
          record.bytes += Buffer.byteLength(text, "utf8");
          if (record.bytes > MAX_STDOUT_BYTES) cancel();
          else record.stdout += text;
        } else if (message.output_type === "error") cancel();
        if (message.stream === "status") {
          record.reply = true;
          if (message.data !== "ok") cancel();
        }
        if (message.output_type === "status" && message.execution_state === "idle")
          record.idle = true;
        if (record.reply && record.idle) {
          let result = null;
          if (!record.cancelled && current()) {
            const at = record.stdout.lastIndexOf(marker);
            if (at !== -1) {
              const frame = record.stdout.slice(at + marker.length).split("\n", 1)[0];
              try {
                result = validateSource(JSON.parse(frame));
              } catch {}
            }
          }
          settle(result);
          release();
        }
      });
    } catch {
      invalidate();
    }
  });
}

module.exports = {
  parseSymbol,
  queryRuntimeSource,
  buildSourceQuery,
  DEFAULT_TIMEOUT_MS,
  MAX_STDOUT_BYTES,
};
