/** @jsx etch.dom */
const etch = require("@lumine-code/etch");
const fs = require("fs");
const path = require("path");
const { ansiNodes, truncateOutput } = require("../../ansi-utils");
const { parseTraceback } = require("../../traceback");
const { resolverForOutput } = require("../../traceback-context");

function fileLink(frame, kernel) {
  const filename = frame.filename;
  // Kernels may return remote paths, pseudo-files, or URLs. A local absolute
  // regular file is the only default navigation target.
  if (
    kernel?.transport?.session ||
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
    etch.initialize(this);
  }
  update(props) {
    this.props = props;
    return etch.update(this);
  }
  destroy() {
    return etch.destroySync(this);
  }

  renderPart(part, index) {
    const resolve = this.props.resolveTracebackFrame || resolverForOutput(this.props.output);
    const link =
      part.location && (resolve?.(part.location) || fileLink(part.location, this.props.kernel));
    return (
      <pre className="error-traceback traceback-frame" key={index}>
        {link ? (
          <button
            className="traceback-location"
            title={link.title}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              Promise.resolve(link.open()).catch((error) =>
                lumine.notifications.addWarning("Cannot open traceback source", {
                  detail: error.message,
                }),
              );
            }}
          >
            {ansiNodes(part.lines[0])}
          </button>
        ) : (
          ansiNodes(part.lines[0])
        )}
        {part.lines.length > 1 ? ["\n", ...ansiNodes(part.lines.slice(1).join("\n"))] : null}
      </pre>
    );
  }

  render() {
    const { output } = this.props;
    const raw = Array.isArray(output.traceback) ? output.traceback.join("\n") : "";
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
      <div className="output-error structured-traceback">
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
