const { execSync } = require("child_process");
const { readFileSync, writeFileSync, existsSync } = require("fs");
const path = require("path");

try {
  const repoRoot = path.resolve(__dirname, "..");
  const distPath = path.join(repoRoot, "dist", "index.html");

  if (!existsSync(distPath)) {
    console.error("dist/index.html not found — run the build step that creates it first.");
    process.exit(0); // don't fail the build if file is missing (optional) — can exit with code 1 if strict behavior is needed
  }

  // Prefer commit SHA from environment (CI/build systems).
  let sha = process.env.COMMIT_SHA || process.env.GIT_COMMIT || process.env.GITHUB_SHA || process.env.GIT_SHA || null;

  // If no env var, attempt to discover git commit by trying multiple candidate
  // working directories. This helps when the script is invoked from a different
  // CWD (Docker build, npm prefix, CI helpers, etc.). We check for a .git
  // directory near the web-page folder and walk up a couple of parents, then
  // fallback to the current process.cwd(). If git is not available or no repo
  // is present, we fall back to 'unknown' without failing the build.
  if (!sha) {
    const candidates = [];
    // primary candidate: the repo root relative to this script
    candidates.push(repoRoot);
    // walk up a couple of levels (in case web-page is nested)
    candidates.push(path.resolve(repoRoot, ".."));
    candidates.push(path.resolve(repoRoot, "..", ".."));
    // also try the current working directory
    candidates.push(process.cwd());

    for (const c of candidates) {
      try {
        const gitDir = path.join(c, ".git");
        if (existsSync(gitDir)) {
          // run git in the candidate cwd
          sha = execSync("git rev-parse --short HEAD", { cwd: c, encoding: "utf8" }).trim();
          if (sha) break;
        } else {
          // if .git not present, we can still try git in case the environment
          // has the repo elsewhere; wrap in try/catch to avoid throwing.
          try {
            sha = execSync("git rev-parse --short HEAD", { cwd: c, encoding: "utf8" }).trim();
            if (sha) break;
          } catch (e) {
            // ignore and continue
          }
        }
      } catch (err) {
        // ignore and continue to next candidate
      }
    }
  }

  if (!sha) {
    sha = "unknown";
    console.warn('No git repository found and no commit env var set — injecting "unknown"');
  }

  //read version from package.json
  let version;
  try {
    const pkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
    version = pkg.version;
  } catch (e) {
    version = "unknown";
    console.warn('No package.json found or invalid — injecting "unknown"');
  }

  const html = readFileSync(distPath, "utf8");
  const updated = html.replace(/COMMIT_PLH/g, sha).replace(/VER_PLH/g, version);
  writeFileSync(distPath, updated, "utf8");
  console.log("Injected commit SHA:", sha);
  console.log("Injected version:", version);
} catch (err) {
  console.error("Failed to inject commit SHA:", err.message || err);
  console.error("Failed to inject version:", err.message || err);
  process.exit(1);
}
