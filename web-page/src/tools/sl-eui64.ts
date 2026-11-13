// Layout of the NVM3 STACK_TRUST_CENTER token: uint16 mode, EUI64[8], key[16]
const TC_TOKEN_EUI64_OFFSET = 2;
const EUI64_SIZE = 8;

export type Eui64Repair = { mismatch: false } | { mismatch: true; tokenData: Uint8Array };

function same(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

// Port of ember-zli stack > repairs > "Check for EUI64 mismatch"; all addresses are in EZSP (little-endian) wire order
export function planEui64Repair(
  nodeEui64: Uint8Array,
  trustCenterAddress: Uint8Array,
  tokenData: Uint8Array,
): Eui64Repair {
  if (nodeEui64.length !== EUI64_SIZE || trustCenterAddress.length !== EUI64_SIZE) {
    throw new Error("EUI64 must be 8 bytes");
  }
  if (same(nodeEui64, trustCenterAddress)) return { mismatch: false };

  if (tokenData.length < TC_TOKEN_EUI64_OFFSET + EUI64_SIZE) throw new Error("Trust Center token is too short");
  const tokenEui64 = tokenData.subarray(TC_TOKEN_EUI64_OFFSET, TC_TOKEN_EUI64_OFFSET + EUI64_SIZE);
  if (!same(tokenEui64, trustCenterAddress)) {
    throw new Error("NVM3 Trust Center token doesn't match current security state");
  }

  const fixed = new Uint8Array(tokenData);
  fixed.set(nodeEui64, TC_TOKEN_EUI64_OFFSET);
  return { mismatch: true, tokenData: fixed };
}
