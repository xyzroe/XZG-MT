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
  process.exit(0);
} catch (err) {
  console.error("Failed to prepare dist/win:", err);
  process.exit(1);
}
