const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

// Ordinary package tests never start a Python interpreter or kernel implicitly.
const liveSuite = process.env.LUMINE_TEST_LIVE_NOTEBOOK === "true" ? describe : () => {};

liveSuite("a real Python notebook session", () => {
  let directory, notebook, kernel, transport, previousRuntime;
  const python = process.env.LUMINE_TEST_PYTHON || "python";

  afterEach(async () => {
    const child = transport?.kernelProcess;
    try {
      if (kernel) await kernel.shutdownAndDestroy();
      if (transport) await transport._killProcessTree(child);
    } finally {
      transport?.destroy();
      if (notebook && !notebook._destroyed) notebook.destroy();
      if (previousRuntime === undefined) delete process.env.JUPYTER_RUNTIME_DIR;
      else process.env.JUPYTER_RUNTIME_DIR = previousRuntime;
      if (directory) fs.rmSync(directory, { recursive: true, force: true });
    }
  }, 30000);

  it("executes, persists rich output, recovers from errors and restarts without old state", async () => {
    jasmine.useRealClock();
    previousRuntime = process.env.JUPYTER_RUNTIME_DIR;
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "lumine-live-notebook-"));
    const ipythonDirectory = path.join(directory, "ipython");
    fs.mkdirSync(path.join(ipythonDirectory, "profile_live", "startup"), { recursive: true });
    process.env.JUPYTER_RUNTIME_DIR = directory;
    const version = execFileSync(
      python,
      ["-c", "import platform; print(platform.python_version())"],
      {
        encoding: "utf8",
        timeout: 10000,
        windowsHide: true,
      },
    ).trim();
    const filename = path.join(directory, "session.ipynb");
    const sources = [
      "import sys, numpy as np, pandas as pd, pyarrow as pa\nfrom IPython.display import display\nvalues = np.arange(6)\nframe = pd.DataFrame({'value': values})\narrow = pa.Table.from_pandas(frame)\nprint(sys.version.split()[0])\ndisplay(frame)",
      "int(arrow.column('value').to_numpy().sum())",
      "%matplotlib inline\nimport matplotlib.pyplot as plt\nplt.plot(values, values ** 2)\nplt.show()",
      "raise ValueError('notebook session check')",
      "print('frame' in globals())",
    ];
    fs.writeFileSync(
      filename,
      JSON.stringify({
        nbformat: 4,
        nbformat_minor: 5,
        metadata: { kernelspec: { name: "python3", display_name: "Python 3", language: "python" } },
        cells: sources.map((source, index) => ({
          id: `live-cell-${index}`,
          cell_type: "code",
          source: [source],
          metadata: {},
          outputs: [],
          execution_count: null,
        })),
      }),
    );

    const pack = await lumine.packages.activatePackage(path.resolve(__dirname, ".."));
    const view = await lumine.packages.activatePackage("jupyter-view");
    notebook = await lumine.workspace.open(filename);
    await notebook._sourceEditorSetupPromise;
    await globalThis.conditionPromise(() =>
      sources.every((_source, index) => notebook.getCellEditor(index + 1)),
    );
    const provider = view.mainModule.provideJupyterAdapter();
    const adapter = provider.getAdapterForItem(notebook);
    const ZMQKernel = require("../lib/zmq-kernel");
    const Kernel = require("../lib/kernel");
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        transport?.destroy();
        reject(new Error("The notebook kernel did not become ready in 30 seconds"));
      }, 30000);
      try {
        transport = new ZMQKernel(
          {
            name: "python3",
            display_name: "Python 3",
            language: "python",
            argv: [
              python,
              "-m",
              "ipykernel_launcher",
              "-f",
              "{connection_file}",
              "--profile=live",
              `--HistoryManager.hist_file=${path.join(directory, "history.sqlite")}`,
            ],
          },
          adapter.getKernelGrammar(),
          {
            cwd: directory,
            stdio: ["ignore", "pipe", "pipe"],
            env: {
              IPYTHONDIR: ipythonDirectory,
              JUPYTER_CONFIG_DIR: path.join(directory, "jupyter"),
              MPLCONFIGDIR: path.join(directory, "matplotlib"),
              PYTHONSTARTUP: "",
              PYTHONNOUSERSITE: "1",
            },
          },
          () => {
            clearTimeout(timer);
            resolve();
          },
        );
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    });
    kernel = new Kernel(transport);
    const integration = require("../lib/adapter-integration");
    integration.activateAdapterIntegration();
    expect(await integration.bindExistingAdapterKernel([provider], adapter, kernel)).toBeTrue();
    const execution = pack.mainModule.provideJupyterExecution();
    const run = async (indexes) => {
      const receipt = await execution.execute({
        item: notebook,
        targets: indexes.map((index) => adapter.getRunTarget(`live-cell-${index}`)),
      });
      expect(receipt.accepted).toBeTrue();
      return receipt.done;
    };

    expect((await run([0, 1, 2])).status).toBe("ok");
    const cells = notebook.document.cells;
    expect(cells[0].outputs.some((output) => output.text?.includes(version))).toBeTrue();
    expect(
      cells[0].outputs.some((output) => output.data?.["text/html"]?.includes("dataframe")),
    ).toBeTrue();
    expect(cells[1].outputs.some((output) => output.data?.["text/plain"] === "15")).toBeTrue();
    const image = cells[2].outputs.find((output) => output.data?.["image/png"]);
    expect(Buffer.from(image?.data["image/png"] || "", "base64").subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    expect(cells.slice(0, 3).map((cell) => cell.executionCount)).toEqual([1, 2, 3]);
    expect((await run([3])).status).toBe("error");
    expect(cells[3].outputs).toContain(
      jasmine.objectContaining({
        output_type: "error",
        ename: "ValueError",
        evalue: "notebook session check",
      }),
    );
    expect((await run([4])).status).toBe("ok");
    expect(cells[4].outputs.some((output) => output.text?.trim() === "True")).toBeTrue();

    expect(await kernel.restart()).toBeTrue();
    expect((await run([4])).status).toBe("ok");
    expect(cells[4].outputs.some((output) => output.text?.trim() === "False")).toBeTrue();
    expect(cells[4].executionCount).toBe(1);
    await notebook.save();
    const saved = JSON.parse(fs.readFileSync(filename, "utf8"));
    expect(saved.metadata.language_info.version).toBe(version);
    expect(saved.cells.map((cell) => cell.outputs)).toEqual(
      cells.map((cell) => cell.toJSON().outputs),
    );
    execFileSync(
      python,
      [
        "-c",
        "import nbformat, sys; nbformat.validate(nbformat.read(sys.argv[1], as_version=4))",
        filename,
      ],
      { timeout: 10000, windowsHide: true },
    );

    const child = transport.kernelProcess;
    const connectionFile = transport.connectionFile;
    await kernel.shutdownAndDestroy();
    await transport._killProcessTree(child);
    expect(kernel._inFlight.size).toBe(0);
    expect(Object.keys(transport.executionCallbacks).length).toBe(0);
    expect(child.exitCode !== null || child.signalCode !== null).toBeTrue();
    expect(fs.existsSync(connectionFile)).toBeFalse();
    expect(transport.shellSocket).toBeNull();
    expect(transport.ioSocket).toBeNull();
    expect(transport.stdinSocket).toBeNull();
    notebook.destroy();
    notebook = await lumine.workspace.open(filename);
    expect(notebook.document.cells.map((cell) => cell.outputs)).toEqual(
      saved.cells.map((cell) => cell.outputs),
    );
  }, 120000);
});
