describe("canonical output event reduction", () => {
  let reduceOutputEvents;
  beforeEach(() => {
    ({ reduceOutputEvents } = require("../lib/output-utils"));
  });

  it("keeps a deferred clear until the next output and preserves input records", () => {
    const events = [
      Object.freeze({ output_type: "stream", name: "stdout", text: "old" }),
      Object.freeze({ output_type: "clear_output", wait: true }),
    ];
    expect(reduceOutputEvents(events)[0].text).toBe("old");
    events.push(Object.freeze({ output_type: "stream", name: "stdout", text: "new" }));
    expect(reduceOutputEvents(events).map((output) => output.text)).toEqual(["new"]);
    expect(events[0].text).toBe("old");
  });

  it("updates every matching display in one run without appending an update record", () => {
    const display = Object.freeze({
      output_type: "display_data",
      data: Object.freeze({ "text/plain": "before" }),
      transient: { display_id: "shared" },
    });
    const result = reduceOutputEvents([
      display,
      display,
      {
        output_type: "update_display_data",
        data: { "text/plain": "after" },
        transient: { display_id: "shared" },
      },
    ]);
    expect(result.length).toBe(2);
    expect(result.map((output) => output.data["text/plain"])).toEqual(["after", "after"]);
    expect(display.data["text/plain"]).toBe("before");
  });

  it("merges streams across arbitrary chunk boundaries and clears immediately", () => {
    const result = reduceOutputEvents([
      { output_type: "stream", name: "stdout", text: "discard" },
      { output_type: "clear_output", wait: false },
      { output_type: "stream", name: "stdout", text: "abcdef\r" },
      { output_type: "stream", name: "stdout", text: "12" },
      { output_type: "stream", name: "stdout", text: "3\nnext" },
    ]);
    expect(result.length).toBe(1);
    expect(result[0].text).toBe("123def\nnext");
  });
});
