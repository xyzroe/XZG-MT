// UI Elements

// Family types
export const FAMILY_VALUES = ["ti", "sl", "esp", "ti_old", "arduino", "telink"] as const;
export type FamilyValue = (typeof FAMILY_VALUES)[number];

// Family section
export const familySection = document.getElementById("familySection") as HTMLElement | null;
export const familyDropdown = document.getElementById("familyDropdown") as HTMLElement | null;
export const familyDropdownBtn = document.getElementById("familyDropdownBtn") as HTMLButtonElement | null;
export const familyDropdownMenu = document.getElementById("familyDropdownMenu") as HTMLElement | null;
let selectedFamilyValue: FamilyValue = "ti";

// General section
export const connectionSection = document.getElementById("connectionSection") as HTMLElement | null;
export const generalSection = document.getElementById("generalSection") as HTMLElement | null;
export const findBaudToggle = document.getElementById("findBaudToggle") as HTMLInputElement | null;
export const findBaudWrap = document.getElementById("findBaudWrap") as HTMLElement | null;
export const implyGateToggle = document.getElementById("implyGateToggle") as HTMLInputElement | null;
export const invertLevel = document.getElementById("invertLevel") as HTMLInputElement | null;

// Serial section
export const serialSection = document.getElementById("serialSection") as HTMLElement | null;
const serialControlsWrap = document.getElementById("serialControlsWrap");
const serialHttpMsg = document.getElementById("serialHttpMsg");
export const bitrateInput = document.getElementById("bitrateInput") as HTMLInputElement;
export const autoBslToggle = document.getElementById("autoBslToggle") as HTMLInputElement | null;
export const autoBslWrap = document.getElementById("autoBslWrap") as HTMLDivElement | null;
export const chooseSerialBtn = document.getElementById("chooseSerial") as HTMLButtonElement;
const serialBaudWrap = document.getElementById("serialBaudWrap") as HTMLDivElement | null;
const arduinoBootWrap = document.getElementById("arduinoBootWrap") as HTMLDivElement | null;
export const arduinoBootSelect = document.getElementById("arduinoBootSelect") as HTMLInputElement;
const telinkOptionsWrap = document.getElementById("telinkOptionsWrap") as HTMLDivElement | null;
export const telinkMethodSelect = document.getElementById("telinkMethodSelect") as HTMLInputElement;
export const telinkMethodWrap = document.getElementById("telinkMethodWrap") as HTMLDivElement | null;
export const telinkFamilySelect = document.getElementById("telinkFamilySelect") as HTMLInputElement;
export const telinkFamilyWrap = document.getElementById("telinkFamilyWrap") as HTMLDivElement | null;

// TCP section
export const tcpSection = document.getElementById("tcpSection") as HTMLElement | null;
const tcpControlsWrap = document.getElementById("tcpControlsWrap");
const tcpHttpsMsg = document.getElementById("tcpHttpsMsg");
export const bridgeStatusIcon = document.getElementById("bridgeStatusIcon") as HTMLSpanElement | null;

export const tcpSettingsPanel = document.getElementById("tcpSettingsPanel") as HTMLDivElement | null;
export const bridgeHostInput = document.getElementById("bridgeHostInput") as HTMLInputElement | null;
export const bridgePortInput = document.getElementById("bridgePortInput") as HTMLInputElement | null;
export const tcpInfoBtn = document.getElementById("tcpInfoBtn") as HTMLButtonElement | null;
export const bridgeInfoModal = document.getElementById("bridgeInfoModal") as HTMLDivElement | null;
export const bridgeInfoClose = document.getElementById("bridgeInfoClose") as HTMLButtonElement | null;
export const bridgeInfoCloseX = document.getElementById("bridgeInfoCloseX") as HTMLButtonElement | null;
export const bridgeLink = document.getElementById("bridgeLink") as HTMLAnchorElement | null;

export const hostInput = document.getElementById("hostInput") as HTMLInputElement;
export const portInput = document.getElementById("portInput") as HTMLInputElement;

export const mdnsSelect = document.getElementById("mdnsSelect") as HTMLSelectElement | null;
export const mdnsRefreshBtn = document.getElementById("mdnsRefresh") as HTMLButtonElement | null;
export const tcpSettingsBtn = document.getElementById("tcpSettingsBtn") as HTMLButtonElement | null;
export const tcpLinksBtn = document.getElementById("tcpLinksBtn") as HTMLButtonElement | null;

// TCP Links Panel
export const tcpLinksPanel = document.getElementById("tcpLinksPanel") as HTMLDivElement | null;
export const pinModeSelect = document.getElementById("pinModeSelect") as HTMLInputElement | null;
export const ctrlUrlRow = document.getElementById("ctrlUrlRow") as HTMLDivElement | null;
export const bslUrlSelect = document.getElementById("bslUrlSelect") as HTMLSelectElement | null;
export const rstUrlSelect = document.getElementById("rstUrlSelect") as HTMLSelectElement | null;
export const baudUrlSelect = document.getElementById("baudUrlSelect") as HTMLSelectElement | null;
export const bslUrlInput = document.getElementById("bslUrlInput") as HTMLInputElement | null;
export const bslMethodSelect = document.getElementById("bslMethodSelect") as HTMLSelectElement | null;
export const rstUrlInput = document.getElementById("rstUrlInput") as HTMLInputElement | null;
export const rstMethodSelect = document.getElementById("rstMethodSelect") as HTMLSelectElement | null;
export const baudUrlInput = document.getElementById("baudUrlInput") as HTMLInputElement | null;
export const baudMethodSelect = document.getElementById("baudMethodSelect") as HTMLSelectElement | null;

export const connectTcpBtn = document.getElementById("connectTcp") as HTMLButtonElement;

// Device section
const deviceSection = document.getElementById("deviceSection") as HTMLElement | null;
export const deviceDetectSpinner = document.getElementById("deviceDetectSpinner") as HTMLSpanElement | null;
export const portInfoEl = document.getElementById("portInfo") as HTMLInputElement | null;
export const chipModelEl = document.getElementById("chipModel") as HTMLInputElement | null;
export const flashSizeEl = document.getElementById("flashSize") as HTMLInputElement | null;
export const flashSizeWrap = document.getElementById("flashSizeWrap") as HTMLElement | null;
export const ieeeMacEl = document.getElementById("ieeeMac") as HTMLInputElement | null;
export const ieeeMacWrap = document.getElementById("ieeeMacWrap") as HTMLElement | null;
export const firmwareVersionEl = document.getElementById("firmwareVersion") as HTMLInputElement | null;
export const firmwareVersionWrap = document.getElementById("firmwareVersionWrap") as HTMLElement | null;
export const bootloaderVersionEl = document.getElementById("bootloaderVersion") as HTMLInputElement | null;
export const bootloaderVersionWrap = document.getElementById("bootloaderVersionWrap") as HTMLElement | null;

export const disconnectBtn = document.getElementById("disconnectBtn") as HTMLButtonElement;

// CC2530 section
const debuggerSection = document.getElementById("debuggerSection") as HTMLElement | null;
const debuggerControls = document.getElementById("debugger-controls") as HTMLElement | null;
const usbHttpMsg = document.getElementById("usbHttpMsg");
export const debuggerDetectSpinner = document.getElementById("debuggerDetectSpinner") as HTMLSpanElement | null;
export const connectDebuggerBtn = document.getElementById("connectDebugger") as HTMLButtonElement | null;
export const debuggerConnectWrap = document.getElementById("debuggerConnectWrap") as HTMLElement | null;
export const connectLoaderBtn = document.getElementById("connectLoader") as HTMLButtonElement | null;
export const loaderConnectWrap = document.getElementById("loaderConnectWrap") as HTMLElement | null;

export const debugModelEl = document.getElementById("debugModel") as HTMLInputElement | null;
export const debugManufEl = document.getElementById("debugManuf") as HTMLInputElement | null;
export const debugSerialEl = document.getElementById("debugSerial") as HTMLInputElement | null;
export const debugFwVersionEl = document.getElementById("debugFwVersion") as HTMLInputElement | null;
export const targetIdEl = document.getElementById("targetId") as HTMLInputElement | null;
export const targetIeeeEl = document.getElementById("targetIeee") as HTMLInputElement | null;

// Firmware section
const firmwareSection = document.getElementById("firmwareSection") as HTMLDivElement | null;

// Local file section
const localFirmwareSection = document.getElementById("localFirmwareSection") as HTMLDivElement | null;
export const localFile = document.getElementById("localFile") as HTMLInputElement;
const localFileHelp = document.getElementById("localFileHelp") as HTMLDivElement | null;

// Cloud firmware section
const cloudFirmwareSection = document.getElementById("cloudFirmwareSection") as HTMLDivElement | null;
export const netFwSelect = document.getElementById("netFwSelect") as HTMLSelectElement | null;
export const netFwNotesBtn = document.getElementById("netFwNotesBtn") as HTMLButtonElement | null;
export const netFwRefreshBtn = document.getElementById("netFwRefresh") as HTMLButtonElement | null;

const netFwSourceEl = document.getElementById("netFwSource") as HTMLAnchorElement | null;

// Firmware Notes Logic
const netFwNotesBtnEl = document.getElementById("netFwNotesBtn");
const fwNotesModalEl = document.getElementById("fwNotesModal");
const fwNotesContentEl = document.getElementById("fwNotesContent");
const fwNotesCloseEl = document.getElementById("fwNotesClose");
const fwNotesCloseXEl = document.getElementById("fwNotesCloseX");

// ESP firmware section
const multiFileSection = document.getElementById("multiFileSection") as HTMLDivElement | null;
export const multiFilesContainer = document.getElementById("multiFilesContainer") as HTMLDivElement | null;
export const btnAddEspFile = document.getElementById("btnAddEspFile") as HTMLButtonElement | null;

// Flash options
const flashOptionsWrap = document.getElementById("flashOptionsWrap") as HTMLElement | null;
export const optErase = document.getElementById("optErase") as HTMLInputElement;
export const optWrite = document.getElementById("optWrite") as HTMLInputElement;
export const optVerify = document.getElementById("optVerify") as HTMLInputElement;

// CC Debugger options
export const debuggerOptionWrap = document.getElementById("debuggerOptionWrap") as HTMLDivElement | null;
export const verifyMethodWrap = document.getElementById("verifyMethod") as HTMLSelectElement | null;
export const writeMethodWrap = document.getElementById("writeMethod") as HTMLSelectElement | null;

// Erase method
export const eraseOptionWrap = document.getElementById("eraseOptionWrap") as HTMLDivElement | null;
export const eraseMethodWrap = document.getElementById("eraseMethod") as HTMLSelectElement | null;

export const startFlashBtn = document.getElementById("startFlashBtn") as HTMLButtonElement;
export const flashWarning = document.getElementById("flashWarning") as HTMLDivElement | null;
export const progressEl = document.getElementById("progress") as HTMLDivElement;

// IEEE secondary address section
const ieeeSection = document.getElementById("ieeeSection") as HTMLDivElement | null;
const ieeeDescription = document.getElementById("ieeeDescription") as HTMLDivElement | null;
export const currentIeee = document.getElementById("currentIeee") as HTMLInputElement | null;
export const btnIeeeRead = document.getElementById("btnIeeeRead") as HTMLButtonElement | null;
export const newIeee = document.getElementById("newIeee") as HTMLInputElement | null;
export const btnIeeeWrite = document.getElementById("btnIeeeWrite") as HTMLButtonElement | null;
const ieeeForceWrap = document.getElementById("ieeeForceWrap") as HTMLDivElement | null;
export const forceWrite = document.getElementById("forceWrite") as HTMLInputElement | null;

// NVRAM section
const nvramSection = document.getElementById("nvramSection") as HTMLDivElement | null;
export const btnNvRead = document.getElementById("btnNvRead") as HTMLButtonElement | null;
export const btnNvErase = document.getElementById("btnNvErase") as HTMLButtonElement | null;
export const btnNvWrite = document.getElementById("btnNvWrite") as HTMLButtonElement | null;
export const nvProgressEl = document.getElementById("nvProgress") as HTMLDivElement | null;

// Actions section
const actionsSection = document.getElementById("actionsSection") as HTMLDivElement | null;
export const enterBslBtn = document.getElementById("enterBslBtn") as HTMLButtonElement | null;
export const resetBtn = document.getElementById("resetBtn") as HTMLButtonElement | null;
export const pingBtn = document.getElementById("pingBtn") as HTMLButtonElement | null;
export const getVersionBtn = document.getElementById("getVersionBtn") as HTMLButtonElement | null;
export const getModelBtn = document.getElementById("getModelBtn") as HTMLButtonElement | null;
export const resetDebugBtn = document.getElementById("resetDebugBtn") as HTMLButtonElement | null;
export const readFlashBtn = document.getElementById("readFlashBtn") as HTMLButtonElement;
export const swireFlashBtn = document.getElementById("swireFlashBtn") as HTMLButtonElement;

// Logs section
const logSection = document.getElementById("logSection") as HTMLElement | null;
const consoleWrapEl = document.getElementById("consoleWrap") as HTMLDivElement | null;
export const logEl = document.getElementById("log") as HTMLDivElement;
export const autoScrollEl = document.getElementById("autoScroll") as HTMLInputElement | null;
export const showIoEl = document.getElementById("showIo") as HTMLInputElement | null;
export const btnClearLog = document.getElementById("btnClearLog") as HTMLButtonElement | null;
export const btnCopyLog = document.getElementById("btnCopyLog") as HTMLButtonElement | null;

// Mist
export const developmentSection = document.getElementById("developmentSection") as HTMLElement | null;

import {
  saveCtrlSettings,
  saveBridgeSettings,
  scheduleBridgeRefresh,
  getSelectedFamily,
  activeConnection,
} from "./flasher";

import { EraseMethod, TelinkMethod } from "./types";

import { getSelectedFwNotes } from "./netfw";

// Event listeners
pinModeSelect?.addEventListener("change", saveCtrlSettings);
bslUrlInput?.addEventListener("change", saveCtrlSettings);
rstUrlInput?.addEventListener("change", saveCtrlSettings);
baudUrlInput?.addEventListener("change", saveCtrlSettings);
invertLevel?.addEventListener("change", saveCtrlSettings);
implyGateToggle?.addEventListener("change", saveCtrlSettings);
bridgeHostInput?.addEventListener("input", scheduleBridgeRefresh);
bridgePortInput?.addEventListener("input", scheduleBridgeRefresh);
findBaudToggle?.addEventListener("change", saveCtrlSettings);
bitrateInput?.addEventListener("change", saveCtrlSettings);

telinkMethodSelect?.addEventListener("change", () => {
  updateTelinkOptionsUI(telinkMethodSelect.value);
  saveCtrlSettings();
});

telinkFamilySelect?.addEventListener("change", () => {
  saveCtrlSettings();
});

// Family dropdown logic
if (familyDropdownBtn && familyDropdownMenu && familyDropdown) {
  // Toggle dropdown on button click
  familyDropdownBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    familyDropdown?.classList.toggle("open");
  });

  // Close dropdown when clicking outside
  document.addEventListener("click", () => {
    familyDropdown?.classList.remove("open");
  });

  // Handle item selection
  const items = familyDropdownMenu.querySelectorAll(".custom-dropdown-item");
  items.forEach((item) => {
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      const value = (item as HTMLElement).dataset.value || "ti";
      const img = item.querySelector("img")?.cloneNode(true) as HTMLImageElement;
      const text = item.querySelector("span")?.textContent || "";

      // Update button
      if (familyDropdownBtn) {
        const btnImg = familyDropdownBtn.querySelector(".dropdown-icon") as HTMLImageElement;
        const btnText = familyDropdownBtn.querySelector(".dropdown-text") as HTMLSpanElement;
        if (btnImg && img) {
          btnImg.src = img.src;
          btnImg.alt = img.alt;
        }
        if (btnText) btnText.textContent = text;
      }

      // Update selected state
      items.forEach((i) => i.classList.remove("selected"));
      item.classList.add("selected");
      selectedFamilyValue = value as FamilyValue;

      // Close dropdown
      familyDropdown?.classList.remove("open");

      // Trigger updates
      updateUIForFamily();
      saveCtrlSettings();
    });
  });

  // Set initial selected state
  const initialItem = familyDropdownMenu.querySelector(`[data-value="${selectedFamilyValue}"]`);
  initialItem?.classList.add("selected");
}

export function updateTelinkOptionsUI(method: string) {
  if (method === TelinkMethod.UART) {
    toggleElement(swireFlashBtn, true);
    toggleElement(telinkFamilyWrap, true);
  } else if (method === TelinkMethod.SWIRE) {
    toggleElement(swireFlashBtn, false);
    toggleElement(telinkFamilyWrap, false);
  }
}

export function getSelectedFamilyValue(): FamilyValue | "" {
  return selectedFamilyValue;
}

export function setSelectedFamilyValue(value: FamilyValue) {
  selectedFamilyValue = value;
  if (familyDropdownMenu && familyDropdownBtn) {
    const item = familyDropdownMenu.querySelector(`[data-value="${value}"]`) as HTMLElement;
    if (item) {
      const img = item.querySelector("img")?.cloneNode(true) as HTMLImageElement;
      const text = item.querySelector("span")?.textContent || "";

      // Update button
      const btnImg = familyDropdownBtn.querySelector(".dropdown-icon") as HTMLImageElement;
      const btnText = familyDropdownBtn.querySelector(".dropdown-text") as HTMLSpanElement;
      if (btnImg && img) {
        btnImg.src = img.src;
        btnImg.alt = img.alt;
      }
      if (btnText) btnText.textContent = text;

      // Update selected state
      familyDropdownMenu.querySelectorAll(".custom-dropdown-item").forEach((i) => i.classList.remove("selected"));
      item.classList.add("selected");
    }
  }
}

tcpSettingsBtn?.addEventListener("click", () => {
  // Show/hide the TCP settings panel
  const tcpSettingsPanelVisible = tcpSettingsPanel?.classList.contains("d-none");
  if (tcpSettingsPanel) tcpSettingsPanel.classList.toggle("d-none", !tcpSettingsPanelVisible);
});

tcpLinksBtn?.addEventListener("click", () => {
  // Show/hide the TCP links panel
  const tcpLinksPanelVisible = tcpLinksPanel?.classList.contains("d-none");
  if (tcpLinksPanel) tcpLinksPanel.classList.toggle("d-none", !tcpLinksPanelVisible);
});

bridgeHostInput?.addEventListener("change", saveBridgeSettings);
bridgePortInput?.addEventListener("change", saveBridgeSettings);

// Firmware Notes Modal Functions
fwNotesCloseEl?.addEventListener("click", () => closeModalById("fwNotesModal"));
fwNotesCloseXEl?.addEventListener("click", () => closeModalById("fwNotesModal"));
fwNotesModalEl?.addEventListener("click", (e) => {
  if (e.target === fwNotesModalEl) closeModalById("fwNotesModal");
});

// Bridge Info Modal Functions
tcpInfoBtn?.addEventListener("click", openBridgeInfo);
bridgeInfoClose?.addEventListener("click", () => closeModalById("bridgeInfoModal"));
bridgeInfoCloseX?.addEventListener("click", () => closeModalById("bridgeInfoModal"));
bridgeInfoModal?.addEventListener("click", (e) => {
  if (e.target === bridgeInfoModal) closeModalById("bridgeInfoModal");
});

// Helper functions for UI manipulation
export function toggleElement(el: HTMLElement | null, show: boolean) {
  if (!el) return;
  if (show) {
    el.classList.remove("d-none");
  } else {
    el.classList.add("d-none");
  }
}

function replaceClass(el: HTMLElement | null, oldClass: string, newClass: string) {
  if (!el) return;
  el.className = el.className.replace(oldClass, newClass);
}

function setMultipleClasses(
  config: Array<{ el: HTMLElement | null; show?: boolean; oldClass?: string; newClass?: string }>,
) {
  config.forEach(({ el, show, oldClass, newClass }) => {
    if (show !== undefined) toggleElement(el, show);
    if (oldClass && newClass) replaceClass(el, oldClass, newClass);
  });
}

function setText(el: HTMLElement | HTMLInputElement | null, text: string) {
  if (!el) return;
  if ("textContent" in el) {
    el.textContent = text;
  }
}

function setAttr(el: HTMLInputElement | null, attr: string, value: string) {
  if (!el) return;
  el.setAttribute(attr, value);
}

function setLink(el: HTMLAnchorElement | null, href: string, text: string) {
  if (!el) return;
  el.href = href;
  el.textContent = text;
}

// Reset all UI elements to default state
function resetToDefaultUI() {
  setMultipleClasses([
    // Sections - default: most visible
    { el: generalSection, show: true },
    { el: connectionSection, show: true },
    { el: tcpSection, show: true },
    { el: serialSection, show: true },
    { el: deviceSection, show: true },
    { el: debuggerSection, show: false },
    { el: localFirmwareSection, show: true },
    { el: cloudFirmwareSection, show: true },
    { el: multiFileSection, show: false },
    { el: ieeeSection, show: false },
    { el: ieeeForceWrap, show: false },
    { el: nvramSection, show: false },
    // Fields - default: basic visible
    { el: serialBaudWrap, show: true },
    { el: arduinoBootWrap, show: false },
    { el: telinkOptionsWrap, show: false },
    { el: flashSizeWrap, show: true },
    { el: ieeeMacWrap, show: true },
    { el: flashOptionsWrap, show: true },
    { el: debuggerOptionWrap, show: false },
    { el: eraseOptionWrap, show: false },
    { el: firmwareVersionWrap, show: false },
    { el: bootloaderVersionWrap, show: false },
    // Toggles - default: visible
    { el: autoBslWrap, show: true },
    { el: findBaudWrap, show: true },
    // Buttons - default: basic visible
    { el: readFlashBtn, show: true },
    { el: resetDebugBtn, show: false },
    { el: enterBslBtn, show: true },
    { el: getModelBtn, show: false },
    { el: getVersionBtn, show: true },
    { el: pingBtn, show: false },
    { el: swireFlashBtn, show: false },
  ]);

  // Reset column classes to default
  replaceClass(serialSection, "col-md-12", "col-md-6");
  replaceClass(localFirmwareSection, "col-md-12", "col-md-6");

  // Reset field sizes to default (col-md-6)
  replaceClass(flashSizeWrap, "col-md-4", "col-md-6");
  replaceClass(ieeeMacWrap, "col-md-4", "col-md-6");
  replaceClass(firmwareVersionWrap, "col-md-4", "col-md-6");
  replaceClass(bootloaderVersionWrap, "col-md-4", "col-md-6");
}

export function updateUIForFamily() {
  // Reset to default state first
  resetToDefaultUI();

  if (selectedFamilyValue === "ti") {
    // Only differences from default
    setMultipleClasses([
      { el: ieeeSection, show: true },
      { el: nvramSection, show: true },
      { el: flashSizeWrap, show: true, oldClass: "col-md-6", newClass: "col-md-4" },
      { el: ieeeMacWrap, show: true, oldClass: "col-md-6", newClass: "col-md-4" },
      { el: firmwareVersionWrap, show: true, oldClass: "col-md-6", newClass: "col-md-4" },
      { el: getModelBtn, show: true },
      { el: pingBtn, show: true },
    ]);

    setText(ieeeDescription, "Read and write secondary IEEE address.");
    setText(localFileHelp, "Use a local file (*.hex or *.bin).");
    setAttr(localFile, "accept", ".hex,.bin");
    setLink(netFwSourceEl, "https://github.com/xyzroe/XZG-MT/tree/fw_files", "XZG-MT/fw_files");
  } else if (selectedFamilyValue === "sl") {
    // Only differences from default
    setMultipleClasses([
      { el: ieeeSection, show: true },
      { el: ieeeForceWrap, show: true },
      { el: flashSizeWrap, show: false },
      { el: ieeeMacWrap, show: false },
      { el: flashOptionsWrap, show: false },
      { el: firmwareVersionWrap, show: true, oldClass: "col-md-6", newClass: "col-md-6" },
      { el: bootloaderVersionWrap, show: true, oldClass: "col-md-6", newClass: "col-md-6" },
      { el: readFlashBtn, show: false },
    ]);

    setText(ieeeDescription, "Read and write primary IEEE address. Use with caution!");
    setText(localFileHelp, "Use a local file (*.ota or *.gbl).");
    setAttr(localFile, "accept", ".ota,.gbl");
    setLink(netFwSourceEl, "https://github.com/xyzroe/XZG-MT/tree/fw_files", "XZG-MT/fw_files");
  } else if (selectedFamilyValue === "esp") {
    // Only differences from default
    setMultipleClasses([
      { el: generalSection, show: false },
      { el: tcpSection, show: false },
      { el: serialSection, show: true, oldClass: "col-md-6", newClass: "col-md-12" },
      { el: localFirmwareSection, show: false },
      { el: multiFileSection, show: true },
      { el: autoBslWrap, show: false },
      { el: findBaudWrap, show: false },
      { el: readFlashBtn, show: false },
      { el: enterBslBtn, show: false },
      { el: getVersionBtn, show: false },
    ]);

    setLink(netFwSourceEl, "https://github.com/xyzroe/XZG-MT/tree/cc_loader", "XZG-MT/cc_loader");
  } else if (selectedFamilyValue === "ti_old") {
    // Only differences from default
    setMultipleClasses([
      { el: generalSection, show: false },
      { el: connectionSection, show: false },
      { el: tcpSection, show: false },
      { el: deviceSection, show: false },
      { el: debuggerSection, show: true },
      { el: cloudFirmwareSection, show: false },
      { el: localFirmwareSection, show: true, oldClass: "col-md-6", newClass: "col-md-12" },
      { el: debuggerOptionWrap, show: true },
      { el: autoBslWrap, show: false },
      { el: findBaudWrap, show: false },
      { el: resetDebugBtn, show: true },
      { el: getModelBtn, show: true },
      { el: enterBslBtn, show: false },
      { el: getVersionBtn, show: false },
    ]);

    setText(localFileHelp, "Use a local file (*.hex or *.bin).");
    setAttr(localFile, "accept", ".hex,.bin");
  } else if (selectedFamilyValue === "arduino") {
    // Only differences from default
    setMultipleClasses([
      { el: generalSection, show: false },
      { el: tcpSection, show: false },
      { el: serialSection, show: true, oldClass: "col-md-6", newClass: "col-md-12" },
      { el: serialBaudWrap, show: false },
      { el: arduinoBootWrap, show: true },
      { el: flashSizeWrap, show: true, oldClass: "col-md-6", newClass: "col-md-4" },
      { el: ieeeMacWrap, show: true, oldClass: "col-md-6", newClass: "col-md-4" },
      { el: bootloaderVersionWrap, show: true, oldClass: "col-md-6", newClass: "col-md-4" },
      { el: autoBslWrap, show: false },
      { el: findBaudWrap, show: false },
      { el: enterBslBtn, show: false },
      { el: getModelBtn, show: true },
      { el: getVersionBtn, show: false },
    ]);

    setText(localFileHelp, "Use a local file (*.hex).");
    setAttr(localFile, "accept", ".hex");
    setLink(netFwSourceEl, "https://github.com/xyzroe/XZG-MT/tree/cc_loader", "XZG-MT/cc_loader");
  } else if (selectedFamilyValue === "telink") {
    // Only differences from default
    setMultipleClasses([
      { el: generalSection, show: false },
      { el: tcpSection, show: false },
      { el: serialSection, show: true, oldClass: "col-md-6", newClass: "col-md-12" },
      { el: autoBslWrap, show: false },
      { el: serialBaudWrap, show: false },
      { el: telinkOptionsWrap, show: true },
      { el: ieeeMacWrap, show: false },
      { el: bootloaderVersionWrap, show: true },
      { el: localFirmwareSection, show: false },
      { el: cloudFirmwareSection, show: false },
      { el: multiFileSection, show: true, oldClass: "col-md-6", newClass: "col-md-12" },
      { el: eraseOptionWrap, show: true },
      { el: getModelBtn, show: true },
      { el: getVersionBtn, show: false },
      { el: enterBslBtn, show: false },
    ]);
  }
}

declare global {
  interface Window {
    copyToClipboard: (el: HTMLElement, txt: string) => void;
    marked: { parse: (text: string) => string } | undefined;
    bootstrap: { Tooltip: new (el: Element, options?: Record<string, unknown>) => void } | undefined;
    netFwSelect: HTMLSelectElement | null;
    netFwItems: { key: string; notes?: string; [key: string]: unknown }[] | undefined;
  }
}

document.addEventListener("DOMContentLoaded", function () {
  // 1. Protocol-specific UI switching
  const isHttps = window.location.protocol === "https:";
  const isLocalhost = window.location.hostname === "localhost";

  const tcpControls =
    tcpControlsWrap &&
    tcpControlsWrap.querySelectorAll(
      ".d-flex, #tcpSettingsPanel, .row.g-2.align-items-center.mb-4, .row.g-2.align-items-center.mb-4, .col-12.mb-4, #ctrlUrlRow, .row.mt-auto",
    );

  const serialControls = serialControlsWrap && serialControlsWrap.querySelector(".serial-controls");
  // const debuggerControls = debuggerControlsWrap && debuggerControlsWrap.querySelector(".debugger-controls");

  console.log("Protocol check: isHttps=" + isHttps + ", isLocalhost=" + isLocalhost);
  if (isLocalhost) {
    console.log("Localhost detected - showing all controls");
    if (serialHttpMsg) serialHttpMsg.classList.add("d-none");
    if (usbHttpMsg) usbHttpMsg.classList.add("d-none");
    if (tcpHttpsMsg) tcpHttpsMsg.classList.add("d-none");
  } else if (isHttps) {
    console.log("HTTPS but not localhost - assuming HTTPS");
    if (tcpControls) {
      tcpControls.forEach((el: Element) => el.classList.add("d-none"));
    }
    if (tcpSettingsBtn) tcpSettingsBtn.classList.add("d-none");
    if (bridgeStatusIcon) bridgeStatusIcon.classList.add("d-none");
    if (tcpHttpsMsg) tcpHttpsMsg.classList.remove("d-none");
    if (serialControls) serialControls.classList.remove("d-none");
    if (serialHttpMsg) serialHttpMsg.classList.add("d-none");

    if (debuggerControls) debuggerControls.classList.remove("d-none");
    if (usbHttpMsg) usbHttpMsg.classList.add("d-none");
  } else {
    console.log("Non-HTTPS and non-localhost - assuming HTTP");
    if (serialControls) serialControls.classList.add("d-none");
    if (serialHttpMsg) serialHttpMsg.classList.remove("d-none");
    if (usbHttpMsg) usbHttpMsg.classList.remove("d-none");
    if (debuggerControls) debuggerControls.classList.add("d-none");
    if (tcpControls) {
      tcpControls.forEach((el: Element) => el.classList.remove("d-none"));
    }
    if (tcpHttpsMsg) tcpHttpsMsg.classList.add("d-none");
  }

  // 2. Log I/O visibility toggle

  if (showIoEl) {
    showIoEl?.addEventListener("change", applyLogVisibility);
    applyLogVisibility();
  }

  // 3. Tooltips
  initTooltips();
});

function applyLogVisibility() {
  if (!consoleWrapEl || !showIoEl) return;
  const hideAll = !showIoEl.checked;
  consoleWrapEl.classList.toggle("hide-rx", hideAll);
  consoleWrapEl.classList.toggle("hide-tx", hideAll);
}

// Theme Toggle
(function () {
  const cb = document.getElementById("themeSwitch") as HTMLInputElement;
  if (!cb) return;

  function setCookie(name: string, value: string, days: number) {
    const maxAge = days ? days * 24 * 60 * 60 : 0;
    let cookie = name + "=" + value + "; Path=/; SameSite=Lax";
    if (maxAge) cookie += "; Max-Age=" + maxAge;
    document.cookie = cookie;
  }

  function getCurrentTheme() {
    return document.documentElement.classList.contains("dark") ? "dark" : "light";
  }

  function apply(theme: string) {
    const dark = theme === "dark";
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = theme;
    cb.checked = dark;
  }

  cb.checked = getCurrentTheme() === "dark";

  cb.addEventListener("change", function () {
    const next = cb.checked ? "dark" : "light";
    apply(next);
    setCookie("theme", next, 365);
  });
})();

function initTooltips() {
  try {
    const w = window;
    if (w.bootstrap && w.bootstrap.Tooltip) {
      const list = document.querySelectorAll('[data-bs-toggle="tooltip"]');
      list.forEach((el) => {
        new w.bootstrap!.Tooltip(el, { container: "body" });
      });
    }
  } catch {
    /* ignore */
  }
}

// Clipboard Helper
window.copyToClipboard = function (el: HTMLElement, txt: string) {
  (async function () {
    try {
      await navigator.clipboard.writeText(txt);
      const prev = el.innerText;
      el.innerText = "Copied!";
      el.classList.remove("bg-primary");
      el.classList.add("bg-success");
      setTimeout(function () {
        el.innerText = prev;
        el.classList.remove("bg-success");
        el.classList.add("bg-primary");
      }, 1000);
    } catch {
      alert("Copy failed");
    }
  })();
};

// Modal Escape Key Handler
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape") {
    const fwNotesModal = document.getElementById("fwNotesModal");
    const bridgeInfoModal = document.getElementById("bridgeInfoModal");
    if (fwNotesModal && !fwNotesModal.classList.contains("d-none")) {
      closeModalById("fwNotesModal");
    }
    if (bridgeInfoModal && !bridgeInfoModal.classList.contains("d-none")) {
      closeModalById("bridgeInfoModal");
    }
  }
});

function closeModalById(id: string) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add("d-none");
    modal.setAttribute("aria-hidden", "true");
  }
}

if (netFwNotesBtnEl) {
  netFwNotesBtnEl.addEventListener("click", function () {
    if (!fwNotesModalEl || !fwNotesContentEl) return;
    const notes = getSelectedFwNotes();
    if (!notes) return;
    const marked = window.marked;
    if (/^https?:\/\/.*\.md$/i.test(notes.trim())) {
      fwNotesContentEl.innerHTML =
        '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Loading...';
      fetch(notes.trim())
        .then((r) => (r.ok ? r.text() : Promise.reject("Failed to load markdown")))
        .then((md) => {
          if (marked) {
            fwNotesContentEl.innerHTML = marked.parse(md);
          } else {
            fwNotesContentEl.textContent = md;
          }
        })
        .catch((err) => {
          fwNotesContentEl.innerHTML = '<div class="text-danger">Error loading markdown: ' + err + "</div>";
        });
    } else {
      if (marked) {
        fwNotesContentEl.innerHTML = marked.parse(notes);
      } else {
        fwNotesContentEl.textContent = notes;
      }
    }
    fwNotesModalEl.classList.remove("d-none");
    fwNotesModalEl.setAttribute("aria-hidden", "false");
  });
}

// Load marked.js if missing
if (!window.marked) {
  const script = document.createElement("script");
  script.src = "https://cdn.jsdelivr.net/npm/marked/marked.min.js";
  script.async = true;
  document.head.appendChild(script);
}

function openBridgeInfo() {
  if (!bridgeInfoModal) return;
  const hostEl = document.getElementById("bridgeHostInput") as HTMLInputElement;
  const portEl = document.getElementById("bridgePortInput") as HTMLInputElement;
  const host = hostEl && hostEl.value ? hostEl.value.trim() : localStorage.getItem("bridgeHost") || "127.0.0.1";
  const portStr = portEl && portEl.value ? portEl.value : localStorage.getItem("bridgePort") || "8765";
  let port = parseInt(portStr, 10);
  if (!port || port <= 0) port = 8765;
  const url = "http://" + host + ":" + port;
  const link = document.getElementById("bridgeLink") as HTMLAnchorElement;
  if (link) {
    link.href = url;
    link.textContent = url;
  }
  bridgeInfoModal.classList.remove("d-none");
  bridgeInfoModal.setAttribute("aria-hidden", "false");
}

export function log(msg: string, cls: "app" | "rx" | "tx" = "app") {
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
export function setBridgeStatus(ok: boolean) {
  if (!bridgeStatusIcon) return;
  bridgeStatusIcon.classList.toggle("text-success", ok);
  bridgeStatusIcon.classList.toggle("text-danger", !ok);
  bridgeStatusIcon.classList.remove("text-muted");
  bridgeStatusIcon.innerHTML = `<i class="bi ${ok ? "bi-check-circle-fill" : "bi-x-circle-fill"}"></i>`;
  bridgeStatusIcon.setAttribute("title", ok ? "Bridge reachable" : "Bridge error");
}

export function setBridgeLoading() {
  if (!bridgeStatusIcon) return;
  bridgeStatusIcon.classList.remove("text-success", "text-danger");
  bridgeStatusIcon.classList.add("text-muted");
  bridgeStatusIcon.innerHTML =
    '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';
  bridgeStatusIcon.setAttribute("title", "Checking bridge...");
}

export function deviceDetectBusy(busy: boolean) {
  if (!deviceDetectSpinner) return;
  deviceDetectSpinner.classList.toggle("d-none", !busy);
}

// Helper: enable/disable entire section by toggling pointer-events and aria-disabled
const setSectionDisabled = (el: HTMLElement | null, disabled: boolean) => {
  if (!el) return;
  el.classList.toggle("opacity-50", disabled);
  el.classList.toggle("pe-none", disabled);
  el.setAttribute("aria-disabled", String(disabled));
  // Additionally, disable all controls within to prevent focus via keyboard
  const ctrls = el.querySelectorAll<HTMLElement>(
    'button, input, select, textarea, fieldset, optgroup, option, details, [contenteditable="true"], [tabindex]',
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

export function updatePortInfo(baudrate?: number) {
  const anyActive = !!activeConnection;

  // Section disabling
  setSectionDisabled(serialSection, anyActive);
  setSectionDisabled(tcpSection, anyActive);
  setSectionDisabled(generalSection, anyActive);
  setSectionDisabled(familySection, anyActive);

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
      let br = 0;
      // let br = parseInt(bitrateInput.value, 10) || 115200;
      // if (getSelectedFamily() === "arduino") {
      if (baudrate) br = baudrate;
      // else br = parseInt(arduinoBootSelect.value, 10) || 115200;
      // }
      portInfoEl.value = `serial @ ${br}bps`;
    }
  }
}

export function updateConnectionUI() {
  const family = getSelectedFamily();
  if (family === "esp") {
    optErase.checked = false;
    optWrite.checked = false;
    optWrite.disabled = true;
    optVerify.checked = false;
    optVerify.disabled = true;
  }

  const anyActive = !!activeConnection;

  // Keep TCP settings panel hidden when a connection is active
  //if (tcpSettingsPanel) tcpSettingsPanel.classList.toggle("d-none", !tcpSettingsPanelVisible || anyActive);

  // Clear Device Info fields on disconnect
  if (!anyActive) {
    if (chipModelEl) chipModelEl.value = "";
    if (flashSizeEl) {
      flashSizeEl.value = "";
      flashSizeEl.classList.remove("border-warning", "bg-warning-subtle");
    }
    if (ieeeMacEl) ieeeMacEl.value = "";
    if (firmwareVersionEl) firmwareVersionEl.value = "";
    if (bootloaderVersionEl) bootloaderVersionEl.value = "";
    if (currentIeee) currentIeee.value = "";
    // clear local file
    if (localFile) localFile.value = "";
    // clear cloud fw selection
    if (netFwSelect) netFwSelect.value = "";
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
  if (ieeeSection) {
    ieeeSection.classList.toggle("opacity-50", !anyActive);
    ieeeSection.classList.toggle("pe-none", !anyActive);
  }
  // Cloud controls reflect connection state
  if (netFwSelect) netFwSelect.disabled = !anyActive;
  if (netFwRefreshBtn) netFwRefreshBtn.disabled = !anyActive;

  // Cause we have usb and tcp at the same time, we won't disable the rest of the controls
  // Disable certain controls when in Pin Mode
  // if (pinModeSelect?.checked) {
  //   implyGateToggle?.setAttribute("disabled", "true");
  //   invertLevel?.setAttribute("disabled", "true");

  //   if (implyGateToggle) implyGateToggle.checked = false;
  //   if (invertLevel) invertLevel.checked = false;
  // } else {
  //   if (!anyActive) {
  //     implyGateToggle?.removeAttribute("disabled");
  //     invertLevel?.removeAttribute("disabled");
  //   }
  // }
  // Disable Find Baud when no baud rate URL is selected
  // if (baudUrlSelect && baudUrlSelect.value == "none") {
  //   findBaudToggle?.setAttribute("disabled", "true");
  //   if (findBaudToggle) findBaudToggle.checked = false;
  // } else {
  //   if (!anyActive) {
  //     findBaudToggle?.removeAttribute("disabled");
  //   }
  // }
}
