/** @jsx etch.dom */
/** The little inline marker a result shows before it has any output. */
const etch = require("@lumine-code/etch"); // JSX factory
function renderStatus(status, style) {
  switch (status) {
    case "queued":
      return <div className="inline-container icon icon-clock queued" style={style} />;

    case "running":
      return (
        <div className="inline-container spinner" style={style}>
          <div className="rect1" />
          <div className="rect2" />
          <div className="rect3" />
          <div className="rect4" />
          <div className="rect5" />
        </div>
      );

    case "ok":
      return <div className="inline-container icon icon-check" style={style} />;

    case "empty":
      return <div className="inline-container icon icon-zap" style={style} />;

    default:
      return <div className="inline-container icon icon-x" style={style} />;
  }
}

module.exports = { renderStatus };
