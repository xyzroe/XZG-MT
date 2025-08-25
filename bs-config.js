module.exports = {
  server: {
    baseDir: "dist",
    index: "index.html",
    serveStaticOptions: {
      extensions: ["html"],
    },
  },
  files: ["dist/**/*"],
  watchEvents: ["change", "add", "unlink", "addDir", "unlinkDir"],
  watch: true,
  port: 3000,
  open: true,
  cors: true,
  notify: false,
  ui: false,
  ghostMode: false,
  reloadOnRestart: true,
  logLevel: "info",
  middleware: [
    function nocache(req, res, next) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.setHeader("Surrogate-Control", "no-store");
      next();
    },
  ],
};
