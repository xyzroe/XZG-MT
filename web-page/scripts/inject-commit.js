const { execSync } = require("child_process");
const { readFileSync, writeFileSync, existsSync } = require("fs");
const path = require("path");

try {
  const repoRoot = path.resolve(__dirname, "..");
  const distPath = path.join(repoRoot, "dist", "index.html");

  if (!existsSync(distPath)) {
    console.error("dist/index.html not found — run the build step that creates it first.");
    process.exit(0); // не фейлить сборку, если файл отсутствует (опция) — можно выйти с кодом 1, если нужно строго
  }

  const sha = execSync("git rev-parse --short HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
  const html = readFileSync(distPath, "utf8");
  const updated = html.replace(/COMMITSHA_PLACEHOLDER/g, sha);
  writeFileSync(distPath, updated, "utf8");
  console.log("Injected commit SHA:", sha);
} catch (err) {
  console.error("Failed to inject commit SHA:", err.message || err);
  process.exit(1);
}
