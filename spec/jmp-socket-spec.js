const { Socket } = require("../lib/jmp");

// zeromq's Observer binds `inproc://zmq.monitor.<its own heap address>`, and a
// socket lingering from a shut-down kernel keeps its monitor name registered
// while the allocator reuses the freed address for the next kernel's observer.
// Constructing the observer then throws "Address already in use" — which used
// to escape connect() and fail the whole kernel launch. Monitoring is
// telemetry; it must degrade, never veto.

// Built around the prototype rather than the constructor: constructing a real
// zeromq socket inside a spec renderer dies natively (0xC0000005) — the same
// crash that kills kernel starts under the drive harness.
function bareSocket() {
  const socket = Object.create(Socket.prototype);
  socket._jmp = { scheme: "sha256", key: "spec-key", _listeners: new Map() };
  socket._socketType = "dealer";
  socket._receiveLoop = null;
  socket._events = null;
  socket._closed = false;
  socket._connectionState = "disconnected";
  socket._connectedAddresses = new Set();
  socket._lastError = null;
  socket._eventLoopStarted = false;
  return socket;
}

describe("jmp socket connection monitoring", () => {
  let socket;

  beforeEach(() => {
    socket = bareSocket();
  });

  function fakeZmqSocket(eventsBehaviour) {
    return {
      connect() {},
      close() {},
      get events() {
        return eventsBehaviour();
      },
    };
  }

  it("still connects when the observer cannot be constructed at all", () => {
    socket._socket = fakeZmqSocket(() => {
      throw new Error("Failed to construct 'Observer': Address already in use");
    });

    expect(() => socket.connect("inproc://spec-endpoint")).not.toThrow();
    expect(socket._eventLoopStarted).toBe(false);
    expect(socket._connectedAddresses.has("inproc://spec-endpoint")).toBe(true);
  });

  it("retries once, because a second observer gets a fresh address", () => {
    let attempts = 0;
    const events = {
      close() {},
      [Symbol.asyncIterator]() {
        return { next: () => Promise.resolve({ done: true }) };
      },
    };
    socket._socket = fakeZmqSocket(() => {
      attempts++;
      if (attempts === 1) {
        throw new Error("Failed to construct 'Observer': Address already in use");
      }
      return events;
    });

    expect(() => socket.connect("inproc://spec-endpoint")).not.toThrow();
    expect(attempts).toBe(2);
    expect(socket._eventLoopStarted).toBe(true);
    expect(socket._events).toBe(events);
  });
});

describe("jmp socket teardown", () => {
  // Closing a zeromq socket while a send is in flight corrupts libzmq's
  // native state on Windows: the wepoll shim asserts, or the io thread is
  // poisoned so that no socket created afterwards ever connects — which is
  // exactly a shutdown-then-start-another-kernel sequence.
  it("defers the native close until an in-flight send settles", async () => {
    const socket = bareSocket();
    let closed = 0;
    let releaseSend;
    socket._socket = {
      connect() {},
      close() {
        closed++;
      },
      send() {
        return new Promise((resolve) => {
          releaseSend = resolve;
        });
      },
    };

    const sending = socket.send("shutdown_request");
    // The chained send reaches the native socket on a microtask.
    await Promise.resolve();
    socket.close();

    expect(closed).toBe(0);

    releaseSend();
    await sending.catch(() => {});
    await Promise.resolve();

    expect(closed).toBe(1);
  });

  it("rejects queued sends at close and still defers on the active one", async () => {
    const socket = bareSocket();
    let closed = 0;
    let releaseSend;
    const sent = [];
    socket._socket = {
      connect() {},
      close() {
        closed++;
      },
      send(payload) {
        sent.push(payload);
        return new Promise((resolve) => {
          releaseSend = resolve;
        });
      },
    };

    const first = socket.send("one");
    const second = socket.send("two");
    await Promise.resolve();
    socket.close();
    expect(closed).toBe(0);

    releaseSend();
    await first;
    // The queued send never started; it must not reach a closed socket.
    let rejection = null;
    await second.catch((error) => {
      rejection = error;
    });
    expect(rejection?.message).toBe("Socket is closed");
    expect(sent).toEqual(["one"]);

    await Promise.resolve();
    await Promise.resolve();
    expect(closed).toBe(1);
  });

  it("closes immediately when nothing is in flight", () => {
    const socket = bareSocket();
    let closed = 0;
    socket._socket = {
      connect() {},
      close() {
        closed++;
      },
    };

    socket.close();

    expect(closed).toBe(1);
  });

  it("closes only once", () => {
    const socket = bareSocket();
    let closed = 0;
    socket._socket = {
      connect() {},
      close() {
        closed++;
      },
    };

    socket.close();
    socket.close();

    expect(closed).toBe(1);
  });
});

describe("jmp observer lifecycle at close", () => {
  // The observer is self-closing: closing the monitored socket makes libzmq
  // emit MONITOR_STOPPED and the native handler closes the observer. Closing
  // it by hand on the normal path corrupts libzmq on Windows — one kernel
  // shut down that way and no later socket ever connected. Bisected to the
  // commit that introduced the manual close; pinned here.
  it("leaves the observer to self-close on a normal close", () => {
    const socket = bareSocket();
    let observerClosed = 0;
    let socketClosed = 0;
    socket._events = {
      close() {
        observerClosed++;
      },
    };
    socket._socket = {
      connect() {},
      close() {
        socketClosed++;
      },
    };

    socket.close();

    expect(socketClosed).toBe(1);
    expect(observerClosed).toBe(0);
  });

  it("closes the observer immediately only for a window unload", async () => {
    const socket = bareSocket();
    let observerClosed = 0;
    let socketClosed = 0;
    let releaseSend;
    socket._events = {
      close() {
        observerClosed++;
      },
    };
    socket._socket = {
      connect() {},
      close() {
        socketClosed++;
      },
      send() {
        return new Promise((resolve) => {
          releaseSend = resolve;
        });
      },
    };

    // Even an in-flight send must not defer an unload close: the window is
    // going away and nothing later will run.
    const sending = socket.send("bye");
    await Promise.resolve();
    socket.close(true);

    expect(observerClosed).toBe(1);
    expect(socketClosed).toBe(1);
    releaseSend();
    await sending.catch(() => {});
  });
});

describe("jmp socket send serialization", () => {
  // zeromq admits one send at a time — a second concurrent send() raises
  // EBUSY, synchronously, and the binding's documentation leaves queueing to
  // the caller. The socket chains sends so callers never coordinate.
  it("runs overlapping sends one at a time, in order", async () => {
    const socket = bareSocket();
    let active = 0;
    const sent = [];
    const releases = [];
    socket._socket = {
      connect() {},
      close() {},
      send(payload) {
        if (active > 0) {
          throw new Error("Socket is busy writing; only one send operation may be in progress");
        }
        active++;
        sent.push(payload);
        return new Promise((resolve) => {
          releases.push(() => {
            active--;
            resolve();
          });
        });
      },
    };

    const first = socket.send("a");
    const second = socket.send("b");
    const third = socket.send("c");

    // Enough microtask turns for the next chained send to reach the socket.
    const settle = async () => {
      for (let i = 0; i < 10; i++) await Promise.resolve();
    };

    await settle();
    expect(sent).toEqual(["a"]);

    releases.shift()();
    await first;
    await settle();
    expect(sent).toEqual(["a", "b"]);

    releases.shift()();
    await second;
    await settle();
    expect(sent).toEqual(["a", "b", "c"]);

    releases.shift()();
    await third;
  });

  it("a failed send fails its own caller and the chain carries on", async () => {
    const socket = bareSocket();
    const sent = [];
    socket._socket = {
      connect() {},
      close() {},
      send(payload) {
        if (payload === "boom") {
          return Promise.reject(new Error("send failed"));
        }
        sent.push(payload);
        return Promise.resolve();
      },
    };

    const failing = socket.send("boom");
    const following = socket.send("after");

    let rejection = null;
    await failing.catch((error) => {
      rejection = error;
    });
    await following;

    expect(rejection?.message).toBe("send failed");
    expect(sent).toEqual(["after"]);
  });
});
