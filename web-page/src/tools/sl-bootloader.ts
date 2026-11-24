// DOM-free helpers for Silicon Labs bootloader-only devices (no application firmware flashed).

/** Shown instead of a guessed model when the chip family cannot be read (bootloader menu has no part number). */
export const SL_CHIP_UNKNOWN = "EFR32 (unknown)";

/** Model assumed for application-level probes that did not report a board string (legacy default). */
export const SL_CHIP_DEFAULT_APP = "EFR32MG21";

const BANNER_RE = /(?:Gecko|\w+\s*Serial)\s+Bootloader\s+v([0-9]+(?:\.[0-9]+)*)/i;
const PROMPT_RE = /(?:^|[\r\n])BL ?> ?/i;

/**
 * Looks for the Gecko Bootloader menu banner + `BL >` prompt in raw serial bytes.
 * The bootloader prints it on every reset when there is no valid application image,
 * which is the signature of a "bootloader only" device. Returns the bootloader version or null.
 */
export function parseBootloaderBanner(data: Uint8Array | string): string | null {
  const text = typeof data === "string" ? data : Array.from(data, (b) => String.fromCharCode(b)).join("");
  const m = text.match(BANNER_RE);
  if (!m || !PROMPT_RE.test(text)) return null;
  return m[1];
}

/** Chip model to show in the UI for a probe result. */
export function slChipFromProbe(result: { deviceModel?: string; bootloaderOnly?: boolean }): string {
  if (result.bootloaderOnly) return SL_CHIP_UNKNOWN;
  return result.deviceModel ?? SL_CHIP_DEFAULT_APP;
}

/**
 * Flash memory map family of an EFR32 Series 2 part. The Gecko Bootloader accepts any GBL and silently
 * discards writes outside the device's application area, so an image built for another family reports
 * "upload complete" while nothing is written (verified on EFR32MG21 with an MG24 image).
 */
export type SlFlashMap = "flash@0" | "flash@0x08000000";

const GBL_HEADER_TAG = 0x03a617eb;
// PROG, PROG_LZ4, PROG_LZMA: the first four body bytes are the flash start address
const GBL_PROG_TAGS = new Set([0xfe0101fe, 0xfd0303fd, 0xfd0505fd]);

/** Flash start address of the first program tag in a GBL, or null (not a GBL / encrypted / no program tag). */
export function gblFlashStartAddress(gbl: Uint8Array): number | null {
  if (gbl.length < 16) return null;
  const v = new DataView(gbl.buffer, gbl.byteOffset, gbl.byteLength);
  if (v.getUint32(0, true) !== GBL_HEADER_TAG) return null;
  let off = 0;
  while (off + 8 <= gbl.length) {
    const id = v.getUint32(off, true);
    const len = v.getUint32(off + 4, true);
    if (GBL_PROG_TAGS.has(id)) return len >= 4 && off + 12 <= gbl.length ? v.getUint32(off + 8, true) : null;
    if (len > gbl.length - off - 8) return null;
    off += 8 + len;
  }
  return null;
}

export function gblFlashMap(gbl: Uint8Array): SlFlashMap | null {
  const addr = gblFlashStartAddress(gbl);
  if (addr === null) return null;
  return addr >= 0x08000000 ? "flash@0x08000000" : "flash@0";
}

/** Flash map for a chip/board name when it is certain (xG21 starts at 0, xG24 at 0x08000000); null otherwise. */
export function slFlashMapForChip(chip: string): SlFlashMap | null {
  const c = chip.toUpperCase();
  if (/EFR32[A-Z]G21|ZBDONGLE-E\b|DONGLE-LMG21|ZB-GW04|SM-011/.test(c)) return "flash@0";
  if (/EFR32[A-Z]G24|ZBDONGLE-M\b|ZBDONGLE-PMG24|DONGLE-PMG24|SLZB-07MG24/.test(c)) return "flash@0x08000000";
  return null;
}

/** Throws when a GBL is built for a different memory map than the (known) chip; returns a warning when unknown. */
export function checkGblMatchesChip(gbl: Uint8Array, chip: string): string | null {
  const img = gblFlashMap(gbl);
  if (!img) return null;
  const dev = slFlashMapForChip(chip);
  if (dev && dev !== img) {
    throw new Error(
      `This image is built for an EFR32 with ${img} but the connected chip (${chip}) uses ${dev}. ` +
        `The bootloader would accept it and write nothing. Choose firmware for your exact chip.`,
    );
  }
  if (!dev) {
    return `Chip family not detectable here; the image uses ${img}. If the device stays in the bootloader afterwards, the image is for a different EFR32 series.`;
  }
  return null;
}
