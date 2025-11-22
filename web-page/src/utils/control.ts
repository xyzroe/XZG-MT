// Control configuration and helpers extracted from flasher.ts

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
