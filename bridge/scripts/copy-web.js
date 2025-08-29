const fs = require("fs");
const path = require("path");

const src = path.resolve(__dirname, "..", "web-page", "dist");
const dest = path.resolve(__dirname, "web");

function copyRecursive(s, d) {
  if (!fs.existsSync(s)) {
    console.error("Source not found:", s);
    process.exit(1);
  }
  fs.mkdirSync(d, { recursive: true });
  for (const entry of fs.readdirSync(s, { withFileTypes: true })) {
    const srcPath = path.join(s, entry.name);
    const destPath = path.join(d, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

try {
  // clean dest
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
  copyRecursive(src, dest);
  console.log("Copied web files from", src, "to", dest);
} catch (err) {
  console.error("copy-web failed:", err);
  process.exit(1);
}
