const { reduceOutputs, normalizeOutput } = require("../lib/output-utils");
const { escapeCarriageReturn } = require("../lib/ansi-utils");
const OutputStore = require("../lib/store/output");

// Stream output arrives in as many pieces as the kernel and the socket happen to
// split it into, and `\r` rewrites the line it sits on — so what a chunk means
// depends on what came before it. Nothing covered any of this: every other spec
// calls `startNewRun()` between appends, which takes the push branch and never
// reaches the merge, and no spec anywhere asserted on a carriage return.
//
// The property that matters is that the rendered text depends on the *content*
// of the stream and not on where its chunk boundaries fall.

/** Feed `chunks` through `reduceOutputs` the way `OutputStore` does. */
function accumulate(chunks, name = "stdout") {
  const outputs = [];
  for (const text of chunks) {
    reduceOutputs(outputs, { output_type: "stream", name, text });
  }
  return outputs;
}

/** Split `text` into `count` roughly equal pieces. */
function intoChunks(text, count) {
  const size = Math.max(1, Math.ceil(text.length / count));
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks.length > 0 ? chunks : [""];
}

describe("stream output accumulation", () => {
  it("merges consecutive outputs from the same stream", () => {
    const outputs = accumulate(["one ", "two ", "three"]);

    expect(outputs.length).toBe(1);
    expect(outputs[0].text).toBe("one two three");
  });

  it("merges interleaved stdout and stderr into their own outputs", () => {
    const outputs = [];
    const append = (name, text) => reduceOutputs(outputs, { output_type: "stream", name, text });

    append("stdout", "out one ");
    append("stderr", "err one ");
    append("stdout", "out two");
    append("stderr", "err two");

    expect(outputs.length).toBe(2);
    expect(outputs[0].text).toBe("out one out two");
    expect(outputs[1].text).toBe("err one err two");
  });

  it("keeps a non-stream output as its own entry", () => {
    const outputs = accumulate(["text "]);
    reduceOutputs(outputs, { output_type: "execute_result", data: { "text/plain": "42" } });
    reduceOutputs(outputs, { output_type: "stream", name: "stdout", text: "after" });

    expect(outputs.length).toBe(3);
    expect(outputs[0].text).toBe("text ");
    expect(outputs[2].text).toBe("after");
  });

  it("never merges stdout or stderr into a previous execution", () => {
    const store = new OutputStore();
    store.appendOutput({ output_type: "stream", name: "stdout", text: "old run\n" });
    store.startNewRun();
    store.appendOutput({ output_type: "stream", name: "stderr", text: "new warning\n" });
    store.appendOutput({ output_type: "stream", name: "stdout", text: "new result\n" });
    store.appendOutput({ output_type: "stream", name: "stderr", text: "more warnings\n" });

    expect(store.outputs.map((output) => output.text)).toEqual([
      "old run\n",
      "new warning\nmore warnings\n",
      "new result\n",
    ]);

    store.appendOutput({ output_type: "clear_output", wait: false });
    expect(store.outputs.map((output) => output.text)).toEqual(["old run\n"]);
  });

  it("keeps a run boundary intact when the oldest history is trimmed", () => {
    const store = new OutputStore(3);
    store.appendOutput({ output_type: "display_data", data: { "text/plain": "first run" } });
    store.startNewRun();
    store.appendOutput({ output_type: "stream", name: "stdout", text: "second run\n" });
    store.startNewRun();
    store.appendOutput({ output_type: "stream", name: "stderr", text: "warning\n" });
    store.appendOutput({ output_type: "stream", name: "stdout", text: "third run\n" });

    expect(store.outputs.map((output) => output.text)).toEqual([
      "second run\n",
      "warning\n",
      "third run\n",
    ]);
    store.appendOutput({ output_type: "clear_output", wait: false });
    expect(store.outputs.map((output) => output.text)).toEqual(["second run\n"]);
  });
});

describe("notebook output normalization", () => {
  it("joins textual MIME lines while preserving structured JSON arrays and primitives", () => {
    const array = [{ value: 1 }, { value: 2 }];
    const output = {
      output_type: "display_data",
      data: {
        "text/plain": ["one\n", "two"],
        "image/png": ["AA", "BB"],
        "application/json": array,
        "application/vnd.example+json": false,
        "application/vnd.example.json": 0,
      },
    };

    const normalized = normalizeOutput(output);
    expect(normalized.data["text/plain"]).toBe("one\ntwo");
    expect(normalized.data["image/png"]).toBe("AABB");
    expect(normalized.data["application/json"]).toBe(array);
    expect(normalized.data["application/vnd.example+json"]).toBe(false);
    expect(normalized.data["application/vnd.example.json"]).toBe(0);
    expect(output.data["text/plain"]).toEqual(["one\n", "two"]);
  });
});

describe("carriage returns in stream output", () => {
  // Each of these is a whole stream; the point is that no matter how it is cut
  // up on the way in, it must read the same on the way out.
  const corpora = [
    "loading...\rdone\nnext\n",
    "a\rb\rc\nd\re\n",
    "\r\r\rxyz\n\rq\rw\n",
    "plain\nlines\nonly\n",
    "tail\r",
    "\n\r\n\r",
    "p 1%\rp 50%\rp 100%\ndone\n",
    "\r",
    "abcdef\rXY\rZ\n",
    "\rlead\n",
    "mid\rdle\rx",
    "a\r\nb\r\n",
  ];

  it("renders the same text however the stream is chunked", () => {
    for (const corpus of corpora) {
      const whole = accumulate([corpus])[0].text;

      for (let count = 2; count <= 8; count++) {
        const chunks = intoChunks(corpus, count);
        expect(accumulate(chunks)[0].text).toBe(whole);
      }
    }
  });

  it("agrees with escaping the whole stream at once", () => {
    for (const corpus of corpora) {
      for (let count = 1; count <= 8; count++) {
        expect(accumulate(intoChunks(corpus, count))[0].text).toBe(escapeCarriageReturn(corpus));
      }
    }
  });

  it("applies a carriage return that arrives in a single chunk", () => {
    // The first chunk used to be stored verbatim, so a `\r` in an output that
    // never received a second chunk reached the DOM unapplied.
    expect(accumulate(["loading...\rdone"])[0].text).toBe("doneing...");
  });

  it("keeps the text of CRLF line endings", () => {
    // A trailing `\r` used to erase its line, so every line of CRLF output came
    // out blank.
    expect(accumulate(["a\r\nb\r\n"])[0].text).toBe("a\nb\n");
  });

  it("returns the cursor on a trailing carriage return rather than erasing", () => {
    expect(accumulate(["tail\r"])[0].text).toBe("tail");
    expect(accumulate(["tail\r", "X"])[0].text).toBe("Xail");
  });

  it("overwrites from the cursor when a write follows an earlier one", () => {
    expect(accumulate(["abcdef\rXY"])[0].text).toBe("XYcdef");
    expect(accumulate(["abcdef\rXY", "Z"])[0].text).toBe("XYZdef");
  });

  it("collapses a progress bar to the line it last wrote", () => {
    // The shape a tqdm-style bar produces: thousands of rewrites of one line.
    // Both the retained text and the work per chunk have to stay bounded.
    const chunks = [];
    for (let i = 0; i < 20000; i++) {
      chunks.push(`\r[${i}/20000]`);
    }
    const outputs = accumulate(chunks);

    expect(outputs.length).toBe(1);
    expect(outputs[0].text).toBe("[19999/20000]");
  });

  it("commits a progress bar when its line finally ends", () => {
    const outputs = accumulate(["\rworking 1%", "\rworking 99%", "\rdone\n", "after\n"]);

    // "done" overwrites only the first four columns, which is why a real
    // progress bar pads its line — the tail of the longer write survives.
    expect(outputs[0].text).toBe("doneing 99%\nafter\n");
  });
});
