let loading, cookieTransport;

module.exports = {
  load() {
    return (loading ||= Promise.all([import("@jupyterlab/services"), import("ws")])
      .then(([services, socket]) => ({
        ...(services.default ?? services),
        WebSocket: socket.default ?? socket,
      }))
      .catch((error) => {
        loading = null;
        throw error;
      }));
  },
  loadCookieTransport() {
    return (cookieTransport ||= import("node-fetch").catch((error) => {
      cookieTransport = null;
      throw error;
    }));
  },
};
