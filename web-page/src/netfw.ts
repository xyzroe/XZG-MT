import { parseIntelHex } from "./utils/intelhex";

import { netFwSelect, chipModelEl, log, bootloaderVersionEl } from "./ui";
import { getSelectedFamily } from "./flasher";

interface ZwFirmwareInfo {
  file: string;
  ver: number | string;
  link: string;
  notes?: string;
  signed?: boolean;
  baud?: number | string;
  board?: string;
}

interface EspFirmwareInfo {
  filename: string;
  url: string;
  board: string;
  chip: string;
  pins: Record<string, string>;
}

type TiCategory = Record<string, Record<string, ZwFirmwareInfo>>;
type SlCategory = Record<string, Record<string, Record<string, ZwFirmwareInfo>>>;

export let netFwItems: Array<{
  key: string;
  link: string;
  ver: number | string;
  notes?: string;
  label: string;
  category: string;
  board?: string;
}> | null = null;
export let netFwCache: TiZwManifest | SlZwManifest | EspManifest | null = null;
let netFwCacheFamily: string | null = null;

interface TiZwManifest {
  router?: TiCategory;
  coordinator?: TiCategory;
  thread?: TiCategory;
  [key: string]: TiCategory | undefined;
}

interface SlZwManifest {
  zigbee_ncp?: SlCategory;
  zb_router?: SlCategory;
  multipan?: SlCategory;
  openthread_rcp?: SlCategory;
  [key: string]: SlCategory | undefined;
}

interface EspManifest {
  firmwares: EspFirmwareInfo[];
}

export async function fetchManifest(): Promise<TiZwManifest | SlZwManifest | EspManifest> {
  const family = getSelectedFamily();
  if (family === "esp") {
    const urls = ["https://raw.githubusercontent.com/xyzroe/XZG-MT/refs/heads/cc_loader/bins/manifest.json"];
    const combined: EspManifest = { firmwares: [] };
    for (const url of urls) {
      try {
        const resp = await fetch(url, { cache: "no-cache" });
        if (!resp.ok) continue;
        const j = (await resp.json()) as EspManifest;
        if (j.firmwares) {
          combined.firmwares.push(...j.firmwares);
        }
      } catch (e) {
        console.error(`Failed to fetch manifest from ${url}`, e);
      }
    }
    return combined;
  }

  const url = `https://raw.githubusercontent.com/xyzroe/XZG-MT/fw_files/${family}/manifest.json`;
  const resp = await fetch(url, { cache: "no-cache" });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  if (family === "sl") {
    const j = (await resp.json()) as SlZwManifest;
    return j;
  }
  if (family === "ti") {
    const j = (await resp.json()) as TiZwManifest;
    return j;
  }
  throw new Error(`Unsupported family: ${family}`);
}

export function filterFwByChip(man: TiZwManifest, chip: string) {
  const categories = ["router", "coordinator", "thread"] as const;
  const chipMap: Record<string, string> = {
    CC2652P2_launchpad: "CC2652P2_launchpad",
    CC2652P2_other: "CC2652P2_other",
    CC2652P7: "CC2652P7",
    CC1352P7: "CC2652P7",
    CC2652RB: "CC2652RB",
    CC2538: "CC2538",
  };
  const deviceName = chipMap[chip] || chip;
  const result: Record<string, ZwFirmwareInfo[]> = {};
  for (const cat of categories) {
    const catObj = man[cat];
    if (!catObj) continue;
    for (const sub of Object.keys(catObj)) {
      if (!sub.startsWith(deviceName)) continue;
      const files = catObj[sub];
      for (const fname of Object.keys(files)) {
        const fi = files[fname];
        (result[cat] ||= []).push({
          file: fname,
          ver: fi.ver,
          link: fi.link,
          notes: fi.notes,
          baud: fi.baud,
          signed: fi.signed,
        });
      }
    }
    if (result[cat]) result[cat]!.sort((a, b) => getVerNum(b.ver) - getVerNum(a.ver));
  }
  return result;
}

export function filterFwByChipSL(man: SlZwManifest, chip: string) {
  const categories = ["zigbee_ncp", "zb_router", "multipan", "openthread_rcp"] as const;

  const chipMap: Record<string, string> = {
    EFR32MG21: "EFR32MG21",
  };
  const deviceName = chipMap[chip] || chip;
  const result: Record<string, ZwFirmwareInfo[]> = {};
  for (const cat of categories) {
    const catObj = man[cat];
    if (!catObj) continue;
    for (const sub of Object.keys(catObj)) {
      if (!sub.startsWith(deviceName)) continue;
      const boards = catObj[sub];
      for (const boardName of Object.keys(boards)) {
        const files = boards[boardName];
        for (const fname of Object.keys(files)) {
          const fi = files[fname];
          (result[cat] ||= []).push({
            file: fname,
            ver: fi.ver,
            link: fi.link,
            notes: fi.notes,
            baud: fi.baud,
            board: boardName,
            signed: fi.signed,
          });
        }
      }
    }
    // Sort by semantic version (newest first)
    if (result[cat]) result[cat]!.sort((a, b) => compareSemanticVersions(b.ver, a.ver));
  }
  return result;
}

export function filterFwByChipESP(man: EspManifest, chip: string) {
  const chipMap: Array<{ pattern: string; target: string }> = [
    { pattern: "ESP8266EX", target: "ESP8266" },
    { pattern: "ESP32-C6*", target: "ESP32-C6" },
    { pattern: "ESP32-S3*", target: "ESP32-S3" },
    { pattern: "ESP32-C3*", target: "ESP32-C3" },
    { pattern: "ESP32-*", target: "ESP32" },
  ];

  let deviceName = chip;
  for (const { pattern, target } of chipMap) {
    if (pattern.endsWith("*")) {
      const prefix = pattern.slice(0, -1);
      if (chip.startsWith(prefix)) {
        deviceName = target;
        break;
      }
    } else {
      if (chip === pattern) {
        deviceName = target;
        break;
      }
    }
  }

  const result: Record<string, ZwFirmwareInfo[]> = {};
  if (man.firmwares) {
    for (const fw of man.firmwares) {
      if (deviceName && fw.chip !== deviceName) continue;
      let notes =
        "This firmware transforms your ESP device into a **CCLoader** programmer, allowing you to flash CC253x chips.\n\n";

      notes += `**🧩 Chip Family:** ${fw.chip}\n\n`;
      notes += `**🛹 Board:** ${fw.board}\n\n`;
      notes += `**📄 File:** \`${fw.filename}\`\n\n\n`;

      notes +=
        "⚠️ Only boards with **CH340** or **CP2102** USB-TTL converters are supported. Boards with other converters or native USB connections will **not** work.\n\n";

      notes += "📍 Pin Configuration\n\n";
      notes +=
        "| Function &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; | GPIO Pin &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; |\n";
      notes += "| :--- | :--- |\n";

      if (fw.pins) {
        const pinEmojis: Record<string, string> = {
          dd: "💾", // Data
          dc: "⏱️", // Clock
          reset: "🔄", // Reset
          led: "💡", // LED
        };
        for (const [k, v] of Object.entries(fw.pins)) {
          const emoji = pinEmojis[k.toLowerCase()] || "🔧";
          notes += `| ${emoji} ${k.toUpperCase()} | \`${v.toUpperCase()}\` |\n`;
        }
      }
      (result["ccloader"] ||= []).push({
        file: fw.filename,
        ver: 0,
        link: fw.url,
        notes: notes,
        board: fw.board,
      });
    }
  }
  return result;
}

// Helper to extract date/number for sorting (TI firmwares with YYYYMMDD dates)
const getVerNum = (v: string | number) => {
  const s = String(v);
  const m = s.match(/(20\d{6})/); // Match YYYYMMDD (e.g. 20221102)
  if (m) return parseInt(m[1], 10);
  // Fallback: try to parse just digits
  const n = parseInt(s.replace(/\D/g, ""), 10);
  return isNaN(n) ? 0 : n;
};

// Helper to compare semantic versions like "6.10.7.3" or "7.5.4"
// Returns: >0 if a > b, <0 if a < b, 0 if equal
const compareSemanticVersions = (a: string | number, b: string | number): number => {
  const parseVersion = (v: string | number): number[] => {
    const s = String(v);
    // Extract version numbers (e.g., "6.10.7.3" -> [6, 10, 7, 3])
    const parts = s.split(".").map((p) => parseInt(p, 10) || 0);
    return parts;
  };

  const pa = parseVersion(a);
  const pb = parseVersion(b);
  const maxLen = Math.max(pa.length, pb.length);

  for (let i = 0; i < maxLen; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na !== nb) return na - nb;
  }
  return 0;
};

export function isLikelyIntelHexPreview(txt: string): boolean {
  const lines = txt.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return false;
  let checked = 0;
  for (const l of lines) {
    if (checked++ > 8) break;
    if (!l.startsWith(":")) return false;
  }
  return true;
}

export function parseImageFromBuffer(bytes: Uint8Array): { startAddress: number; data: Uint8Array } {
  const previewLen = Math.min(4096, bytes.length);
  const preview = new TextDecoder().decode(bytes.subarray(0, previewLen));
  if (isLikelyIntelHexPreview(preview)) {
    const fullText = new TextDecoder().decode(bytes);
    return parseIntelHex(fullText);
  }
  return { startAddress: 0x00000000, data: bytes };
}

export async function downloadFirmwareFromUrl(url: string): Promise<{ startAddress: number; data: Uint8Array }> {
  const resp = await fetch(url, { cache: "no-cache" });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const buf = await resp.arrayBuffer();
  return parseImageFromBuffer(new Uint8Array(buf));
}

export function getSelectedFwNotes() {
  if (!netFwSelect || !netFwItems) return;
  const opt = netFwSelect.selectedOptions[0];
  if (!opt || !opt.value) return;
  const item = netFwItems.find(function (it) {
    return it.key === opt.value;
  });
  return item && item.notes;
}

function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(".").map(Number);
  const pb = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

export async function refreshNetworkFirmwareList(chipModel?: string) {
  if (!netFwSelect) return;
  const chip = chipModel || chipModelEl?.value || "";
  netFwSelect.innerHTML = "";
  const def = document.createElement("option");
  def.value = "";
  def.textContent = chip ? `— Firmware for ${chip} —` : "— Detect device first —";
  netFwSelect.appendChild(def);
  if (!chip) return;

  try {
    const family = getSelectedFamily();
    if (netFwCacheFamily !== family) {
      netFwCache = null;
    }
    const man = netFwCache || (netFwCache = await fetchManifest());
    netFwCacheFamily = family;

    console.log("Fetched manifest:", man);
    let filtered: Record<string, ZwFirmwareInfo[]>;
    let categories: string[] = [];

    if (family === "sl") {
      filtered = filterFwByChipSL(man as SlZwManifest, chip);
      categories = ["zigbee_ncp", "zb_router", "multipan", "openthread_rcp"];

      const blVerStr = bootloaderVersionEl?.value?.trim();
      if (blVerStr) {
        const threshold = "1.9.2";
        const isOld = compareVersions(blVerStr, threshold) < 0;
        for (const cat of categories) {
          if (filtered[cat]) {
            filtered[cat] = filtered[cat]!.filter((fw) => {
              if (isOld) return fw.signed === true;
              return fw.signed !== true;
            });
          }
        }
      }
    } else if (family === "ti") {
      filtered = filterFwByChip(man as TiZwManifest, chip);
      categories = ["coordinator", "router", "thread"];
    } else if (family === "esp") {
      filtered = filterFwByChipESP(man as EspManifest, chip);
      categories = ["ccloader"];
    } else {
      return;
    }

    const items: Array<{
      key: string;
      link: string;
      ver: number | string;
      notes?: string;
      label: string;
      category: string;
      board?: string;
    }> = [];

    for (const category of categories) {
      const list = filtered[category];
      if (!list) continue;

      // Ensure sorted by version descending (newest first) within the category
      list.sort((a, b) => getVerNum(b.ver) - getVerNum(a.ver));

      for (const it of list) {
        const key = `${category}|${it.file}`;
        let label = "";
        if (family === "sl") {
          let typeStr = "UNK";
          if (category === "zigbee_ncp") typeStr = "NCP";
          else if (category === "zb_router") typeStr = "Router";
          else if (category === "multipan") typeStr = "MultiPAN";
          else if (category === "openthread_rcp") typeStr = "RCP";
          label = `[${typeStr}] ${it.ver} — ${it.file}`;
        } else if (family === "esp") {
          label = `${it.board} — ${it.file}`;
        } else {
          label = `${it.ver} — ${it.file}`;
        }

        items.push({
          key,
          link: it.link,
          ver: it.ver,
          notes: it.notes,
          label,
          category,
          board: it.board,
        });
      }
    }

    netFwItems = items;

    window.netFwItems = netFwItems;
    window.netFwSelect = netFwSelect;

    if (family === "sl") {
      // Group by board only, type shown in brackets at start of each option
      const groups: Record<string, typeof items> = {};
      for (const it of items) {
        const b = it.board || "Generic";
        (groups[b] ||= []).push(it);
      }

      // Category display names and order
      const categoryOrder = ["zigbee_ncp", "zb_router", "openthread_rcp", "multipan"];
      const categoryNames: Record<string, string> = {
        zigbee_ncp: "ZB Coordinator",
        zb_router: "ZB Router",
        openthread_rcp: "OpenThread",
        multipan: "MultiPAN",
      };

      // Sort boards alphabetically
      const sortedBoards = Object.keys(groups).sort();

      for (const board of sortedBoards) {
        const boardItems = groups[board];

        // Sort: first by category order, then by version (newest first) within each category
        boardItems.sort((a, b) => {
          const catOrderA = categoryOrder.indexOf(a.category);
          const catOrderB = categoryOrder.indexOf(b.category);
          if (catOrderA !== catOrderB) return catOrderA - catOrderB;
          // Same category - sort by version descending
          return compareSemanticVersions(b.ver, a.ver);
        });

        const g = document.createElement("optgroup");
        g.label = board;

        for (const it of boardItems) {
          const o = document.createElement("option");
          o.value = it.key;
          const typeStr = categoryNames[it.category] || it.category;
          o.textContent = `[${typeStr}] ${it.ver} — ${it.key.split("|")[1]}`;
          o.setAttribute("data-link", it.link);
          g.appendChild(o);
        }
        netFwSelect.appendChild(g);
      }
    } else {
      // TI - Group by category
      const groups: Record<string, typeof items> = {};
      for (const it of items) {
        (groups[it.category] ||= []).push(it);
      }

      for (const cat of categories) {
        if (groups[cat]) {
          const g = document.createElement("optgroup");
          if (cat === "ccloader") {
            g.label = "CCLoader";
          } else {
            g.label = cat.charAt(0).toUpperCase() + cat.slice(1); // Capitalize
          }
          for (const it of groups[cat]) {
            const o = document.createElement("option");
            o.value = it.key;
            o.textContent = it.label;
            o.setAttribute("data-link", it.link);
            g.appendChild(o);
          }
          netFwSelect.appendChild(g);
        }
      }
    }

    if (items.length === 0) {
      const o = document.createElement("option");
      o.value = "";
      o.textContent = "— No matching firmware —";
      netFwSelect.appendChild(o);
    }
    log(`Cloud FW: ${items.length} options`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log("Cloud FW manifest error: " + msg);
  }
}
