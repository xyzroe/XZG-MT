// Control configuration and helpers extracted from flasher.ts

export type ControlConfig = {
  pinMode: boolean;
  bslPath?: string;
  rstPath?: string;
  baudPath?: string;
  invertLevel?: boolean;
};

export const DEFAULT_CONTROL: ControlConfig = {
  pinMode: true,
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
      pinMode: true,
      bslPath: "http://{HOST}/cmdZigBSL",
      rstPath: "http://{HOST}/cmdZigRST",
      baudPath: "",
    },
  },
  {
    name: "TubesZB HTTP (ESPHome)",
    test: (m) => /^(tubeszb|tubes_zb)$/i.test(m.type || ""),
    config: {
      pinMode: false,
      bslPath: "http://{HOST}/switch/zBSL/{SET}",
      rstPath: "http://{HOST}/switch/zRST_gpio/{SET}",
      baudPath: "",
    },
  },
  {
    name: "Local USB via Bridge",
    test: (m) => (m.type || "").toLowerCase() === "local" && (m.protocol || "").toLowerCase() === "usb",
    config: {
      pinMode: false,
      bslPath: "http://{BRIDGE}/sc?port={PORT}&dtr={SET}",
      rstPath: "http://{BRIDGE}/sc?port={PORT}&rts={SET}",
      baudPath: "http://{BRIDGE}/sc?port={PORT}&baud={SET}",
    },
  },
  {
    name: "Local Serial via Bridge",
    test: (m) => (m.type || "").toLowerCase() === "local" && (m.protocol || "").toLowerCase() === "serial",
    config: {
      pinMode: false,
      baudPath: "http://{BRIDGE}/sc?port={PORT}&baud={SET}",
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
  return DEFAULT_CONTROL;
}
