const fs = require("fs");
const path = require("path");

const distDir = path.resolve(__dirname, "..", "dist", "win");

try {
  // remove if exists
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
  }
  // create dir
  fs.mkdirSync(distDir, { recursive: true });
  console.log("Prepared directory:", distDir);

  // ---- NEW: copy `web` next to the exe so artifacts uploaded by CI include it ----
  const webSrc = path.resolve(__dirname, "..", "web");
  const webDest = path.join(distDir, "web");
  if (fs.existsSync(webSrc)) {
    if (typeof fs.cpSync === "function") {
      fs.cpSync(webSrc, webDest, { recursive: true });
    } else {
      // fallback for older Node versions (recursive copy)
      function copyRecursive(src, dest) {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
          const s = path.join(src, entry.name);
          const d = path.join(dest, entry.name);
          if (entry.isDirectory()) copyRecursive(s, d);
          else if (entry.isFile()) fs.copyFileSync(s, d);
        }
      }
      copyRecursive(webSrc, webDest);
    }
    console.log("Copied web folder to:", webDest);
  } else {
    console.warn("web folder not found (expected at):", webSrc);
  }

  process.exit(0);
} catch (err) {
  console.error("Failed to prepare dist/win:", err);
  process.exit(1);
}
