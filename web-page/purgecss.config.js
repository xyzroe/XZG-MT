module.exports = {
  content: ["dist/index.html", "dist/flasher.js"],
  css: ["dist/css/bootstrap.min.css"],
  safelist: {
    standard: [
      // Bootstrap tooltip classes
      "tooltip",
      "tooltip-inner",
      "tooltip-arrow",
      "bs-tooltip-top",
      "bs-tooltip-bottom",
      "bs-tooltip-start",
      "bs-tooltip-end",
      "bs-tooltip-auto",
      "fade",
      "show",
      // Modal classes (if needed)
      "modal-backdrop",
      "modal-open",
    ],
    // Preserve all classes that start with these patterns
    greedy: [/^tooltip/, /^bs-tooltip/],
  },
};
