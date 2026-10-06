const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

describe("the scoped Windows ZeroMQ temporary directory", () => {
  let withZeroMQTemporaryDirectory, previousTMP, previousTEMP, directory;

  beforeEach(() => {
    ({ withZeroMQTemporaryDirectory } = require("../lib/zeromq-loader"));
    previousTMP = process.env.TMP;
    previousTEMP = process.env.TEMP;
    spyOn(os, "homedir").and.returnValue(path.resolve("spec-home"));
    directory = path.join(os.homedir(), ".lumine", "cache", "zeromq-ipc");
    spyOn(fs, "mkdirSync");
  });

  afterEach(() => {
    if (previousTMP === undefined) delete process.env.TMP;
    else process.env.TMP = previousTMP;
    if (previousTEMP === undefined) delete process.env.TEMP;
    else process.env.TEMP = previousTEMP;
  });

  it("leaves the environment and filesystem alone on other platforms", () => {
    process.env.TMP = "original";
    const exports = {};
    expect(
      withZeroMQTemporaryDirectory(() => {
        expect(process.env.TMP).toBe("original");
        return exports;
      }, "linux"),
    ).toBe(exports);
    expect(fs.mkdirSync).not.toHaveBeenCalled();
    expect(process.env.TMP).toBe("original");
  });

  for (const value of ["original", "", undefined]) {
    for (const fail of [false, true]) {
      it(`restores ${value === undefined ? "unset" : JSON.stringify(value)} TMP after ${fail ? "a failed" : "a successful"} load`, () => {
        if (value === undefined) delete process.env.TMP;
        else process.env.TMP = value;
        process.env.TEMP = "unchanged-temp";
        const exports = {};
        const load = () => {
          expect(process.env.TMP).toBe(directory);
          expect(process.env.TEMP).toBe("unchanged-temp");
          if (fail) throw new Error("native load failed");
          return exports;
        };

        if (fail) {
          expect(() => withZeroMQTemporaryDirectory(load, "win32")).toThrowError(
            "native load failed",
          );
        } else {
          expect(withZeroMQTemporaryDirectory(load, "win32")).toBe(exports);
        }
        expect(fs.mkdirSync).toHaveBeenCalledWith(directory, { recursive: true });
        expect(process.env.TMP).toBe(value);
        expect(process.env.TEMP).toBe("unchanged-temp");
      });
    }
  }

  it("does not change the environment or invoke the loader when creating the cache fails", () => {
    process.env.TMP = "original";
    process.env.TEMP = "unchanged-temp";
    fs.mkdirSync.and.throwError("cache directory unavailable");
    const load = jasmine.createSpy("load native module");

    expect(() => withZeroMQTemporaryDirectory(load, "win32")).toThrowError(
      "cache directory unavailable",
    );
    expect(load).not.toHaveBeenCalled();
    expect(process.env.TMP).toBe("original");
    expect(process.env.TEMP).toBe("unchanged-temp");
  });
});

describe("the ZeroMQ loader", () => {
  it("returns the original module exports and restores the caller's TMP", () => {
    const { loadZeroMQ } = require("../lib/zeromq-loader");
    const previous = process.env.TMP;
    const exports = loadZeroMQ();
    expect(exports).toBe(require("zeromq"));
    expect(loadZeroMQ()).toBe(exports);
    expect(process.env.TMP).toBe(previous);
  });
});
