const { js_idx_to_char_idx, char_idx_to_js_idx } = require("../lib/utils");

// A kernel reports completion positions in characters and the editor wants code
// units, so these two run on the keystroke path — twice per completion match,
// which for a Python `dir()` reply is hundreds of times per keypress. They take
// an ASCII shortcut for that reason; these check the shortcut answers exactly
// what the protocol's independent code-point boundary table says.

function jsToCodePoint(jsIndex, offsets) {
  const next = offsets.findIndex((offset) => offset > jsIndex);
  return next < 0 ? offsets.length - 1 : next - 1;
}

describe("converting between character and code-unit indices", () => {
  const ascii = "result = pandas.DataFrame(data).groupby(['a']).agg";
  const samples = [
    { text: "", offsets: [0] },
    { text: "x", offsets: [0, 1] },
    { text: ascii, offsets: Array.from({ length: ascii.length + 1 }, (_, index) => index) },
    { text: "df.描述", offsets: [0, 1, 2, 3, 4, 5] },
    { text: "emoji = '😀'", offsets: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12] },
    { text: "éclair", offsets: [0, 1, 2, 3, 4, 5, 6, 7] },
    { text: "a😀b́c", offsets: [0, 1, 3, 4, 5, 6] },
  ];

  it("converts code-unit indices to protocol code-point boundaries", () => {
    for (const { text, offsets } of samples) {
      for (let index = 0; index <= text.length + 2; index++) {
        expect(js_idx_to_char_idx(index, text)).toBe(jsToCodePoint(index, offsets));
      }
    }
  });

  it("converts protocol code-point indices to the recorded UTF-16 boundaries", () => {
    for (const { text, offsets } of samples) {
      for (let index = 0; index <= offsets.length + 2; index++) {
        expect(char_idx_to_js_idx(index, text)).toBe(offsets[index] ?? text.length);
      }
    }
  });

  it("round-trips a position in ASCII code", () => {
    const line = "np.linalg.sol";
    expect(char_idx_to_js_idx(js_idx_to_char_idx(3, line), line)).toBe(3);
    expect(js_idx_to_char_idx(line.length, line)).toBe(line.length);
  });

  it("reports a refusal rather than a position for invalid input", () => {
    expect(js_idx_to_char_idx(-1, "abc")).toBe(-1);
    expect(char_idx_to_js_idx(-1, "abc")).toBe(-1);
    expect(js_idx_to_char_idx(0, null)).toBe(-1);
    expect(char_idx_to_js_idx(0, null)).toBe(-1);
  });
});
