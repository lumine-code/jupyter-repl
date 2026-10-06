// MIME capabilities and preference order are data, independent of the view
// classes that implement them. OutputStore can classify a result without
// importing every renderer.
const VEGA_MEDIA_TYPES = {
  "application/vnd.vega.v6.json": { kind: "vega", version: "6" },
  "application/vnd.vega.v6+json": { kind: "vega", version: "6" },
  "application/vnd.vega.v5.json": { kind: "vega", version: "5" },
  "application/vnd.vega.v5+json": { kind: "vega", version: "5" },
  "application/vnd.vegalite.v6.json": { kind: "vega-lite", version: "6" },
  "application/vnd.vegalite.v6+json": { kind: "vega-lite", version: "6" },
  "application/vnd.vegalite.v5.json": { kind: "vega-lite", version: "5" },
  "application/vnd.vegalite.v5+json": { kind: "vega-lite", version: "5" },
};

const MIME_PRIORITY = [
  // Live representations can decline when their kernel or model is gone;
  // the next representation in the same bundle then supplies the fallback.
  "application/vnd.jupyter.widget-view+json",
  "application/vnd.bokehjs_load.v0+json",
  "application/vnd.bokehjs_exec.v0+json",
  "application/vnd.holoviews_load.v0+json",
  "application/vnd.holoviews_exec.v0+json",
  ...Object.keys(VEGA_MEDIA_TYPES),
  "application/vnd.plotly.v1+json",
  "text/vnd.plotly.v1+html",
  "text/html",
  "text/markdown",
  "text/latex",
  "image/svg+xml",
  "image/webp",
  "image/png",
  "image/jpeg",
  "image/gif",
  "application/json",
  "application/javascript",
  "text/plain",
];

const SUPPORTED_MEDIA_TYPES = [...MIME_PRIORITY];
const supportedMediaTypes = new Set(SUPPORTED_MEDIA_TYPES);

function isTextOutputOnly(data) {
  const types = Object.keys(data).filter((mediaType) => supportedMediaTypes.has(mediaType));
  return types.length === 1 && types[0] === "text/plain";
}

module.exports = { MIME_PRIORITY, SUPPORTED_MEDIA_TYPES, VEGA_MEDIA_TYPES, isTextOutputOnly };
