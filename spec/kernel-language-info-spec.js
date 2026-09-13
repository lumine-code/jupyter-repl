const Kernel = require("../lib/kernel");
const KernelTransport = require("../lib/kernel-transport");
const JupyterKernel = require("../lib/plugin-api/jupyter-kernel");
const WSKernel = require("../lib/ws-kernel");
const ZMQKernel = require("../lib/zmq-kernel");

describe("kernel language info", () => {
  const kernelSpec = { name: "python3", display_name: "Python 3", language: "python" };
  const grammar = { name: "Python", scopeName: "source.python" };

  it("falls back to the kernelspec until the running kernel reports its language", () => {
    const transport = new KernelTransport(kernelSpec, grammar);

    expect(transport.language).toBe("python");
    expect(transport.languageInfo).toBeNull();

    transport.setLanguageInfo({ name: "Julia", version: "1.12" });

    expect(transport.language).toBe("julia");
    expect(transport.languageInfo).toEqual({ name: "Julia", version: "1.12" });
    expect(Object.isFrozen(transport.languageInfo)).toBe(true);
    transport.destroy();
  });

  it("caches language_info from a local kernel_info_reply", () => {
    const transport = Object.create(ZMQKernel.prototype);
    transport._destroyed = false;
    transport._languageInfo = null;
    transport.executionCallbacks = {
      request: {
        callback: () => {},
        replySeen: false,
        idleSeen: true,
        expectsReply: true,
        expectsIdle: true,
        lastProgressAt: 0,
      },
    };

    transport.onShellMessage({
      header: { msg_id: "reply", msg_type: "kernel_info_reply" },
      parent_header: { msg_id: "request", msg_type: "kernel_info_request" },
      content: {
        status: "ok",
        language_info: { name: "R", version: "4.5" },
      },
    });

    expect(transport.languageInfo).toEqual({ name: "R", version: "4.5" });
  });

  it("keeps language_info current when a remote kernel reports it again", () => {
    let onAnyMessage;
    const signal = { connect: () => {} };
    const session = {
      dispose: () => {},
      kernel: {
        status: "idle",
        statusChanged: signal,
        connectionStatusChanged: signal,
        iopubMessage: signal,
        anyMessage: { connect: (callback) => (onAnyMessage = callback) },
      },
    };
    const transport = new WSKernel("test", kernelSpec, grammar, session);

    onAnyMessage(null, {
      direction: "recv",
      msg: {
        header: { msg_type: "kernel_info_reply" },
        content: { language_info: { name: "Julia", version: "1.12" } },
      },
    });

    expect(transport.language).toBe("julia");
    expect(transport.languageInfo).toEqual({ name: "Julia", version: "1.12" });
    transport.destroy();
  });

  it("exposes the same read-only value through the internal and plugin kernels", () => {
    const transport = new KernelTransport(kernelSpec, grammar);
    transport.setLanguageInfo({ name: "python", version: "3.13" });
    const kernel = new Kernel(transport);
    const pluginKernel = new JupyterKernel(kernel);

    expect(kernel.languageInfo).toBe(transport.languageInfo);
    expect(pluginKernel.languageInfo).toBe(transport.languageInfo);
    kernel.destroy();
  });
});
