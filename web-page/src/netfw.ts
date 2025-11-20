import { parseIntelHex } from "./utils/intelhex";

import { netFwSelect, chipModelEl, log } from "./ui";

interface ZwFirmwareInfo {
  file: string;
  ver: number;
  link: string;
  notes?: string;
}

type ZwCategory = Record<string, Record<string, ZwFirmwareInfo>>;

export let netFwItems: Array<{ key: string; link: string; ver: number; notes?: string; label: string }> | null = null;
export let netFwCache: ZwManifest | null = null;

interface ZwManifest {
  router?: ZwCategory;
  coordinator?: ZwCategory;
  thread?: ZwCategory;
  [key: string]: ZwCategory | undefined;
}

export async function fetchManifest(): Promise<ZwManifest> {
  const url = "https://raw.githubusercontent.com/xyzroe/XZG-MT/fw_files/ti/manifest.json";
  const resp = await fetch(url, { cache: "no-cache" });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const j = (await resp.json()) as ZwManifest;
  return j;
}

export function filterFwByChip(man: ZwManifest, chip: string) {
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
    const catObj: ZwCategory | undefined = man[cat];
    if (!catObj) continue;
    for (const sub of Object.keys(catObj)) {
      if (!sub.startsWith(deviceName)) continue;
      const files = catObj[sub];
      for (const fname of Object.keys(files)) {
        const fi = files[fname];
        (result[cat] ||= []).push({ file: fname, ver: fi.ver, link: fi.link, notes: fi.notes });
      }
    }
    if (result[cat]) result[cat]!.sort((a, b) => b.ver - a.ver);
  }
  return result;
}

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

function makeOptionLabel(item: { ver: number; file: string; category: string }) {
  return `[${item.category.charAt(0).toUpperCase()}] ${item.ver} — ${item.file}`;
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

    window.netFwItems = netFwItems;
    window.netFwSelect = netFwSelect;
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
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log("Cloud FW manifest error: " + msg);
  }
}
