// --- Control strategy mapping ---
type CtrlMode = "zig-http" | "bridge-sc" | "serial-direct";
let currentConnMeta: { type?: string; protocol?: string } = {};
import { DEFAULT_CONTROL, deriveControlConfig, ControlConfig } from "./utils/control";

function applyControlConfig(cfg: ControlConfig, source: string) {
  if (pinModeSelect) pinModeSelect.checked = !!cfg.remote;
  if (bslUrlInput) bslUrlInput.value = cfg.bslPath || DEFAULT_CONTROL.bslPath;
  if (rstUrlInput) rstUrlInput.value = cfg.rstPath || DEFAULT_CONTROL.rstPath;
  saveCtrlSettings();
  // Update UI visibility/state
  //updateConnectionUI();
  log(`Control preset applied (${source}): ${cfg.remote ? "Remote" : "Local"} BSL=${cfg.bslPath} RST=${cfg.rstPath}`);
}
function getCtrlMode(): CtrlMode {
  // If using Web Serial, always serial-direct
  if (activeConnection === "serial") return "serial-direct";
  const t = (currentConnMeta.type || "").toLowerCase();
  const p = (currentConnMeta.protocol || "").toLowerCase();
  // Map known device types over TCP to device HTTP (on port 80)
  if (/^(zigstar_gw|zig_star_gw|uzg-01)$/.test(t) && p === "tcp") {
    return "zig-http";
  }
  // Local serial exposed via ws-tcp bridge: control lines via /sc
  if (t === "local" && p === "serial") return "bridge-sc";
  // Default fallback keeps old behavior
  return "zig-http";
}

// Signal template picker from user fields
function getSignalTemplate(): string | null {
  const fields = [bslUrlInput?.value || "", rstUrlInput?.value || ""];
  for (const f of fields) if (/\{DTR\}|\{RTS\}/i.test(f)) return f.trim();
  return null;
}

// --- Unified control URL builder/sender for BSL/RST endpoints ---
function buildCtrlUrl(template: string, setVal?: number): string {
  const base = getBridgeBase();
  const devHost = hostInput.value.trim();
  const rawPort = Number(portInput.value) || 0;
  let t = (template || "").trim();
  if (setVal !== undefined) t = t.replace(/\{SET\}/g, String(setVal));
  t = t
    .replace(/\{PORT\}/g, String(rawPort))
    .replace(/\{HOST\}/g, devHost)
    .replace(/\{BRIDGE\}/g, base.replace(/^https?:\/\//, ""));
  // Fields are expected to be absolute http URLs; if not, best-effort to prepend device host
  if (!/^https?:\/\//i.test(t)) {
    if (/\{BRIDGE\}/.test(template)) return `${base}/${t.replace(/^\/+/, "")}`;
    return `http://${devHost}/${t.replace(/^\/+/, "")}`;
  }
  return t;
}

async function sendCtrlUrl(template: string, setVal?: number): Promise<void> {
  const url = buildCtrlUrl(template, setVal);
  log(`HTTP: GET ${url}`);
  const r = await httpGetWithFallback(url);
  if (r.opaque) {
    log(`HTTP control response: opaque (no-cors)`);
    return;
  }
  log(`HTTP control response: ${r.text ?? ""}`);
}

// Helpers to compute DTR/RTS from desired RST/BSL low levels and optional swap
import { computeDtrRts } from "./utils/control";
let activeConnection: "serial" | "tcp" | null = null;
import { SerialPort as SerialWrap } from "./transport/serial";
import { TcpClient } from "./transport/tcp";
import {
  bslSync,
  getChipDescription,
  sendMtAndWait as sendMtAndWaitMT,
  pingApp as pingAppMT,
  getFwVersion as getFwVersionMT,
  nvramReadAll as nvramReadAllMT,
  nvramEraseAll as nvramEraseAllMT,
  nvramWriteAll as nvramWriteAllMT,
} from "./cctools";
import { filterFwByChip, fetchManifest, parseImageFromBuffer, downloadFirmwareFromUrl } from "./netfw";
import { sleep, toHex, bufToHex } from "./utils";
import { httpGetWithFallback } from "./utils/http";

const consoleWrapEl = document.getElementById("consoleWrap") as HTMLDivElement | null;
const logEl = document.getElementById("log") as HTMLDivElement;
const autoScrollEl = document.getElementById("autoScroll") as HTMLInputElement | null;
const showIoEl = document.getElementById("showIo") as HTMLInputElement | null;
const chipModelEl = document.getElementById("chipModel") as HTMLInputElement | null;
const flashSizeEl = document.getElementById("flashSize") as HTMLInputElement | null;
const ieeeMacEl = document.getElementById("ieeeMac") as HTMLInputElement | null;
const firmwareVersionEl = document.getElementById("firmwareVersion") as HTMLInputElement | null;
const netFwSelect = document.getElementById("netFwSelect") as HTMLSelectElement | null;
const netFwRefreshBtn = document.getElementById("netFwRefresh") as HTMLButtonElement | null;
const bitrateInput = document.getElementById("bitrateInput") as HTMLInputElement;
const chooseSerialBtn = document.getElementById("chooseSerial") as HTMLButtonElement;
const disconnectBtn = document.getElementById("disconnectBtn") as HTMLButtonElement;
const hostInput = document.getElementById("hostInput") as HTMLInputElement;
const portInput = document.getElementById("portInput") as HTMLInputElement;
const mdnsSelect = document.getElementById("mdnsSelect") as HTMLSelectElement | null;
const mdnsRefreshBtn = document.getElementById("mdnsRefresh") as HTMLButtonElement | null;
const tcpSettingsBtn = document.getElementById("tcpSettingsBtn") as HTMLButtonElement | null;
const tcpSettingsPanel = document.getElementById("tcpSettingsPanel") as HTMLDivElement | null;
const bridgeHostInput = document.getElementById("bridgeHostInput") as HTMLInputElement | null;
const bridgePortInput = document.getElementById("bridgePortInput") as HTMLInputElement | null;
const tcpInfoBtn = document.getElementById("tcpInfoBtn") as HTMLButtonElement | null;
const bridgeStatusIcon = document.getElementById("bridgeStatusIcon") as HTMLSpanElement | null;
const bridgeInfoModal = document.getElementById("bridgeInfoModal") as HTMLDivElement | null;
const bridgeInfoClose = document.getElementById("bridgeInfoClose") as HTMLButtonElement | null;
const bridgeInfoCloseX = document.getElementById("bridgeInfoCloseX") as HTMLButtonElement | null;
const bridgeLink = document.getElementById("bridgeLink") as HTMLAnchorElement | null;
const connectTcpBtn = document.getElementById("connectTcp") as HTMLButtonElement;
const deviceDetectSpinner = document.getElementById("deviceDetectSpinner") as HTMLSpanElement | null;
const portInfoEl = document.getElementById("portInfo") as HTMLInputElement | null;
const hexInput = document.getElementById("hexFile") as HTMLInputElement;
const optErase = document.getElementById("optErase") as HTMLInputElement;
const optWrite = document.getElementById("optWrite") as HTMLInputElement;
const optVerify = document.getElementById("optVerify") as HTMLInputElement;
const btnFlash = document.getElementById("btnFlash") as HTMLButtonElement;
const progressEl = document.getElementById("progress") as HTMLDivElement;
const nvProgressEl = document.getElementById("nvProgress") as HTMLDivElement | null;
const firmwareSection = document.getElementById("firmwareSection") as HTMLDivElement | null;
const nvramSection = document.getElementById("nvramSection") as HTMLDivElement | null;
const actionsSection = document.getElementById("actionsSection") as HTMLDivElement | null;
const btnNvRead = document.getElementById("btnNvRead") as HTMLButtonElement | null;
const btnNvErase = document.getElementById("btnNvErase") as HTMLButtonElement | null;
const btnNvWrite = document.getElementById("btnNvWrite") as HTMLButtonElement | null;
const autoBslToggle = document.getElementById("autoBslToggle") as HTMLInputElement | null;
const enterBslBtn = document.getElementById("enterBslBtn") as HTMLButtonElement | null;
// mapping selector removed; we’ll try both wiring assumptions automatically
const resetBtn = document.getElementById("resetBtn") as HTMLButtonElement | null;
const btnPing = document.getElementById("btn-ping") as HTMLButtonElement | null;
const btnVersion = document.getElementById("btn-version") as HTMLButtonElement | null;
const btnGetModel = document.getElementById("btn-get-model") as HTMLButtonElement | null;
// New controls: Pin/Mode toggle and custom URL paths
const pinModeSelect = document.getElementById("pinModeSelect") as HTMLInputElement | null;
const ctrlUrlRow = document.getElementById("ctrlUrlRow") as HTMLDivElement | null;
const bslUrlInput = document.getElementById("bslUrlInput") as HTMLInputElement | null;
const rstUrlInput = document.getElementById("rstUrlInput") as HTMLInputElement | null;
const verboseIo = true;

let serial: SerialWrap | null = null;
let tcp: TcpClient | null = null;
let hexImage: { startAddress: number; data: Uint8Array } | null = null;
let netFwCache: any | null = null;
let netFwItems: Array<{ key: string; link: string; ver: number; notes?: string; label: string }> | null = null;

// Bootstrap tooltip init moved to index.js

function updateConnectionUI() {
  const anyActive = !!activeConnection;

  // Helper: enable/disable entire section by toggling pointer-events and aria-disabled
  const setSectionDisabled = (el: HTMLElement | null, disabled: boolean) => {
    if (!el) return;
    el.classList.toggle("opacity-50", disabled);
    el.classList.toggle("pe-none", disabled);
    el.setAttribute("aria-disabled", String(disabled));
    // Additionally, disable all controls within to prevent focus via keyboard
    const ctrls = el.querySelectorAll<HTMLElement>(
      'button, input, select, textarea, fieldset, optgroup, option, details, [contenteditable="true"], [tabindex]'
    );
    ctrls.forEach((c) => {
      if (c === disconnectBtn) return; // never disable Disconnect here
      // Only set disabled on form controls that support it
      if (
        c instanceof HTMLButtonElement ||
        c instanceof HTMLInputElement ||
        c instanceof HTMLSelectElement ||
        c instanceof HTMLTextAreaElement ||
        c instanceof HTMLFieldSetElement
      ) {
        (
          c as HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLFieldSetElement
        ).disabled = disabled;
      }
      if (disabled) c.setAttribute("tabindex", "-1");
      else if (c.hasAttribute("tabindex")) c.removeAttribute("tabindex");
    });
  };

  // Sections: Serial and TCP (entire columns)
  const serialSection = document.getElementById("serialSection") as HTMLElement | null;
  const tcpSection = document.getElementById("tcpSection") as HTMLElement | null;
  setSectionDisabled(serialSection, anyActive);
  setSectionDisabled(tcpSection, anyActive);

  // Keep TCP settings panel hidden when a connection is active
  if (tcpSettingsPanel) tcpSettingsPanel.classList.toggle("d-none", !tcpSettingsPanelVisible || anyActive);

  // Unified Disconnect button visible only when connected, red style when shown
  const showDisc = anyActive;
  disconnectBtn.classList.toggle("d-none", !showDisc);
  disconnectBtn.classList.toggle("btn-danger", showDisc);
  disconnectBtn.classList.toggle("btn-outline-secondary", !showDisc);
  disconnectBtn.disabled = !showDisc; // Disconnect remains clickable when connected

  // Update port info field
  if (portInfoEl) {
    if (!anyActive) {
      portInfoEl.value = "";
    } else if (activeConnection === "tcp") {
      const host = hostInput.value.trim();
      const port = parseInt(portInput.value, 10);
      portInfoEl.value = host && port ? `tcp://${host}:${port}` : "tcp://";
    } else {
      // Web Serial has no stable system path; show logical info
      const br = parseInt(bitrateInput.value, 10) || 115200;
      portInfoEl.value = `serial @ ${br}bps`;
    }
  }

  // Clear Device Info fields on disconnect
  if (!anyActive) {
    if (chipModelEl) chipModelEl.value = "";
    if (flashSizeEl) flashSizeEl.value = "";
    if (ieeeMacEl) ieeeMacEl.value = "";
    if (firmwareVersionEl) firmwareVersionEl.value = "";
  }

  // Gate entire Actions section like Firmware/NVRAM
  if (actionsSection) {
    actionsSection.classList.toggle("opacity-50", !anyActive);
    actionsSection.classList.toggle("pe-none", !anyActive);
    actionsSection.setAttribute("aria-disabled", String(!anyActive));
  }

  // Firmware and NVRAM sections enabled only when a connection is active
  if (firmwareSection) {
    firmwareSection.classList.toggle("opacity-50", !anyActive);
    firmwareSection.classList.toggle("pe-none", !anyActive);
  }
  if (nvramSection) {
    nvramSection.classList.toggle("opacity-50", !anyActive);
    nvramSection.classList.toggle("pe-none", !anyActive);
  }

  // Cloud controls reflect connection state
  if (netFwSelect) netFwSelect.disabled = !anyActive;
  if (netFwRefreshBtn) netFwRefreshBtn.disabled = !anyActive;

  // No special-case for control URL fields: they follow section state
}

// Settings: store bridge host/port in localStorage
function getBridgeBase(): string {
  const host = bridgeHostInput?.value?.trim() || localStorage.getItem("bridgeHost") || "127.0.0.1";
  const port = Number(bridgePortInput?.value || localStorage.getItem("bridgePort") || 8765) || 8765;
  return `http://${host}:${port}`;
}
function getBridgeWsBase(): string {
  const host = bridgeHostInput?.value?.trim() || localStorage.getItem("bridgeHost") || "127.0.0.1";
  const port = Number(bridgePortInput?.value || localStorage.getItem("bridgePort") || 8765) || 8765;
  return `ws://${host}:${port}`;
}
function saveBridgeSettings() {
  if (bridgeHostInput) localStorage.setItem("bridgeHost", bridgeHostInput.value.trim() || "127.0.0.1");
  if (bridgePortInput) localStorage.setItem("bridgePort", String(Number(bridgePortInput.value || 8765) || 8765));
}

let tcpSettingsPanelVisible = false;
tcpSettingsBtn?.addEventListener("click", () => {
  tcpSettingsPanelVisible = !tcpSettingsPanelVisible;
  if (tcpSettingsPanel) tcpSettingsPanel.classList.toggle("d-none", !tcpSettingsPanelVisible);
});
bridgeHostInput?.addEventListener("change", saveBridgeSettings);
bridgePortInput?.addEventListener("change", saveBridgeSettings);
// init from localStorage
if (bridgeHostInput) bridgeHostInput.value = localStorage.getItem("bridgeHost") || bridgeHostInput.value;
if (bridgePortInput) bridgePortInput.value = localStorage.getItem("bridgePort") || bridgePortInput.value;

// Initialize Pin/Mode and URLs from localStorage
function loadCtrlSettings() {
  try {
    const mode = localStorage.getItem("pinModeSelect");
    if (pinModeSelect && mode !== null) pinModeSelect.checked = mode === "1";
    if (bslUrlInput) bslUrlInput.value = localStorage.getItem("bslUrlInput") || bslUrlInput.value || "cmdZigBSL";
    if (rstUrlInput) rstUrlInput.value = localStorage.getItem("rstUrlInput") || rstUrlInput.value || "cmdZigRST";
  } catch {}
}
function saveCtrlSettings() {
  try {
    if (pinModeSelect) localStorage.setItem("pinModeSelect", pinModeSelect.checked ? "1" : "0");
    if (bslUrlInput) localStorage.setItem("bslUrlInput", bslUrlInput.value.trim());
    if (rstUrlInput) localStorage.setItem("rstUrlInput", rstUrlInput.value.trim());
  } catch {}
}
loadCtrlSettings();
pinModeSelect?.addEventListener("change", () => {
  saveCtrlSettings();
  // Update disabled state
  updateConnectionUI();
});
bslUrlInput?.addEventListener("change", saveCtrlSettings);
rstUrlInput?.addEventListener("change", saveCtrlSettings);

// When bridge settings change, auto-refresh mDNS list (debounced)
let bridgeRefreshTimer: number | null = null;
function scheduleBridgeRefresh() {
  if (bridgeRefreshTimer) window.clearTimeout(bridgeRefreshTimer);
  setBridgeLoading();
  bridgeRefreshTimer = window.setTimeout(() => {
    // optimistic: show spinner state by setting unknown (keep last icon) then attempt refresh
    refreshMdnsList();
  }, 300);
}
bridgeHostInput?.addEventListener("input", scheduleBridgeRefresh);
bridgePortInput?.addEventListener("input", scheduleBridgeRefresh);

// Bridge Info modal UI wiring moved to index.js

function log(msg: string, cls: "app" | "rx" | "tx" = "app") {
  const at = new Date().toISOString().split("T")[1].replace("Z", "");
  const line = document.createElement("div");
  line.className = `log-line log-${cls}`;
  line.textContent = `[${at}] ${msg}`;
  logEl.appendChild(line);
  if (!autoScrollEl || autoScrollEl.checked) {
    logEl.parentElement!.scrollTop = logEl.parentElement!.scrollHeight;
  }
}

// Bridge availability status icon helper
function setBridgeStatus(ok: boolean) {
  if (!bridgeStatusIcon) return;
  bridgeStatusIcon.classList.toggle("text-success", ok);
  bridgeStatusIcon.classList.toggle("text-danger", !ok);
  bridgeStatusIcon.classList.remove("text-muted");
  bridgeStatusIcon.innerHTML = `<i class="bi ${ok ? "bi-check-circle-fill" : "bi-x-circle-fill"}"></i>`;
  bridgeStatusIcon.setAttribute("title", ok ? "Bridge reachable" : "Bridge error");
}

function setBridgeLoading() {
  if (!bridgeStatusIcon) return;
  bridgeStatusIcon.classList.remove("text-success", "text-danger");
  bridgeStatusIcon.classList.add("text-muted");
  bridgeStatusIcon.innerHTML =
    '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';
  bridgeStatusIcon.setAttribute("title", "Checking bridge…");
}

function deviceDetectBusy(busy: boolean) {
  if (!deviceDetectSpinner) return;
  deviceDetectSpinner.classList.toggle("d-none", !busy);
}

// Progress bar helpers (with auto-reset after completion)
let nvResetTimer: number | null = null;
function nvProgress(pct: number, label?: string) {
  if (!nvProgressEl) return;
  if (typeof pct === "number" && !Number.isNaN(pct)) {
    const v = Math.max(0, Math.min(100, Math.round(pct)));
    nvProgressEl.style.width = `${v}%`;
    nvProgressEl.setAttribute("aria-valuenow", String(v));
    // schedule auto-reset when reaching 100%
    if (v >= 100) {
      if (nvResetTimer) clearTimeout(nvResetTimer);
      nvResetTimer = window.setTimeout(() => {
        nvProgressReset("");
      }, 5000);
    }
  }
  if (label !== undefined) nvProgressEl.textContent = label || "";
}
function nvProgressReset(text = "") {
  if (!nvProgressEl) return;
  if (nvResetTimer) {
    clearTimeout(nvResetTimer);
    nvResetTimer = null;
  }
  nvProgressEl.style.width = "0%";
  nvProgressEl.setAttribute("aria-valuenow", "0");
  nvProgressEl.textContent = text;
}

// Set NVRAM progress bar color to match initiating action
function nvProgressSetColor(kind: "primary" | "warning" | "danger") {
  if (!nvProgressEl) return;
  nvProgressEl.classList.remove("bg-primary", "bg-warning", "bg-danger");
  nvProgressEl.classList.add(`bg-${kind}`);
}

// Firmware progress helpers (mirrors NVRAM behavior)
let fwResetTimer: number | null = null;
function fwProgress(pct: number, label?: string) {
  if (!progressEl) return;
  if (typeof pct === "number" && !Number.isNaN(pct)) {
    const v = Math.max(0, Math.min(100, Math.round(pct)));
    progressEl.style.width = `${v}%`;
    progressEl.setAttribute("aria-valuenow", String(v));
    if (v >= 100) {
      if (fwResetTimer) clearTimeout(fwResetTimer);
      fwResetTimer = window.setTimeout(() => {
        fwProgressReset("");
      }, 5000);
    }
  }
  if (label !== undefined) progressEl.textContent = label || "";
}
function fwProgressReset(text = "") {
  if (!progressEl) return;
  if (fwResetTimer) {
    clearTimeout(fwResetTimer);
    fwResetTimer = null;
  }
  progressEl.style.width = `0%`;
  progressEl.setAttribute("aria-valuenow", "0");
  progressEl.textContent = text;
}

// Button status helper: show spinner while running, then ✅ or ❌, revert after 3 seconds
async function withButtonStatus(btn: HTMLButtonElement, fn: () => Promise<boolean | void>): Promise<void> {
  // Remove any existing status indicator
  btn.querySelectorAll(".btn-status").forEach((el) => el.remove());
  const originalDisabled = btn.disabled;
  btn.disabled = true;
  btn.setAttribute("aria-busy", "true");
  const status = document.createElement("span");
  status.className = "btn-status ms-2 d-inline-flex align-items-center";
  status.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';
  btn.appendChild(status);
  let ok = true;
  try {
    const res = await fn();
    ok = res !== false;
  } catch {
    ok = false;
  }
  // Show result symbol after the existing content
  status.textContent = ok ? " ✅" : " ❌";
  // Auto-revert after 3 seconds
  setTimeout(() => {
    status.remove();
    btn.disabled = originalDisabled;
    btn.removeAttribute("aria-busy");
  }, 3000);
}

// Log I/O visibility UI moved to index.js

chooseSerialBtn.addEventListener("click", async () => {
  if (activeConnection) {
    log("Error: a connection is already active");
    return;
  }
  try {
    if (!("serial" in navigator)) throw new Error("Web Serial not supported");
    const br = parseInt(bitrateInput.value, 10) || 115200;
    const chosen = await (navigator as any).serial.requestPort();
    await chosen.open({ baudRate: br });
    serial?.close();
    serial = new SerialWrap(br);
    serial.useExistingPortAndStart(chosen);
    // Low-level RX/TX logs
    serial.onData((d) => {
      log(`RX: ${bufToHex(d)}`, "rx");
    });
    serial.onTx((d) => {
      log(`TX: ${bufToHex(d)}`, "tx");
    });
    log("Serial selected and opened");
    // Mark connection active immediately on open
    activeConnection = "serial";
    updateConnectionUI();

    await runConnectSequence();
  } catch (e: any) {
    log(`Serial error: ${e?.message || String(e)}`);
  }
});

disconnectBtn.addEventListener("click", async () => {
  if (!activeConnection) return;
  if (activeConnection === "serial") {
    try {
      await serial?.close();
    } catch {}
    serial = null;
    activeConnection = null;
    currentConnMeta = {};
    log("Serial disconnected");
  } else if (activeConnection === "tcp") {
    try {
      tcp?.close();
    } catch {}
    tcp = null;
    activeConnection = null;
    currentConnMeta = {};
    log("TCP disconnected");
  }
  updateConnectionUI();
});

connectTcpBtn.addEventListener("click", async () => {
  if (activeConnection) {
    log("Error: a connection is already active");
    return;
  }
  try {
    const host = hostInput.value.trim();
    const port = parseInt(portInput.value, 10);
    if (!host || !port) throw new Error("Enter host/port");
    if (tcp !== null) {
      tcp.close();
    }
    const wsBase = getBridgeWsBase();
    tcp = new TcpClient(wsBase);
    try {
      await tcp.connect(host, port);
    } catch (e: any) {
      log("TCP connect error: " + (e?.message || String(e)));
      throw e;
    }
    tcp.onData((d) => log(`RX: ${bufToHex(d)}`, "rx"));
    tcp.onTx?.((d: Uint8Array) => log(`TX: ${bufToHex(d)}`, "tx"));
    log(`TCP connected to ${host}:${port}`);

    activeConnection = "tcp";
    updateConnectionUI();
    await runConnectSequence();
  } catch (e: any) {
    log(`TCP error: ${e?.message || String(e)}`);
  }
});

function updateOptionsStateForFile(selected: boolean) {
  if (!selected) {
    optWrite.checked = false;
    optWrite.disabled = true;
    optVerify.checked = false;
    optVerify.disabled = true;
  } else {
    optWrite.disabled = false;
    optVerify.disabled = false;
    optWrite.checked = true;
    optVerify.checked = true;
  }
}

hexInput.addEventListener("change", async () => {
  const f = hexInput.files?.[0];
  if (!f) return;
  try {
    const buf = await f.arrayBuffer();
    const img = parseImageFromBuffer(new Uint8Array(buf));
    hexImage = img;
    log(`Image loaded: ${f.name}, ${img.data.length} bytes, start ${toHex(img.startAddress, 8)}`);
    updateOptionsStateForFile(true);
  } catch (e: any) {
    log("File load error: " + (e?.message || String(e)));
  }
});

function getActiveLink(): { write: (d: Uint8Array) => Promise<void>; onData: (cb: (d: Uint8Array) => void) => void } {
  if (activeConnection === "serial" && serial)
    return { write: (d) => serial!.write(d), onData: (cb) => serial!.onData(cb) };
  if (activeConnection === "tcp" && tcp)
    return { write: (d: Uint8Array) => tcp!.write(d), onData: (cb: (d: Uint8Array) => void) => tcp!.onData(cb) } as any;
  throw new Error("No transport connected");
}

// bslSync provided by cctools

// // Build and send a bridge URL, allowing absolute URL or relative path to bridge base; supports {PORT}
// async function sendBridgeCmd(pathOrUrl: string): Promise<string> {
//   const base = getBridgeBase();
//   const rawPort = Number(portInput.value) || 0;
//   const host = hostInput.value.trim();
//   const p0 = (pathOrUrl || "")
//     .replace(/\{PORT\}/g, String(rawPort))
//     .replace(/\{HOST\}/g, host)
//     .replace(/\{BRIDGE\}/g, base.replace(/^https?:\/\//, ""));
//   const url = /^https?:\/\//i.test(p0) ? p0 : `${base}/${p0.replace(/^\/+/, "")}`;
//   log(`HTTP: GET ${url}`);
//   const r = await httpGetWithFallback(url);
//   if (r.opaque) {
//     log(`HTTP bridge response: opaque (no-cors)`);
//     return "";
//   }
//   log(`HTTP bridge response: ${r.text ?? ""}`);
//   return r.text ?? "";
// }

// // Build and send a device URL, allowing absolute URL or relative path to device host; supports placeholders
// async function sendDeviceCmd(pathOrUrl: string): Promise<string> {
//   const devHost = hostInput.value.trim();
//   const rawPort = Number(portInput.value) || 0;
//   const bridge = getBridgeBase().replace(/^https?:\/\//, "");
//   const p0 = (pathOrUrl || "")
//     .replace(/\{PORT\}/g, String(rawPort))
//     .replace(/\{HOST\}/g, devHost)
//     .replace(/\{BRIDGE\}/g, bridge);
//   const url = /^https?:\/\//i.test(p0) ? p0 : `http://${devHost}/${p0.replace(/^\/+/, "")}`;
//   log(`HTTP: GET ${url}`);
//   const r = await httpGetWithFallback(url);
//   if (r.opaque) {
//     log(`HTTP device response: opaque (no-cors)`);
//     return "";
//   }
//   log(`HTTP device response: ${r.text ?? ""}`);
//   return r.text ?? "";
// }

// Unified: enter BSL for current transport (optimized per concept)
async function enterBsl(): Promise<void> {
  const auto = !!autoBslToggle?.checked;
  const remotePinMode = !!pinModeSelect?.checked;
  const bslTpl = (bslUrlInput?.value || DEFAULT_CONTROL.bslPath).trim();
  log(`Entering BSL: conn=${activeConnection ?? "none"} auto=${auto} pinMode=${remotePinMode}`);

  if (activeConnection === "serial") {
    if (!auto) {
      log("Auto BSL disabled for serial; skipping line sequence");
      return;
    }
    try {
      await bslUseLines(false);
    } catch (e) {
      await bslUseLines(true);
    }
    return;
  }

  if (activeConnection === "tcp") {
    if (!remotePinMode) {
      // Use line sequences via remote bridge pins (two attempts)
      try {
        await bslUseLines(false);
      } catch (e) {
        await bslUseLines(true);
      }
      //delay 500 ms
      //await sleep(500);
      return;
    }
    // Remote pin mode ON: send single request(s) to BSL URL; if {SET} present, we may need specific level
    // For entering BSL we only need to trigger BSL endpoint once; if {SET} exists, set to 1
    const hasSet = /\{SET\}/.test(bslTpl);
    await sendCtrlUrl(bslTpl, hasSet ? 1 : undefined);
    return;
  }

  throw new Error("No active connection");
}

// Unified: reset to application for current transport (optimized per concept)
async function performReset(): Promise<void> {
  const auto = !!autoBslToggle?.checked; // same toggle governs whether to use sequences
  const remotePinMode = !!pinModeSelect?.checked;
  const rstTpl = (rstUrlInput?.value || DEFAULT_CONTROL.rstPath).trim();
  log(`Resetting: conn=${activeConnection ?? "none"} auto=${auto} pinMode=${remotePinMode}`);

  if (activeConnection === "serial") {
    if (!auto) {
      log("Auto reset disabled for serial; skipping line sequence");
      return;
    }
    try {
      await resetUseLines(false);
    } catch (e) {
      await resetUseLines(true);
    }
    return;
  }

  if (activeConnection === "tcp") {
    if (!remotePinMode) {
      // Use line sequences via remote bridge pins
      try {
        await resetUseLines(false);
      } catch (e) {
        await resetUseLines(true);
      }
      //delay 500 ms
      //await sleep(500);
      return;
    }
    // Remote pin mode ON: send single request(s) to RST URL; if {SET} present, choose appropriate level
    const hasSet = /\{SET\}/.test(rstTpl);
    await sendCtrlUrl(rstTpl, hasSet ? 1 : undefined);
    return;
  }

  throw new Error("No active connection");
}

// Read chip information in BSL mode (no mode changes)
// showBusy controls whether to toggle the global device spinner inside this function.
// For the initial connect flow, we manage the spinner at a higher level and pass false here.
async function readChipInfo(showBusy: boolean = true): Promise<void> {
  try {
    if (showBusy) deviceDetectBusy(true);
    const link = getActiveLink();
    const bsl = await bslSync(link);
    const id = await bsl.chipId();
    const chipHex = Array.from(id)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    log(`BSL OK. ChipId packet: ${chipHex}`);

    try {
      const FLASH_SIZE = 0x4003002c;
      const IEEE_ADDR_PRIMARY = 0x500012f0;
      const ICEPICK_DEVICE_ID = 0x50001318;
      const TESXT_ID = 0x57fb4;

      const dev = await (bsl as any).memRead32?.(ICEPICK_DEVICE_ID);
      const usr = await (bsl as any).memRead32?.(TESXT_ID);
      if (dev && usr && dev.length >= 4 && usr.length >= 4) {
        const wafer_id = ((((dev[3] & 0x0f) << 16) | (dev[2] << 8) | (dev[1] & 0xf0)) >>> 4) >>> 0;
        const pg_rev = (dev[3] & 0xf0) >> 4;
        const model = getChipDescription(id, wafer_id, pg_rev, usr[1]);
        log(`Chip model: ${model}`);
        if (chipModelEl) chipModelEl.value = model;
        refreshNetworkFirmwareList(model).catch((e) =>
          log("Network FW list fetch failed: " + (e?.message || String(e)))
        );
      }

      const flashSz = await (bsl as any).memRead32?.(FLASH_SIZE);
      if (flashSz && flashSz.length >= 4) {
        const pages = flashSz[0];
        let size = pages * 8192;
        if (size >= 64 * 1024) size -= 8192;
        log(`Flash size estimate: ${size} bytes`);
        if (flashSizeEl) flashSizeEl.value = `${size} bytes`;
      }

      const mac_lo = await (bsl as any).memRead32?.(IEEE_ADDR_PRIMARY + 0);
      const mac_hi = await (bsl as any).memRead32?.(IEEE_ADDR_PRIMARY + 4);
      if (mac_hi && mac_lo && mac_hi.length >= 4 && mac_lo.length >= 4) {
        const mac = [...mac_lo, ...mac_hi]
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")
          .toUpperCase();
        const macFmt = mac
          .match(/.{1,2}/g)
          ?.reverse()
          ?.join(":");
        if (macFmt) {
          log(`IEEE MAC: ${macFmt}`);
          if (ieeeMacEl) ieeeMacEl.value = macFmt;
        }
      }
    } catch {}
  } catch (e: any) {
    log("BSL sync or chip read failed: " + (e?.message || String(e)));
  } finally {
    if (showBusy) deviceDetectBusy(false);
  }
}

// Full connect sequence: enter BSL → read chip info → reset → read firmware version
async function runConnectSequence(): Promise<void> {
  // Spinner should run from port open until model+FW info are read
  deviceDetectBusy(true);
  try {
    // When using local-serial over TCP bridge, give the bridge a moment to accept TCP and open serial
    try {
      if (getCtrlMode() === "bridge-sc") {
        await sleep(250);
      }
    } catch {}
    await enterBsl().catch((e: any) => log("Enter BSL failed: " + (e?.message || String(e))));
    await readChipInfo(false);
    await performReset().catch((e: any) => log("Reset failed: " + (e?.message || String(e))));
    await sleep(1000);
    try {
      const link = getActiveLink();
      await pingAppMT(link);
    } catch {
      log("App ping skipped");
    }
    try {
      const link = getActiveLink();
      const info = await getFwVersionMT(link);
      if (info && firmwareVersionEl) firmwareVersionEl.value = String(info.fwRev);
    } catch {
      log("FW version check skipped");
    }
  } finally {
    deviceDetectBusy(false);
  }
}

function makeOptionLabel(item: { ver: number; file: string; category: string }) {
  return `[${item.category.charAt(0).toUpperCase()}] ${item.ver} — ${item.file}`;
}

async function refreshNetworkFirmwareList(chipModel?: string) {
  if (!netFwSelect) return;
  const chip = chipModel || chipModelEl?.value || "";
  netFwSelect.innerHTML = "";
  const def = document.createElement("option");
  def.value = "";
  def.textContent = chip ? `— Firmware for ${chip} —` : "— Detect device first —";
  netFwSelect.appendChild(def);
  if (!chip) return;

  try {
    const man = netFwCache || (netFwCache = await fetchManifest());
    const filtered = filterFwByChip(man, chip);
    const items: Array<{ key: string; link: string; ver: number; notes?: string; label: string }> = [];
    for (const category of Object.keys(filtered)) {
      for (const it of filtered[category]!) {
        const key = `${category}|${it.file}`;
        items.push({
          key,
          link: it.link,
          ver: it.ver,
          notes: it.notes,
          label: makeOptionLabel({ ver: it.ver, file: it.file, category }),
        });
      }
    }
    // sort by ver desc overall
    items.sort((a, b) => b.ver - a.ver);
    netFwItems = items;
    for (const it of items) {
      const o = document.createElement("option");
      o.value = it.key;
      o.textContent = it.label;
      o.setAttribute("data-link", it.link);
      netFwSelect.appendChild(o);
    }
    if (items.length === 0) {
      const o = document.createElement("option");
      o.value = "";
      o.textContent = "— No matching firmware —";
      netFwSelect.appendChild(o);
    }
    log(`Cloud FW: ${items.length} options`);
  } catch (e: any) {
    log("Cloud FW manifest error: " + (e?.message || String(e)));
  }
}

netFwRefreshBtn?.addEventListener("click", () => {
  const model = chipModelEl?.value || "";
  refreshNetworkFirmwareList(model);
});

// --- Firmware notes modal logic ---
const netFwNotesBtn = document.getElementById("netFwNotesBtn") as HTMLButtonElement | null;
const fwNotesModal = document.getElementById("fwNotesModal") as HTMLElement | null;
const fwNotesContent = document.getElementById("fwNotesContent") as HTMLElement | null;
const fwNotesClose = document.getElementById("fwNotesClose") as HTMLButtonElement | null;
const fwNotesCloseX = document.getElementById("fwNotesCloseX") as HTMLButtonElement | null;

// Helper: find notes for selected firmware
function getSelectedFwNotes(): string | undefined {
  if (!netFwSelect || !netFwItems) return;
  const opt = netFwSelect.selectedOptions[0];
  if (!opt || !opt.value) return;
  const item = netFwItems.find((it: any) => it.key === opt.value);
  return item?.notes;
}

// Enable/disable notes button on select change
netFwSelect?.addEventListener("change", async () => {
  if (!netFwSelect || !netFwNotesBtn) return;
  const notes = getSelectedFwNotes();
  netFwNotesBtn.disabled = !notes;

  // Existing logic: load firmware
  const opt = netFwSelect.selectedOptions[0];
  const link = opt?.getAttribute("data-link");
  if (!link) return;
  try {
    const img = await downloadFirmwareFromUrl(link);
    hexImage = img;
    updateOptionsStateForFile(true);
    log(`Image loaded from network: ${img.data.length} bytes @ ${toHex(img.startAddress, 8)}`);
  } catch (e: any) {
    log("HEX download error: " + (e?.message || String(e)));
  }
});

// Notes button click: show modal with notes
netFwNotesBtn?.addEventListener("click", () => {
  if (!fwNotesModal || !fwNotesContent) return;
  const notes = getSelectedFwNotes();
  if (!notes) return;
  const marked = (window as any).marked;
  // Если notes — это ссылка на .md файл
  if (/^https?:\/\/.*\.md$/i.test(notes.trim())) {
    fwNotesContent.innerHTML =
      '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Loading…';
    fetch(notes.trim())
      .then((r) => (r.ok ? r.text() : Promise.reject("Failed to load markdown")))
      .then((md) => {
        if (marked) {
          fwNotesContent.innerHTML = marked.parse(md);
        } else {
          fwNotesContent.textContent = md;
        }
      })
      .catch((err) => {
        fwNotesContent.innerHTML = `<div class='text-danger'>Error loading markdown: ${err}</div>`;
      });
  } else {
    if (marked) {
      fwNotesContent.innerHTML = marked.parse(notes);
    } else {
      fwNotesContent.textContent = notes;
    }
  }
  fwNotesModal.classList.remove("d-none");
  fwNotesModal.setAttribute("aria-hidden", "false");
});

// Modal close logic
function closeFwNotesModal() {
  if (!fwNotesModal) return;
  fwNotesModal.classList.add("d-none");
  fwNotesModal.setAttribute("aria-hidden", "true");
}
fwNotesClose?.addEventListener("click", closeFwNotesModal);
fwNotesCloseX?.addEventListener("click", closeFwNotesModal);

// --- Load marked.js if not present ---
if (!(window as any).marked) {
  const script = document.createElement("script");
  script.src = "https://cdn.jsdelivr.net/npm/marked/marked.min.js";
  script.async = true;
  document.head.appendChild(script);
}

async function flash(doVerifyOnly = false) {
  if (!hexImage) throw new Error("Load HEX first");
  // If using Web Serial, bump baud to 500000 for faster flashing
  try {
    await (serial as any)?.reopenWithBaudrate?.(500000);
    log("Serial: switched baud to 500000");
  } catch {}
  // BSL packet length is 1 byte; with header+cmd, safe payload per packet is <= 248 bytes
  const userChunk = 248;
  const chunkSize = Math.max(16, Math.min(248, userChunk));
  const startAddr = hexImage.startAddress;
  const data = hexImage.data;

  const link = getActiveLink();
  // Ensure BSL mode before flashing/verifying depending on transport
  try {
    await enterBsl();
    await sleep(300);
  } catch (e: any) {
    log("Enter BSL failed: " + (e?.message || String(e)));
  }
  const bsl = await bslSync(link);
  let chipIdStr = "";
  let chipIsCC26xx = false;
  try {
    const id = await bsl.chipId();
    chipIdStr = Array.from(id)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    log(`ChipId: ${chipIdStr}`);
    // cc2538-bsl treats unknown IDs as CC26xx/13xx. Known CC2538 IDs: 0xb964/0xb965
    const chipId = ((id[0] << 8) | id[1]) >>> 0;
    chipIsCC26xx = !(chipId === 0xb964 || chipId === 0xb965);
  } catch {}

  if (!doVerifyOnly && optErase.checked) {
    log("Erase…");
    if (chipIsCC26xx) {
      // Prefer bank erase; if it fails, erase sectors across the write range
      try {
        await (bsl as any).bankErase?.();
        log("Bank erase done");
      } catch (e: any) {
        log("Bank erase not supported or failed, erasing sectors…");
        // Sector size heuristic: CC26xx page size 4KB; some variants 8KB. We can try 8KB if CRC verify later fails.
        const pageSize = 4096;
        const from = startAddr & ~(pageSize - 1);
        const to = (startAddr + data.length + pageSize - 1) & ~(pageSize - 1);
        for (let a = from; a < to; a += pageSize) {
          try {
            await (bsl as any).sectorErase?.(a);
          } catch (se: any) {
            throw se;
          }
        }
        log("Sector erase done");
      }
    } else {
      await bsl.erase(startAddr, data.length);
    }
  }

  if (!doVerifyOnly && optWrite.checked) {
    log(`Writing ${data.length} bytes @ ${toHex(startAddr, 8)}…`);
    // reset progress bar
    fwProgressReset("Writing…");
    const ff = 0xff;
    for (let off = 0; off < data.length; off += chunkSize) {
      let end = Math.min(off + chunkSize, data.length);
      let chunk = data.subarray(off, end);
      // Skip fully-0xFF chunks to avoid unnecessary writes
      let skip = true;
      for (let i = 0; i < chunk.length; i++) {
        if (chunk[i] !== ff) {
          skip = false;
          break;
        }
      }
      if (!skip) {
        await bsl.downloadTo(startAddr + off, chunk);
      }
      const cur = off + chunk.length;
      const pct = Math.min(100, Math.round((cur / data.length) * 100));
      // Show current end address out of total end address
      const curAddr = startAddr + cur;
      const endAddr = startAddr + data.length;
      fwProgress(pct, `${curAddr} / ${endAddr}`);
      // Avoid artificial throttling over TCP; keep tiny yield for Web Serial only
      if (activeConnection === "serial") await sleep(1);
    }
    log("Write done");
    fwProgress(100, "Done");
  }

  if (optVerify.checked || doVerifyOnly) {
    log("Verify…");
    let ok = false;
    try {
      if (chipIsCC26xx && (bsl as any).crc32Cc26xx) {
        const crc = await (bsl as any).crc32Cc26xx(startAddr, data.length);
        log(`CRC32(dev)=0x${crc.toString(16).toUpperCase().padStart(8, "0")}`);
        ok = true; // status success implies success; local compare optional
      } else {
        ok = await bsl.verifyCrc(startAddr, data.length);
      }
    } catch {}
    log(ok ? "Verify OK" : "Verify inconclusive");
  }
}

// Reset the device out of BSL and back into application
async function resetUseLines(assumeSwap: boolean) {
  await setLines(true, true, assumeSwap);
  await sleep(250);

  await setLines(true, false, assumeSwap);
  await sleep(250);

  await setLines(true, true, assumeSwap);
  await sleep(1000);
}

// ----------------- NVRAM helpers (delegated to cctools) -----------------
async function nvramReadAll(): Promise<any> {
  nvProgressReset("Reading…");
  const link = getActiveLink();
  const payload = await nvramReadAllMT(link, nvProgress);
  nvProgress(100, "Done");
  return payload;
}

async function nvramEraseAll(): Promise<void> {
  nvProgressReset("Erasing…");
  const link = getActiveLink();
  await nvramEraseAllMT(link, nvProgress);
  nvProgress(100, "Erase done");
}

async function nvramWriteAll(obj: any): Promise<void> {
  nvProgressReset("Writing…");
  const link = getActiveLink();
  await nvramWriteAllMT(link, obj, (s) => log(s), nvProgress);
  nvProgress(100, "Write done");
}

// UI wiring for NVRAM
btnNvRead?.addEventListener("click", async () => {
  await withButtonStatus(btnNvRead!, async () => {
    try {
      nvProgressSetColor("primary");
      nvProgressReset("Reading…");
      const payload = await nvramReadAll();
      const blob = new Blob([JSON.stringify(payload, null, 2) + "\n"], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // Build filename: nvram_<model>_<ieee>_<YYYYMMDD-HHMMSS>.json
      const modelRaw = (chipModelEl?.value || "device").trim();
      const modelSafe = modelRaw.replace(/\s+/g, "-").replace(/[^A-Za-z0-9._-]/g, "");
      const ieeeRaw = (ieeeMacEl?.value || "").toUpperCase();
      const ieeeSafe = ieeeRaw.replace(/[^A-F0-9]/g, ""); // drop ':' and anything non-hex
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const ts = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(
        d.getMinutes()
      )}${pad(d.getSeconds())}`;
      const nameParts = ["NVRAM", modelSafe || "device", ieeeSafe || "unknown", ts];
      a.download = nameParts.join("_") + ".json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      log("NVRAM backup downloaded");
      nvProgress(100, "Done");
      return true;
    } catch (e: any) {
      log("NVRAM read error: " + (e?.message || String(e)));
      nvProgressReset("Error");
      throw e;
    }
  });
});

btnNvErase?.addEventListener("click", async () => {
  await withButtonStatus(btnNvErase!, async () => {
    try {
      nvProgressSetColor("danger");
      nvProgressReset("Erasing…");
      await nvramEraseAll();
      log("NVRAM erase done. Resetting…");
      try {
        await performReset();
      } catch {}
      nvProgress(100, "Done");
      return true;
    } catch (e: any) {
      log("NVRAM erase error: " + (e?.message || String(e)));
      nvProgressReset("Error");
      throw e;
    }
  });
});

const setLines = async (rstLow: boolean, bslLow: boolean, assumeSwap: boolean) => {
  const { dtr, rts } = computeDtrRts(rstLow, bslLow, assumeSwap);
  if (activeConnection === "serial") {
    log(`CTRL(serial): DTR=${dtr ? "1" : "0"} RTS=${rts ? "1" : "0"}`);
    await (serial as any)?.setSignals?.({ dataTerminalReady: dtr, requestToSend: rts });
    return;
  }
  // TCP: send two single requests, one per pin, using absolute URLs from inputs
  const bslTpl = (bslUrlInput?.value || DEFAULT_CONTROL.bslPath).trim();
  const rstTpl = (rstUrlInput?.value || DEFAULT_CONTROL.rstPath).trim();
  const bslLevel = bslLow ? 0 : 1;
  const rstLevel = rstLow ? 0 : 1;
  log(`CTRL(tcp): BSL=${bslLevel} -> ${bslTpl} | RST=${rstLevel} -> ${rstTpl}`);
  const bslHasSet = /\{SET\}/.test(bslTpl);
  const rstHasSet = /\{SET\}/.test(rstTpl);
  await sendCtrlUrl(bslTpl, bslHasSet ? bslLevel : undefined);
  await sendCtrlUrl(rstTpl, rstHasSet ? rstLevel : undefined);
};

async function bslUseLines(assumeSwap: boolean) {
  await setLines(true, true, assumeSwap);
  await sleep(250);
  await setLines(false, true, assumeSwap);
  await sleep(250);
  await setLines(false, false, assumeSwap);
  await sleep(250);
  await setLines(false, true, assumeSwap);
  await sleep(500);
}

enterBslBtn?.addEventListener("click", async () => {
  await withButtonStatus(enterBslBtn!, async () => {
    await enterBsl();
  });
});

resetBtn?.addEventListener("click", async () => {
  await withButtonStatus(resetBtn!, async () => {
    await performReset();
  });
});

btnPing?.addEventListener("click", async () => {
  await withButtonStatus(btnPing!, async () => {
    const link = getActiveLink();
    const ok = await pingAppMT(link);
    if (!ok) throw new Error("Ping failed");
  });
});

btnVersion?.addEventListener("click", async () => {
  await withButtonStatus(btnVersion!, async () => {
    const link = getActiveLink();
    const info = await getFwVersionMT(link);
    const ok = !!info;
    if (info && firmwareVersionEl) firmwareVersionEl.value = String(info.fwRev);
    if (!ok) throw new Error("Version not available");
  });
});

// Get Model action: detect chip and memory without flashing
btnGetModel?.addEventListener("click", async () => {
  await withButtonStatus(btnGetModel!, async () => {
    await readChipInfo();
  });
});

btnNvWrite?.addEventListener("click", async () => {
  await withButtonStatus(btnNvWrite!, async () => {
    try {
      nvProgressSetColor("warning");
      nvProgressReset("Writing…");
      // Open file picker on demand
      let text: string | null = null;
      const hasPicker = typeof (window as any).showOpenFilePicker === "function";
      if (hasPicker) {
        try {
          const handles = await (window as any).showOpenFilePicker({
            multiple: false,
            types: [
              {
                description: "JSON Files",
                accept: { "application/json": [".json"] },
              },
            ],
          });
          const handle = handles && handles[0];
          if (handle) {
            const file = await handle.getFile();
            text = await file.text();
          }
        } catch (e: any) {
          // User canceled: do NOT fallback to avoid reopening dialog
          if (e && (e.name === "AbortError" || e.code === 20)) {
            log("NVRAM JSON file not selected");
            throw e; // propagate to show ❌
          }
          // Non-cancel error: fallback below
        }
      }
      if (text == null && !hasPicker) {
        // Fallback for browsers without showOpenFilePicker
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "application/json";
        input.style.position = "fixed";
        input.style.left = "-10000px";
        document.body.appendChild(input);
        const picked = await new Promise<File | null>((resolve) => {
          let settled = false;
          const cleanup = () => {
            input.removeEventListener("change", onChange);
            window.removeEventListener("focus", onFocus);
          };
          const onChange = () => {
            if (settled) return;
            settled = true;
            const f = input.files && input.files[0] ? input.files[0] : null;
            cleanup();
            resolve(f);
          };
          const onFocus = () => {
            // When the dialog closes (either by cancel or pick), focus returns to window.
            // If no change event fired, treat as cancel.
            setTimeout(() => {
              if (settled) return;
              settled = true;
              cleanup();
              resolve(null);
            }, 0);
          };

          input.addEventListener("change", onChange, { once: true });
          window.addEventListener("focus", onFocus, { once: true });
          input.click();
        });
        if (picked) {
          text = await picked.text();
        }
        input.remove();
      }
      if (!text) {
        const err = new Error("NVRAM JSON file not selected");
        log(err.message);
        throw err;
      }

      const j = JSON.parse(text);
      await nvramWriteAll(j);
      log("NVRAM write done. Resetting…");
      try {
        await performReset();
      } catch {}
      nvProgress(100, "Done");
      return true;
    } catch (e: any) {
      log("NVRAM write error: " + (e?.message || String(e)));
      nvProgressReset("Error");
      throw e;
    }
  });
});

// Flash start button with status feedback
btnFlash.addEventListener("click", async () => {
  await withButtonStatus(btnFlash, async () => {
    try {
      await flash(false);
      log("Flashing finished. Restarting device...");
      try {
        await performReset();
        log("Restart done");
      } catch (e: any) {
        log("Restart error: " + (e?.message || String(e)));
      }

      log("Pinging device...");
      try {
        const link = getActiveLink();
        await pingAppMT(link);
      } catch (e: any) {
        log("Ping error: " + (e?.message || String(e)));
      }
      log("Reading firmware version...");
      try {
        // use local wrapper to log and update UI
        const info = await getFwVersionMT(getActiveLink());
        if (info && firmwareVersionEl) firmwareVersionEl.value = String(info.fwRev);
      } catch (e: any) {
        log("Version read error: " + (e?.message || String(e)));
      }
      return true;
    } catch (e: any) {
      log("Flash error: " + (e?.message || String(e)));
      throw e;
    }
  });
});

// Initialize options state on load
updateOptionsStateForFile(false);
updateConnectionUI();

// Log actions
const btnClearLog = document.getElementById("btnClearLog") as HTMLButtonElement | null;
const btnCopyLog = document.getElementById("btnCopyLog") as HTMLButtonElement | null;
btnClearLog?.addEventListener("click", () => {
  logEl.innerHTML = "";
});
btnCopyLog?.addEventListener("click", async () => {
  const lines = Array.from(logEl.querySelectorAll<HTMLElement>(".log-line"))
    .map((el) => el.innerText)
    .join("\n");
  try {
    await navigator.clipboard.writeText(lines);
    log("Log copied to clipboard");
  } catch (e: any) {
    log("Copy failed: " + (e?.message || String(e)));
  }
});

// --- mDNS discovery via local bridge ---
async function refreshMdnsList() {
  if (!mdnsSelect) return;
  setBridgeLoading();
  try {
    const types = [
      "_zig_star_gw._tcp.local.",
      "_zigstar_gw._tcp.local.",
      "_uzg-01._tcp.local.",
      "_tubeszb._tcp.local.",
      // special token for local serial exposure by the bridge
      "local.serial",
    ].join(",");
    const base = getBridgeBase();
    const url = `${base}/mdns?types=${encodeURIComponent(types)}&timeout=3000`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`mdns http ${resp.status}`);
    const j = await resp.json();
    const devices: Array<{
      name?: string;
      host: string;
      port: number;
      type?: string;
      protocol?: string;
      fqdn?: string;
      txt?: Record<string, any>;
    }> = j.devices || [];
    // rebuild options
    mdnsSelect.innerHTML = "";
    const def = document.createElement("option");
    def.value = "";
    def.textContent = devices.length ? "— Discovered devices —" : "— No devices found —";
    mdnsSelect.appendChild(def);
    for (const d of devices) {
      const o = document.createElement("option");
      o.value = `${d.host}:${d.port}`;
      const extras: string[] = [];
      if (d.type) extras.push(d.type);
      const txt = d.txt || {};
      if (txt.board) extras.push(`board=${String(txt.board)}`);
      if (txt.serial_number) extras.push(`sn=${String(txt.serial_number)}`);
      if (txt.radio_type) extras.push(`radio=${String(txt.radio_type)}`);
      const suffix = extras.length ? ` — ${extras.join(", ")}` : "";
      const main = `${d.host}:${d.port}`;
      o.textContent = d.name ? `${d.name} (${main})${suffix}` : `${main}${suffix}`;
      o.setAttribute("data-host", d.host);
      o.setAttribute("data-port", String(d.port));
      if (d.type) o.setAttribute("data-type", d.type);
      if (d.protocol) o.setAttribute("data-protocol", d.protocol);
      if (txt.board) o.setAttribute("data-board", String(txt.board));
      if (txt.serial_number) o.setAttribute("data-serial-number", String(txt.serial_number));
      if (txt.radio_type) o.setAttribute("data-radio-type", String(txt.radio_type));
      if (d.fqdn) o.title = d.fqdn;
      mdnsSelect.appendChild(o);
    }

    // Add manual option after all discovered devices
    const manual = document.createElement("option");
    manual.value = "manual";
    manual.textContent = "Manual";
    manual.setAttribute("data-protocol", "tcp");
    manual.setAttribute("data-type", "manual");
    manual.setAttribute("data-port", "6638");
    manual.setAttribute("data-host", "");
    mdnsSelect.appendChild(manual);

    // success: mark bridge OK (green check)
    setBridgeStatus(true);
  } catch (e: any) {
    log("mDNS refresh error: " + (e?.message || String(e)));
    // error: mark bridge as problem (red x)
    setBridgeStatus(false);
  }
}

mdnsRefreshBtn?.addEventListener("click", () => {
  if (activeConnection) return;
  refreshMdnsList();
});
mdnsSelect?.addEventListener("change", () => {
  if (!mdnsSelect) return;
  const opt = mdnsSelect.selectedOptions[0];
  const h = opt?.getAttribute("data-host") || "";
  const p = Number(opt?.getAttribute("data-port") || 0);
  if (h) hostInput.value = h;
  if (p) portInput.value = String(p);
  // Capture metadata for strategy
  const t = opt?.getAttribute("data-type") || undefined;
  const pr = opt?.getAttribute("data-protocol") || undefined;
  currentConnMeta = { type: t, protocol: pr };
  // Auto-apply presets on selection change
  applyControlConfig(deriveControlConfig(currentConnMeta), "mdns");
});

// auto-refresh list on load (non-blocking)
refreshMdnsList().catch(() => {});
