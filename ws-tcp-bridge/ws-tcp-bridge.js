#!/usr/bin/env node

const net = require("net");
const http = require("http");
const WebSocket = require("ws");
const os = require("os");
const { pathToFileURL } = require("url");
const path = require("path");
const fs = require("fs");
const { Module } = require("module");

// Global cache for extracted prebuild info to avoid duplicate writes/races
global.__XZG_SERIAL_PREBUILD = global.__XZG_SERIAL_PREBUILD || null;
global.__XZG_SERIAL_PREBUILD_CLEANUP = global.__XZG_SERIAL_PREBUILD_CLEANUP || false;

// Allow configuring the port via env (PORT) or argv[2]; default 8765
const WS_PORT = Number(process.env.PORT || process.argv[2] || 8765);

// Allow configuring the serial scan interval via env (SERIAL_SCAN_INTERVAL) or argv[3]; default 10000
// Use nullish coalescing so that '0' is preserved (disable monitor when 0)
const SERIAL_SCAN_INTERVAL = Number(process.env.SERIAL_SCAN_INTERVAL || process.argv[3] || 10000);

// Allow configuring the advertise host via env (ADVERTISE_HOST) or argv[4]; default null
const ADVERTISE_HOST = process.env.ADVERTISE_HOST || process.argv[4] || null;

// Debugging flag port via env (PORT) or argv[5]; default false
const DEBUG = /^(1|true|yes|on)$/i.test(String(process.env.DEBUG_SERIAL || ""));

function registerTempCleanup(dir) {
  try {
    if (!dir || global.__XZG_SERIAL_PREBUILD_CLEANUP) return;
    const clean = () => {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {}
    };
    process.on("exit", clean);
    process.on("SIGINT", () => {
      try {
        clean();
      } catch {}
      process.exit(0);
    });
    process.on("SIGTERM", () => {
      try {
        clean();
      } catch {}
      process.exit(0);
    });
    process.on("SIGHUP", () => {
      try {
        clean();
      } catch {}
      process.exit(0);
    });
    process.on("uncaughtException", (e) => {
      try {
        clean();
      } catch {}
      // rethrow after cleanup
      throw e;
    });
    global.__XZG_SERIAL_PREBUILD_CLEANUP = true;
  } catch {}
}
let BonjourCtor;
let SerialPortLib;
let serialPortResolvePromise = null;
try {
  const mod = require("bonjour-service");
  // Support both CJS and ESM default/named exports
  BonjourCtor = mod?.Bonjour || mod?.default || mod || null;
} catch (_) {
  BonjourCtor = null;
}
// Lazy resolver for serialport that supports both CJS and ESM builds
async function getSerialPort() {
  if (SerialPortLib) return SerialPortLib;
  if (!serialPortResolvePromise) {
    serialPortResolvePromise = (async () => {
      // In packaged mode, extract the right prebuild into a temp dir and point NODE_GYP_BUILD_PREBUILD there
      if (process.pkg) {
        try {
          const extracted = await ensureSerialportPrebuildExtracted();
          if (extracted && extracted.dir) process.env.NODE_GYP_BUILD_PREBUILD = extracted.dir;
          // Override node-gyp-build to return our extracted native binding directly
          if (extracted && extracted.file) {
            try {
              const loader = function () {
                try {
                  return require(extracted.file);
                } catch (e) {
                  console.warn("[serial][pkg] direct load failed:", String(e));
                  throw e;
                }
              };
              const toPatch = [];
              try {
                toPatch.push(require.resolve("node-gyp-build"));
              } catch {}
              try {
                const lb = require.resolve("@serialport/bindings-cpp/dist/load-bindings.js");
                const id2 = require.resolve("node-gyp-build", { paths: [path.dirname(lb)] });
                toPatch.push(id2);
              } catch {}
              try {
                const sp = require.resolve("serialport");
                const id3 = require.resolve("node-gyp-build", { paths: [path.dirname(sp)] });
                toPatch.push(id3);
              } catch {}
              for (const ngbId of Array.from(new Set(toPatch)).filter(Boolean)) {
                try {
                  const m = new Module(ngbId);
                  m.filename = ngbId;
                  m.loaded = true;
                  m.exports = function () {
                    return loader();
                  };
                  Module._cache[ngbId] = m;
                } catch (e) {
                  console.warn("[serial][pkg] patch node-gyp-build failed:", ngbId, String(e));
                }
              }
            } catch (e3) {
              process.env.DEBUG_SERIAL && console.warn("[serial][pkg] override node-gyp-build failed:", String(e3));
            }
          }
          // Note: do NOT prime require.cache for '@serialport/bindings-cpp'.
          // Serialport expects the JS wrapper (which exports autoDetect()),
          // and priming it with the native exports breaks that contract.
        } catch (e) {
          process.env.DEBUG_SERIAL && console.warn("[serial][pkg] prebuild extraction failed:", String(e));
        }
      }
      try {
        // Prefer CJS require
        const sp = require("serialport");
        // Some broken states may return an unexpected value; validate shape
        if (!sp || (typeof sp !== "function" && typeof sp.SerialPort !== "function" && typeof sp.list !== "function")) {
          throw new Error("serialport invalid export");
        }
        return sp;
      } catch (e) {
        // Fallback for ESM-only package (ERR_REQUIRE_ESM)
        if (e && (e.code === "ERR_REQUIRE_ESM" || /Cannot use import statement/.test(String(e)))) {
          try {
            const mod = await import("serialport");
            return mod?.default || mod;
          } catch (e2) {
            process.env.DEBUG_SERIAL && console.warn("[serial] dynamic import failed:", String(e2));
            return null;
          }
        }
        console.warn("[serial] require('serialport') failed:", String(e));
        // Last resort: try build a thin adapter around bindings-cpp using extracted native binding
        try {
          const extracted = process.pkg ? await ensureSerialportPrebuildExtracted() : null;
          if (extracted && extracted.file) {
            // Load bindings-cpp JS which will call our patched node-gyp-build and return binding classes
            const bindingsCpp = require("@serialport/bindings-cpp");
            const Stream = (() => {
              try {
                return require("@serialport/stream");
              } catch {
                return null;
              }
            })();
            const { autoDetect } = bindingsCpp || {};
            const Binding =
              typeof autoDetect === "function" ? autoDetect() : (bindingsCpp && bindingsCpp.Binding) || null;
            if (Binding && Stream && Stream.SerialPortStream) {
              // Construct SerialPort-compatible facade
              class SerialPortCompat extends Stream.SerialPortStream {}
              SerialPortCompat.Binding = Binding;
              return { SerialPort: SerialPortCompat, ...Stream };
            }
          }
        } catch (e3) {
          console.warn("[serial] fallback via bindings-cpp failed:", String(e3));
        }
        return null;
      }
    })().then((mod) => {
      SerialPortLib = mod;
      return mod;
    });
  }
  return serialPortResolvePromise;
}

// Synchronous extractor used by the global require hook
function ensureSerialportPrebuildExtractedSync() {
  try {
    if (global.__XZG_SERIAL_PREBUILD && fs.existsSync(global.__XZG_SERIAL_PREBUILD.file)) {
      return global.__XZG_SERIAL_PREBUILD;
    }
    const plat = process.platform;
    const arch = process.arch;
    let subdir = null;
    let filename = "node.napi.node";
    if (plat === "win32") {
      if (arch === "x64" || arch === "arm64" || arch === "ia32") {
        subdir = `win32-${arch}`;
      }
    } else if (plat === "darwin") {
      subdir = "darwin-x64+arm64";
    } else if (plat === "linux") {
      if (arch === "x64") {
        const isMusl = detectMusl();
        subdir = "linux-x64";
        filename = isMusl ? "node.napi.musl.node" : "node.napi.glibc.node";
      } else if (arch === "arm64") {
        subdir = "linux-arm64";
        filename = "node.napi.armv8.node";
      } else if (arch === "arm") {
        subdir = "linux-arm";
        filename = "node.napi.armv7.node";
      }
    }
    if (!subdir) return null;
    // External prebuilds next to exe/cwd
    const tryDirs = [];
    try {
      tryDirs.push(path.join(path.dirname(process.execPath), "prebuilds", subdir));
    } catch {}
    try {
      tryDirs.push(path.join(process.cwd(), "prebuilds", subdir));
    } catch {}
    for (const d of tryDirs) {
      try {
        const entries = fs.readdirSync(d).filter((f) => f.toLowerCase().endsWith(".node"));
        if (entries && entries.length) {
          const file = path.join(d, entries[0]);
          return { dir: d, file };
        }
      } catch {}
    }
    // Snapshot prebuilds
    let bindingsPkgDir = null;
    try {
      bindingsPkgDir = path.dirname(require.resolve("@serialport/bindings-cpp/package.json"));
    } catch {}
    if (!bindingsPkgDir) {
      try {
        const entry = require.resolve("@serialport/bindings-cpp");
        bindingsPkgDir = path.join(path.dirname(entry), "..");
      } catch {}
    }
    if (!bindingsPkgDir) return null;
    const prebuildDir = path.join(bindingsPkgDir, "prebuilds", subdir);
    let chosen = path.join(prebuildDir, filename);
    if (!fs.existsSync(chosen)) {
      try {
        const list = fs.readdirSync(prebuildDir).filter((f) => f.toLowerCase().endsWith(".node"));
        if (list && list.length) chosen = path.join(prebuildDir, list[0]);
      } catch {}
    }
    if (!fs.existsSync(chosen)) return null;
    const data = fs.readFileSync(chosen);
    // Use a per-process folder to avoid cross-run locking conflicts
    const outDir = path.join(os.tmpdir(), "ws-tcp-bridge-prebuilds", `${plat}-${arch}-${process.pid}`);
    try {
      fs.mkdirSync(outDir, { recursive: true });
    } catch {}
    const outFile = path.join(outDir, "node.napi.node");
    try {
      if (!fs.existsSync(outFile)) {
        fs.writeFileSync(outFile, data);
      }
    } catch {
      // If we cannot write but the file exists, try to use it
      if (!fs.existsSync(outFile)) return null;
    }
    const result = { dir: outDir, file: outFile };
    global.__XZG_SERIAL_PREBUILD = result;
    return result;
  } catch {
    return null;
  }
}

// Global hook to ensure any 'node-gyp-build' import gets a callable that returns our extracted binding
if (process.pkg && !global.__XZG_NGB_HOOKED) {
  global.__XZG_NGB_HOOKED = true;
  try {
    const origReq = Module.prototype.require;
    Module.prototype.require = function patchedRequire(id) {
      if (id === "node-gyp-build" || id === "node-gyp-build/index.js") {
        // node-gyp-build modules typically export a function that accepts an optional directory
        // but our loader doesn't need the dir, it always returns the extracted binding.
        const extracted = ensureSerialportPrebuildExtractedSync();
        const loader = () => {
          if (!extracted || !extracted.file) throw new Error("prebuild not prepared");
          return origReq.call(this, extracted.file);
        };
        const fn = function (_dir) {
          return loader();
        };
        return fn;
      }
      return origReq.apply(this, arguments);
    };
    if (DEBUG) console.log("[serial][pkg] node-gyp-build hook installed");
  } catch (e) {
    if (DEBUG) console.warn("[serial][pkg] failed to install node-gyp-build hook:", String(e));
  }
}

// Extract the correct @serialport/bindings[-cpp] prebuild from packaged assets to a temp dir
async function ensureSerialportPrebuildExtracted() {
  if (global.__XZG_SERIAL_PREBUILD && fs.existsSync(global.__XZG_SERIAL_PREBUILD.file)) {
    if (DEBUG) console.log("[serial][pkg] using cached prebuild:", global.__XZG_SERIAL_PREBUILD.file);
    return global.__XZG_SERIAL_PREBUILD;
  }
  // Decide subdir and filename inside bindings-cpp/prebuilds
  const plat = process.platform; // 'win32' | 'linux' | 'darwin'
  const arch = process.arch; // 'x64' | 'arm64' | ...
  let subdir = null;
  let filename = "node.napi.node";
  if (plat === "win32") {
    if (arch === "x64" || arch === "arm64" || arch === "ia32") {
      subdir = `win32-${arch}`;
    }
  } else if (plat === "darwin") {
    // universal binary in darwin-x64+arm64
    subdir = "darwin-x64+arm64";
  } else if (plat === "linux") {
    if (arch === "x64") {
      const isMusl = detectMusl();
      subdir = "linux-x64";
      filename = isMusl ? "node.napi.musl.node" : "node.napi.glibc.node";
    } else if (arch === "arm64") {
      subdir = "linux-arm64";
      filename = "node.napi.armv8.node";
    } else if (arch === "arm") {
      subdir = "linux-arm";
      // pick armv7 as a safer default; @serialport has both v6 and v7
      filename = "node.napi.armv7.node";
    }
  }
  if (!subdir) {
    console.log("[serial][pkg] unsupported platform/arch for prebuilds:", { plat, arch });
    return null;
  }
  // First, try to use an existing external prebuild placed next to the exe or in cwd
  const externalDirs = [];
  try {
    externalDirs.push(path.join(path.dirname(process.execPath), "prebuilds", subdir));
  } catch {}
  try {
    externalDirs.push(path.join(process.cwd(), "prebuilds", subdir));
  } catch {}
  for (const d of externalDirs) {
    try {
      const entries = fs.readdirSync(d).filter((f) => f.toLowerCase().endsWith(".node"));
      if (entries && entries.length) {
        const file = path.join(d, entries[0]);
        console.log("[serial][pkg] using external prebuild:", file);
        return { dir: d, file };
      }
    } catch {}
  }
  // Resolve path to packaged asset inside snapshot
  let bindingsPkgDir = null;
  let bindingsPkgName = null; // '@serialport/bindings-cpp' or '@serialport/bindings'
  try {
    const pkgJsonPath = require.resolve("@serialport/bindings-cpp/package.json");
    bindingsPkgDir = path.dirname(pkgJsonPath);
    bindingsPkgName = "@serialport/bindings-cpp";
  } catch {}
  if (!bindingsPkgDir) {
    try {
      const pkgJsonPath2 = require.resolve("@serialport/bindings/package.json");
      bindingsPkgDir = path.dirname(pkgJsonPath2);
      bindingsPkgName = "@serialport/bindings";
    } catch {}
  }
  // Fallback: resolve by JS entrypoint and go up one level
  if (!bindingsPkgDir) {
    try {
      const entry = require.resolve("@serialport/bindings-cpp");
      bindingsPkgDir = path.join(path.dirname(entry), "..");
      bindingsPkgName = "@serialport/bindings-cpp";
    } catch {}
  }
  if (!bindingsPkgDir) {
    try {
      const entry = require.resolve("@serialport/bindings");
      bindingsPkgDir = path.join(path.dirname(entry), "..");
      bindingsPkgName = "@serialport/bindings";
    } catch {}
  }
  if (!bindingsPkgDir) {
    console.log("[serial][pkg] bindings package dir not found in snapshot");
    return null;
  }
  const prebuildDir = path.join(bindingsPkgDir, "prebuilds", subdir);
  if (DEBUG) console.log("[serial][pkg] looking for prebuild in:", prebuildDir);
  let chosenFile = path.join(prebuildDir, filename);
  // If default filename not found, scan directory for any suitable .node
  if (!fs.existsSync(chosenFile)) {
    try {
      const entries = fs.readdirSync(prebuildDir).filter((f) => f.toLowerCase().endsWith(".node"));
      if (entries && entries.length) {
        // Prefer musl/glibc match on linux
        if (process.platform === "linux") {
          const isMusl = detectMusl();
          const musl = entries.find((f) => f.includes("musl"));
          const glibc = entries.find((f) => f.includes("glibc"));
          if (isMusl && musl) chosenFile = path.join(prebuildDir, musl);
          else if (!isMusl && glibc) chosenFile = path.join(prebuildDir, glibc);
          else chosenFile = path.join(prebuildDir, entries[0]);
        } else {
          chosenFile = path.join(prebuildDir, entries[0]);
        }
      }
    } catch {}
  }
  // Fallback: try bundled static folder under __dirname/serialprebuilds
  if (!fs.existsSync(chosenFile)) {
    const altPrebuildDir = path.join(__dirname, "serialprebuilds", subdir);
    if (DEBUG) console.log("[serial][pkg] fallback prebuild lookup in:", altPrebuildDir);
    let alt = path.join(altPrebuildDir, filename);
    if (!fs.existsSync(alt)) {
      try {
        const entries = fs.readdirSync(altPrebuildDir).filter((f) => f.toLowerCase().endsWith(".node"));
        if (entries && entries.length) {
          alt = path.join(altPrebuildDir, entries[0]);
        }
      } catch {}
    }
    if (fs.existsSync(alt)) chosenFile = alt;
  }
  if (!fs.existsSync(chosenFile)) {
    console.warn("[serial][pkg] no prebuild found in:", prebuildDir, "and no fallback in serialprebuilds");
    return null;
  }
  if (DEBUG) console.log("[serial][pkg] selected prebuild file:", chosenFile);
  const data = fs.readFileSync(chosenFile);
  // Write to a stable temp dir
  const baseTmp = path.join(os.tmpdir(), "ws-tcp-bridge-prebuilds");
  try {
    fs.mkdirSync(baseTmp, { recursive: true });
  } catch {}
  // Use a per-process folder to avoid cross-run locking conflicts
  const outDir = path.join(baseTmp, `${plat}-${arch}-${process.pid}`);
  try {
    fs.mkdirSync(outDir, { recursive: true });
  } catch {}
  const outFile = path.join(outDir, "node.napi.node");
  try {
    if (!fs.existsSync(outFile)) {
      fs.writeFileSync(outFile, data);
    }
  } catch (e) {
    // If write failed due to being locked but the file exists, reuse it
    if (!fs.existsSync(outFile)) {
      if (DEBUG) console.warn("[serial][pkg] write prebuild failed:", String(e));
      return null;
    }
  }
  const result = { dir: outDir, file: outFile, pkg: bindingsPkgName };
  global.__XZG_SERIAL_PREBUILD = result;
  registerTempCleanup(outDir);
  // No mirroring next to the exe or cwd; we keep everything in temp and load via the hook
  if (DEBUG) console.log("[serial][pkg] prepared prebuilds:", { temp: outFile, pkg: bindingsPkgName });
  return result;
}

function detectMusl() {
  try {
    if (process.report && typeof process.report.getReport === "function") {
      const rep = process.report.getReport();
      const glibc = rep && rep.header && rep.header.glibcVersionRuntime;
      return !glibc;
    }
  } catch {}
  // Fallback heuristic
  return false;
}

// --- Global store of opened SerialPort instances ---
const openSerialPorts = new Map(); // path -> SerialPort instance
// Reverse mapping of local TCP server port to the serial path
const tcpPortToSerialPath = new Map(); // tcpPort -> path

const serialPortStates = new Map(); // path -> { dtr: boolean, rts: boolean }

const server = http.createServer(async (req, res) => {
  try {
    // CORS: provide permissive defaults (no credentials) and answer preflight requests.
    // This ensures browsers receive the expected headers even when individual
    // response paths call `res.writeHead(...)` with their own headers.
    // dynamic CORS: echo Origin (so credentials work), allow private-network for modern browsers
    const originHeader = req.headers.origin || "*";
    const _corsHeaders = {
      "Access-Control-Allow-Origin": originHeader,
      "Access-Control-Allow-Credentials": "true", // required if frontend sends credentials
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Accept,Origin,X-Requested-With,Authorization",
      "Access-Control-Allow-Private-Network": "true", // for Private Network Access preflight (Chrome/Edge)
      "Access-Control-Max-Age": "86400",
    };

    // Apply headers immediately for all responses
    try {
      for (const k of Object.keys(_corsHeaders)) res.setHeader(k, _corsHeaders[k]);
    } catch {}

    // Monkey-patch writeHead so later handlers that call writeHead with custom
    // headers do not accidentally drop our CORS headers.
    try {
      const _origWriteHead = res.writeHead && res.writeHead.bind(res);
      if (_origWriteHead) {
        res.writeHead = (...args) => {
          try {
            if (args.length >= 2 && typeof args[args.length - 1] === "object") {
              const hdrs = Object.assign({}, _corsHeaders, args[args.length - 1]);
              const newArgs = args.slice(0, args.length - 1).concat(hdrs);
              return _origWriteHead(...newArgs);
            }
          } catch {}
          const result = _origWriteHead(...args);
          try {
            for (const k of Object.keys(_corsHeaders)) res.setHeader(k, _corsHeaders[k]);
          } catch {}
          return result;
        };
      }
    } catch {}

    // Handle preflight requests quickly
    if (String(req.method || "").toUpperCase() === "OPTIONS") {
      try {
        // Some callers pass headers via writeHead; ensure status only here.
        res.writeHead(204);
      } catch {}
      return res.end();
    }

    const u = new URL(req.url, `http://${req.headers.host}`);
    if (u.pathname === "/mdns") {
      // Lightweight request logging to help diagnose why some browsers see an
      // empty response while manual requests return JSON. We log method, key
      // CORS/PNA related headers and the origin so we can compare browser vs curl.
      try {
        const dbg = {
          method: req.method,
          url: req.url,
          origin: req.headers.origin,
          "sec-fetch-site": req.headers["sec-fetch-site"],
          "sec-fetch-mode": req.headers["sec-fetch-mode"],
          "sec-fetch-dest": req.headers["sec-fetch-dest"],
          "access-control-request-private-network": req.headers["access-control-request-private-network"],
        };
        console.log("[mdns] incoming request:", JSON.stringify(dbg));
      } catch {}

      if (!BonjourCtor) {
        console.warn("[mdns] bonjour-service not installed; cannot scan");
        res.writeHead(500, { "content-type": "application/json", "access-control-allow-origin": "*" });
        return res.end(JSON.stringify({ error: "bonjour-service not installed" }));
      }

      // Only support GET query parameters for /mdns to preserve request
      // structure expected by clients. Do not read or interpret POST bodies.
      let typesParam = u.searchParams.get("types");
      let timeout = Math.max(500, Math.min(10000, Number(u.searchParams.get("timeout")) || 2000));
      if (String(req.method || "").toUpperCase() !== "GET") {
        // Log non-GET attempts to help debug clients that accidentally POST.
        try {
          console.log("[mdns] non-GET request method=", String(req.method));
        } catch {}
      }

      const types = (typesParam || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const normalized = types.map((t) => parseServiceType(t)).filter(Boolean);
      const wantsLocalSerial = types.some((t) => isLocalSerialToken(t));

      let results = [];
      try {
        results = await scanMdns(normalized, timeout);
        if (wantsLocalSerial) {
          const locals = await listLocalSerialAsServices();
          results.push(...locals);
        }
        console.log("[mdns] scan done, found", results.length);
      } catch (e) {
        console.warn("[mdns] scan error:", String(e));
        // Fall through to return an error payload below
      }

      const payload = { devices: results || [], error: results ? undefined : "scan_error" };
      const body = JSON.stringify(payload);
      // Explicitly set Content-Type and Content-Length and repeat PNA/CORS headers
      try {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Content-Length", Buffer.byteLength(body));
        // repeat important CORS/PNA headers for some browsers which check them on actual response
        const originHeaderResp = req.headers.origin || "*";
        res.setHeader("Access-Control-Allow-Origin", originHeaderResp);
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader("Access-Control-Allow-Private-Network", "true");
      } catch (e) {
        console.warn("[mdns] failed to set response headers:", String(e));
      }
      try {
        res.writeHead(200);
      } catch (e) {}
      try {
        console.log("[mdns] sending response length", body.length);
        return res.end(body);
      } catch (e) {
        try {
          // Best-effort: ensure connection closes with an error payload
          res.end(JSON.stringify({ devices: [], error: String(e) }));
        } catch {}
        return;
      }
    }

    // --- Endpoint to control DTR/RTS on a local serial port ---
    if (u.pathname === "/sc") {
      const SerialPortLib = await getSerialPort();
      if (!SerialPortLib) {
        res.writeHead(500, { "content-type": "application/json", "access-control-allow-origin": "*" });
        return res.end(JSON.stringify({ error: "serialport not installed" }));
      }
      // Accept either a serial path or the TCP port of a local TCP server bound to a serial
      let path = u.searchParams.get("path");
      const tcpPortStr = u.searchParams.get("port");
      const tcpPort = tcpPortStr ? Number(tcpPortStr) : null;
      if (!path && tcpPort) {
        path = tcpPortToSerialPath.get(tcpPort) || null;
      }
      const dtr = u.searchParams.get("dtr");
      const rts = u.searchParams.get("rts");
      if (!path || (dtr === null && rts === null)) {
        res.writeHead(400, { "content-type": "application/json", "access-control-allow-origin": "*" });
        return res.end(JSON.stringify({ error: "Missing path/tcpPort or dtr/rts param" }));
      }
      let serial = openSerialPorts.get(path);
      if (!serial) {
        try {
          const SP = SerialPortLib.SerialPort || SerialPortLib;
          serial = new SP({ path, baudRate: 115200, autoOpen: true });
          openSerialPorts.set(path, serial);
        } catch (e) {
          res.writeHead(500, { "content-type": "application/json", "access-control-allow-origin": "*" });
          return res.end(JSON.stringify({ error: "Failed to open serial port", details: String(e) }));
        }
      }
      // Get current saved state or initialize defaults
      let currentState = serialPortStates.get(path) || { dtr: false, rts: false };

      // Build the complete state object (current + new values)
      const setObj = { ...currentState };

      // Update only the parameters that were provided
      if (dtr !== null) {
        setObj.dtr = dtr === "1" || dtr === "true";
      }
      if (rts !== null) {
        setObj.rts = rts === "1" || rts === "true";
      }

      // Save the new state
      serialPortStates.set(path, setObj);

      if (Object.keys(setObj).length === 0) {
        res.writeHead(400, { "content-type": "application/json", "access-control-allow-origin": "*" });
        return res.end(JSON.stringify({ error: "No DTR/RTS parameters to set" }));
      }

      serial.set(setObj, (err) => {
        if (err) {
          res.writeHead(500, { "content-type": "application/json", "access-control-allow-origin": "*" });
          return res.end(JSON.stringify({ error: "Failed to set DTR/RTS", details: String(err) }));
        }
        res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
        return res.end(
          JSON.stringify({
            ok: true,
            path,
            tcpPort: tcpPort || tcpPortFromPath(path),
            set: setObj,
            changed: {
              dtr: dtr !== null ? setObj.dtr : undefined,
              rts: rts !== null ? setObj.rts : undefined,
            },
          })
        );
      });
      return;
    }

    // New: Serve static files from ./web directory
    const distPath = path.join(__dirname, "web");
    let filePath = path.join(distPath, u.pathname === "/" ? "index.html" : u.pathname);

    // Security: Prevent directory traversal
    if (!filePath.startsWith(distPath)) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      return res.end("Forbidden");
    }

    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        return res.end("File not found.");
      }

      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".png": "image/png",
        ".jpg": "image/jpg",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
        ".wav": "audio/wav",
        ".mp4": "video/mp4",
        ".woff": "application/font-woff",
        ".ttf": "application/font-ttf",
        ".eot": "application/vnd.ms-fontobject",
        ".otf": "application/font-otf",
        ".wasm": "application/wasm",
      };
      const contentType = mimeTypes[ext] || "application/octet-stream";

      res.writeHead(200, { "Content-Type": contentType });
      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
      stream.on("error", () => {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Server error");
      });
    });
  } catch (e) {
    console.error("[mdns] handler error:", e);
    try {
      res.writeHead(500, { "content-type": "application/json", "access-control-allow-origin": "*" });
      return res.end(JSON.stringify({ error: String(e) }));
    } catch {}
  }
});
const wss = new WebSocket.Server({ server, perMessageDeflate: false });

function getPrimaryIPv4() {
  try {
    const ifaces = os.networkInterfaces();
    const prefer = ["en0", "en1", "eth0", "wlan0"]; // macOS often en0
    // Prefer common primary interfaces first
    for (const name of prefer) {
      const arr = ifaces[name];
      if (!arr) continue;
      const hit = arr.find((x) => x && x.family === "IPv4" && !x.internal);
      if (hit?.address) return hit.address;
    }
    // Otherwise, return the first external IPv4
    for (const arr of Object.values(ifaces)) {
      const hit = (arr || []).find((x) => x && x.family === "IPv4" && !x.internal);
      if (hit?.address) return hit.address;
    }
  } catch {}
  return "127.0.0.1";
}

function getAdvertiseHost() {
  return ADVERTISE_HOST || getPrimaryIPv4();
}

wss.on("connection", (ws, req) => {
  try {
    // Reduce latency on the WebSocket TCP socket (disable Nagle)
    ws?._socket?.setNoDelay?.(true);
    ws?._socket?.setKeepAlive?.(true, 5000);
  } catch {}
  const url = new URL(req.url, `http://${req.headers.host}`);
  const host = url.searchParams.get("host");
  const port = Number(url.searchParams.get("port"));
  if (!host || !port) {
    ws.close(1008, "Missing host/port");
    return;
  }

  const sock = net.createConnection({ host, port }, () => {
    try {
      sock.setNoDelay(true);
    } catch {}
    // ok
  });

  sock.on("data", (chunk) => {
    try {
      ws.readyState === WebSocket.OPEN && ws.send(chunk);
    } catch {}
  });
  sock.on("error", (err) => {
    try {
      ws.close(1011, String(err));
    } catch {}
  });
  sock.on("close", () => {
    try {
      ws.close(1000);
    } catch {}
  });

  ws.on("message", (data) => {
    if (Buffer.isBuffer(data)) sock.write(data);
    else if (typeof data === "string") sock.write(Buffer.from(data, "binary"));
  });
  ws.on("close", () => {
    try {
      sock.destroy();
    } catch {}
  });
});

server.listen(WS_PORT, "0.0.0.0", () => {
  console.log(`[bridge] listening ws://${getAdvertiseHost()}:${WS_PORT}`); // show the effective IP
  if (!BonjourCtor) {
    console.log("[mdns] bonjour-service unavailable.");
  } else {
    try {
      //console.log("[mdns] bonjour ctor resolved:", typeof BonjourCtor);
    } catch {}
  }
  // Startup summary: modules loaded status - prefer to show package versions when available
  function tryReadPkgVersion(names) {
    if (!Array.isArray(names)) names = [names];
    for (const name of names) {
      try {
        // Common case: package.json accessible via '<pkg>/package.json'
        const pkg = require(name + "/package.json");
        if (pkg && pkg.version) return `${name}@${pkg.version}`;
      } catch {}
      try {
        // Fallback: resolve main entry and look for package.json nearby
        const resolved = require.resolve(name);
        const dir = path.dirname(resolved);
        try {
          const pkg2 = require(path.join(dir, "package.json"));
          if (pkg2 && pkg2.version) return `${name}@${pkg2.version}`;
        } catch {}
      } catch {}
    }
    return null;
  }

  const wsVersion = tryReadPkgVersion("ws") || (WebSocket && WebSocket?.version) || "unknown";
  const bonjourVersion =
    tryReadPkgVersion(["bonjour-service", "bonjour"]) || (BonjourCtor && BonjourCtor.name) || "unknown";

  const onSerialReady = (sp) => {
    const serialVersion =
      tryReadPkgVersion(["serialport", "@serialport/bindings-cpp", "@serialport/bindings"]) ||
      (sp && (sp.version || (sp.SerialPort && sp.SerialPort.version))) ||
      "unknown";
    console.log(`[startup] modules: ${wsVersion}, ${bonjourVersion}, ${serialVersion}`);
  };
  if (process.pkg) {
    // Prepare prebuild and warm serial
    ensureSerialportPrebuildExtracted()
      .then(() => getSerialPort())
      .then(onSerialReady)
      .catch((e) => {
        if (DEBUG) console.warn("[serial][pkg] startup extraction error:", String(e));
        onSerialReady(null);
      });
  } else {
    getSerialPort()
      .then(onSerialReady)
      .catch(() => onSerialReady(null));
  }
  // Start background monitor to open/close TCP servers for all available serial ports
  try {
    startSerialMonitor().catch(() => {});
  } catch {}
});

function parseServiceType(full) {
  // e.g. _zigstar_gw._tcp.local. -> { type: 'zigstar_gw', protocol: 'tcp' }
  try {
    // Special token(s) to request local serial exposure
    if (isLocalSerialToken(full)) return { type: "local", protocol: "serial" };
    const m = full.match(/^_([^.]+)\._(tcp|udp)(?:\.|$)/i);
    if (!m) return null;
    //console.log("[mdns] parse type:", full, "=>", { type: m[1], protocol: m[2].toLowerCase() });
    return { type: m[1], protocol: m[2].toLowerCase() };
  } catch {
    return null;
  }
}

function isLocalSerialToken(s) {
  return ["local.serial", "local:serial", "local-serial", "local"]
    .map((x) => x.toLowerCase())
    .includes(String(s || "").toLowerCase());
}

async function scanMdns(typeList, timeoutMs) {
  return await new Promise((resolve) => {
    console.log("[mdns] scanning with timeout", timeoutMs); //, typeList,
    const bonjour = new BonjourCtor();
    const found = new Map();
    const browsers = [];
    const onUp = (svc, base) => {
      try {
        const ip = svc?.addresses?.[0] || svc?.host;
        const board = svc?.txt?.board || "";
        const serialNum = svc?.txt?.serial_number || "";
        console.log(`[mdns] found: ${base?.type} on ${ip}:${svc?.port} (${board}, ${serialNum})`);
        const key = `${svc.name}|${svc.host}|${svc.port}`;
        if (found.has(key)) return;
        const addr =
          (svc.addresses || []).find((a) => /\d+\.\d+\.\d+\.\d+/.test(a)) || (svc.addresses || [])[0] || svc.host;
        found.set(key, {
          name: svc.name || "",
          host: addr || svc.host || "",
          port: svc.port || 0,
          type: base.type,
          protocol: base.protocol,
          fqdn: svc.fqdn || "",
          txt: svc.txt || {},
        });
      } catch {}
    };
    for (const t of typeList) {
      try {
        const finder = bonjour.find || bonjour.browse || bonjour.findServices;
        if (!finder) {
          console.warn("[mdns] no find/browse API on bonjour instance");
          continue;
        }
        const b = finder.call(bonjour, { type: t.type, protocol: t.protocol });
        b.on("up", (svc) => onUp(svc, t));
        b.on("error", (err) => console.error("[mdns] browser error:", err));
        try {
          if (typeof b.start === "function") {
            b.start();
            //console.log("[mdns] started browser for", t);
          } else {
            console.log("[mdns] browser auto-start for", t);
          }
        } catch (e) {
          console.warn("[mdns] start error for", t, e);
        }
        browsers.push(b);
      } catch {}
    }
    const done = () => {
      try {
        for (const b of browsers) {
          try {
            b.stop();
          } catch {}
        }
      } catch {}
      try {
        bonjour.destroy();
      } catch {}
      const arr = Array.from(found.values());
      console.log("[mdns] done; returning", arr.length, "services");
      resolve(arr);
    };
    setTimeout(done, timeoutMs);
  });
}

// --- Local Serial exposure ---
const serialServers = new Map(); // path -> { server, port }

// Keep original port info returned by serialport.list()
const serialPortDetails = new Map(); // path -> portInfo

async function closeSerialTcpServer(path) {
  try {
    const info = serialServers.get(path);
    if (!info) return;
    try {
      // close TCP server
      info.server.close(() => {
        // closed
      });
    } catch {}
    try {
      tcpPortToSerialPath.delete(info.port);
    } catch {}
    serialServers.delete(path);
    serialPortDetails.delete(path);
    try {
      const sp = openSerialPorts.get(path);
      if (sp) {
        if (typeof sp.close === "function") {
          try {
            sp.close();
          } catch {}
        }
        openSerialPorts.delete(path);
      }
    } catch {}
    console.log("[serial] closed TCP server for", path);
  } catch (e) {
    console.warn("[serial] error closing tcp server for", path, String(e));
  }
}

async function scanAndSyncSerialPorts() {
  try {
    const SerialPortLib = await getSerialPort();
    if (!SerialPortLib) return;
    let ports = [];
    try {
      const maybeSerialPort = SerialPortLib.SerialPort || SerialPortLib;
      if (typeof maybeSerialPort.list === "function") {
        ports = await maybeSerialPort.list();
      } else if (typeof SerialPortLib.list === "function") {
        ports = await SerialPortLib.list();
      } else {
        return;
      }
    } catch (e) {
      console.warn("[serial] list() failed during scan:", e);
      return;
    }
    const foundPaths = new Set();
    for (const p of ports) {
      const pathName = p.path || p.comName || p.device || p.port || p.friendlyName;
      if (!pathName) continue;
      foundPaths.add(pathName);
      serialPortDetails.set(pathName, p);
      if (!serialServers.has(pathName)) {
        try {
          // start server for new port (don't await to allow parallel)
          ensureSerialTcpServer(pathName, 115200 /* default baud */).catch((e) =>
            console.warn("[serial] failed to create tcp server for", pathName, e)
          );
        } catch (e) {
          console.warn("[serial] ensureSerialTcpServer error:", e);
        }
      }
    }
    // Remove servers for ports that disappeared
    for (const existingPath of Array.from(serialServers.keys())) {
      if (!foundPaths.has(existingPath)) {
        await closeSerialTcpServer(existingPath);
      }
    }
  } catch (e) {
    if (DEBUG) console.warn("[serial] scanAndSyncSerialPorts error:", String(e));
  }
}

let _serialMonitorHandle = null;
async function startSerialMonitor() {
  try {
    if (SERIAL_SCAN_INTERVAL === 0) {
      if (DEBUG) console.log("[serial] monitor disabled (SERIAL_SCAN_INTERVAL=0)");
      return;
    }
    // initial sync
    await scanAndSyncSerialPorts();
    if (_serialMonitorHandle) return;
    _serialMonitorHandle = setInterval(() => {
      scanAndSyncSerialPorts().catch(() => {});
    }, SERIAL_SCAN_INTERVAL);
    if (DEBUG) console.log("[serial] monitor started, interval", SERIAL_SCAN_INTERVAL);
  } catch (e) {
    console.warn("[serial] failed to start monitor:", e);
  }
}

function stopSerialMonitor() {
  try {
    if (_serialMonitorHandle) {
      clearInterval(_serialMonitorHandle);
      _serialMonitorHandle = null;
      if (DEBUG) console.log("[serial] monitor stopped");
    }
  } catch (e) {
    if (DEBUG) console.warn("[serial] stopSerialMonitor failed:", String(e));
  }
}

async function closeAllSerialServers() {
  try {
    const keys = Array.from(serialServers.keys());
    for (const p of keys) {
      try {
        await closeSerialTcpServer(p);
      } catch (e) {
        if (DEBUG) console.warn("[serial] failed closing server for", p, String(e));
      }
    }
  } catch (e) {
    if (DEBUG) console.warn("[serial] closeAllSerialServers failed:", String(e));
  }
}

let _gracefulShuttingDown = false;
async function gracefulShutdown(code) {
  try {
    if (_gracefulShuttingDown) return;
    _gracefulShuttingDown = true;
    console.log("[shutdown] graceful shutdown starting...");
    // Stop monitor to avoid races
    stopSerialMonitor();
    // Close serial-related servers/ports
    await closeAllSerialServers();
    // Close websocket and http servers
    try {
      if (wss && typeof wss.close === "function") {
        wss.close();
      }
    } catch (e) {}
    try {
      if (server && typeof server.close === "function") {
        server.close(() => {
          // closed
        });
      }
    } catch (e) {}
    console.log("[shutdown] done");
  } catch (e) {
    console.warn("[shutdown] error:", String(e));
  } finally {
    try {
      if (typeof code === "number") process.exit(code);
    } catch {}
  }
}

async function listLocalSerialAsServices() {
  // Only return services for servers we already created via the monitor.
  const services = [];
  try {
    const hostIp = getAdvertiseHost(); // use the actual advertised IP
    for (const [pathName, info] of serialServers) {
      const p = serialPortDetails.get(pathName) || {};
      services.push({
        name: pathName,
        host: hostIp,
        port: info.port,
        type: "local",
        protocol: "serial",
        fqdn: pathName,
        txt: {
          board: p.manufacturer || p.productId || "",
          serial_number: p.serialNumber || "",
          vendor_id: p.vendorId || "",
          product_id: p.productId || p.productId || "",
        },
      });
    }
  } catch (e) {
    console.warn("[serial] listLocalSerialAsServices failed:", e);
  }
  return services;
}

async function ensureSerialTcpServer(path, baudRate) {
  // Ensure SerialPort is resolved prior to accepting connections
  const SerialPortLib = await getSerialPort();
  if (serialServers.has(path)) return serialServers.get(path);
  const server = net.createServer();
  let boundPort = null;
  server.on("connection", (socket) => {
    console.log("[serial] client connected for", path);
    let serial;
    try {
      const SP = (SerialPortLib && (SerialPortLib.SerialPort || SerialPortLib)) || null;
      if (!SP) throw new Error("serialport unavailable");
      serial = new SP({ path, baudRate, autoOpen: true });
      openSerialPorts.set(path, serial); // keep for DTR/RTS control
    } catch (e) {
      console.error("[serial] open failed", path, e);
      try {
        socket.destroy(e);
      } catch {}
      return;
    }
    const onSerialData = (data) => {
      try {
        socket.write(data);
      } catch {}
    };
    const onSockData = (data) => {
      try {
        serial.write(data);
      } catch {}
    };
    serial.on("data", onSerialData);
    socket.on("data", onSockData);
    const safeOff = (emitter, event, handler) => {
      try {
        if (!emitter) return;
        if (typeof emitter.off === "function") emitter.off(event, handler);
        else if (typeof emitter.removeListener === "function") emitter.removeListener(event, handler);
      } catch {}
    };
    let cleaned = false;
    const cleanup = (reason) => {
      if (cleaned) return;
      cleaned = true;
      // Detach listeners first to avoid re-entrant calls
      safeOff(serial, "data", onSerialData);
      safeOff(socket, "data", onSockData);
      safeOff(socket, "close", onSocketClose);
      safeOff(socket, "error", onSocketError);
      safeOff(serial, "error", onSerialError);
      safeOff(serial, "close", onSerialClose);
      try {
        if (serial && typeof serial.close === "function" && serial.isOpen) {
          serial.close();
        }
      } catch {}
      try {
        socket && socket.destroy && socket.destroy();
      } catch {}
      openSerialPorts.delete(path); // remove from the store
      console.log("[serial] connection closed for", path, reason ? `(reason: ${reason})` : "");
    };
    const onSocketClose = () => cleanup("socket close");
    const onSocketError = () => cleanup("socket error");
    const onSerialError = () => cleanup("serial error");
    const onSerialClose = () => cleanup("serial close");
    socket.on("close", onSocketClose);
    socket.on("error", onSocketError);
    serial.on("error", onSerialError);
    serial.on && serial.on("close", onSerialClose);
  });
  await new Promise((resolve) => server.listen(0, "0.0.0.0", resolve));
  boundPort = server.address().port;
  console.log("[serial] TCP server for", path, "listening on", boundPort);
  const info = { server, port: boundPort, baudRate };
  serialServers.set(path, info);
  try {
    tcpPortToSerialPath.set(boundPort, path);
  } catch {}
  return info;
}

function tcpPortFromPath(path) {
  try {
    const info = serialServers.get(path);
    return info?.port || null;
  } catch {
    return null;
  }
}

// Install graceful shutdown hooks
try {
  process.on("SIGINT", () => gracefulShutdown(0));
  process.on("SIGTERM", () => gracefulShutdown(0));
  process.on("SIGHUP", () => gracefulShutdown(0));
  process.on("uncaughtException", (err) => {
    console.error("[uncaughtException]", err);
    gracefulShutdown(1);
  });
} catch (e) {
  if (DEBUG) console.warn("[shutdown] failed to install handlers:", String(e));
}
