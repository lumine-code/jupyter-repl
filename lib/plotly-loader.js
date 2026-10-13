let loading;

module.exports = {
  load() {
    return (loading ||= import("plotly.js-dist")
      .then((namespace) => namespace.default ?? namespace)
      .catch((error) => {
        loading = null;
        throw error;
      }));
  },
};
