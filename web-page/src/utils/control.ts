// Control configuration and helpers extracted from flasher.ts

import { log } from "../ui";
import { setLines } from "../flasher";
import { sleep } from "../utils/index";

export type ControlConfig = {
  pinMode?: boolean;
  bslValue?: string;
  rstValue?: string;
  baudValue?: string;
  invertLevel?: boolean;
};

export const CONTROL_PRESETS: Array<{
  name: string;
  test: (meta: { type?: string; protocol?: string }) => boolean;
  config: ControlConfig;
}> = [
  {
    name: "ZigStar/XZG HTTP",
    test: (m) => /^(zigstar_gw|zig_star_gw|uzg-01|xzg)$/i.test(m.type || ""),
    config: {
      pinMode: true,
      bslValue: "url:cmdZigBSL",
      rstValue: "url:cmdZigRST",
    },
  },
  {
    name: "TubesZB HTTP (ESPHome)",
    test: (m) => /^(tubeszb|tubes_zb)$/i.test(m.type || ""),
    config: {
      pinMode: false,
      bslValue: "url:switch/zBSL",
      rstValue: "url:switch/zRST_gpio",
    },
  },
  {
    name: "Local USB via Bridge",
    test: (m) => (m.type || "").toLowerCase() === "local" && (m.protocol || "").toLowerCase() === "usb",
    config: {
      pinMode: false,
      bslValue: "sp:dtr",
      rstValue: "sp:rts",
      baudValue: "bridge",
    },
  },
  {
    name: "Local Serial via Bridge",
    test: (m) => (m.type || "").toLowerCase() === "local" && (m.protocol || "").toLowerCase() === "serial",
    config: {
      pinMode: false,
      baudValue: "bridge",
    },
  },
];

export function deriveControlConfig(meta: { type?: string; protocol?: string }): ControlConfig {
  for (const p of CONTROL_PRESETS) {
    try {
      if (p.test(meta)) return p.config;
    } catch {
      // ignore
    }
  }
  return {};
}

export async function enterBootloader(implyGate: boolean) {
  log("Universal entry bootloader, implyGate=" + implyGate);

  // Assume standard scheme:
  // RTS controls RESET (Active Low - 0 resets)
  // DTR controls BOOT/GPIO (Active Low - 0 activates bootloader)

  // 1. Initial state: All released (High)
  // (RTS=1, DTR=1) -> (false, false) in await setLines logic, if false=High/Inactive
  // In await setLines: rstLevel=true -> RTS=1 (High), rstLevel=false -> RTS=0 (Low)
  // Usually: true = active level (Low for reset), false = inactive (High)
  // But let's check your await setLines logic.
  // In flasher.ts: log(`CTRL(tcp): setting RTS=${rst ? "1" : "0"} ...`)
  // Usually USB-UART adapters invert signals, but drivers operate with logical levels.

  // Let's try the classic sequence for "bare" UART (without auto-reset scheme like ESP):

  if (!implyGate) {
    // Step 0: Make sure everything is at high level (VCC), chip is running
    // RTS=0 (High/3.3V), DTR=0 (High/3.3V)
    await setLines(false, false);
    await sleep(300);

    // Step 1: Press RESET (RTS -> Low/GND)
    // Don't touch DTR yet (or keep High)
    // RTS=1 (Low/GND), DTR=0 (High/3.3V)
    await setLines(true, false);
    await sleep(300);

    // Step 2: Press BOOT (DTR -> Low/GND), while RESET is still pressed
    // RTS=1 (Low/GND), DTR=1 (Low/GND)
    await setLines(true, true);
    await sleep(300);

    // Step 3: Release RESET (RTS -> High/3.3V), but keep BOOT pressed!
    // Chip wakes up, sees pressed BOOT and enters bootloader.
    // RTS=0 (High/3.3V), DTR=1 (Low/GND)
    await setLines(false, true);
    await sleep(600); // Give time for bootloader to initialize

    // Step 4: Release BOOT (DTR -> High/3.3V)
    // RTS=0 (High/3.3V), DTR=0 (High/3.3V)
    await setLines(false, false);
    await sleep(300);
  }

  // Logic for scheme with two transistors:

  // Truth table for such scheme:
  // DTR=0, RTS=0 -> Idle (VCC, VCC)
  // DTR=0, RTS=1 -> Reset (VCC, GND) -> CHIP IN RESET
  // DTR=1, RTS=0 -> Boot  (GND, VCC) -> CHIP IN BOOT MODE
  // DTR=1, RTS=1 -> Idle  (VCC, VCC) -> Protection from simultaneous pressing
  if (implyGate) {
    // 1. Initial state (Idle)
    await setLines(false, false);
    await sleep(300);

    // 2. Press RESET (RTS=True, DTR=False)
    // Chip stops
    await setLines(true, false);
    await sleep(300);

    // 3. Switch to BOOT mode (RTS=False, DTR=True)
    // At this moment Reset is released (becomes High), and Boot is pressed to ground (Low).
    // Chip starts, sees low level on Boot pin and enters bootloader.
    await setLines(false, true);
    await sleep(600); // Give time for bootloader to initialize

    // 4. Release everything (Idle)
    // Boot pin returns to VCC
    await setLines(false, false);
    await sleep(300);
  }
  await sleep(1000);
}

export async function makeReset(implyGate: boolean) {
  log("Universal reset, implyGate=" + implyGate);

  if (!implyGate) {
    // Just pull Reset
    await setLines(false, false); // Release Reset
    await sleep(300);
    await setLines(true, false); // Press Reset
    await sleep(300);
    await setLines(false, false); // Release Reset
    await sleep(300);
  }

  if (implyGate) {
    // Simple reset for transistor scheme
    // 1. Idle
    await setLines(false, false);
    await sleep(300);

    // 2. Reset (RTS=True, DTR=False)
    await setLines(true, false);
    await sleep(300);

    // 3. Back to Idle
    await setLines(false, false);
    await sleep(300);
  }

  await sleep(1000);
}
