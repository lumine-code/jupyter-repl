const { js_idx_to_char_idx, char_idx_to_js_idx } = require("../lib/utils");

// A kernel reports completion positions in characters and the editor wants code
// units, so these two run on the keystroke path — twice per completion match,
// which for a Python `dir()` reply is hundreds of times per keypress. They take
// an ASCII shortcut for that reason; these check the shortcut answers exactly
// what walking the graphemes would.

// What the functions do when they cannot take the shortcut, written out here so
// the shortcut has something independent to agree with.
function segments(text) {
  return [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(text)];
}

function jsToCharBySegmenting(jsIndex, text) {
  const parts = segments(text);
  for (let i = 0; i < parts.length; i++) {
    const end = parts[i + 1]?.index ?? text.length;
    if (jsIndex >= parts[i].index && jsIndex < end) {
      return i;
    }
  }
  return parts.length;
}

function charToJsBySegmenting(charIndex, text) {
  const parts = segments(text);
  return charIndex >= parts.length ? text.length : parts[charIndex].index;
}

describe("converting between character and code-unit indices", () => {
  const samples = [
    "",
    "x",
    "result = pandas.DataFrame(data).groupby(['a']).agg",
    "df.描述", // beyond ASCII, one code unit per character
    "emoji = '😀'", // astral, two code units
    "éclair", // combining accent, two code points in one grapheme
    "a😀b́c",
  ];

  it("converts code-unit indices the same way whether or not it segments", () => {
    for (const text of samples) {
      for (let index = 0; index <= text.length + 2; index++) {
        expect(js_idx_to_char_idx(index, text)).toBe(jsToCharBySegmenting(index, text));
      }
    }
  });

  it("converts character indices the same way whether or not it segments", () => {
    for (const text of samples) {
      for (let index = 0; index <= segments(text).length + 2; index++) {
        expect(char_idx_to_js_idx(index, text)).toBe(charToJsBySegmenting(index, text));
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
