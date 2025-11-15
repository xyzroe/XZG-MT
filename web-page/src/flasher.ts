// --- Control strategy mapping ---
type CtrlMode = "zig-http" | "bridge-sc" | "serial-direct";
let currentConnMeta: { type?: string; protocol?: string } = {};
import { DEFAULT_CONTROL, deriveControlConfig, ControlConfig } from "./utils/control";

function applyControlConfig(cfg: ControlConfig, source: string) {
  if (pinModeSelect) pinModeSelect.checked = cfg.pinMode ?? DEFAULT_CONTROL.pinMode;
  if (bslUrlInput)
    if (cfg.bslPath !== undefined) bslUrlInput.value = cfg.bslPath;
    else if (DEFAULT_CONTROL.bslPath !== undefined) bslUrlInput.value = DEFAULT_CONTROL.bslPath;
  //bslUrlInput.value = cfg.bslPath ?? DEFAULT_CONTROL.bslPath;
  if (rstUrlInput)
    if (cfg.rstPath !== undefined) rstUrlInput.value = cfg.rstPath;
    else if (DEFAULT_CONTROL.rstPath !== undefined) rstUrlInput.value = DEFAULT_CONTROL.rstPath;
  //rstUrlInput.value = cfg.rstPath ?? DEFAULT_CONTROL.rstPath;
  if (baudUrlInput)
    if (cfg.baudPath !== undefined) baudUrlInput.value = cfg.baudPath;
    else if (DEFAULT_CONTROL.baudPath !== undefined) baudUrlInput.value = DEFAULT_CONTROL.baudPath;
  //baudUrlInput.value = cfg.baudPath ?? DEFAULT_CONTROL.baudPath;
  //if (invertBsl) invertBsl.checked = cfg.invertBsl ?? DEFAULT_CONTROL.invertBsl ?? false;
  //if (invertRst) invertRst.checked = cfg.invertRst ?? DEFAULT_CONTROL.invertRst ?? false;
  if (invertLevel) {
    if (cfg.invertLevel !== undefined) invertLevel.checked = cfg.invertLevel;
    else if (DEFAULT_CONTROL.invertLevel !== undefined) invertLevel.checked = DEFAULT_CONTROL.invertLevel;
  }
  // if baudUrlInput != "" then select baudUrlSelect option bridge
  if (baudUrlSelect) baudUrlSelect.value = cfg.baudPath ? "bridge" : "none";
  saveCtrlSettings();
  // Update UI visibility/state
  //updateConnectionUI();
  //log(`Control preset applied (${source}): ${cfg.remote ? "Remote" : "Local"} BSL=${cfg.bslPath} RST=${cfg.rstPath}`);
}

function getCtrlMode(): CtrlMode {
  // If using Web Serial, always serial-direct
  if (activeConnection === "serial") return "serial-direct";
  const t = (currentConnMeta.type || "").toLowerCase();
  const p = (currentConnMeta.protocol || "").toLowerCase();
  // Map known device types over TCP to device HTTP (on port 80)
  if (/^(zigstar_gw|zig_star_gw|uzg-01|xzg)$/.test(t) && p === "tcp") {
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
  //log(`HTTP: GET ${url}`);
  const r = await httpGetWithFallback(url);
  if (r.opaque) {
    //log(`HTTP control response: opaque (no-cors)`);
    return;
  }
  //log(`HTTP control response: ${r.text ?? ""}`);
}

// Helpers to compute DTR/RTS from desired RST/BSL low levels and optional swap
//import { computeDtrRts } from "./utils/control";
let activeConnection: "serial" | "tcp" | null = null;
import { SerialPort as SerialWrap } from "./transport/serial";
import { TcpClient } from "./transport/tcp";
import * as ti_tools from "./tools/ti";
import { SilabsTools, enterSilabsBootloader } from "./tools/sl";
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
const tcpLinksBtn = document.getElementById("tcpLinksBtn") as HTMLButtonElement | null;
const tcpSettingsPanel = document.getElementById("tcpSettingsPanel") as HTMLDivElement | null;
const tcpLinksPanel = document.getElementById("tcpLinksPanel") as HTMLDivElement | null;
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
const localFile = document.getElementById("localFile") as HTMLInputElement;
const optErase = document.getElementById("optErase") as HTMLInputElement;
const optWrite = document.getElementById("optWrite") as HTMLInputElement;
const optVerify = document.getElementById("optVerify") as HTMLInputElement;
const btnFlash = document.getElementById("btnFlash") as HTMLButtonElement;
const flashWarning = document.getElementById("flashWarning") as HTMLDivElement | null;
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
const baudUrlInput = document.getElementById("baudUrlInput") as HTMLInputElement | null;
const bslUrlSelect = document.getElementById("bslUrlSelect") as HTMLSelectElement | null;
const rstUrlSelect = document.getElementById("rstUrlSelect") as HTMLSelectElement | null;
const baudUrlSelect = document.getElementById("baudUrlSelect") as HTMLSelectElement | null;
const netFwNotesBtn = document.getElementById("netFwNotesBtn") as HTMLButtonElement | null;
const findBaudToggle = document.getElementById("findBaudToggle") as HTMLInputElement | null;
const implyGateToggle = document.getElementById("implyGateToggle") as HTMLInputElement | null;
//const invertBsl = document.getElementById("invertBsl") as HTMLInputElement | null;
//const invertRst = document.getElementById("invertRst") as HTMLInputElement | null;
const invertLevel = document.getElementById("invertLevel") as HTMLInputElement | null;

let serial: SerialWrap | null = null;
let tcp: TcpClient | null = null;
let hexImage: { startAddress: number; data: Uint8Array } | null = null;
let netFwCache: any | null = null;
let netFwItems: Array<{ key: string; link: string; ver: number; notes?: string; label: string }> | null = null;
let sl_tools: SilabsTools | null = null;

function getSelectedFamily(): "ti" | "sl" {
  const el = document.querySelector('input[name="chip_family"]:checked') as HTMLInputElement | null;
  const v = (el?.value || "ti").toLowerCase();
  return v === "sl" ? "sl" : "ti";
}

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
  const generalSection = document.getElementById("generalSection") as HTMLElement | null;
  const familySection = document.getElementById("familySection") as HTMLElement | null;
  setSectionDisabled(serialSection, anyActive);
  setSectionDisabled(tcpSection, anyActive);
  setSectionDisabled(generalSection, anyActive);
  setSectionDisabled(familySection, anyActive);

  // Keep TCP settings panel hidden when a connection is active
  //if (tcpSettingsPanel) tcpSettingsPanel.classList.toggle("d-none", !tcpSettingsPanelVisible || anyActive);

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

  if (pinModeSelect?.checked) {
    // make bslInvert and rstInvert disabled when in remote mode
    //invertBsl?.setAttribute("disabled", "true");
    //invertRst?.setAttribute("disabled", "true");
    invertLevel?.setAttribute("disabled", "true");
  } else {
    //invertBsl?.removeAttribute("disabled");
    //invertRst?.removeAttribute("disabled");
    invertLevel?.removeAttribute("disabled");
  }
  // No special-case for control URL fields: they follow section state

  // const ctrlUrlSelectRow = document.getElementById("ctrlUrlSelectRow") as HTMLElement | null;
  // if (pinModeSelect?.checked) {
  //   ctrlUrlSelectRow?.classList.add("d-none");
  // } else {
  //   ctrlUrlSelectRow?.classList.remove("d-none");
  // }
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

//let tcpSettingsPanelVisible = false;
tcpSettingsBtn?.addEventListener("click", () => {
  //tcpSettingsPanelVisible = !tcpSettingsPanelVisible;
  //get current visibility
  let tcpSettingsPanelVisible = tcpSettingsPanel?.classList.contains("d-none");
  if (tcpSettingsPanel) tcpSettingsPanel.classList.toggle("d-none", !tcpSettingsPanelVisible);
});

tcpLinksBtn?.addEventListener("click", () => {
  // Show/hide the TCP links panel
  let tcpLinksPanelVisible = tcpLinksPanel?.classList.contains("d-none");
  if (tcpLinksPanel) tcpLinksPanel.classList.toggle("d-none", !tcpLinksPanelVisible);
});

bridgeHostInput?.addEventListener("change", saveBridgeSettings);
bridgePortInput?.addEventListener("change", saveBridgeSettings);
// init from localStorage
if (bridgeHostInput) bridgeHostInput.value = localStorage.getItem("bridgeHost") || bridgeHostInput.value;
if (bridgePortInput) bridgePortInput.value = localStorage.getItem("bridgePort") || bridgePortInput.value;

// Auto-fill bridge host/port from current page URL when opened as http://HOST:PORT
// if no values are already stored in localStorage.
// This covers localhost и прямые IP-адреса.
try {
  const storedHost = localStorage.getItem("bridgeHost");
  const storedPort = localStorage.getItem("bridgePort");
  const loc = window.location;
  const isHttp = loc.protocol === "http:";
  const isLocalhost = loc.hostname === "localhost";
  const isIpv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(loc.hostname);
  const isIpLike = isIpv4 || loc.hostname.includes(":"); // quick IPv6-ish check
  const hasPort = !!loc.port;

  if (isHttp && (isLocalhost || isIpLike) && !storedHost && !storedPort && (hasPort || isLocalhost)) {
    const host = loc.hostname;
    //const port = loc.port ? String(Number(loc.port) || 8765) : "8765";
    const port = "8765";
    if (bridgeHostInput) bridgeHostInput.value = host;
    if (bridgePortInput) bridgePortInput.value = port;
    // Persist to localStorage
    saveBridgeSettings();
  }
} catch (e) {
  // ignore any unexpected errors
}

// Initialize Pin/Mode and URLs from localStorage
function loadCtrlSettings() {
  try {
    const mode = localStorage.getItem("pinModeSelect");
    if (pinModeSelect && mode !== null) pinModeSelect.checked = mode === "1";
    if (bslUrlInput) bslUrlInput.value = localStorage.getItem("bslUrlInput") || bslUrlInput.value; // || "cmdZigBSL";
    if (rstUrlInput) rstUrlInput.value = localStorage.getItem("rstUrlInput") || rstUrlInput.value; // || "cmdZigRST";
    if (baudUrlInput) baudUrlInput.value = localStorage.getItem("baudUrlInput") || baudUrlInput.value; // || "";
    //if (invertBsl) invertBsl.checked = localStorage.getItem("invertBsl") === "1";
    //if (invertRst) invertRst.checked = localStorage.getItem("invertRst") === "1";
    if (invertLevel) invertLevel.checked = localStorage.getItem("invertLevel") === "1";
  } catch {}
}
function saveCtrlSettings() {
  try {
    if (pinModeSelect) localStorage.setItem("pinModeSelect", pinModeSelect.checked ? "1" : "0");
    if (bslUrlInput) localStorage.setItem("bslUrlInput", bslUrlInput.value.trim());
    if (rstUrlInput) localStorage.setItem("rstUrlInput", rstUrlInput.value.trim());
    if (baudUrlInput) localStorage.setItem("baudUrlInput", baudUrlInput.value.trim());
    //if (invertBsl) localStorage.setItem("invertBsl", invertBsl.checked ? "1" : "0");
    //if (invertRst) localStorage.setItem("invertRst", invertRst.checked ? "1" : "0");
    if (invertLevel) localStorage.setItem("invertLevel", invertLevel.checked ? "1" : "0");
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
baudUrlInput?.addEventListener("change", saveCtrlSettings);
//invertBsl?.addEventListener("change", saveCtrlSettings);
//invertRst?.addEventListener("change", saveCtrlSettings);
invertLevel?.addEventListener("change", saveCtrlSettings);

// When bridge settings change, auto-refresh mDNS list (debounced)
let bridgeRefreshTimer: number | null = null;
function scheduleBridgeRefresh() {
  if (bridgeRefreshTimer) window.clearTimeout(bridgeRefreshTimer);
  //setBridgeLoading();
  // also update the helpful localhost link in the TCP HTTPS message to reflect bridge settings

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
  bridgeStatusIcon.setAttribute("title", "Checking bridge...");
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

function getSelectedFwNotes() {
  if (!netFwSelect || !netFwItems) return;
  const opt = netFwSelect.selectedOptions[0];
  if (!opt || !opt.value) return;
  const item = netFwItems.find(function (it) {
    return it.key === opt.value;
  });
  return item && item.notes;
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

localFile.addEventListener("change", async () => {
  const f = localFile.files?.[0];
  if (!f) return;
  try {
    log(`File selected: ${f.name} size=${f.size} bytes type=${f.type || "unknown"}`);
    // Read explicitly using slice to ensure full file read
    const buf = await f.slice(0, f.size).arrayBuffer();
    //log(`ArrayBuffer read: ${buf.byteLength} bytes`);
    // If lengths differ, fail early so we can debug
    if (buf.byteLength !== f.size) {
      log(`Warning: read length (${buf.byteLength}) != file.size (${f.size})`);
    }
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

// ti_toolsSync provided by ti_tools (imported as bslSync for compatibility)

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
  //  const auto = !!autoBslToggle?.checked;
  //  const remotePinMode = !!pinModeSelect?.checked;
  const bslTpl = (bslUrlInput?.value || DEFAULT_CONTROL.bslPath).trim();
  if (activeConnection === "serial") {
    log(
      `Entering BSL: conn=serial auto=${autoBslToggle?.checked} implyGate=${implyGateToggle?.checked} findBaud=${findBaudToggle?.checked}`
    );
  } else if (activeConnection === "tcp") {
    const strategy = pinModeSelect?.checked ? "mode" : "pin";
    log(
      `Entering BSL: conn=tcp strategy=${strategy} implyGate=${implyGateToggle?.checked} findBaud=${findBaudToggle?.checked}`
    );
  }

  if (activeConnection === "serial") {
    if (!autoBslToggle?.checked) {
      log("Auto BSL disabled for serial; skipping line sequence");
      return;
    }
    // Use Silabs auto entry when SI family is selected
    if (getSelectedFamily() === "sl") {
      await enterSilabsBootloader(setLines, log);
    }
    if (getSelectedFamily() === "ti") {
      await bslUseLines();
    }
    return;
  }

  if (activeConnection === "tcp") {
    if (!pinModeSelect?.checked) {
      // Use line sequences via remote bridge pins (two attempts)
      // try {

      if (getSelectedFamily() === "sl") {
        await enterSilabsBootloader(setLines, log);
      }
      if (getSelectedFamily() === "ti") {
        await bslUseLines();
      }
      // } catch (e) {
      //   await bslUseLines(true);
      // }
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
  //const auto = !!autoBslToggle?.checked; // same toggle governs whether to use sequences
  //const remotePinMode = !!pinModeSelect?.checked;
  const rstTpl = (rstUrlInput?.value || DEFAULT_CONTROL.rstPath).trim();
  if (activeConnection === "serial") {
    log(
      `Resetting: conn=serial auto=${autoBslToggle?.checked} implyGate=${implyGateToggle?.checked} findBaud=${findBaudToggle?.checked}`
    );
  } else if (activeConnection === "tcp") {
    const strategy = pinModeSelect?.checked ? "mode" : "pin";
    log(
      `Resetting: conn=tcp strategy=${strategy} implyGate=${implyGateToggle?.checked} findBaud=${findBaudToggle?.checked}`
    );
  }

  if (activeConnection === "serial") {
    if (!autoBslToggle?.checked) {
      log("Auto reset disabled for serial; skipping line sequence");
      return;
    }
    // For Silabs, if in bootloader, send "2" to run application, then reset lines
    if (getSelectedFamily() === "sl") {
      log("Sending '2' to bootloader to run application");
      const encoder = new TextEncoder();
      await getActiveLink().write(encoder.encode("2\r\n"));
      await sleep(500); // Give time for bootloader to process
      await resetUseLines(); // Then reset the device
    } else {
      await resetUseLines();
    }
    return;
  }

  if (activeConnection === "tcp") {
    if (!pinModeSelect?.checked) {
      // Use line sequences via remote bridge pins
      //try {
      await resetUseLines();
      // } catch (e) {
      //   await resetUseLines(true);
      // }
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
    const family = getSelectedFamily();
    if (family === "ti") {
      const link = getActiveLink();
      const bsl = await ti_tools.sync(link);
      const id = await bsl.chipId();
      const chipHex = Array.from(id as Uint8Array)
        .map((b: number) => b.toString(16).padStart(2, "0"))
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
          const model = ti_tools.getChipDescription(id, wafer_id, pg_rev, usr[1]);
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
    } else {
      // Silabs stub path for now
      if (!sl_tools) sl_tools = new SilabsTools(getActiveLink());
      const info = await sl_tools.getChipInfo();
      if (chipModelEl) chipModelEl.value = info.chipName;
      if (firmwareVersionEl) firmwareVersionEl.value = info.firmwareVersion || "";
      refreshNetworkFirmwareList(info.chipName).catch((e) =>
        log("Network FW list fetch failed: " + (e?.message || String(e)))
      );
    }
  } catch (e: any) {
    log("BSL sync or chip read failed: " + (e?.message || String(e)));
    throw e;
  } finally {
    if (showBusy) deviceDetectBusy(false);
  }
}

// ...existing code...
async function pingWithBaudRetries(
  link: any,
  baudCandidates: number[] = [9600, 19200, 38400, 57600, 115200, 230400, 460800]
): Promise<boolean> {
  // Try a normal ping first
  const findBaud = !!findBaudToggle?.checked;
  try {
    log("Pinging application...");
    const ok0 = await ti_tools.pingApp(link);
    if (
      (findBaud && activeConnection === "serial") ||
      (findBaud && activeConnection === "tcp" && (baudUrlInput?.value ?? "").trim() !== "")
    ) {
      log(baudUrlInput?.value || "NULL");
      // If findBaud is enabled, we need to check for baud rate changes
      if (ok0) return true;
    } else {
      // If findBaud is not enabled, we don't need to check for baud rate changes
      //log("Ping succeeded");
      return ok0;
    }
  } catch {}

  // Only attempt baud cycling for real serial connection
  //if (activeConnection !== "serial" || !serial) return false;

  const originalBaud = parseInt(bitrateInput.value, 10) || 115200;
  // ensure unique sorted list and make sure original baud is present
  const bauds = Array.from(new Set(baudCandidates.concat([originalBaud]))).sort((a, b) => a - b);

  // If there's only one candidate (the original), nothing to try
  if (bauds.length <= 1) return false;

  const startIdx = bauds.indexOf(originalBaud);
  // start from the next baud after original and loop circularly until we come back
  let idx = (startIdx + 1) % bauds.length;

  for (; idx !== startIdx; idx = (idx + 1) % bauds.length) {
    const b = bauds[idx];
    try {
      // if active serial connection
      if (activeConnection === "serial") {
        await (serial as any)?.reopenWithBaudrate?.(b);
        log(`Serial: switched baud to ${b} for ping retry`);
      } else if (activeConnection === "tcp" && baudUrlInput?.value?.trim() !== "") {
        await changeBaudOverTcp(b);

        log(`TCP: requested baud change to ${b} for ping retry`);
      }
    } catch (e: any) {
      log(`Serial: failed to switch baud to ${b}: ${e?.message || String(e)}`);
      continue;
    }

    // give device/bridge a moment; perform a reset to let device re-sync at new baud
    await performReset().catch((e: any) => log("Reset failed: " + (e?.message || String(e))));
    await sleep(500);

    try {
      log("Pinging application...");
      const ok = await ti_tools.pingApp(link);
      if (ok) {
        // keep new baud in UI
        try {
          bitrateInput.value = String(b);
          updateConnectionUI();
        } catch {}
        log(`Ping succeeded at ${b}bps`);
        return true;
      } else {
        log(`Ping at ${b}bps: timed out or no response`);
      }
    } catch (e: any) {
      log(`Ping error at ${b}bps: ${e?.message || String(e)}`);
    }
  }

  // restore original baud if cycling failed
  try {
    if (activeConnection === "serial") {
      await (serial as any)?.reopenWithBaudrate?.(originalBaud);
      log(`Serial: restored baud to ${originalBaud}`);
    } else if (activeConnection === "tcp" && baudUrlInput?.value?.trim() !== "") {
      await changeBaudOverTcp(originalBaud);
      log(`TCP: restored baud to ${originalBaud}`);
    }

    try {
      bitrateInput.value = String(originalBaud);
    } catch {}
  } catch {}

  return false;
}
// ...existing code...

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
    const family = getSelectedFamily();
    if (family === "ti") {
      await enterBsl().catch((e: any) => log("Enter BSL failed: " + (e?.message || String(e))));
      await readChipInfo(false);
      await performReset().catch((e: any) => log("Reset failed: " + (e?.message || String(e))));
      await sleep(1000);
      try {
        const link = getActiveLink();
        const ok = await pingWithBaudRetries(link);
        if (!ok) {
          log("App ping: timed out or no response");
        } else {
          log("App ping: successful");
        }
      } catch {
        log("App ping skipped");
      }
      try {
        const link = getActiveLink();
        log("Checking firmware version...");
        const info = await ti_tools.getFwVersion(link);
        if (!info) {
          log("FW version request: timed out or no response");
        } else if (firmwareVersionEl) {
          firmwareVersionEl.value = String(info.fwRev);
          log(`FW version: ${info.fwRev}`);
        }
      } catch {
        log("FW version check skipped");
      }
    } else {
      // Silabs path: enter bootloader, read BL version, then reset back to app
      if (!sl_tools) sl_tools = new SilabsTools(getActiveLink());
      try {
        // Enter Gecko Bootloader
        await enterBsl();
        // Give BL a brief moment, then query menu/version
        await sleep(200);
        const blv = await sl_tools.getBootloaderVersion();
        log(`Silabs bootloader: v${blv}`);
        if (firmwareVersionEl) firmwareVersionEl.value = `BL v${blv}`;
        if (chipModelEl && !chipModelEl.value) chipModelEl.value = "EFR32";
      } catch (e: any) {
        log("Silabs bootloader check failed: " + (e?.message || String(e)));
      }
      try {
        await performReset();
      } catch (e: any) {
        log("Reset failed: " + (e?.message || String(e)));
      }
      // Read application firmware version via EZSP
      await sleep(1000); // Give more time for application to start
      try {
        const link = getActiveLink();
        if (!sl_tools) sl_tools = new SilabsTools(getActiveLink());
        const ezspVersion = await sl_tools.getApplicationVersion();
        if (firmwareVersionEl) firmwareVersionEl.value = ezspVersion;
        log(`EZSP app version: ${ezspVersion}`);
      } catch (e: any) {
        log("EZSP app version check failed: " + (e?.message || String(e)));
      }
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
    // Make available to index.js
    (window as any).netFwItems = netFwItems;
    (window as any).netFwSelect = netFwSelect;
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

async function flash() {
  if (!hexImage) throw new Error("Load HEX first");

  // Show warning
  if (flashWarning) flashWarning.classList.remove("d-none");

  if (getSelectedFamily() === "ti") {
    // If using Web Serial, bump baud to 500000 for faster flashing
    try {
      if (activeConnection === "serial") {
        await (serial as any)?.reopenWithBaudrate?.(500000);
        log("Serial: switched baud to 500000");
      } else if (activeConnection === "tcp" && baudUrlInput?.value?.trim() !== "") {
        await changeBaudOverTcp(460800);
        log("TCP: switched baud to 460800");
      }
    } catch {
      log("Serial: failed to switch baud");
    }
  }
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

  // Branch for Silabs vs TI
  if (getSelectedFamily() === "sl") {
    if (!sl_tools) sl_tools = new SilabsTools(getActiveLink());

    log(`Flashing Silabs firmware: ${data.length} bytes`);
    fwProgressReset("Flashing Silabs...");

    try {
      await sl_tools.flash(data, (progress) => {
        const pct = Math.round(progress);
        fwProgress(pct, `Uploading... ${pct}%`);
      });

      log("Silabs flash complete!");
      fwProgress(100, "Done");
    } catch (error: any) {
      log("Silabs flash error: " + (error?.message || String(error)));
      throw error;
    }

    return; // Exit early for Silabs path
  }

  // TI path continues below
  const bsl = await ti_tools.sync(link);
  let chipIdStr = "";
  let chipIsCC26xx = false;
  try {
    const id = await bsl.chipId();
    chipIdStr = Array.from(id as Uint8Array)
      .map((b: number) => b.toString(16).padStart(2, "0"))
      .join("");
    log(`ChipId: ${chipIdStr}`);
    // cc2538-bsl treats unknown IDs as CC26xx/13xx. Known CC2538 IDs: 0xb964/0xb965
    const chipId = ((id[0] << 8) | id[1]) >>> 0;
    chipIsCC26xx = !(chipId === 0xb964 || chipId === 0xb965);
  } catch {}

  if (optErase.checked) {
    log("Erase...");
    if (chipIsCC26xx) {
      // Prefer bank erase; if it fails, erase sectors across the write range
      try {
        await (bsl as any).bankErase?.();
        log("Bank erase done");
      } catch (e: any) {
        log("Bank erase not supported or failed, erasing sectors...");
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

  if (optWrite.checked) {
    log(`Writing ${data.length} bytes @ ${toHex(startAddr, 8)}...`);
    // reset progress bar
    fwProgressReset("Writing...");
    //const ff = 0xff;
    const zero = 0x00;

    for (let off = 0; off < data.length; off += chunkSize) {
      let end = Math.min(off + chunkSize, data.length);
      let chunk = data.subarray(off, end);
      // Skip chunks that are fully 0x00 to avoid unnecessary writes
      let skip = true;
      const firstByte = chunk[0];
      if (firstByte !== zero) {
        skip = false;
      } else {
        // Check if all bytes match the first byte
        for (let i = 1; i < chunk.length; i++) {
          if (chunk[i] !== firstByte) {
            skip = false;
            break;
          }
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

  if (optVerify.checked) {
    log("Verify...");
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

  // If using Web Serial, bump baud back to original that was set in ui
  const originalBaudRate = parseInt(bitrateInput.value, 10) || 115200;
  try {
    if (activeConnection === "serial") {
      await (serial as any)?.reopenWithBaudrate?.(originalBaudRate);
      log(`Serial: switched baud to ${originalBaudRate}`);
    } else if (activeConnection === "tcp" && baudUrlInput?.value?.trim() !== "") {
      await changeBaudOverTcp(originalBaudRate);
      log(`TCP: switched baud to ${originalBaudRate}`);
    }
  } catch {
    log("Serial: failed to switch baud");
  }

  if (flashWarning) {
    setTimeout(() => flashWarning.classList.add("d-none"), 1000);
  }
}

async function bslUseLines() {
  if (implyGateToggle?.checked != true) {
    await setLines(true, true);
    await sleep(250);
    await setLines(true, false);
    await sleep(250);
    await setLines(false, false);
    await sleep(250);
    await setLines(true, false);
    await sleep(500);
    await setLines(true, true);
    await sleep(500);
  } else {
    await setLines(true, true);
    await sleep(250);
    await setLines(true, false);
    await sleep(250);
    await setLines(false, true);
    await sleep(450);
    await setLines(false, false);
    await sleep(250);
  }
}

// Reset the device out of BSL and back into application
async function resetUseLines() {
  await setLines(true, true);
  await sleep(500);
  await setLines(false, true);
  await sleep(500);
  await setLines(true, true);
  await sleep(1000);
}

// ----------------- NVRAM helpers (delegated to ti_tools) -----------------
async function nvramReadAll(): Promise<any> {
  nvProgressReset("Reading...");
  const link = getActiveLink();
  const payload = await ti_tools.nvramReadAll(link, nvProgress);
  nvProgress(100, "Done");
  return payload;
}

async function nvramEraseAll(): Promise<void> {
  nvProgressReset("Erasing...");
  const link = getActiveLink();
  await ti_tools.nvramEraseAll(link, nvProgress);
  nvProgress(100, "Erase done");
}

async function nvramWriteAll(obj: any): Promise<void> {
  nvProgressReset("Writing...");
  const link = getActiveLink();
  await ti_tools.nvramWriteAll(link, obj, (s: string) => log(s), nvProgress);
  nvProgress(100, "Write done");
}

// UI wiring for NVRAM
btnNvRead?.addEventListener("click", async () => {
  await withButtonStatus(btnNvRead!, async () => {
    try {
      nvProgressSetColor("primary");
      nvProgressReset("Reading...");
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
      nvProgressReset("Erasing...");
      await nvramEraseAll();
      log("NVRAM erase done. Resetting...");
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

// DTR = BSL(FLASH), RTS = RESET; (active low);
// without NPN - rts=0 reset=0, dtr=0 bsl=0
// with NPN invert - rts=0 reset=1, dtr=0 bsl=1

const setLines = async (rstLevel: boolean, bslLevel: boolean) => {
  // Apply optional inversion toggles (affect desired logic-low intent), for both serial and tcp

  // const rstLevelEff = invertRst?.checked ? !rstLevel : rstLevel;
  // const bslLevelEff = invertBsl?.checked ? !bslLevel : bslLevel;
  const rstLevelEff = invertLevel?.checked ? !rstLevel : rstLevel;
  const bslLevelEff = invertLevel?.checked ? !bslLevel : bslLevel;
  // const rstLevelEff = rstLevel;
  // const bslLevelEff = bslLevel;

  // Compute base mapping for TCP endpoints (values used only for building URLs below)
  //const base = computeDtrRts(rstLowEff, bslLowEff);
  let bsl = bslLevelEff;
  let rst = rstLevelEff;
  if (activeConnection === "serial") {
    // For Web Serial, many adapters assert low when the boolean is true.
    // For Silabs path we want direct low/high mapping: true => line asserted/low.
    // if (getSelectedFamily() === "sl") {
    //   dtr = rstLevelEff; // true => pull RST low
    //   rts = bslLevelEff; // true => pull BOOT low
    // }
    // Note: mapping is RST->DTR, BSL->RTS

    log(`CTRL(serial): RTS(RST)=${rst ? "1" : "0"} DTR(BSL)=${bsl ? "1" : "0"}`);
    const p: any = serial as any;
    if (!p || typeof p.setSignals !== "function") {
      log("Warning: Web Serial setSignals() not supported in this browser; cannot toggle DTR/RTS");
      throw new Error("setSignals unsupported");
    }
    await p.setSignals({ dataTerminalReady: bsl, requestToSend: rst });
    return;
  }
  if (activeConnection === "tcp") {
    // TCP: send two single requests, one per pin, using absolute URLs from inputs
    const bslTpl = (bslUrlInput?.value || DEFAULT_CONTROL.bslPath).trim();
    const rstTpl = (rstUrlInput?.value || DEFAULT_CONTROL.rstPath).trim();
    // let bslLevel = bslLevelEff ? 1 : 0;
    // let rstLevel = rstLevelEff ? 1 : 0;
    // if (getSelectedFamily() === "ti") {
    //   bslLevel = rts ? 1 : 0;
    //   rstLevel = dtr ? 1 : 0;
    // }

    // if (getSelectedFamily() === "sl") {
    //   bslLevel = rts ? 0 : 1;
    //   rstLevel = dtr ? 0 : 1;
    // }

    //log(`CTRL(tcp): BSL=${bslLevel} -> ${bslTpl} | RST=${rstLevel} -> ${rstTpl}`);
    const bslHasSet = /\{SET\}/.test(bslTpl);
    const rstHasSet = /\{SET\}/.test(rstTpl);
    log(`CTRL(tcp): setting RTS=${rst ? "1" : "0"} BSL=${bsl ? "1" : "0"} `);
    await sendCtrlUrl(bslTpl, bslHasSet ? (bsl ? 1 : 0) : undefined);
    await sendCtrlUrl(rstTpl, rstHasSet ? (rst ? 1 : 0) : undefined);
    return;
  }
};

async function changeBaudOverTcp(baud: number): Promise<void> {
  if (activeConnection !== "tcp" || !tcp) throw new Error("No TCP connection");
  const tpl = (baudUrlInput?.value || DEFAULT_CONTROL.baudPath).trim();
  // const rstTpl = (rstUrlInput?.value || DEFAULT_CONTROL.rstPath).trim();
  const hasSet = /\{SET\}/.test(tpl);
  // const hasRstSet = /\{SET\}/.test(rstTpl);
  log(`CTRL(tcp): changing baud -> ${baud} using template ${tpl}`);
  // send control URL (may be opaque/no-cors)
  await sendCtrlUrl(tpl, hasSet ? baud : undefined).catch((e: any) => {
    log("Baud change failed: " + (e?.message || String(e)));
    sleep(1000);
  });
  await sleep(1000);

  // Reconnect the TCP client to the same device host:port
  const host = hostInput.value.trim();
  const port = parseInt(portInput.value || "", 10);
  if (!host || !port) throw new Error("Host/port not set for reconnect");

  try {
    try {
      tcp.close();
    } catch {}
    const wsBase = getBridgeWsBase();
    tcp = new TcpClient(wsBase);
    await tcp.connect(host, port).catch;
    tcp.onData((d) => log(`RX: ${bufToHex(d)}`, "rx"));
    tcp.onTx?.((d: Uint8Array) => log(`TX: ${bufToHex(d)}`, "tx"));
    activeConnection = "tcp";
    updateConnectionUI();
    log(`TCP reconnected to ${host}:${port} after baud change`);
    // await performReset().catch((ee: any) => {
    //   log("Reset failed: " + (ee?.message || String(ee)));
    //   sleep(1000);
    // });
    await sleep(1000);
  } catch (e: any) {
    log(`TCP reconnect error after baud change: ${e?.message || String(e)}`);
    throw e;
  }
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
    const family = getSelectedFamily();
    if (family !== "ti") {
      log("Ping is not supported for Silabs yet");
      throw new Error("Unsupported for Silabs");
    }
    const link = getActiveLink();
    log("Pinging application...");
    const ok = await ti_tools.pingApp(link);
    if (!ok) throw new Error("Ping failed");
    //else log("Pong");
  });
});

btnVersion?.addEventListener("click", async () => {
  await withButtonStatus(btnVersion!, async () => {
    log("Checking firmware version...");
    const family = getSelectedFamily();
    if (family === "ti") {
      const link = getActiveLink();

      const info = await ti_tools.getFwVersion(link);
      const ok = !!info;
      if (info && firmwareVersionEl) {
        firmwareVersionEl.value = String(info.fwRev);
        log(`FW version: ${info.fwRev}`);
      }
      if (!ok) throw new Error("Version not available");
    } else {
      if (!sl_tools) sl_tools = new SilabsTools(getActiveLink());
      const ezspVersion = await sl_tools.getApplicationVersion();
      if (firmwareVersionEl) firmwareVersionEl.value = ezspVersion;
      if (ezspVersion && firmwareVersionEl) {
        firmwareVersionEl.value = String(ezspVersion || "");
        log(`FW version: ${ezspVersion || "unknown"}`);
      } else {
        throw new Error("Version not available");
      }
    }
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
      nvProgressReset("Writing...");
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
      log("NVRAM write done. Resetting...");
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
      await flash();
      log("Flashing finished. Restarting device...");
      try {
        await performReset();
        log("Restart done");
      } catch (e: any) {
        log("Restart error: " + (e?.message || String(e)));
      }

      const family = getSelectedFamily();
      if (family == "ti") {
        //log("Pinging device...");
        try {
          const link = getActiveLink();
          const ok = await pingWithBaudRetries(link);
          if (!ok) log("Ping: timed out or no response");
        } catch (e: any) {
          log("Ping error: " + (e?.message || String(e)));
        }
      }
      log("Checking firmware version...");
      if (family == "sl") {
        // After flash, re-read device info
        await sleep(5000);

        const link = getActiveLink();
        if (!sl_tools) sl_tools = new SilabsTools(getActiveLink());
        const ezspVersion = await sl_tools.getApplicationVersion();
        if (firmwareVersionEl) firmwareVersionEl.value = ezspVersion;
        log(`EZSP app version: ${ezspVersion}`);
      }
      if (family == "ti") {
        try {
          // use local wrapper to log and update UI
          const info = await ti_tools.getFwVersion(getActiveLink());
          if (info && firmwareVersionEl) {
            firmwareVersionEl.value = String(info.fwRev);
            log(`FW version: ${info.fwRev}`);
          }
        } catch (e: any) {
          log("Version read error: " + (e?.message || String(e)));
        }
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

// Map selected template from select to the corresponding input URL template
function applySelectToInput(sel: HTMLSelectElement | null, input: HTMLInputElement | null) {
  if (!sel || !input) return;
  const v = (sel.value || "").trim();
  if (!v) {
    input.value = "";
    saveCtrlSettings();
    return;
  }

  if (v === "sp:dtr") {
    input.value = "http://{BRIDGE}/sc?port={PORT}&dtr={SET}";
  } else if (v === "sp:rts") {
    input.value = "http://{BRIDGE}/sc?port={PORT}&rts={SET}";
  } else if (v.startsWith("gpio:") || v.startsWith("led:")) {
    // extract everything after the first ':' to preserve any further ':' characters
    const idx = v.indexOf(":");
    const path = idx >= 0 ? v.substring(idx + 1) : v;
    input.value = `http://{BRIDGE}/gpio?path=${path}&set={SET}`;
  } else if (v === "bridge") {
    input.value = "http://{BRIDGE}/sc?port={PORT}&baud={SET}";
  } else if (v === "none") {
    input.value = "";
  } else if (v == "xzg:bsl") {
    input.value = "http://{HOST}/cmdZigBSL";
  } else if (v == "xzg:rst") {
    input.value = "http://{HOST}/cmdZigRST";
  } else if (v == "esphome:bsl") {
    input.value = "http://{HOST}/switch/zBSL/{SET}";
  } else if (v == "esphome:rst") {
    input.value = "http://{HOST}/switch/zRST_gpio/{SET}";
  } else if (v == "tasmota:bsl") {
    input.value = "http://{HOST}/cm?cmnd=Power2%20{SET}";
  } else if (v == "tasmota:rst") {
    input.value = "http://{HOST}/cm?cmnd=Power1%20{SET}";
  }

  // else {
  //   input.value = `http://{BRIDGE}/gpio?path=${encodeURIComponent(v)}&set={SET}`;
  // }

  saveCtrlSettings();
  //log(`Applied template ${v} -> ${input.id}`);
}

// Attach change listeners to the template selects so they populate inputs
bslUrlSelect?.addEventListener("change", () => applySelectToInput(bslUrlSelect, bslUrlInput));
rstUrlSelect?.addEventListener("change", () => applySelectToInput(rstUrlSelect, rstUrlInput));
baudUrlSelect?.addEventListener("change", () => applySelectToInput(baudUrlSelect, baudUrlInput));

// Log actions
const btnClearLog = document.getElementById("btnClearLog") as HTMLButtonElement | null;
const btnCopyLog = document.getElementById("btnCopyLog") as HTMLButtonElement | null;
btnClearLog?.addEventListener("click", () => {
  logEl.innerHTML = "";
});
btnCopyLog?.addEventListener("click", async () => {
  const lines = Array.from(logEl.querySelectorAll<HTMLElement>(".log-line"))
    .filter((el) => {
      // when showIo is unchecked, omit RX/TX lines (they have classes log-rx / log-tx)
      if (typeof showIoEl !== "undefined" && showIoEl !== null && !showIoEl.checked) {
        if (el.classList.contains("log-rx") || el.classList.contains("log-tx")) return false;
      }
      return true;
    })
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
  //check if page loader over http
  if (window.location.protocol === "https:") {
    console.warn("Secure page - no request to bridge");
    return;
  }
  setBridgeLoading();
  // try {
  //   var host =
  //     (bridgeHostInput && bridgeHostInput.value && bridgeHostInput.value.trim()) ||
  //     localStorage.getItem("bridgeHost") ||
  //     "127.0.0.1";
  //   var port = Number((bridgePortInput && bridgePortInput.value) || localStorage.getItem("bridgePort") || 3000) || 3000;
  //   var link = document.getElementById("tcpLocalhostLink") as HTMLAnchorElement | null;
  //   if (link) {
  //     link.href = "http://" + host + ":" + port;
  //     link.textContent = host === "localhost" ? "localhost" : host + ":" + port;
  //   }
  // } catch (e) {
  //   // ignore
  //   console.log(e);
  // }

  // Refresh control lists
  refreshControlLists();
  try {
    const types = [
      "_zig_star_gw._tcp.local.",
      "_zigstar_gw._tcp.local.",
      "_uzg-01._tcp.local.",
      "_tubeszb._tcp.local.",
      "_xzg._tcp.local.",
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
  if (mdnsSelect.selectedOptions[0].value === "manual") {
    tcpLinksPanel?.classList.remove("d-none");
  }
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
  updateConnectionUI();
});

// auto-refresh list on load (non-blocking)
refreshMdnsList().catch(() => {});

// Populate control template selects (BSL / RST) from bridge /gl endpoint
async function refreshControlLists() {
  if (!bslUrlSelect || !rstUrlSelect) return;
  try {
    const base = getBridgeBase();
    const url = `${base}/gl`;
    let j: any = {};
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`gl http ${resp.status}`);
      j = await resp.json();
    } catch (e: any) {
      log("Control lists fetch failed: " + (e?.message || String(e)));
      // j остаётся {} — последующий код будет работать с пустыми списками
    }

    // Normalize gpio and leds
    const gpioItems: Array<any> = [];
    if (j && j.gpio) {
      // Accept array or object map
      if (Array.isArray(j.gpio)) {
        gpioItems.push(...j.gpio);
      } else if (typeof j.gpio === "object") {
        // convert map to array of { path?, label?, value? }
        for (const k of Object.keys(j.gpio)) {
          const v = j.gpio[k];
          if (v && typeof v === "object") gpioItems.push(v as any);
          else gpioItems.push({ path: String(k), label: String(k), value: String(v) });
        }
      }
    }

    const ledItems: Array<any> = Array.isArray(j?.leds) ? j.leds : [];

    function buildSelect(sel: HTMLSelectElement, defaultSerial: string) {
      sel.innerHTML = "";

      const title = document.createElement("optgroup");
      if (sel === bslUrlSelect) title.label = "🟨 BSL";
      else if (sel === rstUrlSelect) title.label = "🟩 Reset";
      //add blank option None
      const oNone = document.createElement("option");
      oNone.value = "";
      oNone.textContent = "None";
      title.appendChild(oNone);
      sel.appendChild(title);
      // make default option selected
      if (defaultSerial === "") {
        oNone.selected = true;
      }

      // add shared Serial optgroup
      addSerialOptgroup(sel, defaultSerial || null);

      // GPIO optgroup
      const gg = document.createElement("optgroup");
      gg.label = "GPIOs";
      if (gpioItems.length) {
        for (const it of gpioItems) {
          const o = document.createElement("option");
          const label = it.label || it.name || it.path || String(it);
          const path = it.path || it.name || label;
          o.value = `gpio:${path}`;
          o.textContent = `${label}` + (it.path ? ` (${it.path})` : "");
          gg.appendChild(o);
        }
        sel.appendChild(gg);
      } else {
        const o = document.createElement("option");
        o.disabled = true;
        o.textContent = "no exported GPIOs";
        gg.appendChild(o);
        sel.appendChild(gg);
      }

      // Leds optgroup
      const lg = document.createElement("optgroup");
      lg.label = "LEDs";
      if (ledItems.length) {
        for (const it of ledItems) {
          const o = document.createElement("option");
          const label = it.label || it.name || it.path || String(it);
          const path = it.path || label;
          o.value = `led:${path}`;
          o.textContent = `${label}` + (it.path ? ` (${it.path})` : "");
          lg.appendChild(o);
        }
        sel.appendChild(lg);
      } else {
        const o = document.createElement("option");
        o.disabled = true;
        o.textContent = "no exported LEDs";
        lg.appendChild(o);
        sel.appendChild(lg);
      }

      // add XZG optgroup
      addXZGOptgroup(sel, defaultSerial || null);

      // add ESPHome optgroup
      addESPHomeOptgroup(sel, defaultSerial || null);

      // add Tasmota optgroup
      addTasmotaOptgroup(sel, defaultSerial || null);
    }

    // Fill both selects
    // Default choices: BSL -> RTS, RST -> DTR
    buildSelect(bslUrlSelect, "");
    buildSelect(rstUrlSelect, "");

    //log(`Control lists updated: GPIO=${gpioItems.length} Leds=${ledItems.length}`);
  } catch (e: any) {
    log("Control lists refresh error: " + (e?.message || String(e)));
  }
}

// Serial optgroup helper (shared within this function)
function addSerialOptgroup(target: HTMLSelectElement, def: string | null) {
  const sg = document.createElement("optgroup");
  sg.label = "Serial";
  const oDtr = document.createElement("option");
  oDtr.value = "sp:dtr";
  oDtr.textContent = "DTR";
  const oRts = document.createElement("option");
  oRts.value = "sp:rts";
  oRts.textContent = "RTS";
  sg.appendChild(oDtr);
  sg.appendChild(oRts);
  target.appendChild(sg);
  if (def) {
    try {
      target.value = def;
    } catch {}
  }
}

function addXZGOptgroup(target: HTMLSelectElement, def: string | null) {
  const xg = document.createElement("optgroup");
  xg.label = "XZG Firmware";
  const oBsl = document.createElement("option");
  oBsl.value = "xzg:bsl";
  oBsl.textContent = "BSL mode";
  xg.appendChild(oBsl);
  const oRst = document.createElement("option");
  oRst.value = "xzg:rst";
  oRst.textContent = "RST mode";
  xg.appendChild(oRst);
  target.appendChild(xg);
  if (def) {
    try {
      target.value = def;
    } catch {}
  }
}

function addESPHomeOptgroup(target: HTMLSelectElement, def: string | null) {
  const xg = document.createElement("optgroup");
  xg.label = "ESP Home";
  const oBsl = document.createElement("option");
  oBsl.value = "esphome:bsl";
  oBsl.textContent = "BSL pin";
  xg.appendChild(oBsl);
  const oRst = document.createElement("option");
  oRst.value = "esphome:rst";
  oRst.textContent = "RST pin";
  xg.appendChild(oRst);
  target.appendChild(xg);
  if (def) {
    try {
      target.value = def;
    } catch {}
  }
}

function addTasmotaOptgroup(target: HTMLSelectElement, def: string | null) {
  const tg = document.createElement("optgroup");
  tg.label = "Tasmota";
  const oRst = document.createElement("option");
  oRst.value = "tasmota:rst";
  oRst.textContent = "Relay 1";
  tg.appendChild(oRst);
  const oBsl = document.createElement("option");
  oBsl.value = "tasmota:bsl";
  oBsl.textContent = "Relay 2";
  tg.appendChild(oBsl);

  target.appendChild(tg);
  if (def) {
    try {
      target.value = def;
    } catch {}
  }
}

// UI update for chip family selection
const chipTiRadio = document.getElementById("chip_ti") as HTMLInputElement;
const chipSlRadio = document.getElementById("chip_si") as HTMLInputElement;

function updateUIForFamily() {
  const family = getSelectedFamily();
  const cloudFw = document.getElementById("cloudFirmwareSection");
  const nvram = document.getElementById("nvramSection");
  const flashSize = document.getElementById("flashSizeWrap");
  const ieeeMac = document.getElementById("ieeeMacWrap");
  const fwVersion = document.getElementById("firmwareVersionWrap");
  const localFirmwareSection = document.getElementById("localFirmwareSection");
  const flashOptionsWrap = document.getElementById("flashOptionsWrap");
  const findBaudWrap = document.getElementById("findBaudWrap");
  const btnGetModel = document.getElementById("btn-get-model");
  const btnPing = document.getElementById("btn-ping");

  if (family === "sl") {
    if (cloudFw) cloudFw.classList.add("d-none");
    if (nvram) nvram.classList.add("d-none");
    if (flashSize) flashSize.classList.add("d-none");
    if (ieeeMac) ieeeMac.classList.add("d-none");
    if (flashOptionsWrap) flashOptionsWrap.classList.add("d-none");
    if (findBaudWrap) findBaudWrap.classList.add("d-none");
    if (btnGetModel) btnGetModel.classList.add("d-none");
    if (btnPing) btnPing.classList.add("d-none");
    if (fwVersion) fwVersion.className = fwVersion.className.replace("col-md-4", "col-md-12");
    if (localFirmwareSection)
      localFirmwareSection.className = localFirmwareSection.className.replace("col-md-6", "col-md-12");
  }
  if (family === "ti") {
    if (cloudFw) cloudFw.classList.remove("d-none");
    if (nvram) nvram.classList.remove("d-none");
    if (flashSize) flashSize.classList.remove("d-none");
    if (ieeeMac) ieeeMac.classList.remove("d-none");
    if (flashOptionsWrap) flashOptionsWrap.classList.remove("d-none");
    if (findBaudWrap) findBaudWrap.classList.remove("d-none");
    if (btnGetModel) btnGetModel.classList.remove("d-none");
    if (btnPing) btnPing.classList.remove("d-none");
    if (fwVersion) fwVersion.className = fwVersion.className.replace("col-md-12", "col-md-4");
    if (localFirmwareSection)
      localFirmwareSection.className = localFirmwareSection.className.replace("col-md-12", "col-md-6");
  }
}

chipTiRadio.addEventListener("change", updateUIForFamily);
chipSlRadio.addEventListener("change", updateUIForFamily);

// Initialize UI on load
updateUIForFamily();

// Escape key handler to close firmware notes and bridge info modals
