import { parseIntelHex } from "./utils/intelhex";

export type ZwManifest = Record<string, any> & {
  router?: Record<string, any>;
  coordinator?: Record<string, any>;
  thread?: Record<string, any>;
};

export async function fetchManifest(): Promise<ZwManifest> {
  const url = "https://raw.githubusercontent.com/xyzroe/XZG/zb_fws/ti/manifest.json";
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
  };
  const deviceName = chipMap[chip] || chip;
  const result: Record<string, Array<{ file: string; ver: number; link: string; notes?: string }>> = {};
  for (const cat of categories) {
    const catObj: any = (man as any)[cat];
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
