/** @jsx etch.dom */
const etch = require("@lumine-code/etch"); // JSX factory
const { Buffer } = require("buffer");
const { ansiNodes, truncateOutput } = require("../../ansi-utils");

// Each renderer takes the decoded data for its media type and returns virtual
// nodes. They are plain functions, not etch components: etch invokes a function
// tag with `new`, so only classes can be tags, and none of these hold state.

/** Plain text with ANSI colour support. */
function Plain(data) {
  if (data == null) return null;
  const rawText = typeof data === "string" ? data : String(data);

  // Truncate to prevent crashes from large outputs
  const { text, truncated } = truncateOutput(rawText);

  return (
    <div>
      <pre className="output-text">{ansiNodes(text)}</pre>
      {truncated ? <div className="output-truncated">... output truncated</div> : null}
    </div>
  );
}

/**
 * Image renderer for the base64 image media types. Metadata may carry the
 * width and height set by IPython.display.Image, as a number of pixels or as a
 * string with its own unit. SVG uses the same path after encoding its XML so
 * notebook markup never enters the document as active DOM.
 */
function image(mediaType, className = "output-image") {
  return (data, metadata) => {
    if (!data) return null;
    const src = `data:${mediaType};base64,${data}`;

    const style = { maxWidth: "100%" };
    if (metadata) {
      if (metadata.width) {
        style.width = typeof metadata.width === "number" ? `${metadata.width}px` : metadata.width;
      }
      if (metadata.height) {
        style.height =
          typeof metadata.height === "number" ? `${metadata.height}px` : metadata.height;
      }
    }

    return <img className={className} src={src} alt="Output" style={style} draggable={false} />;
  };
}

function SVG(data, metadata) {
  if (!data) return null;
  const encoded = Buffer.from(String(data), "utf8").toString("base64");
  return image("image/svg+xml", "output-image output-svg")(encoded, metadata);
}

/** Pretty-printed JSON. */
function Json(data) {
  if (data == null) return null;
  const rawFormatted = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  const { text: formatted, truncated } = truncateOutput(rawFormatted);
  return (
    <div>
      <pre className="output-json">{formatted}</pre>
      {truncated ? <div className="output-truncated">... output truncated</div> : null}
    </div>
  );
}

function JavaScript(data) {
  if (!data) return null;
  return <pre className="output-javascript">{data}</pre>;
}

module.exports = {
  Plain,
  SVG,
  Json,
  JavaScript,
  image,
};
