const style = document.createElement("style");
style.dataset.realmProbe = "true";
document.head.appendChild(style);
window.__jupyterRealmProbe = {
  document,
  hasRequire: typeof window.require === "function",
};
