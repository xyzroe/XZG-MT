const fs = require("fs");
const path = require("path");

const possibleSrcs = [
  path.resolve(__dirname, "..", "web-page", "dist"), // bridge/web-page/dist (if layout different)
  path.resolve(__dirname, "..", "..", "web-page", "dist"), // repo-root/web-page/dist (expected)
];

let src = null;
for (const p of possibleSrcs) {
  if (fs.existsSync(p)) {
    src = p;
    break;
  }
}

const dest = path.resolve(__dirname, "..", "web"); // bridge/web

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
  if (!src) {
    console.error("web-page build not found. Looked for:");
    possibleSrcs.forEach((p) => console.error("  ", p));
    console.error("");
    console.error(
      "Run `npm --prefix ../web-page run build:lite` (CI does this automatically if package.json updated)."
    );
    process.exit(1);
  }

  // clean dest
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
  copyRecursive(src, dest);
  console.log("Copied web files from", src, "to", dest);
} catch (err) {
  console.error("copy-web failed:", err);
  process.exit(1);
}
