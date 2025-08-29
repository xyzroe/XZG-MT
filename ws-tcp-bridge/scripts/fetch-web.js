const https = require("https");
const fs = require("fs");
const path = require("path");

const baseUrl = "https://mt.xyzroe.cc";
const webDir = path.resolve(__dirname, "..", "web");

const files = ["flasher.js", "index.html", "index.js", "style.css"];

const favFiles = [
  "apple-touch-icon.png",
  "favicon-96x96.png",
  "favicon.ico",
  "favicon.svg",
  "site.webmanifest",
  "web-app-manifest-192x192.png",
  "web-app-manifest-512x512.png",
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function fetchToFile(urlPath, dest) {
  return new Promise((resolve, reject) => {
    const url = baseUrl + "/" + urlPath;
    const file = fs.createWriteStream(dest);
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        res.pipe(file);
        file.on("finish", () => file.close(resolve));
      })
      .on("error", (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
  });
}

async function main() {
  try {
    ensureDir(webDir);
    for (const f of files) {
      const dest = path.join(webDir, f);
      console.log("Fetching", f);
      await fetchToFile(f, dest);
    }

    const favDir = path.join(webDir, "fav");
    ensureDir(favDir);
    for (const f of favFiles) {
      const dest = path.join(favDir, f);
      console.log("Fetching fav/", f);
      await fetchToFile("fav/" + f, dest);
    }

    console.log("All web assets fetched into", webDir);
  } catch (err) {
    console.error("Failed to fetch web assets:", err.message || err);
    process.exit(1);
  }
}

main();
