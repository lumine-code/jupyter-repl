/**
 * Jupyter Messaging Protocol (JMP) implementation
 * Based on jmp package by Nicolas Riesco
 * BSD 3-Clause License
 *
 * Uses ZeroMQ v6 native API
 */

const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const zmq = require("zeromq");

const DEBUG = global.DEBUG || false;
const DELIMITER = "<IDS|MSG>";

// Socket configuration constants for reliability
const SOCKET_OPTIONS = {
  // Reconnection settings
  reconnectInterval: 100, // ms - initial reconnect interval
  reconnectMaxInterval: 5000, // ms - max reconnect backoff (5 seconds)

  // TCP keepalive settings (for long-running connections)
  tcpKeepalive: 1, // Enable TCP keepalive
  tcpKeepaliveIdle: 60, // seconds before first probe
  tcpKeepaliveInterval: 10, // seconds between probes

  // Linger settings (behavior on close)
  linger: 1000, // ms to wait for pending messages on close

  // High water marks (message buffering)
  sendHighWaterMark: 1000,
  receiveHighWaterMark: 1000,

  // Timeouts (-1 = infinite, but we can override per-operation)
  sendTimeout: -1,
  receiveTimeout: -1,
};

let log;
if (DEBUG) {
  log = (...args) => {
    process.stderr.write("JMP: ");
    console.error(...args);
  };
} else {
  log = () => {};
}

/**
 * Jupyter message
 */
class Message {
  constructor(properties) {
    this.idents = (properties && properties.idents) || [];
    this.header = (properties && properties.header) || {};
    this.parent_header = (properties && properties.parent_header) || {};
    this.metadata = (properties && properties.metadata) || {};
    this.content = (properties && properties.content) || {};
    this.buffers = (properties && properties.buffers) || [];
  }

  /**
   * Send a response over a given socket
   */
  respond(socket, messageType, content, metadata, protocolVersion) {
    const response = new Message();

    response.idents = this.idents;
    response.header = {
      msg_id: uuidv4(),
      username: this.header.username,
      session: this.header.session,
      msg_type: messageType,
    };

    if (this.header && this.header.version) {
      response.header.version = this.header.version;
    }
    if (protocolVersion) {
      response.header.version = protocolVersion;
    }

    response.parent_header = this.header;
    response.content = content || {};
    response.metadata = metadata || {};

    socket.send(response);

    return response;
  }

  /**
   * Decode message received over a ZMQ socket
   */
  static _decode(messageFrames, scheme, key) {
    try {
      return _decode(messageFrames, scheme, key);
    } catch (err) {
      log("MESSAGE: DECODE: Error:", err);
    }
    return null;
  }

  /**
   * Encode message for transfer over a ZMQ socket
   */
  _encode(scheme, key) {
    scheme = scheme || "sha256";
    key = key || "";

    const idents = this.idents;
    const header = JSON.stringify(this.header);
    const parent_header = JSON.stringify(this.parent_header);
    const metadata = JSON.stringify(this.metadata);
    const content = JSON.stringify(this.content);

    let signature = "";
    if (key) {
      const hmac = crypto.createHmac(scheme, key);
      const encoding = "utf8";
      hmac.update(Buffer.from(header, encoding));
      hmac.update(Buffer.from(parent_header, encoding));
      hmac.update(Buffer.from(metadata, encoding));
      hmac.update(Buffer.from(content, encoding));
      signature = hmac.digest("hex");
    }

    const response = idents
      .concat([DELIMITER, signature, header, parent_header, metadata, content])
      .concat(this.buffers);

    return response;
  }
}

function _decode(messageFrames, scheme, key) {
  scheme = scheme || "sha256";
  key = key || "";

  let i;
  const idents = [];
  for (i = 0; i < messageFrames.length; i++) {
    const frame = messageFrames[i];
    if (frame.toString() === DELIMITER) {
      break;
    }
    idents.push(frame);
  }

  if (messageFrames.length - i < 5) {
    log("MESSAGE: DECODE: Not enough message frames", messageFrames);
    return null;
  }

  if (messageFrames[i].toString() !== DELIMITER) {
    log("MESSAGE: DECODE: Missing delimiter", messageFrames);
    return null;
  }

  if (key) {
    const obtainedSignature = messageFrames[i + 1].toString();
    const hmac = crypto.createHmac(scheme, key);
    hmac.update(messageFrames[i + 2]);
    hmac.update(messageFrames[i + 3]);
    hmac.update(messageFrames[i + 4]);
    hmac.update(messageFrames[i + 5]);
    const expectedSignature = hmac.digest("hex");

    if (expectedSignature !== obtainedSignature) {
      log(
        "MESSAGE: DECODE: Incorrect message signature:",
        "Obtained = " + obtainedSignature,
        "Expected = " + expectedSignature,
      );
      return null;
    }
  }

  const message = new Message({
    idents: idents,
    header: toJSON(messageFrames[i + 2]),
    parent_header: toJSON(messageFrames[i + 3]),
    content: toJSON(messageFrames[i + 5]),
    metadata: toJSON(messageFrames[i + 4]),
    buffers: Array.prototype.slice.call(messageFrames, i + 6),
  });

  return message;

  function toJSON(value) {
    return JSON.parse(value.toString());
  }
}

/**
 * Create appropriate ZMQ v6 socket based on type and configure reliability options
 */
function createZmqSocket(socketType, options = {}) {
  let socket;
  switch (socketType) {
    case "dealer":
      socket = new zmq.Dealer();
      break;
    case "sub":
      socket = new zmq.Subscriber();
      break;
    case "req":
      socket = new zmq.Request();
      break;
    case "rep":
      socket = new zmq.Reply();
      break;
    case "pub":
      socket = new zmq.Publisher();
      break;
    case "push":
      socket = new zmq.Push();
      break;
    case "pull":
      socket = new zmq.Pull();
      break;
    case "router":
      socket = new zmq.Router();
      break;
    default:
      throw new Error(`Unknown socket type: ${socketType}`);
  }

  // Apply reliability options (merge defaults with overrides)
  const opts = { ...SOCKET_OPTIONS, ...options };

  try {
    // Reconnection settings
    if (socket.reconnectInterval !== undefined) {
      socket.reconnectInterval = opts.reconnectInterval;
    }
    if (socket.reconnectMaxInterval !== undefined) {
      socket.reconnectMaxInterval = opts.reconnectMaxInterval;
    }

    // TCP keepalive (only for TCP transports, but safe to set)
    if (socket.tcpKeepalive !== undefined) {
      socket.tcpKeepalive = opts.tcpKeepalive;
    }
    if (socket.tcpKeepaliveIdle !== undefined) {
      socket.tcpKeepaliveIdle = opts.tcpKeepaliveIdle;
    }
    if (socket.tcpKeepaliveInterval !== undefined) {
      socket.tcpKeepaliveInterval = opts.tcpKeepaliveInterval;
    }

    // Linger (wait for pending messages on close)
    if (socket.linger !== undefined) {
      socket.linger = opts.linger;
    }

    // High water marks
    if (socket.sendHighWaterMark !== undefined) {
      socket.sendHighWaterMark = opts.sendHighWaterMark;
    }
    if (socket.receiveHighWaterMark !== undefined) {
      socket.receiveHighWaterMark = opts.receiveHighWaterMark;
    }
  } catch (err) {
    log("SOCKET: Error setting options:", err);
  }

  return socket;
}

/**
 * Connection state enum
 */
const ConnectionState = {
  DISCONNECTED: "disconnected",
  CONNECTING: "connecting",
  CONNECTED: "connected",
  RECONNECTING: "reconnecting",
  CLOSED: "closed",
};

/**
 * ZMQ socket that parses the Jupyter Messaging Protocol
 * Uses ZeroMQ v6 native API
 *
 * Enhanced with:
 * - Connection state tracking
 * - Error event emission
 * - Automatic event monitoring
 */
class Socket {
  constructor(socketType, scheme, key, options = {}) {
    this._jmp = {
      scheme: scheme,
      key: key,
      _listeners: new Map(), // event -> [{unwrapped, wrapped}]
    };
    this._socketType = socketType;
    this._socket = createZmqSocket(socketType, options);
    this._receiveLoop = null;
    this._events = null;
    this._inFlightSend = null;
    this._closed = false;
    this._connectionState = ConnectionState.DISCONNECTED;
    this._connectedAddresses = new Set();
    this._lastError = null;
    this._eventLoopStarted = false;
  }

  get identity() {
    return this._socket.routingId;
  }

  set identity(value) {
    this._socket.routingId = value;
  }

  /**
   * Get current connection state
   */
  get connectionState() {
    return this._connectionState;
  }

  /**
   * Get the last error that occurred
   */
  get lastError() {
    return this._lastError;
  }

  /**
   * Check if socket is connected
   */
  get isConnected() {
    return this._connectionState === ConnectionState.CONNECTED;
  }

  connect(address) {
    this._connectionState = ConnectionState.CONNECTING;
    this._connectedAddresses.add(address);
    this._socket.connect(address);
    this._startEventLoop();
  }

  subscribe(filter) {
    if (this._socketType === "sub") {
      this._socket.subscribe(filter);
    }
  }

  async send(message) {
    if (this._closed) {
      throw new Error("Socket is closed");
    }
    // zeromq admits one send at a time — a second concurrent send() throws
    // EBUSY, synchronously, and the binding explicitly leaves queueing to the
    // caller. Chain each send behind the previous one, so any number of
    // callers can await send() without coordinating. A failed send fails its
    // own caller only; the chain itself continues.
    const previous = this._inFlightSend ? this._inFlightSend.catch(() => {}) : Promise.resolve();
    const pending = previous.then(() => {
      if (this._closed) {
        throw new Error("Socket is closed");
      }
      if (message instanceof Message) {
        log("SOCKET: SEND:", message);
        const encoded = message._encode(this._jmp.scheme, this._jmp.key);
        return this._socket.send(encoded);
      }
      return this._socket.send(message);
    });
    // Closing a socket while a send is in flight corrupts libzmq's native
    // state on Windows (wepoll asserts, a poisoned io thread that never
    // connects another socket); close() waits for the chain's tail to settle
    // first, which this field always holds.
    this._inFlightSend = pending;
    try {
      await pending;
    } finally {
      if (this._inFlightSend === pending) {
        this._inFlightSend = null;
      }
    }
  }

  /**
   * Start the event loop for monitoring connection events
   */
  _startEventLoop() {
    if (this._eventLoopStarted || this._closed) return;

    // `socket.events` is a lazy getter that CONSTRUCTS the native Observer,
    // and constructing one can throw "Address already in use": the monitor
    // endpoint is `inproc://zmq.monitor.<observer heap address>`, and a socket
    // from a shut-down kernel lingers (linger is 1000ms) with its monitor name
    // still registered while the allocator hands the freed address to the next
    // kernel's observer. Shutting one kernel down and starting another hits
    // this deterministically. Monitoring is connection-state telemetry — it
    // must degrade, never veto a launch — so a second attempt gets a fresh
    // address and a second failure just means this socket goes unmonitored.
    let events = null;
    for (let attempt = 0; attempt < 2 && !events; attempt++) {
      try {
        events = this._socket.events;
      } catch (err) {
        log("SOCKET: OBSERVER UNAVAILABLE (attempt", attempt + 1, "):", err);
      }
    }
    if (!events) return;

    this._eventLoopStarted = true;
    // Keep the native Observer so close() can release it: breaking out of the
    // for-await below never closes it (the zeromq iterator has no return()),
    // and an observer left armed at window teardown crashes the renderer.
    this._events = events;

    // Start async event loop for connection monitoring
    (async () => {
      try {
        for await (const event of this._events) {
          if (this._closed) break;
          this._handleSocketEvent(event);
        }
      } catch (err) {
        if (!this._closed) {
          log("SOCKET: EVENT LOOP ERROR:", err);
          this._lastError = err;
          this._emitEvent("error", err);
        }
      }
    })();
  }

  /**
   * Handle socket events from the ZMQ observer
   */
  _handleSocketEvent(event) {
    const { type } = event;
    log("SOCKET: EVENT:", type, event);

    switch (type) {
      case "connect":
        this._connectionState = ConnectionState.CONNECTED;
        this._emitEvent("connect", event);
        break;

      case "connect:delay":
        this._connectionState = ConnectionState.CONNECTING;
        this._emitEvent("connect:delay", event);
        break;

      case "connect:retry":
        this._connectionState = ConnectionState.RECONNECTING;
        this._emitEvent("connect:retry", event);
        this._emitEvent("reconnecting", event);
        break;

      case "disconnect":
        this._connectionState = ConnectionState.DISCONNECTED;
        this._emitEvent("disconnect", event);
        break;

      case "close":
        this._connectionState = ConnectionState.CLOSED;
        this._emitEvent("close", event);
        break;

      case "close:error":
      case "accept:error":
      case "bind:error":
        this._lastError = event.error || new Error(`Socket error: ${type}`);
        this._emitEvent("error", this._lastError);
        break;

      case "handshake:error:protocol":
      case "handshake:error:auth":
      case "handshake:error:other":
        this._lastError = event.error || new Error(`Handshake error: ${type}`);
        this._emitEvent("error", this._lastError);
        break;

      default:
        // Forward other events as-is
        this._emitEvent(type, event);
    }
  }

  /**
   * Emit an event to registered listeners
   */
  _emitEvent(event, data) {
    const listeners = this._jmp._listeners.get(event);
    if (listeners && listeners.length > 0) {
      const listenersCopy = [...listeners];
      for (const listener of listenersCopy) {
        try {
          listener.unwrapped(data);
        } catch (err) {
          log("SOCKET: EVENT HANDLER ERROR:", event, err);
        }
      }
    }
  }

  /**
   * Start the async receive loop for message events
   */
  _startReceiveLoop() {
    if (this._receiveLoop) return;

    this._receiveLoop = (async () => {
      try {
        for await (const frames of this._socket) {
          if (this._closed) break;

          const listeners = this._jmp._listeners.get("message");
          if (listeners && listeners.length > 0) {
            const message = Message._decode(frames, this._jmp.scheme, this._jmp.key);
            if (message) {
              // Copy array to avoid issues if listeners are removed during iteration
              const listenersCopy = [...listeners];
              for (const listener of listenersCopy) {
                try {
                  listener.unwrapped(message);
                } catch (err) {
                  log("SOCKET: MESSAGE HANDLER ERROR:", err);
                }
              }
            }
          }
        }
      } catch (err) {
        if (!this._closed) {
          log("SOCKET: RECEIVE LOOP ERROR:", err);
          this._lastError = err;
          this._emitEvent("error", err);
        }
      }
    })();
  }

  on(event, listener) {
    if (!this._jmp._listeners.has(event)) {
      this._jmp._listeners.set(event, []);
    }
    this._jmp._listeners.get(event).push({
      unwrapped: listener,
      wrapped: listener,
    });
    // Start the receive loop when first message listener is added
    if (event === "message") {
      this._startReceiveLoop();
    }
    return this;
  }

  addListener(event, listener) {
    return this.on(event, listener);
  }

  once(event, listener) {
    const onceWrapper = (...args) => {
      this.removeListener(event, onceWrapper);
      listener(...args);
    };
    return this.on(event, onceWrapper);
  }

  removeListener(event, listener) {
    const listeners = this._jmp._listeners.get(event);
    if (listeners) {
      const index = listeners.findIndex((l) => l.unwrapped === listener);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
    return this;
  }

  removeAllListeners(event) {
    if (event === undefined) {
      // Remove all listeners for all events
      this._jmp._listeners.clear();
    } else {
      // Remove listeners for specific event
      this._jmp._listeners.delete(event);
    }
    return this;
  }

  /**
   * Close the socket.
   *
   * The Observer is NOT closed here on the normal path: closing its PAIR by
   * hand while its iterator holds a pending receive corrupts libzmq on
   * Windows, and after one kernel's sockets closed that way no later socket
   * ever connected (bisected to the commit that introduced the manual close).
   * The observer is self-closing by design — closing the monitored socket
   * makes libzmq emit MONITOR_STOPPED, and the native handler closes the
   * observer on that event. A deferred release stays as a safety net and is a
   * no-op when the self-close already happened.
   *
   * `forUnload` is the one exception: at window teardown there is no later
   * event-loop turn for the self-close, and an observer left armed when the
   * environment dies aborts the renderer. There the observer closes
   * immediately and the socket closes synchronously — the window is going
   * away, so the in-flight-send deferral has nothing left to protect.
   *
   * @param {Boolean} [forUnload=false]
   */
  close(forUnload = false) {
    if (this._closed) {
      return;
    }
    this._closed = true;
    this._jmp._listeners.clear();

    const releaseObserver = () => {
      const events = this._events;
      this._events = null;
      if (!events) {
        return;
      }
      try {
        events.close();
      } catch (err) {
        // Ignore errors during close (observer may already be closed)
        log("SOCKET: OBSERVER CLOSE ERROR (ignored):", err);
      }
    };

    const closeSocket = () => {
      try {
        this._socket.close();
      } catch (err) {
        // Ignore errors during close (socket may already be closed)
        log("SOCKET: CLOSE ERROR (ignored):", err);
      }
    };

    if (forUnload) {
      releaseObserver();
      closeSocket();
      return;
    }

    // Never close under an in-flight send: that is the native-state corruption
    // that wedges every socket created afterwards. A send to a peer that died
    // may never settle, so the wait is capped.
    if (this._inFlightSend) {
      const settled = this._inFlightSend.catch(() => {});
      const capped = new Promise((resolve) => setTimeout(resolve, 250));
      Promise.race([settled, capped]).then(closeSocket);
    } else {
      closeSocket();
    }

    // By now MONITOR_STOPPED has normally self-closed the observer; this
    // releases one that never got the event, while the app is still alive.
    setTimeout(releaseObserver, 500);
  }
}

module.exports = {
  default: { Message, Socket, ConnectionState, SOCKET_OPTIONS },
  SOCKET_OPTIONS,
  Message,
  ConnectionState,
  Socket,
};
