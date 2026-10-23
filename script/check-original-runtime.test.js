const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  checkOriginalRuntime,
  expectedFailures,
  typedSourceFailure,
} = require("./check-original-runtime");

function log(failures = expectedFailures) {
  return [
    "Started",
    ...failures.map((name) => `${name} [FAIL]`),
    "Failures:",
    ...failures.flatMap((name) => [
      name,
      name === typedSourceFailure
        ? "  Expected [ 'first()' ] to equal [ 'first()', '%%bash -e\n  printf 'once'\n  ' ]."
        : "  The original Unicode implementation failed its regression assertion.",
    ]),
    `1216 specs, ${failures.length} failures`,
    "LUMINE_TEST_EXIT_STATUS=1",
  ].join("\n");
}

test("accepts only the exact original failures and deterministic missing-magic message", () => {
  for (const output of [log(), log().replace(/\n/g, "\r\n"), log().replace("Failures:\n", "")])
    assert.deepEqual(checkOriginalRuntime(output, 1), { specs: 1216, failures: 7 });
});

test("rejects missing, additional, duplicated and renamed original failures", () => {
  for (const failures of [
    expectedFailures.slice(0, -1),
    [...expectedFailures, "another failure"],
    [...expectedFailures.slice(0, -1), expectedFailures[0]],
    [...expectedFailures.slice(0, -1), `${typedSourceFailure} with different behavior`],
    [
      ...expectedFailures.slice(0, -1),
      "typed source preparation does not reinterpret empty cell bodies as the next executable cell",
    ],
  ])
    assert.throws(
      () => checkOriginalRuntime(log(failures), 1),
      /Unexpected original-runtime failures/,
    );
});

test("rejects the same historical case failing for a different reason", () => {
  assert.throws(
    () => checkOriginalRuntime(log().replace("Expected [ 'first()' ]", "Timed out instead of"), 1),
    /assertion message/,
  );
  assert.throws(
    () =>
      checkOriginalRuntime(log().replace("Expected [ 'first()' ]", "Expected [ 'other()' ]"), 1),
    /assertion message/,
  );
  assert.throws(
    () =>
      checkOriginalRuntime(
        log().replace(`${typedSourceFailure}\n`, "different failure details\n"),
        1,
      ),
    /assertion details/,
  );
});

test("rejects a passing, crashed, incomplete or inconsistent original run", () => {
  for (const status of [0, 2, 130])
    assert.throws(() => checkOriginalRuntime(log(), status), /status 1/);
  assert.throws(
    () =>
      checkOriginalRuntime(log().replace("1216 specs, 7 failures", "1216 specs, 6 failures"), 1),
    /summary/,
  );
  assert.throws(
    () => checkOriginalRuntime(log().replace("1216 specs, 7 failures", ""), 1),
    /summary/,
  );
  assert.throws(
    () => checkOriginalRuntime(log().replace("1216 specs", "1215 specs"), 1),
    /summary/,
  );
});
