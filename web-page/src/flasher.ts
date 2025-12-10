// Imports

import { ESPLoader, Transport } from "esptool-js";

import { SerialPort as SerialWrap } from "./transport/serial";
import { TcpClient } from "./transport/tcp";

import { TiTools, TiChipFamily } from "./tools/ti";
import { SilabsTools } from "./tools/sl";
import { CCDebugger } from "./tools/cc-debugger";
import { CCLoader } from "./tools/cc-loader";
import { ArduinoTools } from "./tools/arduino";
import { parseImageFromBuffer, downloadFirmwareFromUrl, getSelectedFwNotes, refreshNetworkFirmwareList } from "./netfw";
import { sleep, toHex, bufToHex } from "./utils";
import { deriveControlConfig, ControlConfig } from "./utils/control";
import { httpGetWithFallback, saveToFile } from "./utils/http";
import { crc32 as computeCrc32 } from "./utils/crc";

import {
  pinModeSelect,
  bslUrlInput,
  rstUrlInput,
  baudUrlInput,
  invertLevel,
  bridgeHostInput,
  bridgePortInput,
  tcpLinksPanel,
  chooseSerialBtn,
  bitrateInput,
  chipModelEl,
  ieeeMacEl,
  flashSizeEl,
  disconnectBtn,
  hostInput,
  portInput,
  connectTcpBtn,
  netFwSelect,
  netFwNotesBtn,
  localFile,
  netFwRefreshBtn,
  btnNvRead,
  btnNvErase,
  currentIeee,
  btnIeeeRead,
  newIeee,
  btnIeeeWrite,
  enterBslBtn,
  resetBtn,
  pingBtn,
  getVersionBtn,
  firmwareVersionEl,
  bootloaderVersionEl,
  getModelBtn,
  btnNvWrite,
  btnFlash,
  bslUrlSelect,
  rstUrlSelect,
  baudUrlSelect,
  btnClearLog,
  logEl,
  showIoEl,
  btnCopyLog,
  connectDebuggerBtn,
  connectLoaderBtn,
  debuggerConnectWrap,
  loaderConnectWrap,
  debugModelEl,
  debugManufEl,
  debugSerialEl,
  debugFwVersionEl,
  targetIdEl,
  targetIeeeEl,
  debuggerDetectSpinner,
  resetDebugBtn,
  btnReadFlash,
  verifyMethodWrap,
  writeMethodWrap,
  mdnsRefreshBtn,
  mdnsSelect,
  btnAddEspFile,
  nvProgressEl,
  progressEl,
  optErase,
  optWrite,
  optVerify,
  flashWarning,
  autoBslToggle,
  implyGateToggle,
  findBaudToggle,
  espFilesContainer,
  updateUIForFamily,
  log,
  setBridgeStatus,
  setBridgeLoading,
  deviceDetectBusy,
  updateConnectionUI,
  debuggerOptionWrap,
  portInfoEl,
  forceWrite,
  arduinoBootSelect,
} from "./ui";

// Global state variables and UI elements
// --- Control strategy mapping ---
type CtrlMode = "zig-http" | "bridge-sc" | "serial-direct";
let currentConnMeta: { type?: string; protocol?: string } = {};

// CCDebugger instance for TI old family
let ccDebugger: CCDebugger | null = null;

// CCLoader instance for CC2530 via Arduino
let ccLoader: CCLoader | null = null;

// Arduino tools instance
let arduinoTools: ArduinoTools | null = null;

export let activeConnection: "serial" | "tcp" | null = null;
let esploader: ESPLoader | null = null;

let serial: SerialWrap | null = null;
let tcp: TcpClient | null = null;
let hexImage: { startAddress: number; data: Uint8Array } | null = null;
let sl_tools: SilabsTools | null = null;
let ti_tools: TiTools | null = null;
let detectedTiChipFamily: TiChipFamily | null = null;

chooseSerialBtn.addEventListener("click", async () => {
  if (activeConnection) {
    log("Error: a connection is already active");
    return;
  }
  try {
    if (!("serial" in navigator)) throw new Error("Web Serial not supported");
    const br = parseInt(bitrateInput.value, 10) || 115200;
    deviceDetectBusy(true);
    const chosen = await (navigator as any).serial.requestPort();
    if (!chosen) throw new Error("No port selected");
    const family = getSelectedFamily();
    if (family === "esp") {
      log("Port selected, initializing ESP transport...");
      const transport = new Transport(chosen);
      const terminal = {
        clean: () => {},
        writeLine: (data: string) => log(data),
        write: (data: string) => log(data),
      };
      esploader = new ESPLoader({ transport, baudrate: br, terminal, romBaudrate: br });
      log("Connecting to ESP...");

      const chipDesc = await esploader.main("default_reset");

      if (chipModelEl) chipModelEl.value = chipDesc || (esploader as any).chip.CHIP_NAME || "ESP Unknown";
      refreshNetworkFirmwareList(chipModelEl?.value).catch((e) =>
        log("Network FW list fetch failed: " + (e?.message || String(e)))
      );
      if (ieeeMacEl) {
        try {
          const mac = await (esploader as any).chip.readMac(esploader);
          if (mac) ieeeMacEl.value = mac.toUpperCase();
        } catch {
          // ignore
        }
      }
      if (flashSizeEl) {
        try {
          await (esploader as any).flashId();
          const flashIdVal = await (esploader as any).readFlashId();
          const flidLowbyte = (flashIdVal >> 16) & 0xff;
          let szStr = (esploader as any).DETECTED_FLASH_SIZES?.[flidLowbyte];
          if (!szStr) {
            if (flashIdVal === 0) {
              log("WARNING: Failed to communicate with the flash chip.");
            }
            log("Could not auto-detect Flash size. Defaulting to 4MB");
            szStr = "4MB";
            flashSizeEl.classList.add("border-warning", "bg-warning-subtle");
          }
          flashSizeEl.value = szStr;
        } catch (e: any) {
          log("Flash detection failed: " + (e?.message || String(e)));
          flashSizeEl.classList.add("border-warning", "bg-warning-subtle");
        }
      }

      activeConnection = "serial";
      updateConnectionUI();
      deviceDetectBusy(false);
      return;
    }

    if (family === "arduino") {
      log("Port selected, initializing Arduino connection...");
      const br = parseInt(arduinoBootSelect.value, 10) || 115200;
      log(`Opening serial port at ${br}bps...`);
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

      log("Serial port opened, connecting to Arduino bootloader...");

      // Give bootloader time to initialize after port open
      await sleep(250);

      // Create Arduino tools instance
      arduinoTools = new ArduinoTools(serial);
      arduinoTools.setLogger(log);
      arduinoTools.setProgressCallback((percent, msg) => {
        if (progressEl) {
          progressEl.style.width = `${percent}%`;
          progressEl.textContent = msg;
        }
      });
      arduinoTools.setSetLinesHandler((dtr, rts) => {
        if (serial) {
          serial.setSignals({ dataTerminalReady: dtr, requestToSend: rts });
        }
      });

      // Get board info
      try {
        const boardInfo = await arduinoTools.getBoardInfo();
        if (boardInfo) {
          if (chipModelEl) chipModelEl.value = boardInfo.chipName;
          // if (portInfoEl) portInfoEl.value = `Arduino @ ${br}bps`;

          // Set flash size
          if (flashSizeEl && boardInfo.flashSize) {
            const sizeKB = (boardInfo.flashSize / 1024).toFixed(0);
            flashSizeEl.value = `${sizeKB}KB (${boardInfo.flashSize} bytes)`;
          }

          // Set device ID (pseudo-serial number)
          if (ieeeMacEl && boardInfo.serialNumber) {
            ieeeMacEl.value = boardInfo.serialNumber;
          }

          // Set bootloader version
          if (bootloaderVersionEl && boardInfo.swMajor !== undefined && boardInfo.swMinor !== undefined) {
            bootloaderVersionEl.value = `${boardInfo.swMajor}.${boardInfo.swMinor}`;
          }

          log(`Arduino board connected: ${boardInfo.chipName}`);

          // Refresh network firmware list
          await refreshNetworkFirmwareList(chipModelEl?.value || "").catch((e) =>
            log("Network FW list fetch failed: " + (e?.message || String(e)))
          );
        } else {
          log("Warning: Could not read board information");
        }
      } catch (e: any) {
        log("Board detection error: " + (e?.message || String(e)));
      }

      activeConnection = "serial";
      updateConnectionUI();
      optErase.disabled = true;
      deviceDetectBusy(false);
      return;
    }

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

  // Reset protocol tools
  sl_tools = null;
  ti_tools = null;
  detectedTiChipFamily = null;
  arduinoTools = null;

  if (activeConnection === "serial") {
    try {
      if (esploader) {
        try {
          await (esploader as any).transport?.disconnect?.();
        } catch {
          // ignore
        }
        try {
          await (esploader as any).transport?.device?.close?.();
        } catch {
          // ignore
        }
        esploader = null;
      }
      await serial?.close();
    } catch {
      // ignore
    }
    serial = null;
    activeConnection = null;
    currentConnMeta = {};
    log("Serial disconnected");
  } else if (activeConnection === "tcp") {
    try {
      tcp?.close();
    } catch {
      // ignore
    }
    tcp = null;
    activeConnection = null;
    currentConnMeta = {};
    log("TCP disconnected");
  }
  hexImage = null;
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
    const wsBase = getBridgeBase("ws");
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
    const fillByte = getSelectedFamily() === "arduino" ? 0xff : 0x00;
    const img = await downloadFirmwareFromUrl(link, fillByte);
    hexImage = img;
    updateOptionsStateForFile(true);
    log(`Image loaded from network: ${img.data.length} bytes @ ${toHex(img.startAddress, 8)}`);
  } catch (e: any) {
    log("HEX download error: " + (e?.message || String(e)));
  }
});

localFile.addEventListener("change", async () => {
  const f = localFile.files?.[0];
  if (!f) {
    updateOptionsStateForFile(false);
    return;
  }
  try {
    log(`File selected: ${f.name} size=${f.size} bytes type=${f.type || "unknown"}`);
    // Read explicitly using slice to ensure full file read
    const buf = await f.slice(0, f.size).arrayBuffer();
    //log(`ArrayBuffer read: ${buf.byteLength} bytes`);
    // If lengths differ, fail early so we can debug
    if (buf.byteLength !== f.size) {
      log(`Warning: read length (${buf.byteLength}) != file.size (${f.size})`);
    }
    const fillByte = getSelectedFamily() === "arduino" ? 0xff : 0x00;
    const img = parseImageFromBuffer(new Uint8Array(buf), fillByte);
    hexImage = img;
    log(`Image loaded: ${f.name}, ${img.data.length} bytes, start ${toHex(img.startAddress, 8)}`);
    updateOptionsStateForFile(true);
  } catch (e: any) {
    log("File load error: " + (e?.message || String(e)));
  }
});

netFwRefreshBtn?.addEventListener("click", () => {
  const model = chipModelEl?.value || "";
  refreshNetworkFirmwareList(model);
});

// UI wiring for NVRAM
btnNvRead?.addEventListener("click", async () => {
  await withButtonStatus(btnNvRead!, async () => {
    try {
      const payload = await nvramReadAll();

      const jsonContent = JSON.stringify(payload, null, 2) + "\n";

      const filename = saveToFile(
        jsonContent,
        "application/json",
        "json",
        "NVRAM",
        chipModelEl?.value,
        ieeeMacEl?.value
      );

      log("NVRAM backup saved to " + filename);

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
      await nvramEraseAll();
      log("NVRAM erase done. Resetting...");
      try {
        await performReset();
      } catch {
        // ignore
      }
      nvProgress(100, "Done");
      return true;
    } catch (e: any) {
      log("NVRAM erase error: " + (e?.message || String(e)));
      nvProgressReset("Error");
      throw e;
    }
  });
});

enterBslBtn?.addEventListener("click", async () => {
  await withButtonStatus(enterBslBtn!, async () => {
    await enterBsl();
  });
});

resetBtn?.addEventListener("click", async () => {
  await withButtonStatus(resetBtn!, async () => {
    try {
      if (getSelectedFamily() === "ti_old") {
        if (ccDebugger) {
          await ccDebugger?.reset(false);
        } else if (ccLoader) {
          log("Reset not supported for CC Loader");
          return false;
        }
      } else {
        await performReset();
      }
    } catch (e: any) {
      log("Reset error: " + (e?.message || String(e)));
      return false;
    }
  });
});

pingBtn?.addEventListener("click", async () => {
  await withButtonStatus(pingBtn!, async () => {
    const family = getSelectedFamily();
    if (family === "esp") {
      log("Ping not supported for ESP");
      return;
    }
    if (family === "sl") {
      log("Ping is not supported for Silabs yet");
      throw new Error("Unsupported for Silabs");
    }
    if (!ti_tools) throw new Error("TiTools not initialized");
    log("Pinging application...");
    const ok = await ti_tools.pingApp();
    if (!ok) throw new Error("Ping failed");
    //else log("Pong");
  });
});

getVersionBtn?.addEventListener("click", async () => {
  await withButtonStatus(getVersionBtn!, async () => {
    log("Checking firmware version...");
    const family = getSelectedFamily();
    if (family === "esp") {
      log("ESP: Firmware version check not implemented");
    }
    if (family === "ti") {
      if (!ti_tools) throw new Error("TiTools not initialized");

      // Try Zigbee first
      const info = await ti_tools.getFwVersion().catch(() => null);
      if (info) {
        if (firmwareVersionEl) firmwareVersionEl.value = String(info.fwRev);
        log(`Zigbee FW version: ${info.fwRev}`);
        return;
      }

      // Fallback to OpenThread RCP (460800 baud)
      log("FW version request: timed out or no response");
      // TI with OpenThread RCP  support only 460800 baud
      if (detectedTiChipFamily !== "cc2538") {
        await changeBaud(460800);
        await performReset();
        await sleep(1000);
        const rcpInfo = await ti_tools.detectOpenThreadRcp().catch(() => null);
        if (rcpInfo) {
          if (firmwareVersionEl) firmwareVersionEl.value = rcpInfo.version;
          log(`OpenThread RCP version: ${rcpInfo.version}`);
          return;
        }
      }

      throw new Error("Version not available");
    }
    if (family === "sl") {
      if (!sl_tools) throw "SilabsTools not initialized"; //sl_tools = new SilabsTools(getActiveLink());
      const result = await sl_tools.probe(
        "auto",
        findBaudToggle?.checked ? "auto" : bitrateInput ? Number(bitrateInput.value) || 115200 : 115200,
        implyGateToggle?.checked ?? true
      );
      if (firmwareVersionEl) firmwareVersionEl.value = result.version;
      if (chipModelEl) chipModelEl.value = result.deviceModel ?? "EFR32MG21";
      await refreshNetworkFirmwareList(chipModelEl?.value || "").catch((e) =>
        log("Network FW list fetch failed: " + (e?.message || String(e)))
      );
    }
  });
});

// Get Model action: detect chip and memory without flashing
getModelBtn?.addEventListener("click", async () => {
  await withButtonStatus(getModelBtn!, async () => {
    if (getSelectedFamily() === "ti_old") {
      if (ccDebugger) {
        await ccDebugger?.refreshInfo();
      } else if (ccLoader) {
        await ccLoader?.getChipInfo();
      }
    } else {
      await readChipInfo();
    }
  });
});

btnNvWrite?.addEventListener("click", async () => {
  await withButtonStatus(btnNvWrite!, async () => {
    try {
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
            }, 10000);
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
      } catch {
        // ignore
      }
      nvProgress(100, "Done");
      return true;
    } catch (e: any) {
      log("NVRAM write error: " + (e?.message || String(e)));
      nvProgressReset("Error");
      throw e;
    }
  });
});

// UI wiring for IEEE secondary address
btnIeeeRead?.addEventListener("click", async () => {
  await withButtonStatus(btnIeeeRead!, async () => {
    try {
      const ieee = await ieeeReadSecondary();
      if (currentIeee) {
        currentIeee.value = ieee;
      }
      if (getSelectedFamily() === "ti") {
        log(`Secondary IEEE address: ${ieee}`);
      } else {
        log(`Primary IEEE address: ${ieee}`);
      }
      return true;
    } catch (e: any) {
      log("IEEE read error: " + (e?.message || String(e)));
      throw e;
    }
  });
});

btnIeeeWrite?.addEventListener("click", async () => {
  await withButtonStatus(btnIeeeWrite!, async () => {
    try {
      const addr = newIeee?.value?.trim();
      if (!addr) {
        const err = new Error("Please enter a new IEEE address");
        log(err.message);
        throw err;
      }
      await ieeeWriteSecondary(addr);
      if (getSelectedFamily() === "ti") {
        log(`Secondary IEEE address written: ${addr}`);
      } else {
        log(`Primary IEEE address written: ${addr}`);
      }
      log("Resetting device...");
      try {
        await performReset();
      } catch {
        // ignore reset errors
      }
      // Clear the new IEEE field after successful write
      if (newIeee) {
        newIeee.value = "";
      }
      return true;
    } catch (e: any) {
      log("IEEE write error: " + (e?.message || String(e)));
      throw e;
    }
  });
});

// Flash start button with status feedback
btnFlash.addEventListener("click", async () => {
  await withButtonStatus(btnFlash, async () => {
    const family = getSelectedFamily();
    // TI old family (CC253x) - use CC Debugger
    if (family === "ti_old") {
      flashWarning?.classList.remove("d-none");

      if (ccLoader) {
        // CC Loader (Arduino-based flasher for CC2530)
        await ccLoader?.flashAction();
      } else if (ccDebugger) {
        // CC Debugger (TI's official debugger)
        await ccDebugger?.flashAction();
      }

      setTimeout(() => flashWarning?.classList.add("d-none"), 500);

      return;
    } else if (family === "arduino") {
      // Arduino flashing
      if (!arduinoTools) throw new Error("ArduinoTools not initialized");

      // Check if firmware is loaded
      if (!hexImage) {
        throw new Error("No firmware loaded. Please select a firmware file first.");
      }

      flashWarning?.classList.remove("d-none");

      try {
        const firmware = hexImage.data;
        const pageSize = 128; // Standard page size for most Arduino boards

        // Give bootloader time to be ready
        await sleep(100);

        // Check write option
        if (optWrite.checked) {
          log(`Flashing ${firmware.length} bytes to Arduino...`);

          // Flash with optional verification
          await arduinoTools.flash(firmware, pageSize, optVerify.checked);

          //log("Flashing complete!");

          if (optVerify.checked) {
            log("Verification successful!");
          }
        } else if (optVerify.checked) {
          // Only verify without writing
          log("Verify-only mode: reading flash and comparing...");
          const readData = await arduinoTools.readFlash(0, firmware.length, pageSize);

          // Compare
          let errors = 0;
          for (let i = 0; i < firmware.length; i++) {
            if (readData[i] !== firmware[i]) {
              errors++;
              if (errors <= 10) {
                log(
                  `Verify error at 0x${i.toString(16)}: expected 0x${firmware[i]
                    .toString(16)
                    .padStart(2, "0")}, got 0x${readData[i].toString(16).padStart(2, "0")}`
                );
              }
            }
          }

          if (errors > 0) {
            throw new Error(`Verification failed: ${errors} byte(s) mismatch`);
          }

          log("Verification successful!");
        } else {
          throw new Error("Please enable Write or Verify option");
        }

        // Leave programming mode
        await sleep(100);

        await arduinoTools.resetArduino();
        // Device will reset automatically after leaving programming mode
      } catch (e: any) {
        log("Arduino flash error: " + (e?.message || String(e)));
        throw e;
      } finally {
        setTimeout(() => flashWarning?.classList.add("d-none"), 500);
      }

      return true;
    } else {
      try {
        await flash(detectedTiChipFamily);
        log("Flashing finished. Restarting device...");
        try {
          await performReset();
          log("Restart done");
        } catch (e: any) {
          log("Restart error: " + (e?.message || String(e)));
        }

        if (family == "esp") {
          // don't ping and version check for ESP
          return true;
        }

        if (family == "ti") {
          //log("Pinging device...");
          await sleep(1000);
          try {
            const ok = await pingWithBaudRetries();
            if (!ok) log("Ping: timed out or no response");
          } catch (e: any) {
            log("Ping error: " + (e?.message || String(e)));
          }
        }

        log("Checking firmware version...");
        if (family == "sl") {
          // After flash, re-read device info
          await sleep(1000);

          if (!sl_tools) throw "SilabsTools not initialized"; //sl_tools = new SilabsTools(getActiveLink());
          const result = await sl_tools.probe(
            "auto",
            findBaudToggle?.checked ? "auto" : bitrateInput ? Number(bitrateInput.value) || 115200 : 115200,
            implyGateToggle?.checked ?? true
          );
          if (firmwareVersionEl) firmwareVersionEl.value = result.version;
          if (chipModelEl) chipModelEl.value = result.deviceModel ?? "EFR32MG21";
          await refreshNetworkFirmwareList(chipModelEl?.value || "").catch((e) =>
            log("Network FW list fetch failed: " + (e?.message || String(e)))
          );
        }
        if (family == "ti") {
          // use local wrapper to log and update UI
          if (!ti_tools) throw new Error("TiTools not initialized");
          const info = await ti_tools.getFwVersion();
          if (info) {
            if (firmwareVersionEl) firmwareVersionEl.value = String(info.fwRev);
            log(`Zigbee FW version: ${info.fwRev}`);
          }
          if (!info) {
            log("FW version request: timed out or no response");
            if (detectedTiChipFamily !== "cc2538") {
              // TI with OpenThread RCP  support only 460800 baud
              await changeBaud(460800);
              await performReset();
              await sleep(1000);
              const rcpInfo = await ti_tools.detectOpenThreadRcp();
              if (rcpInfo) {
                if (firmwareVersionEl) firmwareVersionEl.value = rcpInfo.version;
                log(`OpenThread RCP version: ${rcpInfo.version}`);
              }
            }
          }
        }
        return true;
      } catch (e: any) {
        log("Flash error: " + (e?.message || String(e)));
        throw e;
      }
    }
  });
});

bslUrlSelect?.addEventListener("change", () => applySelectToInput(bslUrlSelect, bslUrlInput));
rstUrlSelect?.addEventListener("change", () => applySelectToInput(rstUrlSelect, rstUrlInput));
baudUrlSelect?.addEventListener("change", () => applySelectToInput(baudUrlSelect, baudUrlInput));

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

// CC Debugger event handlers
connectDebuggerBtn?.addEventListener("click", async () => {
  if (ccDebugger && ccDebugger["device"]) {
    // Disconnect
    try {
      await ccDebugger.disconnect();
      ccDebugger = null;
      if (connectDebuggerBtn) {
        connectDebuggerBtn.classList.replace("btn-danger", "btn-primary");
        connectDebuggerBtn.innerHTML = '<i class="bi bi-usb-plug-fill me-1"></i>Connect Debugger';
      }
      if (debugModelEl) debugModelEl.value = "";
      if (debugManufEl) debugManufEl.value = "";
      if (debugSerialEl) debugSerialEl.value = "";
      if (debugFwVersionEl) debugFwVersionEl.value = "";
      if (targetIdEl) targetIdEl.value = "";
      if (targetIeeeEl) targetIeeeEl.value = "";
      log("CC Debugger disconnected");
      activeConnection = null;
      hexImage = null;
      updateConnectionUI();
    } catch (e: any) {
      log("Disconnect error: " + (e?.message || String(e)));
    }
    loaderConnectWrap?.classList.remove("d-none");
  } else {
    // Connect
    debuggerDetectSpinner?.classList.remove("d-none");
    try {
      ccDebugger = new CCDebugger();
      ccDebugger.setLogger((msg: string) => log(msg));
      ccDebugger.setProgressCallback((percent: number, msg: string) => {
        fwProgress(percent, msg);
      });

      await ccDebugger.connect();

      if (connectDebuggerBtn) {
        connectDebuggerBtn.classList.replace("btn-primary", "btn-danger");
        connectDebuggerBtn.innerHTML = '<i class="bi bi-x-octagon-fill me-1"></i>Disconnect';
      }
      loaderConnectWrap?.classList.add("d-none");

      const info = await ccDebugger.getDeviceInfo();

      if (debugModelEl) debugModelEl.value = ccDebugger.device?.productName || "";
      if (debugManufEl) debugManufEl.value = ccDebugger.device?.manufacturerName || "";
      if (debugSerialEl) debugSerialEl.value = ccDebugger.device?.serialNumber || "";
      if (debugFwVersionEl)
        debugFwVersionEl.value = `v${(info.fwVersion >> 8).toString(16)}.${(info.fwVersion & 0xff)
          .toString(16)
          .toUpperCase()}`;

      // Read target info
      if (targetIdEl) targetIdEl.value = `CC${info.chipId.toString(16).toUpperCase()}`;

      const ieee = await ccDebugger.readIEEEAddress();
      if (targetIeeeEl) targetIeeeEl.value = ieee;

      log("CC Debugger connected successfully");

      activeConnection = "serial";
      updateConnectionUI();
    } catch (e: any) {
      log("Connection error: " + (e?.message || String(e)));
      ccDebugger = null;
    } finally {
      debuggerDetectSpinner?.classList.add("d-none");
    }
  }
});

// Read Flash button handler
btnReadFlash?.addEventListener("click", async () => {
  await withButtonStatus(btnReadFlash!, async () => {
    flashWarning?.classList.remove("d-none");
    if (ccLoader) {
      // Use Arduino-based CC Loader
      await ccLoader?.dumpFlash();
    } else if (ccDebugger) {
      // Use CC Debugger
      await ccDebugger?.dumpFlash();
    } else if (ti_tools) {
      await changeBaud(500000, 460800);

      await ti_tools?.dumpFlash();

      const originalBaudRate = parseInt(bitrateInput.value, 10) || 115200;
      await changeBaud(originalBaudRate);
    } else if (arduinoTools) {
      await arduinoTools?.dumpFlash();
    }

    setTimeout(() => flashWarning?.classList.add("d-none"), 500);

    return;
  });
});

// Reset button handler
resetDebugBtn?.addEventListener("click", async () => {
  await withButtonStatus(resetDebugBtn!, async () => {
    try {
      if (ccDebugger) {
        await ccDebugger?.reset(true);
      } else if (ccLoader) {
        log("Reset not supported for CC Loader");
        return false;
      }
    } catch (e: any) {
      log("Reset error: " + (e?.message || String(e)));
    }
  });
});

// CC Loader (Arduino-based) event handlers
connectLoaderBtn?.addEventListener("click", async () => {
  //console.log("Connect Loader button clicked");

  if (ccLoader) {
    // Disconnect
    //console.log("Disconnecting CC Loader");
    try {
      ccLoader.dispose();
      ccLoader = null;

      serial?.close();
      serial = null;
      if (connectLoaderBtn) {
        connectLoaderBtn.classList.replace("btn-danger", "btn-warning");
        connectLoaderBtn.innerHTML = '<i class="bi bi-usb-plug-fill me-1"></i>Connect Loader';
      }
      if (targetIdEl) targetIdEl.value = "";
      if (targetIeeeEl) targetIeeeEl.value = "";
      if (debugModelEl) debugModelEl.value = "";
      if (debugManufEl) debugManufEl.value = "";
      log("CC Loader disconnected");
      activeConnection = null;
      hexImage = null;
      updateConnectionUI();
    } catch (e: any) {
      log("Disconnect error: " + (e?.message || String(e)));
    }
    debuggerOptionWrap?.classList.remove("d-none");
    debuggerConnectWrap?.classList.remove("d-none");
    // connectDebuggerBtn?.classList.remove("d-none");
    optErase.disabled = false;
    resetBtn?.classList.remove("d-none");
    resetDebugBtn?.classList.remove("d-none");
  } else {
    debuggerDetectSpinner?.classList.remove("d-none");
    // Connect
    try {
      if (!("serial" in navigator)) throw new Error("Web Serial not supported");
      const br = 115200;
      const chosen = await (navigator as any).serial.requestPort();
      if (!chosen) throw new Error("No port selected");

      if (invertLevel) {
        invertLevel.checked = false;
      }

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
      const link = getActiveLink();
      if (!link) {
        throw new Error("No active connection. Please connect Serial or TCP first.");
      }

      ccLoader = new CCLoader(link);

      ccLoader.setLogger((msg: string) => log(msg));
      ccLoader.setProgressCallback((percent: number, msg: string) => {
        fwProgress(percent, msg);
      });
      ccLoader.setSetLinesHandler(setLines);

      if (connectLoaderBtn) {
        connectLoaderBtn.classList.replace("btn-warning", "btn-danger");
        connectLoaderBtn.innerHTML = '<i class="bi bi-x-octagon-fill me-1"></i>Disconnect Loader';
      }
      debuggerOptionWrap?.classList.add("d-none");
      debuggerConnectWrap?.classList.add("d-none");
      optErase.checked = true;
      optErase.disabled = true;
      resetBtn?.classList.add("d-none");
      resetDebugBtn?.classList.add("d-none");

      log("Waiting for Arduino loader to initialize...");
      // Set DTR/RTS lines (default to UNO: DTR=off, RTS=off)
      await ccLoader.resetCCLoader(0);

      await ccLoader.getChipInfo();

      activeConnection = "serial";
      updateConnectionUI();
    } catch (e: any) {
      log("CC Loader connection error: " + (e?.message || String(e)));
      if (ccLoader) {
        ccLoader.dispose();
        ccLoader = null;
      }
    } finally {
      debuggerDetectSpinner?.classList.add("d-none");
    }
  }
});

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
  applyControlConfig(deriveControlConfig(currentConnMeta));
  updateConnectionUI();
});

btnAddEspFile?.addEventListener("click", addEspFileRow);

function applyControlConfig(cfg: ControlConfig) {
  if (pinModeSelect && cfg.pinMode !== undefined) pinModeSelect.checked = cfg.pinMode;

  if (invertLevel && cfg.invertLevel !== undefined) invertLevel.checked = cfg.invertLevel;

  if (bslUrlSelect) {
    if (cfg.bslValue !== undefined) bslUrlSelect.value = cfg.bslValue;
    else {
      // if in bslUrlSelect options there is an option with name matching zb:boot, select it
      const zbBootOption = Array.from(bslUrlSelect.options).find((opt) => opt.text === "zb:boot");
      if (zbBootOption) bslUrlSelect.value = zbBootOption.value;
    }
    applySelectToInput(bslUrlSelect, bslUrlInput);
  }

  if (rstUrlSelect) {
    if (cfg.rstValue !== undefined) rstUrlSelect.value = cfg.rstValue;
    else {
      // if in rstUrlSelect options there is an option matching zb:reset, select it
      const zbResetOption = Array.from(rstUrlSelect.options).find((opt) => opt.text === "zb:reset");
      if (zbResetOption) rstUrlSelect.value = zbResetOption.value;
    }
    applySelectToInput(rstUrlSelect, rstUrlInput);
  }

  if (baudUrlSelect) {
    if (cfg.baudValue !== undefined) baudUrlSelect.value = cfg.baudValue;
    else baudUrlSelect.value = "none";
    applySelectToInput(baudUrlSelect, baudUrlInput);
  }
  saveCtrlSettings();
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

// --- Unified control URL builder/sender for BSL/RST endpoints ---
function buildCtrlUrl(template: string, setVal?: number): string {
  const base = getBridgeBase("http");
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

export function getSelectedFamily(): string {
  const { getSelectedFamilyValue } = require("./ui");
  return getSelectedFamilyValue();
}

// Bootstrap tooltip init moved to index.js

// Settings: store bridge host/port in localStorage
function getBridgeBase(base: string): string {
  const host = bridgeHostInput?.value?.trim() || localStorage.getItem("bridgeHost") || "127.0.0.1";
  const port = Number(bridgePortInput?.value || localStorage.getItem("bridgePort") || 8765) || 8765;
  return `${base}://${host}:${port}`;
}

export function saveBridgeSettings() {
  if (bridgeHostInput) localStorage.setItem("bridgeHost", bridgeHostInput.value.trim() || "127.0.0.1");
  if (bridgePortInput) localStorage.setItem("bridgePort", String(Number(bridgePortInput.value || 8765) || 8765));
}

// init from localStorage
if (bridgeHostInput) bridgeHostInput.value = localStorage.getItem("bridgeHost") || bridgeHostInput.value;
if (bridgePortInput) bridgePortInput.value = localStorage.getItem("bridgePort") || bridgePortInput.value;

// Auto-fill bridge host/port from current page URL when opened as http://HOST:PORT
// if no values are already stored in localStorage.
// This covers localhost and direct IP addresses.
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
} catch {
  // ignore any unexpected errors
}

// Initialize Pin/Mode and URLs from localStorage
function loadCtrlSettings() {
  try {
    const mode = localStorage.getItem("pinModeSelect");
    if (pinModeSelect && mode !== null) pinModeSelect.checked = mode === "1";

    if (bslUrlInput) bslUrlInput.value = localStorage.getItem("bslUrlInput") || bslUrlInput.value;
    if (rstUrlInput) rstUrlInput.value = localStorage.getItem("rstUrlInput") || rstUrlInput.value;
    if (baudUrlInput) baudUrlInput.value = localStorage.getItem("baudUrlInput") || baudUrlInput.value;

    const invertLevelValue = localStorage.getItem("invertLevel");
    if (invertLevel && invertLevelValue !== null) invertLevel.checked = invertLevelValue === "1";

    const implyGateValue = localStorage.getItem("implyGate");
    if (implyGateToggle && implyGateValue !== null) implyGateToggle.checked = implyGateValue === "1";

    const findBaudValue = localStorage.getItem("findBaud");
    if (findBaudToggle && findBaudValue !== null) findBaudToggle.checked = findBaudValue === "1";

    if (bitrateInput) bitrateInput.value = localStorage.getItem("bitrateInput") || bitrateInput.value;

    const savedFamily = localStorage.getItem("chip_family");
    if (savedFamily) {
      const { setSelectedFamilyValue } = require("./ui");
      const validFamily =
        savedFamily === "sl" || savedFamily === "esp" || savedFamily === "ti_old" || savedFamily === "arduino"
          ? savedFamily
          : "ti";
      setSelectedFamilyValue(validFamily);
      updateUIForFamily();
    }
  } catch {
    // ignore
  }
}

export function saveCtrlSettings() {
  try {
    if (pinModeSelect) localStorage.setItem("pinModeSelect", pinModeSelect.checked ? "1" : "0");
    if (bslUrlInput) localStorage.setItem("bslUrlInput", bslUrlInput.value.trim());
    if (rstUrlInput) localStorage.setItem("rstUrlInput", rstUrlInput.value.trim());
    if (baudUrlInput) localStorage.setItem("baudUrlInput", baudUrlInput.value.trim());
    if (invertLevel) localStorage.setItem("invertLevel", invertLevel.checked ? "1" : "0");
    if (implyGateToggle) localStorage.setItem("implyGate", implyGateToggle.checked ? "1" : "0");
    if (findBaudToggle) localStorage.setItem("findBaud", findBaudToggle.checked ? "1" : "0");
    if (bitrateInput) localStorage.setItem("bitrateInput", bitrateInput.value.trim());
    localStorage.setItem("chip_family", getSelectedFamily());
  } catch {
    // ignore
  }
}

loadCtrlSettings();

// When bridge settings change, auto-refresh mDNS list (debounced)
let bridgeRefreshTimer: number | null = null;
export function scheduleBridgeRefresh() {
  if (bridgeRefreshTimer) window.clearTimeout(bridgeRefreshTimer);
  bridgeRefreshTimer = window.setTimeout(() => {
    // optimistic: show spinner state by setting unknown (keep last icon) then attempt refresh
    refreshMdnsList();
  }, 300);
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

function updateOptionsStateForFile(selected: boolean) {
  const family = getSelectedFamily();
  if (!selected) {
    optWrite.checked = false;
    optWrite.disabled = true;
    if (family !== "esp") {
      optVerify.checked = false;
      optVerify.disabled = true;
    }
    if (verifyMethodWrap) verifyMethodWrap.disabled = true;
    if (writeMethodWrap) writeMethodWrap.disabled = true;
  } else {
    optWrite.checked = true;
    optWrite.disabled = false;
    if (family !== "esp") {
      optVerify.checked = true;
      optVerify.disabled = false;
    }
    if (verifyMethodWrap) verifyMethodWrap.disabled = false;
    if (writeMethodWrap) writeMethodWrap.disabled = false;
  }
}

function getActiveLink(): {
  write: (d: Uint8Array) => Promise<void>;
  onData: (cb: (d: Uint8Array) => void) => void;
  offData: (cb: (d: Uint8Array) => void) => void;
} {
  if (activeConnection === "serial" && serial)
    return {
      write: (d) => serial!.write(d),
      onData: (cb) => serial!.onData(cb),
      offData: (cb) => serial!.offData(cb),
    };
  if (activeConnection === "tcp" && tcp)
    return {
      write: (d: Uint8Array) => tcp!.write(d),
      onData: (cb: (d: Uint8Array) => void) => tcp!.onData(cb),
      offData: (cb: (d: Uint8Array) => void) => tcp!.offData(cb),
    } as any;
  throw new Error("No transport connected");
}

// Unified: enter BSL for current transport (optimized per concept)
async function enterBsl(): Promise<void> {
  const bslTpl = (bslUrlInput?.value || "").trim();
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
  }

  if (activeConnection === "tcp") {
    if (pinModeSelect?.checked) {
      log("Using remote pin mode to enter BSL");
      const hasSet = /\{SET\}/.test(bslTpl);
      await sendCtrlUrl(bslTpl, hasSet ? 1 : undefined);
      return;
    }
  }
  const family = getSelectedFamily();
  //log(`Using line sequences for family: ${family}`);
  // Use line sequences via direct serial or remote bridge pins
  if (family === "sl") {
    await sl_tools?.enterBootloader(implyGateToggle?.checked ?? false);
  }
  if (family === "ti") {
    await ti_tools?.enterBootloader(implyGateToggle?.checked ?? false);
  }

  if (family === "esp") {
    log("ESP: Use 'Connect' to enter bootloader automatically.");
  }
  // Remote pin mode ON: send single request(s) to BSL URL; if {SET} present, we may need specific level
  // For entering BSL we only need to trigger BSL endpoint once; if {SET} exists, set to 1

  return;
}

// Unified: reset to application for current transport (optimized per concept)
async function performReset(): Promise<void> {
  //const auto = !!autoBslToggle?.checked; // same toggle governs whether to use sequences
  //const remotePinMode = !!pinModeSelect?.checked;
  const rstTpl = (rstUrlInput?.value || "").trim();
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
  }

  if (activeConnection === "tcp") {
    if (pinModeSelect?.checked) {
      // Remote pin mode ON: send single request(s) to RST URL; if {SET} present, choose appropriate level
      const hasSet = /\{SET\}/.test(rstTpl);
      await sendCtrlUrl(rstTpl, hasSet ? 1 : undefined);

      return;
    }
  }
  const family = getSelectedFamily();
  //log(`Using line sequences for family: ${family}`);
  // Use line sequences via direct serial or remote bridge pins
  if (family === "ti") {
    await ti_tools?.reset(implyGateToggle?.checked ?? false);
  }
  if (family === "sl") {
    await sl_tools?.reset(implyGateToggle?.checked ?? false);
  }
  if (family === "esp") {
    if (!esploader) {
      log("ESP: Tools not initialized");
      return;
    }
    log("ESP: Resetting...");
    await (esploader as any).after("hard_reset");
  }
  if (family === "arduino") {
    if (!arduinoTools) {
      log("Arduino: Tools not initialized");
      return;
    }
    await arduinoTools.resetArduino();
  }
  // UNO: DTR=off, RTS=off

  return;
}

// Read chip information in BSL mode (no mode changes)
// showBusy controls whether to toggle the global device spinner inside this function.
// For the initial connect flow, we manage the spinner at a higher level and pass false here.
async function readChipInfo(showBusy: boolean = true): Promise<TiChipFamily | null> {
  let detectedFamily: TiChipFamily | null = null;
  try {
    if (showBusy) deviceDetectBusy(true);
    const family = getSelectedFamily();
    if (family === "ti") {
      if (!ti_tools) throw new Error("TiTools not initialized");
      const info = await ti_tools.readDeviceInfo();
      console.log("Device info:", info);
      if (info) {
        if (chipModelEl) chipModelEl.value = info.chipModel || "";
        if (flashSizeEl && info.flashSizeBytes)
          flashSizeEl.value = `${info.flashSizeBytes} bytes (${(info.flashSizeBytes / 1024).toFixed(2)} KB)`;
        if (ieeeMacEl && info.ieeeMac) ieeeMacEl.value = info.ieeeMac;
        await refreshNetworkFirmwareList(info.chipModel || "").catch((e) =>
          log("Network FW list fetch failed: " + (e?.message || String(e)))
        );
        if (info.family) detectedFamily = info.family;
      } else {
        log("Failed to read device info via TI BSL");
      }
    } else if (family === "sl") {
      detectedFamily = null;
      // Silabs stub path for now
      if (!sl_tools) throw "SilabsTools not initialized"; //sl_tools = new SilabsTools(getActiveLink());
      // Silabs bootloader requires 115200 baud
      await changeBaud(115200);
      const info = await sl_tools.getChipInfo();
      if (chipModelEl) chipModelEl.value = info.chipName;
      if (bootloaderVersionEl) bootloaderVersionEl.value = info.bootloaderVersion || "";
      refreshNetworkFirmwareList(info.chipName).catch((e) =>
        log("Network FW list fetch failed: " + (e?.message || String(e)))
      );
    } else if (family === "esp") {
      log("ESP: Chip info detected during connection");
    }
  } catch (e: any) {
    log("BSL sync or chip read failed: " + (e?.message || String(e)));
    throw e;
  } finally {
    if (showBusy) deviceDetectBusy(false);
  }
  detectedTiChipFamily = detectedFamily;
  return detectedFamily;
}

async function pingWithBaudRetries(baudCandidates: number[] = [115200, 460800, 230400]): Promise<boolean> {
  // Try a normal ping first
  const findBaud = !!findBaudToggle?.checked;
  if (!ti_tools) return false;
  try {
    log("Pinging application...");
    const ok0 = await ti_tools.pingApp();
    if (
      (findBaud && activeConnection === "serial") ||
      (findBaud && activeConnection === "tcp" && (baudUrlInput?.value ?? "").trim() !== "")
    ) {
      //log(baudUrlInput?.value || "NULL");
      // If findBaud is enabled, we need to check for baud rate changes
      if (ok0) return true;
    } else {
      // If findBaud is not enabled, we don't need to check for baud rate changes
      //log("Ping succeeded");
      return ok0;
    }
  } catch {
    // ignore
  }

  // Only attempt baud cycling for real serial connection
  //if (activeConnection !== "serial" || !serial) return false;

  const originalBaud = parseInt(bitrateInput.value, 10) || 115200;
  // ensure unique sorted list and make sure original baud is present
  const bauds = Array.from(new Set(baudCandidates.concat([originalBaud])));

  // If there's only one candidate (the original), nothing to try
  if (bauds.length <= 1) return false;

  const startIdx = bauds.indexOf(originalBaud);
  // start from the next baud after original and loop circularly until we come back
  let idx = (startIdx + 1) % bauds.length;

  for (; idx !== startIdx; idx = (idx + 1) % bauds.length) {
    const b = bauds[idx];

    await changeBaud(b);

    // give device/bridge a moment; perform a reset to let device re-sync at new baud
    await performReset();
    await sleep(1000);

    try {
      log("Pinging application...");
      const ok = await ti_tools.pingApp();
      if (ok) {
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

  await changeBaud(originalBaud);

  return false;
}

// Full connect sequence: enter BSL → read chip info → reset → read firmware version
async function runConnectSequence(): Promise<void> {
  // Spinner should run from port open until model+FW info are read
  deviceDetectBusy(true);
  try {
    // When using local-serial over TCP bridge, give the bridge a moment to accept TCP and open serial

    if (getCtrlMode() === "bridge-sc") {
      await sleep(250);
    }

    const family = getSelectedFamily();
    if (family === "ti") {
      // Initialize TiTools if needed
      if (!ti_tools) ti_tools = new TiTools(getActiveLink());
      ti_tools.setLogger((msg: string) => log(msg));
      ti_tools.setProgressCallback((percent: number, msg: string) => {
        fwProgress(percent, msg);
      });
      ti_tools.setSetLinesHandler(setLines);
    } else if (family === "sl") {
      // Silabs path: enter bootloader, read BL version, then reset back to app
      if (!sl_tools) sl_tools = new SilabsTools(getActiveLink());
      sl_tools.setLogger((msg: string) => log(msg));
      sl_tools.setProgressCallback((percent: number, msg: string) => {
        fwProgress(percent, msg);
      });
      sl_tools.setSetLinesHandler(setLines);
    }

    // Try to read chip model with automatic parameter switching on failure
    // Strategy: try different combinations of invertLevel and implyGate
    const originalInvertLevel = invertLevel?.checked ?? false;
    const originalImplyGate = implyGateToggle?.checked ?? false;

    const combinations = [
      // First try with current settings
      { invert: originalInvertLevel, implyGate: originalImplyGate },
      // Then try toggling invertLevel
      { invert: !originalInvertLevel, implyGate: originalImplyGate },
      // Then try toggling implyGate
      { invert: originalInvertLevel, implyGate: !originalImplyGate },
      // Finally try both toggled
      { invert: !originalInvertLevel, implyGate: !originalImplyGate },
    ];

    let chipReadSuccess = false;

    for (let i = 0; i < combinations.length; i++) {
      const combo = combinations[i];

      // Apply settings for this attempt
      if (invertLevel) invertLevel.checked = combo.invert;
      if (implyGateToggle) implyGateToggle.checked = combo.implyGate;

      if (i > 0) {
        log(`Retrying with invertLevel=${combo.invert}, implyGate=${combo.implyGate}`);
      }

      try {
        await enterBsl();
        await readChipInfo(false);

        // If we get here without error, success!
        chipReadSuccess = true;
        if (i > 0) {
          log(`Successfully read chip model with invertLevel=${combo.invert}, implyGate=${combo.implyGate}`);
          saveCtrlSettings(); // Save working settings
        }
        break;
      } catch (e: any) {
        log(`BSL/chip read error (attempt ${i + 1}/${combinations.length}): ${e?.message || String(e)}`);
        // Continue to next combination
      }
    }

    if (!chipReadSuccess) {
      // Restore original settings if all attempts failed
      if (invertLevel) invertLevel.checked = originalInvertLevel;
      if (implyGateToggle) implyGateToggle.checked = originalImplyGate;
      log("Failed to read chip model after all attempts. Check connection and settings.");
    }

    if (family == "ti") {
      await performReset().catch((e: any) => log("Reset failed: " + (e?.message || String(e))));
      await sleep(1000);
      try {
        const ok = await pingWithBaudRetries();
        if (!ok) {
          log("App ping: timed out or no response");
        } else {
          log("App ping: successful");
        }
      } catch {
        log("App ping skipped");
      }
      try {
        if (!ti_tools) throw new Error("TiTools not initialized");
        log("Checking firmware version...");
        const info = await ti_tools.getFwVersion();
        if (info) {
          if (firmwareVersionEl) firmwareVersionEl.value = String(info.fwRev);
          log(`Zigbee FW version: ${info.fwRev}`);
        }
        if (!info) {
          log("FW version request: timed out or no response");
          if (detectedTiChipFamily !== "cc2538") {
            // TI with OpenThread RCP  support only 460800 baud
            await changeBaud(460800);
            await performReset();
            await sleep(1000);
            const rcpInfo = await ti_tools.detectOpenThreadRcp();
            if (rcpInfo) {
              if (firmwareVersionEl) firmwareVersionEl.value = rcpInfo.version;
              log(`OpenThread RCP version: ${rcpInfo.version}`);
            }
          }
        }
      } catch {
        log("FW version check skipped");
      }
    } else if (family === "sl") {
      try {
        if (!sl_tools) throw "SilabsTools not initialized";
        const result = await sl_tools.probe(
          "auto",
          findBaudToggle?.checked ? "auto" : bitrateInput ? Number(bitrateInput.value) || 115200 : 115200,
          implyGateToggle?.checked ?? true
        );
        if (firmwareVersionEl) firmwareVersionEl.value = result.version;
        if (chipModelEl) chipModelEl.value = result.deviceModel ?? "EFR32MG21";
        await refreshNetworkFirmwareList(chipModelEl?.value || "").catch((e) =>
          log("Network FW list fetch failed: " + (e?.message || String(e)))
        );
      } catch (e: any) {
        log("Silabs probe failed: " + (e?.message || String(e)));
      }
    }
  } finally {
    deviceDetectBusy(false);
  }
}

// --- Firmware notes modal logic ---

async function flash(detectedTiFamily?: TiChipFamily | null) {
  // Show warning
  if (flashWarning) flashWarning.classList.remove("d-none");

  if (getSelectedFamily() === "esp") {
    if (optErase.checked) {
      await eraseEsp();
    }
    if (optWrite.checked) {
      await flashEsp();
    }

    if (flashWarning) {
      setTimeout(() => flashWarning?.classList.add("d-none"), 500);
      performReset().catch((e) => log("Reset failed: " + (e?.message || String(e))));
    }
    return;
  }

  if (!hexImage) throw new Error("Load HEX first");

  if (getSelectedFamily() === "ti") {
    // If possible to use high baud, switch to it before flashing
    await changeBaud(500000, 460800);
  }
  if (getSelectedFamily() === "sl") {
    // SL bootloader needs 115200 for flashing
    await changeBaud(115200);
  }
  // BSL packet length is 1 byte; with header+cmd, safe payload per packet is <= 248 bytes
  const userChunk = 248;
  const chunkSize = Math.max(16, Math.min(248, userChunk));
  const startAddr = hexImage.startAddress;
  const data = hexImage.data;

  const link = getActiveLink();
  const chipFamily = detectedTiFamily ?? detectedTiChipFamily;
  // Ensure BSL mode before flashing/verifying depending on transport
  try {
    await enterBsl();
    await sleep(500);
  } catch (e: any) {
    log("Enter BSL failed: " + (e?.message || String(e)));
  }

  // Branch for Silabs vs TI vs ESP

  if (getSelectedFamily() === "sl") {
    if (!sl_tools) throw "SilabsTools not initialized"; //sl_tools = new SilabsTools(getActiveLink());

    log(`Flashing Silabs firmware: ${data.length} bytes`);
    fwProgressReset("Flashing Silabs...");

    try {
      await sl_tools.flash(data);

      log("Silabs flash complete!");
      fwProgress(100, "Done");
      //wait 10 seconds, showing progress
      for (let i = 0; i <= 10; i++) {
        fwProgress(10 * (10 - i), `Resetting in ${10 - i}...`);
        await sleep(1000);
      }
    } catch (error: any) {
      log("Silabs flash error: " + (error?.message || String(error)));
      throw error;
    }
    setTimeout(() => flashWarning?.classList.add("d-none"), 500);
    return; // Exit early for Silabs path
  }

  // TI path continues below
  if (!ti_tools) throw new Error("TiTools not initialized");
  await ti_tools.sync();

  if (optErase.checked) {
    if (chipFamily === "cc26xx") {
      // Prefer bank erase; if it fails, erase sectors across the write range
      log("Erase...");
      fwProgress(50, `Erasing...`);
      try {
        await ti_tools.bankErase();
        log("Bank erase done");
        fwProgress(100, `Erase done`);
        await sleep(500);
      } catch {
        log("Bank erase not supported or failed, erasing sectors...");
        // Sector size heuristic: CC26xx page size 4KB; some variants 8KB. We can try 8KB if CRC verify later fails.
        const pageSize = 4096;
        const from = startAddr & ~(pageSize - 1);
        const to = (startAddr + data.length + pageSize - 1) & ~(pageSize - 1);
        for (let a = from; a < to; a += pageSize) {
          fwProgress(Math.min(100, Math.round(((a - from) / (to - from)) * 100)), `Erasing... ${toHex(a, 8)}`);
          try {
            await ti_tools.sectorErase(a);
          } catch {
            // ignore sector erase errors
          }
        }
        log("Sector erase done");
        fwProgress(100, `Erase done`);
        await sleep(500);
      }
    } else if (chipFamily === "cc2538") {
      log("Erase " + data.length + " bytes at " + toHex(startAddr, 8) + "...");
      fwProgress(50, `Erasing...`);
      await ti_tools.erase(startAddr, data.length);
      log("Erase done");
      fwProgress(100, `Erase done`);
      await sleep(500);
    }
  }

  if (optWrite.checked) {
    log(`Writing ${data.length} bytes @ ${toHex(startAddr, 8)}...`);
    // reset progress bar
    fwProgressReset("Writing...");
    //const ff = 0xff;
    const zero = 0x00;

    for (let off = 0; off < data.length; off += chunkSize) {
      const end = Math.min(off + chunkSize, data.length);
      const chunk = data.subarray(off, end);
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
        await ti_tools.downloadTo(startAddr + off, chunk);
      }
      const cur = off + chunk.length;
      const pct = Math.min(100, Math.round((cur / data.length) * 100));
      // Show relative progress (bytes written / total bytes)
      fwProgress(pct, `Writing ${cur} / ${data.length}`);
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
      if (chipFamily === "cc26xx") {
        const crcDev = await ti_tools.crc32Cc26xx(startAddr, data.length);
        // Create buffer representing actual device state after write (skipped 0x00 chunks remain as 0xFF)
        const deviceData = new Uint8Array(data.length);
        deviceData.fill(0xff); // Start with erased state (all 0xFF)
        const zero = 0x00;
        // Apply written chunks
        for (let off = 0; off < data.length; off += chunkSize) {
          const end = Math.min(off + chunkSize, data.length);
          const chunk = data.subarray(off, end);
          let skip = true;
          const firstByte = chunk[0];
          if (firstByte !== zero) {
            skip = false;
          } else {
            for (let i = 1; i < chunk.length; i++) {
              if (chunk[i] !== firstByte) {
                skip = false;
                break;
              }
            }
          }
          if (!skip) {
            deviceData.set(chunk, off);
          }
        }
        const crcLocal = computeCrc32(deviceData);
        log(`CRC32(dev)=0x${crcDev.toString(16).toUpperCase().padStart(8, "0")}`);
        log(`CRC32(loc)=0x${crcLocal.toString(16).toUpperCase().padStart(8, "0")}`);
        ok = crcDev === crcLocal;
      } else if (chipFamily === "cc2538") {
        // For CC2538 we use crc32 (command 0x27 with addr+size)
        const crcDev = await ti_tools.crc32(startAddr, data.length);
        // Create buffer representing actual device state after write (skipped 0x00 chunks remain as 0xFF)
        const deviceData = new Uint8Array(data.length);
        deviceData.fill(0xff); // Start with erased state (all 0xFF)
        const zero = 0x00;
        // Apply written chunks
        for (let off = 0; off < data.length; off += chunkSize) {
          const end = Math.min(off + chunkSize, data.length);
          const chunk = data.subarray(off, end);
          let skip = true;
          const firstByte = chunk[0];
          if (firstByte !== zero) {
            skip = false;
          } else {
            for (let i = 1; i < chunk.length; i++) {
              if (chunk[i] !== firstByte) {
                skip = false;
                break;
              }
            }
          }
          if (!skip) {
            deviceData.set(chunk, off);
          }
        }
        const crcLocal = computeCrc32(deviceData);
        log(`CRC32(dev)=0x${crcDev.toString(16).toUpperCase().padStart(8, "0")}`);
        log(`CRC32(loc)=0x${crcLocal.toString(16).toUpperCase().padStart(8, "0")}`);
        ok = crcDev === crcLocal;
      }
    } catch (e: any) {
      log(`Verify error: ${e?.message || String(e)}`);
    }
    log(ok ? "Verify OK" : "Verify FAILED");
  }

  // bump baud back to original that was set in ui
  const originalBaudRate = parseInt(bitrateInput.value, 10) || 115200;
  await changeBaud(originalBaudRate);

  setTimeout(() => flashWarning?.classList.add("d-none"), 500);
}

// ----------------- NVRAM helpers (delegated to ti_tools) -----------------
async function nvramReadAll(): Promise<any> {
  nvProgressSetColor("primary");
  // nvProgressReset("Reading...");
  await sleep(500);
  if (!ti_tools) throw new Error("TiTools not initialized");
  const payload = await ti_tools.nvramReadAll(nvProgress);
  // nvProgress(100, "Done");
  return payload;
}

async function nvramEraseAll(): Promise<void> {
  nvProgressSetColor("danger");
  // nvProgressReset("Erasing...");
  await sleep(500);
  if (!ti_tools) throw new Error("TiTools not initialized");
  await ti_tools.nvramEraseAll(nvProgress);
  // nvProgress(100, "Erase done");
}

async function nvramWriteAll(obj: any): Promise<void> {
  nvProgressSetColor("warning");
  // nvProgressReset("Writing...");
  await sleep(500);
  if (!ti_tools) throw new Error("TiTools not initialized");
  await ti_tools.nvramWriteAll(obj, (s: string) => log(s), nvProgress);
  // nvProgress(100, "Write done");
}

// IEEE secondary address functions
async function ieeeReadSecondary(): Promise<string> {
  const family = getSelectedFamily();

  if (family === "ti") {
    if (!ti_tools) throw new Error("TiTools not initialized");
    await enterBsl();
    await readChipInfo();
    if (!detectedTiChipFamily) throw new Error("Chip family not detected. Connect to device first.");

    // Read the secondary IEEE address from TI chip
    const ieeeBytes = await ti_tools.readSecondaryIeeeAddress(detectedTiChipFamily);

    // Format as colon-separated string
    const ieeeStr = Array.from(ieeeBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(":")
      .toUpperCase();

    return ieeeStr;
  } else if (family === "sl") {
    if (!sl_tools) throw new Error("SilabsTools not initialized");

    await performReset();
    await sleep(1000);

    // Ensure Silabs tool is ready
    // Read the secondary IEEE address from SiLabs chip
    const ieeeBytes = await sl_tools.readSecondaryIeeeAddress();

    // Format as colon-separated string (SiLabs EUI64 is little-endian, reverse for display)
    const ieeeStr = Array.from(ieeeBytes)
      .reverse()
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(":")
      .toUpperCase();

    return ieeeStr;
  } else {
    throw new Error("IEEE address read/write is only supported for TI and SiLabs chips");
  }
}

async function ieeeWriteSecondary(address: string): Promise<void> {
  const family = getSelectedFamily();

  if (family === "ti") {
    if (!ti_tools) throw new Error("TiTools not initialized");
    if (!detectedTiChipFamily) throw new Error("Chip family not detected. Connect to device first.");

    // Write the secondary IEEE address to TI chip
    await ti_tools.writeSecondaryIeeeAddress(address, detectedTiChipFamily);
  } else if (family === "sl") {
    if (!sl_tools) throw new Error("SilabsTools not initialized");

    // Parse the address string manually (supports colon/dash/hex formats)
    let addr = address.trim();
    let bytes: string[];

    if (addr.includes(":")) {
      bytes = addr.split(":");
    } else if (addr.includes("-")) {
      bytes = addr.split("-");
    } else {
      addr = addr.replace(/^0x/i, "");
      if (addr.length !== 16) {
        throw new Error("IEEE address hex string must be exactly 16 characters");
      }
      bytes = addr.match(/.{1,2}/g) || [];
    }

    if (bytes.length !== 8) {
      throw new Error("IEEE address must contain exactly 8 bytes");
    }

    const parsed = new Uint8Array(8);
    for (let i = 0; i < 8; i++) {
      const val = parseInt(bytes[i], 16);
      if (isNaN(val) || val < 0 || val > 255) {
        throw new Error(`Invalid byte value in IEEE address: ${bytes[i]}`);
      }
      parsed[i] = val;
    }

    // Reverse bytes for SiLabs (display is big-endian, chip expects little-endian)
    const reversedBytes = new Uint8Array(parsed).reverse();

    // Write the secondary IEEE address to SiLabs chip
    await sl_tools.writeSecondaryIeeeAddress(reversedBytes, forceWrite?.checked ?? false);
  } else {
    throw new Error("IEEE address read/write is only supported for TI and SiLabs chips");
  }
}

// DTR = BSL(FLASH), RTS = RESET; (active low);
// without NPN - rts=0 reset=0, dtr=0 bsl=0
// with NPN invert - rts=0 reset=1, dtr=0 bsl=1
const setLines = async (rstLevel: boolean, bslLevel: boolean) => {
  const rstLevelEff = invertLevel?.checked ? !rstLevel : rstLevel;
  const bslLevelEff = invertLevel?.checked ? !bslLevel : bslLevel;
  // just for simplicity
  const bsl = bslLevelEff;
  const rst = rstLevelEff;
  if (activeConnection === "serial") {
    // log(`CTRL(serial): RTS(RST)=${rst ? "1" : "0"} DTR(BSL)=${bsl ? "1" : "0"}`);
    const p: any = serial as any;
    if (!p || typeof p.setSignals !== "function") {
      // log("Warning: Web Serial setSignals() not supported in this browser; cannot toggle DTR/RTS");
      throw new Error("setSignals unsupported");
    }
    await p.setSignals({ dataTerminalReady: bsl, requestToSend: rst });
    return;
  }
  if (activeConnection === "tcp") {
    // TCP: send two single requests, one per pin, using absolute URLs from inputs
    const bslTpl = (bslUrlInput?.value || "").trim();
    const rstTpl = (rstUrlInput?.value || "").trim();

    const bslHasSet = /\{SET\}/.test(bslTpl);
    const rstHasSet = /\{SET\}/.test(rstTpl);

    const bridgeSelected = /\{BRIDGE\}/.test(bslTpl) && /\{BRIDGE\}/.test(rstTpl);
    // log(`CTRL(tcp): setting RTS=${rst ? "1" : "0"} BSL=${bsl ? "1" : "0"} `);
    //check if templates has same beginning before "&" - make one request if so
    if (bridgeSelected && bslHasSet && rstHasSet && bslTpl.split("&")[0] === rstTpl.split("&")[0]) {
      const combinedTpl = bslTpl.split("&")[0];
      const finalTplNoHttp = combinedTpl.replace(/^http:\/\//, "");

      const combinedSet = `rts=${rst ? "1" : "0"}&dtr=${bsl ? "1" : "0"}`;

      const fullUrl = finalTplNoHttp
        .replace("{BRIDGE}", getBridgeBase("http"))
        .replace("{PORT}", portInput.value || "");
      const endUrl = fullUrl + `&${combinedSet}`;

      // log(`  final URL with params: ${endUrl}`);

      // make link and send using httpGetWithFallback
      await httpGetWithFallback(endUrl).catch((e: any) => {
        log("send request failed: " + (e?.message || String(e)));
        sleep(1000);
      });
      return;
    }

    // log(`  using BSL template: ${bslTpl}`);
    // // await sendCtrlUrl(bslTpl, bslHasSet ? (bsl ? 1 : 0) : undefined);
    // log(`  using RST template: ${rstTpl}`);
    // // await sendCtrlUrl(rstTpl, rstHasSet ? (rst ? 1 : 0) : undefined);

    const bslVal = bslHasSet ? (bsl ? 1 : 0) : undefined;
    const rstVal = rstHasSet ? (rst ? 1 : 0) : undefined;

    const p1 = sendCtrlUrl(bslTpl, bslVal);
    const p2 = sendCtrlUrl(rstTpl, rstVal);

    await Promise.all([p1, p2]);
    return;
  }
};

export async function changeBaud(local: number, remote: number = local): Promise<void> {
  try {
    if (activeConnection === "serial") {
      await (serial as any)?.reopenWithBaudrate?.(local);
      log(`Serial: switched baud to ${local}`);
      if (portInfoEl) portInfoEl.value = `serial @ ${local}bps`;
    } else if (activeConnection === "tcp" && baudUrlInput?.value?.trim() !== "") {
      await changeBaudOverTcp(remote);
      log(`TCP: switched baud to ${remote}`);
    }
  } catch (e: any) {
    log("Serial: failed to switch baud " + (e?.message || String(e)));
  }
}

async function changeBaudOverTcp(baud: number): Promise<void> {
  if (activeConnection !== "tcp" || !tcp) throw new Error("No TCP connection");
  const tpl = (baudUrlInput?.value || "").trim();
  // const rstTpl = (rstUrlInput?.value || DEFAULT_CONTROL.rstPath).trim();
  const hasSet = /\{SET\}/.test(tpl);
  // const hasRstSet = /\{SET\}/.test(rstTpl);
  // log(`CTRL(tcp): changing baud -> ${baud} using template ${tpl}`);
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
    } catch {
      // ignore
    }
    const wsBase = getBridgeBase("ws");
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
  } else if (v.startsWith("url:")) {
    const idx = v.indexOf(":");
    const path = idx >= 0 ? v.substring(idx + 1) : v;
    input.value = `http://{HOST}/${path}`;
  }
  saveCtrlSettings();
}

// --- mDNS discovery via local bridge ---
async function refreshMdnsList() {
  if (!mdnsSelect) return;
  //check if page loader over http
  if (window.location.protocol === "https:") {
    console.warn("Secure page - no request to bridge");
    return;
  }
  setBridgeLoading();

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
    const base = getBridgeBase("http");
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
    // clean up options
    mdnsSelect.innerHTML = "";
    const def = document.createElement("option");
    def.value = "";
    def.textContent = "— No connection —";
    mdnsSelect.appendChild(def);
  }
}

// Populate control template selects (BSL / RST) from bridge /gl endpoint
async function refreshControlLists() {
  if (!bslUrlSelect || !rstUrlSelect) return;
  try {
    const base = getBridgeBase("http");
    const url = `${base}/gl`;
    let j: any = {};
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`gl http ${resp.status}`);
      j = await resp.json();
    } catch (e: any) {
      log("Control lists fetch failed: " + (e?.message || String(e)));
      // j remains {} — subsequent code will work with empty lists
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
          o.textContent = `${label}`;
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
          o.textContent = `${label}`;
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

      addControlTemplateOptgroups(sel, defaultSerial || null);
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
    } catch {
      // ignore
    }
  }
}
// Define control templates configuration
const controlTemplates = [
  {
    label: "XZG Firmware",
    options: [
      { value: "url:cmdZigBSL", text: "BSL mode" },
      { value: "url:cmdZigRST", text: "RST make" },
    ],
  },
  {
    label: "ESP Home",
    options: [
      { value: "url:switch/zBSL/{SET}", text: "BSL pin" },
      { value: "url:switch/zRST_gpio/{SET}", text: "RST pin" },
    ],
  },
  {
    label: "Tasmota",
    options: [
      { value: "url:cm?cmnd=Power1%20{SET}", text: "Relay 1" },
      { value: "url:cm?cmnd=Power2%20{SET}", text: "Relay 2" },
    ],
  },
  {
    label: "SLS",
    options: [
      { value: "url:zigbee/startbsl", text: "BSL mode" },
      { value: "url:zigbee/softreset", text: "RST make" },
    ],
  },
];

function addControlTemplateOptgroups(target: HTMLSelectElement, def: string | null) {
  controlTemplates.forEach((template) => {
    const optgroup = document.createElement("optgroup");
    optgroup.label = template.label;

    template.options.forEach((opt) => {
      const option = document.createElement("option");
      option.value = opt.value;
      option.textContent = opt.text;
      optgroup.appendChild(option);
    });

    target.appendChild(optgroup);
  });

  if (def) {
    try {
      target.value = def;
    } catch {
      // ignore
    }
  }
}

// --- ESP File Management ---

function createEspFileRow() {
  const row = document.createElement("div");
  row.className = "d-flex gap-2 mb-2 esp-file-row align-items-stretch";
  row.innerHTML = `
    <input type="text" class="form-control font-monospace esp-addr-input" placeholder="0x1000" style="width: 100px;" value="0x0">
    <input class="form-control esp-file-input flex-grow-1" type="file" accept=".bin" />
    <button class="btn btn-outline-danger remove-row" type="button"><i class="bi bi-x-circle"></i></button>
  `;
  row.querySelector(".remove-row")?.addEventListener("click", () => {
    row.remove();
    if (espFilesContainer) {
      // Ensure at least one row remains
      if (espFilesContainer.children.length === 0) {
        updateOptionsStateForFile(false);
        addEspFileRow();
      }
    }
  });
  row.querySelector(".esp-file-input")?.addEventListener("change", () => {
    // if no file selected, update options state
    // Check all ESP file rows for any selected files
    const allRows = document.querySelectorAll(".esp-file-row");
    let hasAnyFile = false;
    for (const r of Array.from(allRows)) {
      const fileInput = r.querySelector(".esp-file-input") as HTMLInputElement;
      if (fileInput?.files?.[0]) {
        hasAnyFile = true;
        break;
      }
    }
    updateOptionsStateForFile(hasAnyFile);
  });
  return row;
}

function addEspFileRow() {
  if (!espFilesContainer) return;
  espFilesContainer.appendChild(createEspFileRow());
}

// Add initial row if empty
if (espFilesContainer && espFilesContainer.children.length === 0) {
  addEspFileRow();
}

function readAsBinaryString(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result) {
        resolve(reader.result as string);
      } else {
        reject(new Error("Empty file"));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsBinaryString(file);
  });
}

async function eraseEsp() {
  if (!esploader) throw new Error("ESP loader not initialized");
  //log("Erasing ESP flash (this may take a while)...");
  fwProgress(50, "Erasing ESP...");

  try {
    await (esploader as any).eraseFlash();
    log("ESP Erase complete!");
    fwProgress(100, "Erase Done");
    await sleep(500);
  } catch (e: any) {
    log("ESP Erase error: " + (e?.message || String(e)));
    throw e;
  }
}

async function flashEsp() {
  if (!esploader) throw new Error("ESP loader not initialized");

  const fileArray: { data: string; address: number }[] = [];

  // Check if cloud firmware is selected
  if (netFwSelect && netFwSelect.value && hexImage) {
    log(`Using pre-loaded firmware image...`);
    let binary = "";
    const bytes = hexImage.data;
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    fileArray.push({ data: binary, address: 0x0000 });
  }

  // If no cloud firmware, check local files
  if (fileArray.length === 0) {
    const rows = document.querySelectorAll(".esp-file-row");
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const addrInput = row.querySelector(".esp-addr-input") as HTMLInputElement;
      const fileInput = row.querySelector(".esp-file-input") as HTMLInputElement;

      const file = fileInput.files?.[0];
      if (!file) continue; // Skip empty rows

      let addrStr = addrInput.value.trim();
      if (!addrStr) addrStr = "0x0";
      const addr = parseInt(addrStr, 16);
      if (isNaN(addr)) throw new Error(`Invalid address: ${addrStr}`);

      log(`Reading ${file.name} for address 0x${addr.toString(16)}...`);
      const data = await readAsBinaryString(file);
      fileArray.push({ data, address: addr });
    }
  }

  if (fileArray.length === 0) throw new Error("No files selected for flashing");

  log(`Flashing ${fileArray.length} files...`);
  fwProgressReset("Flashing ESP...");

  const flashOptions = {
    fileArray,
    flashSize: "keep",
    flashMode: "keep",
    flashFreq: "keep",
    eraseAll: false,
    compress: true,
    reportProgress: (fileIndex: number, written: number, total: number) => {
      const pct = Math.round((written / total) * 100);
      fwProgress(pct, `File ${fileIndex + 1}/${fileArray.length}: ${written}/${total}`);
    },
  } as any;

  await esploader.writeFlash(flashOptions);
  log("ESP Flash complete!");
  fwProgress(100, "Done");
}

// On load

// Initial UI update
updateUIForFamily();

// Initialize options state on load
updateOptionsStateForFile(false);

// Update connection UI on load
updateConnectionUI();

// auto-refresh list on load (non-blocking)
refreshMdnsList().catch(() => {});
