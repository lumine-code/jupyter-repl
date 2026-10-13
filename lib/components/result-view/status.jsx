/** @jsx etch.dom */
/** Shared waiting animation and inline execution-status markers. */
const etch = require("@lumine-code/etch"); // JSX factory
function renderSpinner(style, className = "inline-container spinner") {
  return (
    <div className={className} style={style}>
      <div className="rect1" />
      <div className="rect2" />
      <div className="rect3" />
      <div className="rect4" />
      <div className="rect5" />
    </div>
  );
}

function renderStatus(status, style) {
  switch (status) {
    case "queued":
      return <div className="inline-container icon icon-clock queued" style={style} />;

    case "running":
      return renderSpinner(style);

    case "ok":
      return <div className="inline-container icon icon-check" style={style} />;

    case "empty":
      return <div className="inline-container icon icon-zap" style={style} />;

    default:
      return <div className="inline-container icon icon-x" style={style} />;
  }
}

module.exports = { renderStatus, renderSpinner };
