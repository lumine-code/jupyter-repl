const { Disposable } = require("lumine");
const { v4: uuidv4 } = require("uuid");

const { log } = require("./utils");

// The three message types that make up the comm protocol. A comm is a named
// channel between the kernel and a front end that outlives the request which
// created it — ipywidgets is built entirely on them.
const COMM_MESSAGE_TYPES = new Set(["comm_open", "comm_msg", "comm_close"]);

/**
 * Normalize buffers arriving from the wire into what a comm consumer expects.
 *
 * jmp hands us the trailing zeromq frames as Node Buffers, and ipywidgets does
 * `new DataView(buffer)` on each one, which throws for a Buffer. The slice is
 * not optional either: a Buffer is a view onto a shared allocation pool, so
 * handing over `buf.buffer` would expose kilobytes of unrelated memory rather
 * than this message's payload.
 *
 * @param {Array} buffers
 * @returns {DataView[]}
 */
function fromWireBuffers(buffers) {
  if (!Array.isArray(buffers) || buffers.length === 0) {
    return [];
  }
  return buffers.map((buffer) => {
    if (ArrayBuffer.isView(buffer)) {
      return new DataView(
        buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
      );
    }
    if (buffer instanceof ArrayBuffer) {
      return new DataView(buffer);
    }
    return buffer;
  });
}

/**
 * Normalize buffers on their way to the wire.
 *
 * zeromq accepts a Buffer or a typed array and refuses a bare ArrayBuffer,
 * which is exactly what ipywidgets produces when it strips binary traits out
 * of a state update.
 *
 * @param {Array} buffers
 * @returns {Buffer[]}
 */
function toWireBuffers(buffers) {
  if (!Array.isArray(buffers) || buffers.length === 0) {
    return [];
  }
  return buffers.map((buffer) => {
    if (Buffer.isBuffer(buffer)) {
      return buffer;
    }
    if (ArrayBuffer.isView(buffer)) {
      return Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    }
    if (buffer instanceof ArrayBuffer) {
      return Buffer.from(buffer);
    }
    return buffer;
  });
}

/**
 * One comm.
 *
 * The member names here are snake_case and the send methods return a message
 * id synchronously, which is not this codebase's style — but this object *is*
 * ipywidgets' `IClassicComm`, handed straight to `@jupyter-widgets/base`. The
 * alternative is a second adapter object per widget that renames six members,
 * so this is a documented exception rather than a shim nobody can find.
 */
class Comm {
  constructor(commId, targetName, driver) {
    this.comm_id = commId;
    this.target_name = targetName;
    this._driver = driver;
    this._onMsg = null;
    this._onClose = null;
    this._closed = false;
  }

  /**
   * Open the comm on the kernel side. Only called for a comm this side
   * initiated; one the kernel opened is already open when we first see it.
   */
  open(data, callbacks, metadata, buffers) {
    return this._send(
      "comm_open",
      {
        comm_id: this.comm_id,
        target_name: this.target_name,
        data: data ?? {},
      },
      metadata,
      buffers,
    );
  }

  send(data, callbacks, metadata, buffers) {
    return this._send("comm_msg", { comm_id: this.comm_id, data: data ?? {} }, metadata, buffers);
  }

  /**
   * Close the comm. Idempotent: ipywidgets closes a comm when a model is
   * disposed, and a model can be disposed after the kernel already closed it.
   */
  close(data, callbacks, metadata, buffers) {
    if (this._closed) {
      return "";
    }
    this._closed = true;
    const msgId = this._send(
      "comm_close",
      { comm_id: this.comm_id, data: data ?? {} },
      metadata,
      buffers,
    );
    this._driver.unregister(this.comm_id);
    return msgId;
  }

  /** ipywidgets registers exactly one handler; last writer wins. */
  on_msg(callback) {
    this._onMsg = callback;
  }

  on_close(callback) {
    this._onClose = callback;
  }

  _send(msgType, content, metadata, buffers) {
    if (this._closed && msgType !== "comm_close") {
      log("Comm: send on a closed comm ignored:", this.comm_id, msgType);
      return "";
    }
    return this._driver.send(msgType, content, metadata || {}, buffers || []);
  }

  _handleMsg(message) {
    if (!this._onMsg) {
      return undefined;
    }
    return this._onMsg(message);
  }

  _handleClose(message) {
    this._closed = true;
    if (!this._onClose) {
      return undefined;
    }
    return this._onClose(message);
  }
}

/**
 * Every comm on one connection, and the targets we have claimed.
 *
 * A target is claimed before the kernel could use it; the kernel opens comms
 * against a target name, and one it finds unclaimed it never offers again.
 */
class CommRegistry {
  constructor(driver) {
    this._driver = driver;
    this._targets = new Map();
    this._comms = new Map();
    // Comm dispatch is serialized. `handle_comm_open` is async — it awaits the
    // widget class — and a comm_msg for a model whose open has not resolved
    // would reach a comm with no handler yet and be dropped, which is exactly
    // the first update of an interact widget. Only comm traffic is queued;
    // output and status are untouched by this.
    this._chain = Promise.resolve();
  }

  registerTarget(targetName, handler) {
    this._targets.set(targetName, handler);
    return new Disposable(() => {
      if (this._targets.get(targetName) === handler) {
        this._targets.delete(targetName);
      }
    });
  }

  /** A comm this side initiates. Nothing goes on the wire until `open()`. */
  createComm(targetName, commId = uuidv4()) {
    const comm = new Comm(commId, targetName, {
      send: (msgType, content, metadata, buffers) =>
        this._driver.send(msgType, content, metadata, buffers),
      unregister: (id) => this._comms.delete(id),
    });
    this._comms.set(commId, comm);
    return comm;
  }

  getComm(commId) {
    return this._comms.get(commId);
  }

  handleIOPubMessage(message) {
    this._chain = this._chain
      .then(() => this._dispatch(message))
      .catch((error) => log("CommRegistry: dispatch failed:", error));
  }

  async _dispatch(message) {
    const msgType = message?.header?.msg_type;
    const commId = message?.content?.comm_id;
    if (!commId) {
      log("CommRegistry: comm message without a comm_id:", msgType);
      return;
    }

    if (msgType === "comm_open") {
      await this._open(message, commId);
      return;
    }

    const comm = this._comms.get(commId);
    if (!comm) {
      // Another client's comm, or one we already closed. Not ours to act on.
      log("CommRegistry: no comm for", commId, msgType);
      return;
    }

    if (message.buffers) {
      message.buffers = fromWireBuffers(message.buffers);
    }

    if (msgType === "comm_msg") {
      await comm._handleMsg(message);
    } else if (msgType === "comm_close") {
      this._comms.delete(commId);
      await comm._handleClose(message);
    }
  }

  async _open(message, commId) {
    const targetName = message.content?.target_name;
    const handler = this._targets.get(targetName);
    if (!handler) {
      // Dropped, never closed. JupyterLab answers an unclaimed target with a
      // comm_close, but this kernel may be shared with a jupyter console or a
      // second Lumine window, and closing would destroy that client's live
      // comm. Closing mutates kernel-wide state and is not ours to do.
      log("CommRegistry: no handler for target", targetName);
      return;
    }

    const comm = new Comm(commId, targetName, {
      send: (msgType, content, metadata, buffers) =>
        this._driver.send(msgType, content, metadata, buffers),
      unregister: (id) => this._comms.delete(id),
    });
    this._comms.set(commId, comm);

    if (message.buffers) {
      message.buffers = fromWireBuffers(message.buffers);
    }

    try {
      await handler(comm, message);
    } catch (error) {
      this._comms.delete(commId);
      log("CommRegistry: target handler failed for", targetName, error);
    }
  }

  /**
   * Drop every comm, keeping the target claims.
   *
   * A restart replaces the kernel process, not our interest in its targets:
   * the new process must find `jupyter.widget` already claimed, or it will
   * never offer a widget to us again.
   */
  clear(reason) {
    const comms = [...this._comms.values()];
    this._comms.clear();
    for (const comm of comms) {
      comm._closed = true;
      try {
        comm._handleClose({ content: { comm_id: comm.comm_id, data: {} }, reason });
      } catch (error) {
        log("CommRegistry: close handler failed during clear:", error);
      }
    }
  }

  dispose() {
    this.clear("Connection disposed");
    this._targets.clear();
  }
}

module.exports = {
  COMM_MESSAGE_TYPES,
  Comm,
  CommRegistry,
  fromWireBuffers,
  toWireBuffers,
};
