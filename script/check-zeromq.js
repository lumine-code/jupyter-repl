/**
 * Native Node-API smoke tests, isolated so a libzmq abort or shutdown hang is
 * reported by the parent instead of taking the whole validation run with it.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawnSync } = require("node:child_process");

const PROBES = [
  "require-exit",
  "constructor-close",
  "tcp-roundtrip",
  "unload-during-send",
  "unload-during-observer",
];
const PROBE_TIMEOUT_MS = 15000;

async function closedTcpEndpoint() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, resolve);
  });
  const endpoint = `tcp://127.0.0.1:${server.address().port}`;
  await new Promise((resolve) => server.close(resolve));
  return endpoint;
}

async function probe(name) {
  const environment = Object.fromEntries(
    ["TMP", "TEMP"].map((key) => [
      key,
      { present: Object.hasOwn(process.env, key), value: process.env[key] },
    ]),
  );
  const assertEnvironmentRestored = () => {
    for (const [key, original] of Object.entries(environment)) {
      assert.equal(Object.hasOwn(process.env, key), original.present, `${key} presence changed`);
      assert.equal(process.env[key], original.value, `${key} value changed`);
    }
  };
  const { loadZeroMQ } = require("../lib/zeromq-loader");
  const zmq = loadZeroMQ();
  assertEnvironmentRestored();
  let sockets = 0;
  let roundtrips = 0;
  let unload = null;

  if (name === "constructor-close") {
    for (let round = 0; round < 3; round++) {
      for (const SocketType of [zmq.Dealer, zmq.Subscriber, zmq.Request]) {
        assertEnvironmentRestored();
        const socket = new SocketType({ linger: 0 });
        socket.close();
        sockets++;
      }
    }
  } else if (name === "tcp-roundtrip") {
    const { Socket, Message } = require("../lib/jmp");
    for (let round = 0; round < 3; round++) {
      assertEnvironmentRestored();
      const router = new zmq.Router({ linger: 0 });
      const dealer = new Socket("dealer", "sha256", "native-smoke");
      sockets += 2;
      try {
        await router.bind("tcp://127.0.0.1:*");
        const received = new Promise((resolve, reject) => {
          dealer.on("message", resolve);
          dealer.on("error", reject);
        });
        dealer.connect(router.lastEndpoint);
        await dealer.send(
          new Message({
            header: { msg_id: `native_${round}`, msg_type: "kernel_info_request" },
            parent_header: {},
            content: { round },
          }),
        );
        const frames = await router.receive();
        await router.send(frames);
        const message = await received;
        assert.equal(message.header.msg_id, `native_${round}`);
        assert.equal(message.content.round, round);
        roundtrips++;
      } finally {
        // Close the client while its peer still exists, then give the native
        // observer its self-close turn before constructing the next socket set.
        await dealer.close();
        router.close();
        await new Promise((resolve) => setTimeout(resolve, 650));
      }
    }
  } else if (name === "unload-during-send" || name === "unload-during-observer") {
    const { Socket } = require("../lib/jmp");
    const endpoint = await closedTcpEndpoint();
    const socket = new Socket("dealer", "sha256", "", { sendTimeout: 2500 });
    sockets++;
    let sending = Promise.resolve();
    let sendSettled = false;
    let sendRejected = null;
    const observer = () => socket._events;
    const snapshot = (monitor) => ({
      nativeClosed: socket._socket.closed,
      observerClosed: monitor?.closed ?? null,
      observerTimerPending: socket._observerReleaseTimer != null,
      pendingSend: Boolean(socket._inFlightSend),
    });
    try {
      // immediate prevents a disconnected DEALER from accepting the payload
      // into its native queue, leaving send pending until close cancels it.
      if (name === "unload-during-send") socket._socket.immediate = true;
      socket.connect(endpoint);
      const monitor = observer();
      if (name === "unload-during-send") {
        sending = socket.send("pending").then(
          () => {
            sendSettled = true;
          },
          (error) => {
            sendSettled = true;
            sendRejected = error.code || error.message;
          },
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
      if (name === "unload-during-send") {
        assert.equal(sendSettled, false, "The native send must be pending before close");
      }
      const ordinary = socket.close(false, true);
      assert.equal(socket.close(), ordinary, "Normal close must preserve its promise identity");
      const beforeForce = snapshot(monitor);
      if (name === "unload-during-send") {
        assert.equal(beforeForce.nativeClosed, false, "Normal close must await the send");
      } else {
        assert.equal(beforeForce.nativeClosed, true, "Normal native close must finish");
      }
      // A fast native monitor may already have self-closed on another OS.
      // Both states must permit forced unload, without opening more sockets.
      const forcing = socket.close(true);
      const afterForce = snapshot(monitor);
      assert.equal(afterForce.nativeClosed, true, "Unload must close the native socket");
      assert(!monitor || monitor.closed, "Unload must release the native observer");
      assert.equal(socket._observerReleaseTimer, null, "Unload must cancel observer callbacks");
      assert.equal(
        socket.close(),
        ordinary,
        "Unload must retain the original normal-close promise",
      );
      await forcing;
      await socket.closedResources;
      await sending;
      await ordinary;
      assert.equal(socket._observerReleaseTimer, null);
      unload = { beforeForce, afterForce, sendRejected };
    } finally {
      await socket.close(true, true);
      await socket.closedResources;
      await sending;
    }
  } else {
    assert.equal(name, "require-exit", "Unknown native probe");
  }

  assertEnvironmentRestored();
  console.log(
    JSON.stringify({
      probe: name,
      pid: process.pid,
      sockets,
      roundtrips,
      ...(unload ? { unload } : {}),
    }),
  );
  // Natural process exit is part of the check: libzmq's context cleanup can
  // abort even after a require-only probe has successfully printed its result.
}

function run() {
  const environment = { ...process.env };
  if (process.platform === "win32") {
    // Exercise the affected inherited temp location even when the caller runs
    // from a deliberately safe test TMP. The loader must restore this value.
    environment.TMP = path.join(
      environment.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
      "Temp",
    );
    assert(fs.statSync(environment.TMP).isDirectory(), "Windows AppData temp directory is missing");
  }

  const reports = [];
  for (const name of PROBES) {
    const result = spawnSync(process.execPath, [__filename, "--probe", name], {
      cwd: path.resolve(__dirname, ".."),
      env: environment,
      encoding: "utf8",
      timeout: PROBE_TIMEOUT_MS,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
    });
    const details = [result.error?.message, result.stdout, result.stderr]
      .filter(Boolean)
      .join("\n");
    assert.equal(result.status, 0, `Native probe ${name} (PID ${result.pid}) failed:\n${details}`);
    const report = JSON.parse(result.stdout.trim());
    assert.equal(report.probe, name);
    reports.push(report);
  }
  console.log(
    JSON.stringify({ platform: process.platform, node: process.version, probes: reports }),
  );
}

if (process.argv[2] === "--probe") {
  probe(process.argv[3]).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
} else {
  run();
}
