const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function withZeroMQTemporaryDirectory(load, platform = process.platform) {
  if (platform !== "win32") return load();

  // libzmq 4.3.5's Windows AF_UNIX signaler fails under AppData temp paths:
  // https://github.com/zeromq/libzmq/pull/4734
  // Its static CRT snapshots TMP when the native DLL loads. Keep that snapshot
  // on a persistent directory outside AppData, then restore the process env.
  // Remove this workaround when the bundled native build fixes that issue.
  const directory = path.join(os.homedir(), ".lumine", "cache", "zeromq-ipc");
  fs.mkdirSync(directory, { recursive: true });
  const previous = process.env.TMP;
  try {
    process.env.TMP = directory;
    return load();
  } finally {
    if (previous === undefined) delete process.env.TMP;
    else process.env.TMP = previous;
  }
}

function loadZeroMQ() {
  return withZeroMQTemporaryDirectory(() => require("zeromq"));
}

module.exports = { loadZeroMQ, withZeroMQTemporaryDirectory };
