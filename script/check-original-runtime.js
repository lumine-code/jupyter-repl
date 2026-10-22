const fs = require("node:fs");

const typedSourceFailure =
  "typed source preparation does not reinterpret empty cell bodies as the next executable cell";
const expectedFailures = [
  "converting between character and code-unit indices converts code-unit indices to protocol code-point boundaries",
  "converting between character and code-unit indices converts protocol code-point indices to the recorded UTF-16 boundaries",
  "Jupyter completion code-point offsets uses code points for a combining-mark identifier and a plain reply",
  "Jupyter completion code-point offsets uses code points for the typed completion's explicit range",
  "Jupyter completion code-point offsets keeps separate code points in inspection of a combining-mark identifier",
  "Jupyter completion code-point offsets translates the astral UTF-16 inspection position onto the wire",
  typedSourceFailure,
];

function checkOriginalRuntime(output, status) {
  if (Number(status) !== 1)
    throw new Error("The original runtime must exit with test failure status 1");
  const text = output.replace(/\r\n/g, "\n");
  const failed = [...text.matchAll(/^(.+) \[FAIL\]$/gm)].map((match) => match[1].trim()).sort();
  const expected = expectedFailures.toSorted();
  if (JSON.stringify(failed) !== JSON.stringify(expected))
    throw new Error(`Unexpected original-runtime failures: ${JSON.stringify(failed)}`);
  const summaries = [...text.matchAll(/^\s*(\d+) specs, (\d+) failures\s*$/gm)];
  if (
    summaries.length !== 1 ||
    Number(summaries[0][1]) !== 1215 ||
    Number(summaries[0][2]) !== expected.length
  )
    throw new Error(
      "The original-runtime summary must report 1215 specs and the expected seven failures",
    );
  // ListReporter prints the full failed name again before its assertion
  // details, without the ConsoleReporter's separate "Failures:" heading.
  const lines = text.split("\n");
  const at = lines.findLastIndex((line) => line.trim() === typedSourceFailure);
  if (at < 0) throw new Error("The original missing-magic assertion details are absent");
  const end = lines.findIndex(
    (line, index) => index > at && expectedFailures.includes(line.trim()),
  );
  const typedSourceDetail = lines
    .slice(at + 1, end < 0 ? undefined : end)
    .join(" ")
    .replace(/\s+/g, " ");
  for (const message of [
    "Expected [ 'code' ] to equal [ 'code', 'code' ].",
    "Expected [ 'dangerous()' ] to equal [ 'dangerous()', '%%bash -e printf 'once' ' ].",
  ]) {
    if (!typedSourceDetail.includes(message))
      throw new Error("The original missing-magic failure changed its assertion message");
  }
  return { specs: Number(summaries[0][1]), failures: expected.length };
}

if (require.main === module) {
  if (!process.argv[2] || process.argv[3] === undefined)
    throw new Error("Pass the original runtime log path and exit status");
  const result = checkOriginalRuntime(fs.readFileSync(process.argv[2], "utf8"), process.argv[3]);
  console.log(
    `Verified ${result.specs} original-runtime specs with the exact ${result.failures} expected failures.`,
  );
}

module.exports = { checkOriginalRuntime, expectedFailures, typedSourceFailure };
