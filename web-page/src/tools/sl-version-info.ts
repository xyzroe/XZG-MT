// Parser for the reply of EZSP getValue(VALUE_VERSION_INFO = 0x11).
// Reply layout: [status (1 byte for EZSP < 14, 4 bytes LE for EZSP >= 14), length, ...value]
// VALUE_VERSION_INFO value: [build_lo, build_hi, major, minor, patch, special, type, ...]

/** Returns the stack build number, or null when the reply is an error or too short. */
export function parseVersionInfoBuild(response: Uint8Array, protocolVersion: number): number | null {
  const statusSize = protocolVersion < 0x0e ? 1 : 4;
  if (response.length < statusSize + 1) return null;
  for (let i = 0; i < statusSize; i++) {
    if (response[i] !== 0x00) return null; // EZSP_SUCCESS == 0
  }
  const valueLength = response[statusSize];
  const valueOffset = statusSize + 1;
  if (valueLength < 7 || response.length < valueOffset + valueLength) return null;
  return response[valueOffset] | (response[valueOffset + 1] << 8);
}
