/** @jsx etch.dom */
const etch = require("@lumine-code/etch");
const fs = require("fs");
const path = require("path");
const { ansiNodes, truncateOutput } = require("../../ansi-utils");
const { parseTraceback } = require("../../traceback");
const { resolverForOutput } = require("../../traceback-context");
const { registerTarget } = require("../../traceback-targets");

function tracebackText(output) {
  return Array.isArray(output?.traceback) ? output.traceback.join("\n") : "";
}

function fileLink(frame, kernel) {
  const filename = frame.filename;
  // Kernels may return remote paths, pseudo-files, or URLs. A local absolute
  // regular file is the only default navigation target.
  if (
    (kernel && !kernel.capabilities.localSource) ||
    !filename ||
    !path.isAbsolute(filename) ||
    /[\0\r\n]/.test(filename)
  )
    return null;
  try {
    if (!fs.statSync(filename).isFile()) return null;
  } catch {
    return null;
  }
  return {
    title: "Open file at this traceback location",
    async open() {
      const editor = await lumine.workspace.open(filename, {
        initialLine: frame.line - 1,
        initialColumn: frame.column || 0,
      });
      if (frame.endColumn != null && editor?.setSelectedBufferRange) {
        editor.setSelectedBufferRange([
          [frame.line - 1, frame.column || 0],
          [frame.line - 1, frame.endColumn],
        ]);
      }
    },
  };
}

class Traceback {
  constructor(props) {
    this.props = props;
    this.destroyed = false;
    this.generation = 0;
    this.registrations = [];
    etch.initialize(this);
    this.registerLocations();
  }
  update(props) {
    this.clearLocations();
    this.generation++;
    this.props = props;
    return etch.update(this);
  }
  destroy() {
    this.destroyed = true;
    this.generation++;
    this.clearLocations();
    return etch.destroySync(this);
  }

  clearLocations() {
    for (const registration of this.registrations) registration.dispose();
    this.registrations = [];
  }

  snapshotCurrent(snapshot) {
    if (
      this.destroyed ||
      this.generation !== snapshot.generation ||
      this.props.output !== snapshot.output ||
      this.props.kernel !== snapshot.kernel ||
      this.props.resolveTracebackFrame !== snapshot.resolver ||
      tracebackText(this.props.output) !== snapshot.text ||
      this.props.output?.ename !== snapshot.ename
    )
      return false;
    const kernel = snapshot.kernel;
    return (
      !kernel?.isDestroyed() &&
      kernel?.generation === snapshot.connectionGeneration &&
      (!kernel || kernel.connectionState === "ready") &&
      ![
        "loading",
        "recovering",
        "unresponsive",
        "restarting",
        "autorestarting",
        "shutting-down",
        "dead",
      ].includes(kernel?.executionState)
    );
  }

  resolveLocation(location) {
    const resolve = this.props.resolveTracebackFrame || resolverForOutput(this.props.output);
    return resolve?.(location) || fileLink(location, this.props.kernel);
  }

  registerLocations() {
    this.clearLocations();
    const snapshot = this.renderSnapshot;
    if (!snapshot || !this.snapshotCurrent(snapshot)) return;
    for (const { location, index } of this.renderedLocations) {
      const element = this.refs[`location-${index}`];
      if (!element) continue;
      const label = element.textContent;
      const isCurrent = () =>
        this.snapshotCurrent(snapshot) &&
        this.element.contains(element) &&
        element.textContent === label;
      this.registrations.push(
        registerTarget(element, () => (isCurrent() ? this.resolveLocation(location) : null), {
          isCurrent,
        }),
      );
    }
  }

  writeAfterUpdate() {
    this.registerLocations();
  }

  renderPart(part, index) {
    const link = part.location && this.resolveLocation(part.location);
    if (link) this.renderedLocations.push({ location: part.location, index });
    return (
      <pre className="error-traceback traceback-frame" key={index}>
        {link ? (
          <span className="traceback-location" ref={`location-${index}`} role="link" tabIndex={0}>
            {ansiNodes(part.lines[0])}
          </span>
        ) : (
          ansiNodes(part.lines[0])
        )}
        {part.lines.length > 1 ? ["\n", ...ansiNodes(part.lines.slice(1).join("\n"))] : null}
      </pre>
    );
  }

  render() {
    const { output } = this.props;
    const raw = tracebackText(output);
    this.renderedLocations = [];
    this.renderSnapshot = {
      generation: this.generation,
      output,
      text: raw,
      ename: output.ename,
      resolver: this.props.resolveTracebackFrame,
      kernel: this.props.kernel,
      connectionGeneration: this.props.kernel?.generation,
    };
    const { text, truncated } = truncateOutput(raw);
    const parts = text ? parseTraceback(text, output.ename) : [];
    const nodes = [];
    for (let index = 0; index < parts.length;) {
      const start = index;
      if (parts[index].library) {
        while (index < parts.length && parts[index].library) index++;
        nodes.push(
          <details
            className="traceback-library"
            key={start}
            onClick={(event) => event.stopPropagation()}
          >
            <summary>
              {index - start} library {index - start === 1 ? "frame" : "frames"}
            </summary>
            {parts.slice(start, index).map((part, offset) => this.renderPart(part, start + offset))}
          </details>,
        );
      } else {
        nodes.push(this.renderPart(parts[index], index));
        index++;
      }
    }
    return (
      <div className="output-error structured-traceback" dataset={{ hyperclickBoundary: "true" }}>
        {!text ? (
          <div className="error-header">
            <span className="error-name">{output.ename}</span>
            {output.evalue ? (
              <span className="error-value">: {ansiNodes(output.evalue)}</span>
            ) : null}
          </div>
        ) : null}
        {nodes}
        {truncated ? <div className="output-truncated">... traceback truncated</div> : null}
      </div>
    );
  }
}

module.exports = Traceback;
