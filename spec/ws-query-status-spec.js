const { CompositeDisposable } = require("lumine");

function signal() {
  const listeners = [];
  return {
    connect(callback) {
      listeners.push(callback);
    },
    emit(sender, value) {
      for (const callback of [...listeners]) callback(sender, value);
    },
    clear() {
      listeners.length = 0;
    },
  };
}

// Reproduce the public JupyterLab signals and shell futures. A send emits
// anyMessage synchronously; replies and idle can arrive in either order.
function connection() {
  const value = {
    clientId: "our-client",
    status: "idle",
    statusChanged: signal(),
    connectionStatusChanged: signal(),
    iopubMessage: signal(),
    anyMessage: signal(),
    requests: [],
    send(type, content) {
      const msg = {
        channel: "shell",
        header: {
          msg_id: `request-${this.requests.length}`,
          msg_type: type,
          session: this.clientId,
        },
        content,
      };
      let resolve, reject;
      const future = {
        msg,
        done: new Promise((done, fail) => {
          resolve = done;
          reject = fail;
        }),
      };
      const record = { msg, future, resolve, reject, replySeen: false, idleSeen: false };
      this.requests.push(record);
      this.anyMessage.emit(this, { direction: "send", msg });
      return record;
    },
    requestComplete(content) {
      return this.send("complete_request", content).future.done;
    },
    requestInspect(content) {
      return this.send("inspect_request", content).future.done;
    },
    requestExecute(content) {
      return this.send("execute_request", content).future;
    },
    reply(record, content) {
      const msg = {
        channel: "shell",
        header: {
          msg_id: `${record.msg.header.msg_id}_reply`,
          msg_type: record.msg.header.msg_type.replace(/_request$/, "_reply"),
        },
        parent_header: record.msg.header,
        content,
      };
      this.anyMessage.emit(this, { direction: "recv", msg });
      record.future.onReply?.(msg);
      record.replySeen = true;
      record.reply = msg;
      if (record.idleSeen) record.resolve(msg);
    },
    iopub(record, type, content, parent = record.msg.header) {
      const msg = {
        channel: "iopub",
        header: { msg_id: `${parent.msg_id}_${type}`, msg_type: type },
        parent_header: parent,
        content,
      };
      this.anyMessage.emit(this, { direction: "recv", msg });
      if (type === "status") {
        this.status = content.execution_state;
        this.statusChanged.emit(this, this.status);
      }
      if (
        parent.msg_id === record.msg.header.msg_id &&
        parent.session === record.msg.header.session
      ) {
        record.future.onIOPub?.(msg);
        if (type === "status" && content.execution_state === "idle") record.idleSeen = true;
      }
      this.iopubMessage.emit(this, msg);
      if (record.replySeen && record.idleSeen) record.resolve(record.reply);
    },
    dispose() {
      for (const request of this.requests) request.reject(new Error("Session disposed"));
      for (const field of [
        "statusChanged",
        "connectionStatusChanged",
        "iopubMessage",
        "anyMessage",
      ])
        this[field].clear();
    },
  };
  return value;
}

describe("remote query status ownership", () => {
  let transport, kernel, session, remote, autocomplete, store, settings;
  beforeEach(() => {
    settings = [
      "jupyter-repl.autocomplete",
      "jupyter-repl.showInspectorResultsInAutocomplete",
      "autocomplete.minimumWordLength",
    ].map((key) => [key, lumine.config.get(key)]);
    lumine.config.set("jupyter-repl.autocomplete", true);
    lumine.config.set("jupyter-repl.showInspectorResultsInAutocomplete", true);
    lumine.config.set("autocomplete.minimumWordLength", 1);
    const WSKernel = require("../lib/ws-kernel");
    const Kernel = require("../lib/kernel");
    remote = connection();
    transport = new WSKernel(
      "gateway",
      { display_name: "Python", language: "python" },
      { name: "Python" },
      { kernel: remote, dispose: () => remote.dispose() },
    );
    transport.supportsComms = false;
    kernel = new Kernel(transport);
    session = kernel.getPluginWrapper();
    store = { kernel, subscriptions: new CompositeDisposable() };
    autocomplete = require("../lib/services/provided/autocomplete").provideAutocomplete(store, {
      getKernelForEditor: () => store.kernel?.getPluginWrapper() || null,
    });
  });
  afterEach(async () => {
    store.subscriptions.dispose();
    kernel.destroy();
    for (const [key, value] of settings) lumine.config.set(key, value);
    for (let turn = 0; turn < 8; turn++) await Promise.resolve();
  });

  function state(record, executionState, parent) {
    remote.iopub(record, "status", { execution_state: executionState }, parent);
  }

  it("does not cancel autocomplete when its own busy precedes complete_reply", async () => {
    const editor = {
      isDestroyed: () => false,
      getTextInBufferRange: () => "pr",
      getCursorBufferPosition: () => ({ row: 0, column: 2 }),
    };
    const pending = autocomplete.getSuggestions({
      editor,
      bufferPosition: { row: 0, column: 2 },
      prefix: "pr",
    });
    await Promise.resolve();
    const record = remote.requests[0];
    state(record, "busy");
    expect(session.executionState).toBe("idle");
    remote.reply(record, { status: "ok", matches: ["print"], cursor_start: 0, cursor_end: 2 });
    state(record, "idle");
    expect((await pending)[0].text).toBe("print");
    expect(transport._queryRequests.size).toBe(0);
  });

  it("keeps exact query ownership after reply and observer disposal until trailing idle", async () => {
    const handle = session.request({ type: "inspect", purpose: "query", code: "print" });
    await Promise.resolve();
    const record = remote.requests[0];
    state(record, "busy");
    remote.reply(record, { status: "ok", found: true, data: { "text/plain": "docs" } });
    handle.dispose();
    expect((await handle.done).status).toBe("cancelled");
    expect(transport._queryRequests.size).toBe(1);
    const foreign = {
      msg_id: "other-execution",
      msg_type: "execute_request",
      session: "other-client",
    };
    state(record, "busy", foreign);
    expect(session.executionState).toBe("busy");
    state(record, "idle");
    expect(session.executionState).toBe("busy");
    expect(transport._queryRequests.size).toBe(0);
    state(record, "idle", foreign);
    expect(session.executionState).toBe("idle");
  });

  it("retires idle-before-reply queries without exposing their idle as user work", async () => {
    const handle = session.request({ type: "complete", purpose: "query", code: "pr" });
    await Promise.resolve();
    const record = remote.requests[0];
    state(record, "busy");
    state(record, "idle");
    expect(transport._queryRequests.size).toBe(1);
    remote.reply(record, { status: "ok", matches: ["print"] });
    expect((await handle.done).status).toBe("ok");
    expect(transport._queryRequests.size).toBe(0);
    expect(session.executionState).toBe("idle");
  });

  it("does not refetch watches after a fast query or change their shared counter and timer", async () => {
    const refetch = jasmine.createSpy("refetch watches");
    const ownership = session.onDidBecomeIdle(refetch);
    const handle = session.request({ type: "execute", purpose: "query", code: "watched_value" });
    await Promise.resolve();
    const record = remote.requests[0];
    state(record, "busy");
    remote.iopub(record, "execute_input", { execution_count: 42 });
    remote.reply(record, { status: "ok" });
    state(record, "idle");
    expect((await handle.done).status).toBe("ok");
    window.advanceClock(1000);
    expect(refetch).not.toHaveBeenCalled();
    expect(session.executionCount).toBe(0);
    expect(session.lastExecutionTime).toBe("No execution");
    expect(session.executionStartTime).toBeNull();
    expect(transport._queryRequests.size).toBe(0);
    ownership.dispose();
  });

  it("preserves another client's status even when its parent id collides with an owned query", async () => {
    const handle = session.request({ type: "complete", purpose: "query", code: "pr" });
    await Promise.resolve();
    const record = remote.requests[0];
    const states = [];
    session.onDidChangeExecutionState((value) => states.push(value));
    state(record, "busy");
    const foreign = { ...record.msg.header, session: "other-client" };
    state(record, "busy", foreign);
    remote.iopub(record, "execute_input", { execution_count: 9 }, foreign);
    expect(session.executionState).toBe("busy");
    expect(session.executionCount).toBe(9);
    remote.reply(record, { status: "ok", matches: [] });
    state(record, "idle");
    expect((await handle.done).status).toBe("ok");
    expect(session.executionState).toBe("busy");
    state(record, "idle", foreign);
    expect(states).toEqual(["busy", "idle"]);
  });

  it("publishes ordinary user executions and still triggers the idle refetch signal", async () => {
    const refetch = jasmine.createSpy("refetch watches");
    const ownership = session.onDidBecomeIdle(refetch);
    const handle = session.request({ type: "execute", purpose: "user", code: "user_value = 1" });
    await Promise.resolve();
    const record = remote.requests[0];
    state(record, "busy");
    remote.iopub(record, "execute_input", { execution_count: 1 });
    remote.reply(record, { status: "ok" });
    state(record, "idle");
    expect((await handle.done).status).toBe("ok");
    window.advanceClock(200);
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(session.executionCount).toBe(1);
    ownership.dispose();
  });

  it("bounds retained query identities without evicting live traffic and clears them on reset", async () => {
    const WSKernel = require("../lib/ws-kernel");
    const handles = [];
    for (let index = 0; index <= WSKernel.MAX_QUERY_REQUESTS; index++)
      handles.push(
        session.request({
          type: "complete",
          purpose: "query",
          code: `value_${index}`,
          timeoutMs: 0,
        }),
      );
    await Promise.resolve();
    expect((await handles.at(-1).done).status).toBe("unavailable");
    expect(remote.requests.length).toBe(WSKernel.MAX_QUERY_REQUESTS);
    expect(transport._queryRequests.size).toBe(WSKernel.MAX_QUERY_REQUESTS);
    for (const handle of handles) handle.dispose();
    expect(transport._queryRequests.size).toBe(WSKernel.MAX_QUERY_REQUESTS);
    remote.status = "restarting";
    remote.statusChanged.emit(remote, remote.status);
    expect(transport._queryRequests.size).toBe(0);
  });

  it("clears retained identities and settles pending observations on disconnect", async () => {
    const handle = session.request({
      type: "complete",
      purpose: "query",
      code: "pr",
      timeoutMs: 0,
    });
    await Promise.resolve();
    expect(transport._queryRequests.size).toBe(1);
    remote.connectionStatusChanged.emit(remote, "disconnected");
    expect(transport._queryRequests.size).toBe(0);
    expect((await handle.done).status).toBe("unavailable");
    expect(session.connectionState).toBe("dead");
  });
});
