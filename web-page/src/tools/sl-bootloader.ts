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
