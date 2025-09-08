// Control configuration and helpers extracted from flasher.ts

export type ControlConfig = { remote: boolean; bslPath: string; rstPath: string; baudPath: string };

export const DEFAULT_CONTROL: ControlConfig = {
  remote: true,
  bslPath: "",
  rstPath: "",
  baudPath: "",
};

export const CONTROL_PRESETS: Array<{
  name: string;
  test: (meta: { type?: string; protocol?: string }) => boolean;
  config: ControlConfig;
}> = [
  {
    name: "ZigStar/UZG HTTP",
    test: (m) => /^(zigstar_gw|zig_star_gw|uzg-01|xzg)$/i.test(m.type || ""),
    config: {
      remote: true,
      bslPath: "http://{HOST}/cmdZigBSL",
      rstPath: "http://{HOST}/cmdZigRST",
      baudPath: "",
    },
  },
  {
    name: "TubesZB HTTP (ESPHome)",
    test: (m) => /^(tubeszb|tubes_zb)$/i.test(m.type || ""),
    config: {
      remote: false,
      bslPath: "http://{HOST}/switch/zBSL/{SET}",
      rstPath: "http://{HOST}/switch/zRST_gpio/{SET}",
      baudPath: "",
    },
  },
  {
    name: "Local USB via Bridge",
    test: (m) => (m.type || "").toLowerCase() === "local" && (m.protocol || "").toLowerCase() === "usb",
    config: {
      remote: false,
      bslPath: "http://{BRIDGE}/sc?port={PORT}&rts={SET}",
      rstPath: "http://{BRIDGE}/sc?port={PORT}&dtr={SET}",
      baudPath: "http://{BRIDGE}/sc?port={PORT}&baud={SET}",
    },
  },
  {
    name: "Local Serial via Bridge",
    test: (m) => (m.type || "").toLowerCase() === "local" && (m.protocol || "").toLowerCase() === "serial",
    config: {
      remote: false,
      bslPath: "",
      rstPath: "",
      baudPath: "http://{BRIDGE}/sc?port={PORT}&baud={SET}",
    },
  },
];

export function deriveControlConfig(meta: { type?: string; protocol?: string }): ControlConfig {
  for (const p of CONTROL_PRESETS) {
    try {
      if (p.test(meta)) return p.config;
    } catch {}
  }
  return DEFAULT_CONTROL;
}

// Helpers to compute DTR/RTS from desired RST/BSL low levels and optional swap
export function computeDtrRts(rstLow: boolean, bslLow: boolean, assumeSwap: boolean): { dtr: boolean; rts: boolean } {
  let dtr: boolean, rts: boolean;
  if (!assumeSwap) {
    // RST=DTR, BSL=RTS (preserve existing inversion semantics)
    dtr = !rstLow;
    rts = !bslLow;
  } else {
    dtr = !bslLow;
    rts = !rstLow;
  }
  return { dtr, rts };
}
