import assert from "node:assert/strict";
import test from "node:test";
import {
  parseBootloaderBanner,
  slChipFromProbe,
  SL_CHIP_UNKNOWN,
  gblFlashStartAddress,
  gblFlashMap,
  checkGblMatchesChip,
} from "./sl-bootloader";

const hex = (s: string) => Uint8Array.from(s.trim().split(/\s+/).map((h) => parseInt(h, 16)));

// Raw bytes from xyzroe/XZG-MT#116 (SLZB-07MG24, bootloader only), split across several RX chunks.
const chunks = [
  "0d 0a 47 65 63 6b 6f 20 42 6f 6f 74 6c 6f 61 64 65 72 20 76 33 2e 30 32 2e 30 31 0d 0a 31 2e 20 75 70 6c 6f 61 64 20 67 62 6c 0d 0a 32 2e 20 72 75 6e 0d 0a 33 2e 20 65 62 6c 20 69 6e 66 6f 0d",
  "0a 42 4c 20 3e 20 00",
];

test("detects Gecko Bootloader banner from the issue #116 bytes", () => {
  const all = Uint8Array.from(chunks.flatMap((c) => Array.from(hex(c))));
  assert.equal(parseBootloaderBanner(all), "3.02.01");
});

test("banner without the BL > prompt is not reported yet", () => {
  assert.equal(parseBootloaderBanner(hex(chunks[0])), null);
});

test("ASH/EZSP traffic and noise are not a bootloader", () => {
  assert.equal(parseBootloaderBanner(hex("1a c1 02 0b 0a 52 7e")), null);
  assert.equal(parseBootloaderBanner("Router> "), null);
});

test("legacy 'Serial Bootloader' banner is accepted", () => {
  assert.equal(parseBootloaderBanner("\r\nEFR32 Serial Bootloader v1.10.0\r\n1. upload gbl\r\n2. run\r\n3. ebl info\r\nBL > "), "1.10.0");
});

test("bootloader-only result never claims a chip model", () => {
  assert.equal(slChipFromProbe({ bootloaderOnly: true, deviceModel: "EFR32MG21" }), SL_CHIP_UNKNOWN);
  assert.equal(slChipFromProbe({ deviceModel: "Acme Stick" }), "Acme Stick");
  assert.equal(slChipFromProbe({}), "EFR32MG21");
});

// minimal GBL: header tag + one PROG_LZ4 tag whose body starts with the flash address
function gbl(addr: number, progTag = 0xfd0303fd): Uint8Array {
  const out = new Uint8Array(8 + 8 + 8 + 8);
  const v = new DataView(out.buffer);
  v.setUint32(0, 0x03a617eb, true);
  v.setUint32(4, 8, true);
  v.setUint32(16, progTag, true);
  v.setUint32(20, 8, true);
  v.setUint32(24, addr, true);
  return out;
}

test("GBL flash start address selects the memory map (MG21 0x4000, MG24 0x08006000)", () => {
  assert.equal(gblFlashStartAddress(gbl(0x4000)), 0x4000);
  assert.equal(gblFlashMap(gbl(0x4000)), "flash@0");
  assert.equal(gblFlashMap(gbl(0x08006000, 0xfe0101fe)), "flash@0x08000000");
  assert.equal(gblFlashMap(Uint8Array.of(1, 2, 3)), null);
  assert.equal(gblFlashMap(new Uint8Array(64)), null);
});

test("image for another chip family is refused, unknown chip only warns", () => {
  assert.throws(() => checkGblMatchesChip(gbl(0x08006000), "SONOFF ZBDongle-E"), /flash@0x08000000/);
  assert.throws(() => checkGblMatchesChip(gbl(0x4000), "EFR32MG24"), /flash@0/);
  assert.equal(checkGblMatchesChip(gbl(0x4000), "SONOFF ZBDongle-E"), null);
  assert.match(checkGblMatchesChip(gbl(0x4000), SL_CHIP_UNKNOWN) ?? "", /not detectable/);
  assert.equal(checkGblMatchesChip(new Uint8Array(32), SL_CHIP_UNKNOWN), null);
});
