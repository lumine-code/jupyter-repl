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
        ? "  Expected [ 'code' ] to equal [ 'code', 'code' ].\n  Expected [ 'dangerous()' ] to equal [ 'dangerous()', '%%bash -e\n  printf 'once'\n  ' ]."
        : "  The original Unicode implementation failed its regression assertion.",
    ]),
    `1215 specs, ${failures.length} failures`,
    "LUMINE_TEST_EXIT_STATUS=1",
  ].join("\n");
}

test("accepts only the exact original failures and known missing-magic messages", () => {
  for (const output of [log(), log().replace(/\n/g, "\r\n"), log().replace("Failures:\n", "")])
    assert.deepEqual(checkOriginalRuntime(output, 1), { specs: 1215, failures: 7 });
});

test("rejects missing, additional, duplicated and renamed original failures", () => {
  for (const failures of [
    expectedFailures.slice(0, -1),
    [...expectedFailures, "another failure"],
    [...expectedFailures.slice(0, -1), expectedFailures[0]],
    [...expectedFailures.slice(0, -1), `${typedSourceFailure} with different behavior`],
  ])
    assert.throws(
      () => checkOriginalRuntime(log(failures), 1),
      /Unexpected original-runtime failures/,
    );
});

test("rejects the same historical case failing for a different reason", () => {
  assert.throws(
    () => checkOriginalRuntime(log().replace("Expected [ 'code' ]", "Timed out instead of"), 1),
    /assertion message/,
  );
  assert.throws(
    () =>
      checkOriginalRuntime(
        log().replace("Expected [ 'dangerous()' ]", "Expected [ 'other()' ]"),
        1,
      ),
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
      checkOriginalRuntime(log().replace("1215 specs, 7 failures", "1215 specs, 6 failures"), 1),
    /summary/,
  );
  assert.throws(
    () => checkOriginalRuntime(log().replace("1215 specs, 7 failures", ""), 1),
    /summary/,
  );
  assert.throws(
    () => checkOriginalRuntime(log().replace("1215 specs", "1214 specs"), 1),
    /summary/,
  );
});
