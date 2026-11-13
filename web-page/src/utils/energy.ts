export const ZIGBEE_CHANNELS: readonly number[] = Array.from({ length: 16 }, (_, index) => 11 + index);

// Typical RSSI span of an 802.15.4 energy detect
export const ENERGY_MIN_DBM = -100;
export const ENERGY_MAX_DBM = -20;

export function energyPercent(dbm: number): number {
  const percent = ((dbm - ENERGY_MIN_DBM) / (ENERGY_MAX_DBM - ENERGY_MIN_DBM)) * 100;
  return Math.min(100, Math.max(0, percent));
}

// Green for a quiet channel, red for a busy one
export function energyColor(percent: number): string {
  const hue = 120 - Math.min(100, Math.max(0, percent)) * 1.2;
  return `hsl(${Math.round(hue)}, 70%, 45%)`;
}

export function energyLabel(channel: number, dbm: number | null, peak: number | null): string {
  if (dbm === null) return `Channel ${channel}: no data`;
  return `Channel ${channel}: ${dbm} dBm${peak !== null && peak > dbm ? ` (peak ${peak} dBm)` : ""}`;
}
