const { CompositeDisposable } = require("lumine");
const { provideAutocomplete } = require("../lib/services/provided/autocomplete");

describe("kernel autocomplete request lifetime", () => {
  let store, provider, editor, code, position, replies;

  beforeEach(() => {
    spyOn(lumine.config, "get").and.callFake((key) => {
      if (key === "jupyter-repl.autocomplete") return true;
      if (key === "jupyter-repl.showInspectorResultsInAutocomplete") return true;
      if (key === "autocomplete.minimumWordLength") return 1;
    });
    replies = [];
    code = "pr";
    position = { row: 0, column: 2 };
    editor = {
      isDestroyed: () => false,
      getTextInBufferRange: () => code,
      getCursorBufferPosition: () => position,
    };
    store = {
      subscriptions: new CompositeDisposable(),
      kernel: {
        language: "python",
        executionState: "idle",
        complete: (_code, callback) => replies.push(callback),
        inspect: (_code, _position, callback) => replies.push(callback),
      },
    };
    provider = provideAutocomplete(store);
  });

  afterEach(() => store.subscriptions.dispose());

  function suggestions() {
    return provider.getSuggestions({ editor, bufferPosition: { ...position }, prefix: code });
  }

  it("settles a superseded completion without waiting for its kernel reply", async () => {
    const first = suggestions();
    const second = suggestions();
    await expectAsync(first).toBeResolvedTo(null);
    replies[1]({ matches: ["print"], cursor_start: 0, cursor_end: 2 });
    expect((await second)[0].text).toBe("print");
  });

  it("discards a response after its source text changes", async () => {
    const pending = suggestions();
    code = "ab";
    replies[0]({ matches: ["print"], cursor_start: 0, cursor_end: 2 });
    await expectAsync(pending).toBeResolvedTo(null);
  });

  it("discards a response after the cursor moves", async () => {
    const pending = suggestions();
    position = { row: 0, column: 0 };
    replies[0]({ matches: ["print"], cursor_start: 0, cursor_end: 2 });
    await expectAsync(pending).toBeResolvedTo(null);
  });

  it("discards a response after the kernel changes", async () => {
    const pending = suggestions();
    store.kernel = null;
    replies[0]({ matches: ["print"], cursor_start: 0, cursor_end: 2 });
    await expectAsync(pending).toBeResolvedTo(null);
  });

  it("settles pending requests when the provider is disposed", async () => {
    const pending = suggestions();
    store.subscriptions.dispose();
    await expectAsync(pending).toBeResolvedTo(null);
    expect(suggestions()).toBeNull();
  });

  it("releases a successful completion's deadline immediately", async () => {
    spyOn(window, "clearTimeout").and.callThrough();
    const pending = suggestions();
    replies[0]({ matches: ["print"], cursor_start: 0, cursor_end: 2 });
    await pending;
    expect(window.clearTimeout).toHaveBeenCalled();
  });

  it("settles when middleware rejects a request synchronously", async () => {
    store.kernel.complete = () => {
      throw new Error("Kernel disconnected");
    };
    await expectAsync(suggestions()).toBeResolvedTo(null);
  });

  it("tolerates an inspection reply with no documentation", async () => {
    const pending = provider.getSuggestionDetailsOnSelect({ text: "print", replacedText: "print" });
    replies[0]({ found: true });
    await expectAsync(pending).toBeResolvedTo(null);
  });
});
