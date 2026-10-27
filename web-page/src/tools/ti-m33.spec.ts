import assert from "node:assert/strict";
import test from "node:test";
import { crc32 } from "../utils/crc";
import type { TiTools } from "./ti";
import {
  CC2674P10_PROFILE as profile,
  parseM33Hex,
  prepareM33Image,
  programM33,
  readM33DeviceInfo,
  writeM33SecondaryIeeeAddress,
} from "./ti-m33";

const base = profile.memory.ccfgBase;
const bootloader = Uint8Array.of(0xc5, 13, 0xfe, 0xc5);
const firmware = () => [
  { address: 0, data: Uint8Array.of(0, 0, 0, 0, 1, 2, 3, 4) },
  { address: base + profile.offsets.bootloaderConfig, data: bootloader.slice() },
];
const options = () => ({
  erase: true, write: true, verify: true,
  log: () => {}, progress: () => {},
});

function record(type: number, address: number, data: number[] = []): string {
  const bytes = [data.length, address >>> 8, address & 0xff, type, ...data];
  bytes.push((-bytes.reduce((sum, value) => sum + value, 0)) & 0xff);
  return ":" + bytes.map((value) => value.toString(16).padStart(2, "0")).join("");
}

function hexInput(...lines: string[]): Uint8Array {
  return new TextEncoder().encode(lines.join("\n"));
}

function deviceMock() {
  const main = new Uint8Array(profile.flashSizeBytes).fill(0xff);
  const ccfg = new Uint8Array(profile.memory.ccfgSizeBytes).fill(0xff);
  ccfg.set(bootloader, profile.offsets.bootloaderConfig);
  ccfg.set([1, 2, 3, 4, 5, 6, 7, 8], profile.offsets.secondaryIeee);
  ccfg[0x40] = 0;
  ccfg[0x100] = 0x42;
  const events: string[] = [];
  const state = { badSnapshot: false, shortRead: false, badMainCrc: false, protected: false, chipId: "120af000" };
  const registers = new Map<number, Uint8Array>([
    [0x50000b18, Uint8Array.of(0x2f, 0x80, 0xb7, 0x1b)],
    [0x50000a94, Uint8Array.of(0, 0xf0, 0x0a, 2)],
    [0x5803002c, Uint8Array.of(0, 2, 0, 0)],
  ]);
  const mock = {
    async sync() { events.push("sync"); },
    async chipId() { return Uint8Array.from(state.chipId.match(/../g)!, (byte) => parseInt(byte, 16)); },
    async memRead32(address: number) {
      if (address >= base && address < base + ccfg.length) return ccfg.slice(address - base, address - base + 4);
      if (address === 0x58030004) return Uint8Array.of(state.protected ? 1 : 0, 0, 0, 0);
      return registers.get(address)?.slice() ?? new Uint8Array(4);
    },
    async memReadBlock(address: number, length: number) {
      return ccfg.slice(address - base, address - base + length - (state.shortRead ? 4 : 0));
    },
    async crc32Cc26xx(address: number, length: number) {
      const value = crc32(address >= base ? ccfg.subarray(address - base, address - base + length) : main.subarray(address, address + length));
      if ((address >= base && state.badSnapshot) || (address < base && state.badMainCrc)) return (value ^ 1) >>> 0;
      events.push(address >= base ? "verify ccfg" : "verify main");
      return value;
    },
    async bankErase() { events.push("erase main"); main.fill(0xff); },
    async sectorErase(address: number) { assert.equal(address, base); events.push("erase ccfg"); ccfg.fill(0xff); },
    async downloadTo(address: number, data: Uint8Array) {
      events.push(address >= base ? "write ccfg" : "write main");
      if (address >= base) ccfg.set(data, address - base);
      else main.set(data, address);
    },
  };
  return { tools: mock as unknown as TiTools, main, ccfg, events, state };
}

test("sparse HEX keeps main and independent CCFG separate without allocating the gap", () => {
  const segments = parseM33Hex(hexInput(
    record(0, 0, [0, 1, 2, 3]), record(4, 0, [0x50, 0]),
    record(0, 0x28, [...bootloader]), record(1, 0),
  ));
  assert.deepEqual(segments.map((segment) => [segment.address, segment.data.length]), [[0, 4], [base + 0x28, 4]]);
});

test("HEX rejects corrupt checksums, missing EOF, overlaps and data after EOF", () => {
  assert.throws(() => parseM33Hex(hexInput(":040000000001020300", record(1, 0))), /checksum/);
  assert.throws(() => parseM33Hex(hexInput(record(0, 0, [1]))), /EOF/);
  assert.throws(() => parseM33Hex(hexInput(record(0, 0, [1]), record(0, 0, [2]), record(1, 0))), /overlap/);
  assert.throws(() => parseM33Hex(hexInput(record(1, 0), record(0, 0, [1]))), /after the EOF/);
});

test("HEX alignment merges adjacent partial words without losing data", () => {
  const segments = parseM33Hex(hexInput(record(0, 1, [1]), record(0, 2, [2, 3]), record(1, 0)));
  assert.deepEqual(segments, [{ address: 0, data: Uint8Array.of(0xff, 1, 2, 3) }]);
});

test("profile rejects legacy and mismatched M33 devices", async () => {
  const mock = deviceMock();
  mock.state.chipId = "1202f000";
  await assert.rejects(readM33DeviceInfo(mock.tools), /Unsupported TI M33 chip ID/);
  assert.equal(profile.matches({
    chipIdHex: "120af000", waferId: 0xbb78, pgRevision: 1,
    flashSizeBytes: 0x100000, userIdRaw: new Uint8Array(4),
  }), false);
});

test("image validation refuses foreign ranges, overlaps and disabled bootloaders", async () => {
  const mock = deviceMock();
  const device = await readM33DeviceInfo(mock.tools);
  assert.throws(() => prepareM33Image([...firmware(), { address: 0x50000800, data: new Uint8Array(4) }], device), /outside/);
  assert.throws(() => prepareM33Image([...firmware(), { address: 0, data: new Uint8Array(4) }], device), /overlap/);
  const image = firmware();
  image[1].data.fill(0);
  assert.throws(() => prepareM33Image(image, device), /disables the ROM bootloader/);
});

test("programming preserves omitted CCFG and IEEE, writes zeros and verifies main before CCFG erase", async () => {
  const mock = deviceMock();
  const original = mock.ccfg.slice();
  const device = await readM33DeviceInfo(mock.tools);
  await programM33(mock.tools, firmware(), device, options());
  assert.deepEqual(mock.ccfg, original);
  assert.deepEqual(mock.main.subarray(0, 8), firmware()[0].data);
  assert.ok(mock.events.indexOf("verify main") < mock.events.indexOf("erase ccfg"));
  assert.equal(mock.events.at(-1), "verify ccfg");
});

test("a bad or short preservation read aborts before any erase", async () => {
  for (const setting of ["badSnapshot", "shortRead"] as const) {
    const mock = deviceMock();
    const device = await readM33DeviceInfo(mock.tools);
    mock.state[setting] = true;
    await assert.rejects(programM33(mock.tools, firmware(), device, options()), /CRC32 mismatch|expected/);
    assert.ok(!mock.events.some((event) => event.startsWith("erase")));
  }
});

test("a failed main CRC leaves the original CCFG untouched", async () => {
  const mock = deviceMock();
  const device = await readM33DeviceInfo(mock.tools);
  const original = mock.ccfg.slice();
  mock.state.badMainCrc = true;
  await assert.rejects(programM33(mock.tools, firmware(), device, options()), /Main flash CRC32 mismatch/);
  assert.ok(!mock.events.includes("erase ccfg"));
  assert.deepEqual(mock.ccfg, original);
});

test("unsafe operation combinations are rejected before device commands", async () => {
  for (const overrides of [{ write: false }, { erase: false }, { verify: false }]) {
    const mock = deviceMock();
    const device = await readM33DeviceInfo(mock.tools);
    mock.events.length = 0;
    await assert.rejects(programM33(mock.tools, firmware(), device, { ...options(), ...overrides }));
    assert.deepEqual(mock.events, []);
  }
});

test("latched protection, disabled erase and protection changes abort before main erase", async () => {
  for (const setting of ["latched", "disabled", "changed", "backdoor"] as const) {
    const mock = deviceMock();
    const device = await readM33DeviceInfo(mock.tools);
    const image = firmware();
    if (setting === "latched") mock.state.protected = true;
    if (setting === "disabled") mock.ccfg[0x2c] = 0;
    if (setting === "changed") image.push({ address: base + 0x34, data: new Uint8Array(4) });
    if (setting === "backdoor") image[1].data[1] = 14;
    await assert.rejects(programM33(mock.tools, image, device, options()), /protect|erase|backdoor/);
    assert.ok(!mock.events.includes("erase main"));
  }
});

test("IEEE update preserves the complete sector and skips identical writes", async () => {
  const mock = deviceMock();
  const device = await readM33DeviceInfo(mock.tools);
  const expected = mock.ccfg.slice();
  const address = "11:22:33:44:55:66:77:88";
  expected.set([0x88, 0x77, 0x66, 0x55, 0x44, 0x33, 0x22, 0x11], 0x18);
  const updated = await writeM33SecondaryIeeeAddress(mock.tools, address, device, () => {});
  assert.deepEqual(mock.ccfg, expected);
  mock.events.length = 0;
  await writeM33SecondaryIeeeAddress(mock.tools, address, updated, () => {});
  assert.ok(!mock.events.includes("erase ccfg"));
});

test("read-only verification needs no erase permission and never writes", async () => {
  const mock = deviceMock();
  mock.main.set(firmware()[0].data);
  mock.state.protected = true;
  const device = await readM33DeviceInfo(mock.tools);
  await programM33(mock.tools, firmware(), device, { ...options(), erase: false, write: false });
  assert.ok(!mock.events.some((event) => event.startsWith("erase") || event.startsWith("write")));
});
