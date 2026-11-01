import {crc32} from "../utils/crc";
import type {TiDeviceInfo, TiTools} from "./ti";

function uint32Le(bytes: Uint8Array): number {
    if (bytes.length !== 4) throw new Error(`Expected a 4-byte little-endian value, got ${bytes.length}`);
    return (bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24)) >>> 0;
}

export interface M33MemoryMap {
    fcfgBase: number;
    ccfgBase: number;
    ccfgSizeBytes: number;
    flashConfigBase: number;
}

export interface M33RegisterOffsets {
    userId: number;
    icepickId: number;
    primaryIeee: number;
    revision: number;
    flashSize: number;
    secondaryIeee: number;
    bootloaderConfig: number;
    eraseConfig: number;
    eraseConfig1: number;
    writeProtection: number;
}

export interface M33Capabilities {
    flash: boolean;
    ccfg: boolean;
    secondaryIeee: boolean;
    nvram: boolean;
    fullFlashRead: boolean;
}

export interface M33ProfileIdentity {
    chipIdHex: string;
    waferId: number;
    pgRevision: number;
    flashSizeBytes: number;
    userIdRaw: Uint8Array;
}

export interface M33DeviceProfile {
    key: string;
    model: string;
    romChipIds: readonly string[];
    waferId: number;
    flashSizeBytes: number;
    memory: M33MemoryMap;
    offsets: M33RegisterOffsets;
    capabilities: M33Capabilities;
    protectedCcfgRanges: readonly (readonly [number, number])[];

    decodeWaferId(deviceId: Uint8Array): number;

    decodePgRevision(deviceId: Uint8Array): number;

    decodeFlashSize(flashSize: Uint8Array): number;

    formatRevision(pgRevision: number, minorRevision: number): string;

    matches(identity: M33ProfileIdentity): boolean;
}

export const CC2674P10_PROFILE = {
    key: "cc2674p10",
    model: "CC2674P10",
    romChipIds: ["120af000"],
    waferId: 0xbb78,
    flashSizeBytes: 0x100000,
    memory: {
        fcfgBase: 0x50000800,
        ccfgBase: 0x50000000,
        ccfgSizeBytes: 0x800,
        flashConfigBase: 0x58030000,
    },
    offsets: {
        userId: 0x294,
        icepickId: 0x318,
        primaryIeee: 0x2f0,
        revision: 0x0a0,
        flashSize: 0x2c,
        secondaryIeee: 0x18,
        bootloaderConfig: 0x28,
        eraseConfig: 0x2c,
        eraseConfig1: 0x30,
        writeProtection: 0x04,
    },
    capabilities: {
        flash: true,
        ccfg: true,
        secondaryIeee: true,
        nvram: false,
        fullFlashRead: false,
    },
    protectedCcfgRanges: [[0x2c, 0x40], [0x44, 0x7c]],
    decodeWaferId(deviceId: Uint8Array): number {
        return (((deviceId[3] & 0x0f) << 16) | (deviceId[2] << 8) | (deviceId[1] & 0xf0)) >>> 4;
    },
    decodePgRevision(deviceId: Uint8Array): number {
        return (deviceId[3] & 0xf0) >>> 4;
    },
    decodeFlashSize(flashSize: Uint8Array): number {
        const flashUnits = ((flashSize[1] & 0x03) << 1) | ((flashSize[0] & 0x80) >>> 7);
        return flashUnits * 256 * 1024;
    },
    formatRevision(pgRevision: number, minorRevision: number): string {
        const generation = pgRevision === 0 ? 1 : pgRevision === 1 ? 2 : pgRevision + 1;
        return `PG${generation}.${minorRevision}`;
    },
    matches(identity: M33ProfileIdentity): boolean {
        const userId = uint32Le(identity.userIdRaw);
        const encodingVersion = (userId >>> 26) & 0x03;
        const hasHighPowerPa = ((userId >>> 25) & 1) !== 0;
        const isCc13 = ((userId >>> 23) & 1) !== 0;
        const sequence = (userId >>> 19) & 0x0f;
        const protocols = (userId >>> 12) & 0x0f;
        return (
            identity.chipIdHex === "120af000" &&
            identity.waferId === 0xbb78 &&
            identity.flashSizeBytes === 0x100000 &&
            encodingVersion === 0 &&
            !isCc13 &&
            hasHighPowerPa &&
            (sequence & 1) !== 0 &&
            protocols === 0x0f
        );
    },
} as const satisfies M33DeviceProfile;

export const M33_DEVICE_PROFILES: readonly M33DeviceProfile[] = [CC2674P10_PROFILE];

const WRITE_CHUNK_SIZE = 248;

export interface M33Segment {
    address: number;
    data: Uint8Array;
}

export interface M33DeviceInfo extends TiDeviceInfo {
    family: "cc26xx-m33";
    profile: M33DeviceProfile;
    chipModel: string;
    flashSizeBytes: number;
    waferId: number;
    pgRevision: number;
    packageName: string;
    pageSizeBytes: number;
    ccfgAddress: number;
    ccfgSizeBytes: number;
    bootloaderAddress: number;
    bootloaderConfig: Uint8Array;
    bootloaderEnabled: boolean;
    secondaryIeeeRaw: Uint8Array;
}

export interface M33ImagePlan {
    main: M33Segment[];
    ccfg: M33Segment[];
    totalBytes: number;
    bootloaderConfig: Uint8Array;
    secondaryIeeePresent: boolean;
    restoredSecondaryIeee: boolean;
}

export interface M33ProgramOptions {
    erase: boolean;
    write: boolean;
    verify: boolean;
    synchronize?: boolean;
    log: (message: string) => void;
    progress: (percentage: number, message: string) => void;
}

function hex(value: number, width = 8): string {
    return `0x${value.toString(16).toUpperCase().padStart(width, "0")}`;
}

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
}

function formatIeee(bytes: Uint8Array): string {
    return Array.from(bytes)
        .reverse()
        .map((value) => value.toString(16).padStart(2, "0"))
        .join(":")
        .toUpperCase();
}

function copyBytes(bytes: Uint8Array): Uint8Array {
    return new Uint8Array(bytes);
}

async function readWord(tools: TiTools, address: number): Promise<Uint8Array> {
    const value = await tools.memRead32(address);
    if (value.length !== 4) {
        throw new Error(`M33 memory read at ${hex(address)} returned ${value.length} bytes; expected 4`);
    }
    return copyBytes(value);
}

interface M33ProfileProbe {
    profile: M33DeviceProfile;
    identity: M33ProfileIdentity;
    revision: Uint8Array;
}

async function probeM33Profile(
    tools: TiTools,
    profile: M33DeviceProfile,
    chipIdHex: string,
): Promise<M33ProfileProbe> {
    const {memory, offsets} = profile;
    const deviceId = await readWord(tools, memory.fcfgBase + offsets.icepickId);
    const userIdRaw = await readWord(tools, memory.fcfgBase + offsets.userId);
    const revision = await readWord(tools, memory.fcfgBase + offsets.revision);
    const flashSize = await readWord(tools, memory.flashConfigBase + offsets.flashSize);
    const identity: M33ProfileIdentity = {
        chipIdHex,
        waferId: profile.decodeWaferId(deviceId),
        pgRevision: profile.decodePgRevision(deviceId),
        flashSizeBytes: profile.decodeFlashSize(flashSize),
        userIdRaw,
    };
    return {profile, identity, revision};
}

async function readMemoryRange(tools: TiTools, address: number, length: number): Promise<Uint8Array> {
    if ((address & 3) !== 0 || (length & 3) !== 0) {
        throw new Error(`M33 memory range must be 4-byte aligned: ${hex(address)} + ${length}`);
    }

    const result = new Uint8Array(length);
    const maxReadBytes = 63 * 4;
    for (let offset = 0; offset < length; offset += maxReadBytes) {
        const chunkLength = Math.min(maxReadBytes, length - offset);
        const chunk = await tools.memReadBlock(address + offset, chunkLength);
        if (chunk.length !== chunkLength) {
            throw new Error(
                `M33 memory read at ${hex(address + offset)} returned ${chunk.length} bytes; expected ${chunkLength}`,
            );
        }
        result.set(chunk, offset);
    }
    return result;
}

function isBootloaderEnabled(config: Uint8Array): boolean {
    return config.length === 4 && config[0] === 0xc5 && config[3] === 0xc5;
}

async function validateCcfgRewrite(
    tools: TiTools,
    profile: M33DeviceProfile,
    original: Uint8Array,
    planned: Uint8Array,
): Promise<void> {
    const {memory, offsets} = profile;
    for (const ccfg of [original, planned]) {
        const erase = uint32Le(ccfg.slice(offsets.eraseConfig, offsets.eraseConfig + 4));
        const erase1 = uint32Le(ccfg.slice(offsets.eraseConfig1, offsets.eraseConfig1 + 4));
        if ((erase & 0x101) !== 0x101 || (erase1 & 1) !== 1) {
            throw new Error("CCFG disables bank/chip erase or protects CCFG; write was refused");
        }
    }
    const protection = await readWord(tools, memory.flashConfigBase + offsets.writeProtection);
    if ((uint32Le(protection) & 1) !== 0) throw new Error("Live CCFG is write/erase protected");
    for (const [start, end] of profile.protectedCcfgRanges) {
        if (original.subarray(start, end).some((value, index) => value !== planned[start + index])) {
            throw new Error("Changes to M33 protection/security configuration are not supported");
        }
    }
    const bootloader = original.subarray(offsets.bootloaderConfig, offsets.bootloaderConfig + 4);
    if (isBootloaderEnabled(bootloader) &&
        bootloader.some((value, index) => value !== planned[offsets.bootloaderConfig + index])) {
        throw new Error("Changing the working M33 bootloader backdoor configuration is not supported");
    }
}

function parseIeeeAddress(address: string): Uint8Array {
    const normalized = address.trim().replace(/^0x/i, "").replace(/[:\-\s]/g, "");
    if (!/^[0-9a-fA-F]{16}$/.test(normalized)) {
        throw new Error("IEEE address must contain exactly 8 hexadecimal bytes");
    }

    const result = new Uint8Array(8);
    for (let index = 0; index < result.length; index++) {
        result[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
    }
    return result;
}

function concatenate(chunks: Uint8Array[], length: number): Uint8Array {
    const result = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
    }
    return result;
}

function mergeAdjacentSegments(segments: M33Segment[]): M33Segment[] {
    const sorted = [...segments].sort((left, right) => left.address - right.address);
    if (sorted.length === 0) return [];

    const result: M33Segment[] = [];
    let start = sorted[0].address;
    let end = start;
    let chunks: Uint8Array[] = [];

    const flush = () => {
        result.push({address: start, data: concatenate(chunks, end - start)});
    };

    for (const segment of sorted) {
        if (segment.address < end) throw new Error(`Intel HEX data overlaps at ${hex(segment.address)}`);
        if (chunks.length > 0 && segment.address !== end) {
            flush();
            start = segment.address;
            chunks = [];
        }
        if (chunks.length === 0) start = segment.address;
        chunks.push(segment.data);
        end = segment.address + segment.data.length;
    }
    flush();
    return result;
}

function alignSegments(segments: M33Segment[]): M33Segment[] {
    const sorted = [...segments].sort((left, right) => left.address - right.address);
    const result: M33Segment[] = [];
    let group: M33Segment[] = [];
    let groupStart = 0;
    let groupEnd = 0;

    const flush = () => {
        if (group.length === 0) return;
        const data = new Uint8Array(groupEnd - groupStart).fill(0xff);
        for (const segment of group) data.set(segment.data, segment.address - groupStart);
        result.push({address: groupStart, data});
    };

    for (const segment of sorted) {
        const alignedStart = Math.floor(segment.address / 4) * 4;
        const alignedEnd = Math.ceil((segment.address + segment.data.length) / 4) * 4;
        if (group.length === 0 || alignedStart > groupEnd) {
            flush();
            group = [segment];
            groupStart = alignedStart;
            groupEnd = alignedEnd;
        } else {
            group.push(segment);
            groupEnd = Math.max(groupEnd, alignedEnd);
        }
    }
    flush();
    return result;
}

function readSegmentBytes(segments: M33Segment[], address: number, length: number): Uint8Array {
    const result = new Uint8Array(length);
    for (let offset = 0; offset < length; offset++) {
        const targetAddress = address + offset;
        const segment = segments.find(
            (candidate) => targetAddress >= candidate.address && targetAddress < candidate.address + candidate.data.length,
        );
        if (!segment) throw new Error(`M33 firmware is missing data at ${hex(targetAddress)}`);
        result[offset] = segment.data[targetAddress - segment.address];
    }
    return result;
}

function overlayBytes(segments: M33Segment[], address: number, data: Uint8Array): M33Segment[] {
    const result = segments.map((segment) => ({address: segment.address, data: copyBytes(segment.data)}));
    const missing: M33Segment[] = [];
    let missingStart = -1;
    let missingValues: number[] = [];

    const flushMissing = () => {
        if (missingStart >= 0) missing.push({address: missingStart, data: Uint8Array.from(missingValues)});
        missingStart = -1;
        missingValues = [];
    };

    for (let offset = 0; offset < data.length; offset++) {
        const targetAddress = address + offset;
        const segment = result.find(
            (candidate) => targetAddress >= candidate.address && targetAddress < candidate.address + candidate.data.length,
        );
        if (segment) {
            flushMissing();
            segment.data[targetAddress - segment.address] = data[offset];
        } else {
            if (missingStart < 0) missingStart = targetAddress;
            missingValues.push(data[offset]);
        }
    }
    flushMissing();
    return mergeAdjacentSegments([...result, ...missing]);
}

// Parse sparse Intel HEX without flattening gaps between address ranges.
export function parseM33Hex(input: Uint8Array): M33Segment[] {
    let text = new TextDecoder().decode(input);
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

    const records: M33Segment[] = [];
    let addressBase = 0;
    let sawEof = false;

    for (const originalLine of text.split(/\r?\n/)) {
        const line = originalLine.trim();
        if (!line) continue;
        if (sawEof) throw new Error("Intel HEX contains data after the EOF record");
        if (!/^:(?:[0-9a-fA-F]{2})+$/.test(line)) throw new Error("Invalid Intel HEX record");

        const record = new Uint8Array((line.length - 1) / 2);
        for (let index = 0; index < record.length; index++) {
            record[index] = Number.parseInt(line.slice(index * 2 + 1, index * 2 + 3), 16);
        }

        const count = record[0];
        const address = (record[1] << 8) | record[2];
        const type = record[3];
        const checksum = record.reduce((sum, value) => (sum + value) & 0xff, 0);
        if (record.length !== count + 5 || checksum !== 0) {
            throw new Error("Intel HEX record length or checksum mismatch");
        }

        if (type === 0x00) {
            if (address + count > 0x10000) throw new Error("Intel HEX data record crosses an address boundary");
            for (let offset = 0; offset < count; offset++) {
                const absoluteAddress = addressBase + address + offset;
                if (!Number.isSafeInteger(absoluteAddress) || absoluteAddress > 0xffffffff) {
                    throw new Error("Intel HEX address overflow");
                }
                // Address validation is done for every byte so overflow cannot wrap unnoticed.
            }
            if (count > 0) records.push({address: addressBase + address, data: record.slice(4, 4 + count)});
            continue;
        }

        if (type === 0x01) {
            if (count !== 0 || address !== 0) throw new Error("Invalid Intel HEX EOF record");
            sawEof = true;
            continue;
        }

        if (type === 0x02 || type === 0x04) {
            if (count !== 2 || address !== 0) throw new Error("Invalid Intel HEX extended address record");
            const upper = (record[4] << 8) | record[5];
            addressBase = type === 0x02 ? upper * 16 : upper * 0x10000;
            continue;
        }

        if (type === 0x03 || type === 0x05) {
            if (count !== 4 || address !== 0) throw new Error("Invalid Intel HEX start-address record");
            continue;
        }

        throw new Error(`Unsupported Intel HEX record type ${hex(type, 2)}`);
    }

    if (!sawEof) throw new Error("Intel HEX is missing the EOF record");
    if (records.length === 0) throw new Error("Intel HEX contains no data");
    return mergeAdjacentSegments(records);
}

// Resolve a registered M33 profile, then read profile-specific configuration fields.
export async function readM33DeviceInfo(tools: TiTools, synchronize = true): Promise<M33DeviceInfo> {
    if (synchronize) await tools.sync();
    const chipId = await tools.chipId();
    const chipIdHex = bytesToHex(chipId);
    const candidates = M33_DEVICE_PROFILES.filter((candidate) => candidate.romChipIds.includes(chipIdHex));
    if (candidates.length === 0) {
        const supportedIds = [...new Set(M33_DEVICE_PROFILES.flatMap((profile) => profile.romChipIds))].join(", ");
        throw new Error(`Unsupported TI M33 chip ID ${chipIdHex || "<empty>"}; supported IDs: ${supportedIds}`);
    }

    let selected: M33ProfileProbe | null = null;
    let lastProbe: M33ProfileProbe | null = null;
    let lastProbeError: unknown = null;
    for (const candidate of candidates) {
        try {
            const probe = await probeM33Profile(tools, candidate, chipIdHex);
            lastProbe = probe;
            if (candidate.matches(probe.identity)) {
                selected = probe;
                break;
            }
        } catch (error) {
            lastProbeError = error;
        }
    }
    if (!selected) {
        if (lastProbe) {
            throw new Error(
                `Unsupported TI M33 identity: chip=${chipIdHex}, wafer=${hex(lastProbe.identity.waferId, 4)}, flash=${lastProbe.identity.flashSizeBytes} bytes, USER_ID=${bytesToHex(lastProbe.identity.userIdRaw)}`,
            );
        }
        const detail = lastProbeError instanceof Error ? `: ${lastProbeError.message}` : "";
        throw new Error(`Unable to probe a TI M33 device profile${detail}`);
    }

    const {profile, identity, revision} = selected;
    const {memory, offsets} = profile;
    const {waferId, pgRevision, flashSizeBytes, userIdRaw: userId} = identity;
    const ieeeLow = await readWord(tools, memory.fcfgBase + offsets.primaryIeee);
    const ieeeHigh = await readWord(tools, memory.fcfgBase + offsets.primaryIeee + 4);
    const secondaryIeeeLow = await readWord(tools, memory.ccfgBase + offsets.secondaryIeee);
    const secondaryIeeeHigh = await readWord(tools, memory.ccfgBase + offsets.secondaryIeee + 4);
    const bootloaderConfig = await readWord(tools, memory.ccfgBase + offsets.bootloaderConfig);

    const packageName =
        ({
            0x00: "4x4mm",
            0x01: "5x5mm",
            0x02: "7x7mm",
            0x03: "Wafer",
            0x04: "2.7x2.7mm",
            0x05: "7x7mm Q1",
        } as Record<number, string>)[userId[2] & 0x07] ?? "Unknown";
    const primaryIeeeRaw = new Uint8Array([...ieeeLow, ...ieeeHigh]);
    const secondaryIeeeRaw = new Uint8Array([...secondaryIeeeLow, ...secondaryIeeeHigh]);
    const minorRevision = revision[0] === 0xff ? 0 : revision[0];

    return {
        profile,
        chipIdHex,
        chipModel: `${profile.model} ${profile.formatRevision(pgRevision, minorRevision)}`,
        family: "cc26xx-m33",
        flashSizeBytes,
        ieeeMac: formatIeee(primaryIeeeRaw),
        waferId,
        pgRevision,
        packageName,
        pageSizeBytes: memory.ccfgSizeBytes,
        ccfgAddress: memory.ccfgBase,
        ccfgSizeBytes: memory.ccfgSizeBytes,
        bootloaderAddress: memory.ccfgBase + offsets.bootloaderConfig,
        bootloaderConfig,
        bootloaderEnabled: isBootloaderEnabled(bootloaderConfig),
        secondaryIeeeRaw,
    };
}

// Return the secondary IEEE address in display/network byte order.
export function getM33SecondaryIeeeAddress(device: M33DeviceInfo): string {
    return formatIeee(device.secondaryIeeeRaw);
}

// Replace only the secondary IEEE address while preserving the complete independent CCFG sector.
// The target must already be running ROM BSL.
export async function writeM33SecondaryIeeeAddress(
    tools: TiTools,
    address: string,
    expectedDevice: M33DeviceInfo,
    log: (message: string) => void,
    synchronize = true,
): Promise<M33DeviceInfo> {
    const liveDevice = await readM33DeviceInfo(tools, synchronize);
    const {memory, offsets} = liveDevice.profile;
    if (
        liveDevice.profile.key !== expectedDevice.profile.key ||
        liveDevice.chipIdHex !== expectedDevice.chipIdHex ||
        liveDevice.waferId !== expectedDevice.waferId ||
        liveDevice.flashSizeBytes !== expectedDevice.flashSizeBytes
    ) {
        throw new Error("M33 device identity changed before the IEEE write; operation was refused");
    }
    if (!liveDevice.bootloaderEnabled) {
        throw new Error("CCFG.BL_CONFIG does not currently enable ROM BSL; IEEE write was refused");
    }
    if (!liveDevice.profile.capabilities.secondaryIeee) {
        throw new Error(`${liveDevice.profile.model} does not support secondary IEEE operations`);
    }

    log(`Reading and validating the ${memory.ccfgSizeBytes}-byte CCFG sector...`);
    const ccfg = await readMemoryRange(tools, memory.ccfgBase, memory.ccfgSizeBytes);
    const originalCrc = crc32(ccfg);
    const deviceOriginalCrc = await tools.crc32Cc26xx(memory.ccfgBase, memory.ccfgSizeBytes);
    if (deviceOriginalCrc !== originalCrc) {
        throw new Error(
            `CCFG read CRC32 mismatch: device=${hex(deviceOriginalCrc)}, local=${hex(originalCrc)}`,
        );
    }

    const bootloaderConfig = ccfg.slice(offsets.bootloaderConfig, offsets.bootloaderConfig + 4);
    if (!isBootloaderEnabled(bootloaderConfig)) {
        throw new Error(
            `Preserved CCFG would disable ROM BSL (BL_CONFIG=${bytesToHex(bootloaderConfig)}); IEEE write was refused`,
        );
    }

    const displayBytes = parseIeeeAddress(address);
    const storedBytes = copyBytes(displayBytes).reverse();
    const currentBytes = ccfg.slice(offsets.secondaryIeee, offsets.secondaryIeee + storedBytes.length);
    if (currentBytes.every((value, index) => value === storedBytes[index])) {
        log(`Secondary IEEE address is already ${formatIeee(storedBytes)}; CCFG was not erased`);
        return liveDevice;
    }
    const originalCcfg = copyBytes(ccfg);
    ccfg.set(storedBytes, offsets.secondaryIeee);
    await validateCcfgRewrite(tools, liveDevice.profile, originalCcfg, ccfg);

    log(`Erasing independent CCFG sector at ${hex(memory.ccfgBase)}...`);
    await tools.sectorErase(memory.ccfgBase);
    for (let offset = 0; offset < ccfg.length; offset += WRITE_CHUNK_SIZE) {
        const chunk = ccfg.subarray(offset, Math.min(offset + WRITE_CHUNK_SIZE, ccfg.length));
        if (!isErased(chunk)) await tools.downloadTo(memory.ccfgBase + offset, chunk);
    }

    const expectedCrc = crc32(ccfg);
    const writtenCrc = await tools.crc32Cc26xx(memory.ccfgBase, memory.ccfgSizeBytes);
    if (writtenCrc !== expectedCrc) {
        throw new Error(`CCFG CRC32 mismatch after IEEE write: device=${hex(writtenCrc)}, image=${hex(expectedCrc)}`);
    }

    const updatedDevice = await readM33DeviceInfo(tools, false);
    if (!updatedDevice.secondaryIeeeRaw.every((value, index) => value === storedBytes[index])) {
        throw new Error("Secondary IEEE read-back mismatch after CCFG programming");
    }
    log(`Secondary IEEE address written and CCFG CRC32 verified: ${getM33SecondaryIeeeAddress(updatedDevice)}`);
    return updatedDevice;
}

// Validate writable ranges and build the exact image used for write and CRC verification.
export function prepareM33Image(
    segments: M33Segment[],
    device: M33DeviceInfo,
    preservedCcfg?: Uint8Array,
): M33ImagePlan {
    const {profile} = device;
    const {memory, offsets} = profile;
    if (
        !M33_DEVICE_PROFILES.some((candidate) => candidate.key === profile.key) ||
        !profile.romChipIds.includes(device.chipIdHex) ||
        device.waferId !== profile.waferId ||
        device.flashSizeBytes !== profile.flashSizeBytes
    ) {
        throw new Error(`M33 device profile was not validated for ${profile.model}`);
    }
    if (segments.length === 0) throw new Error("M33 firmware contains no data segments");

    let main: M33Segment[] = [];
    let ccfg: M33Segment[] = [];
    let previousEnd = -1;
    const sorted = [...segments].sort((left, right) => left.address - right.address);
    for (const segment of sorted) {
        const end = segment.address + segment.data.length;
        if (
            !Number.isSafeInteger(segment.address) ||
            !Number.isSafeInteger(end) ||
            segment.address < 0 ||
            end <= segment.address
        ) {
            throw new Error(`Invalid M33 segment at ${hex(segment.address)}`);
        }

        if (segment.address < previousEnd) throw new Error(`M33 firmware segments overlap at ${hex(segment.address)}`);
        previousEnd = end;

        if (segment.address < device.flashSizeBytes && end <= device.flashSizeBytes) {
            main.push({address: segment.address, data: copyBytes(segment.data)});
        } else if (segment.address >= memory.ccfgBase && end <= memory.ccfgBase + memory.ccfgSizeBytes) {
            ccfg.push({address: segment.address, data: copyBytes(segment.data)});
        } else {
            throw new Error(
                `M33 segment ${hex(segment.address)}..${hex(end - 1)} is outside main flash and CCFG`,
            );
        }

    }

    if (main.length === 0) throw new Error("M33 firmware does not contain a main-flash segment");
    main = alignSegments(main);
    let imageBootloaderConfig: Uint8Array;
    try {
        imageBootloaderConfig = readSegmentBytes(ccfg, memory.ccfgBase + offsets.bootloaderConfig, 4);
    } catch {
        throw new Error("M33 firmware does not contain CCFG.BL_CONFIG");
    }
    if (!isBootloaderEnabled(imageBootloaderConfig)) {
        throw new Error(
            `M33 firmware disables the ROM bootloader (CCFG.BL_CONFIG=${bytesToHex(imageBootloaderConfig)}); flashing was refused`,
        );
    }
    if (imageBootloaderConfig[1] === 0xff || imageBootloaderConfig[1] > 63) {
        throw new Error(`M33 firmware has an invalid bootloader backdoor pin ${imageBootloaderConfig[1]}`);
    }

    let restoredSecondaryIeee = false;
    const secondaryIeeePresent = device.secondaryIeeeRaw.some((value) => value !== 0xff);
    if (secondaryIeeePresent) {
        for (let offset = 0; offset < device.secondaryIeeeRaw.length; offset++) {
            const targetAddress = memory.ccfgBase + offsets.secondaryIeee + offset;
            const segment = ccfg.find(
                (candidate) => targetAddress >= candidate.address && targetAddress < candidate.address + candidate.data.length,
            );
            const existing = segment?.data[targetAddress - segment.address];
            if (existing !== device.secondaryIeeeRaw[offset]) restoredSecondaryIeee = true;
        }
        ccfg = overlayBytes(ccfg, memory.ccfgBase + offsets.secondaryIeee, device.secondaryIeeeRaw);
    }

    if (preservedCcfg) {
        if (preservedCcfg.length !== memory.ccfgSizeBytes) throw new Error("Invalid preserved CCFG sector size");
        const completeCcfg = copyBytes(preservedCcfg);
        for (const segment of ccfg) completeCcfg.set(segment.data, segment.address - memory.ccfgBase);
        ccfg = [{address: memory.ccfgBase, data: completeCcfg}];
    }

    ccfg.sort((left, right) => {
        const bootloaderAddress = memory.ccfgBase + offsets.bootloaderConfig;
        const leftContains = left.address <= bootloaderAddress && left.address + left.data.length > bootloaderAddress;
        const rightContains = right.address <= bootloaderAddress && right.address + right.data.length > bootloaderAddress;
        if (leftContains !== rightContains) return leftContains ? -1 : 1;
        return left.address - right.address;
    });
    const totalBytes = [...main, ...ccfg].reduce((total, segment) => total + segment.data.length, 0);
    return {
        main,
        ccfg,
        totalBytes,
        bootloaderConfig: imageBootloaderConfig,
        secondaryIeeePresent,
        restoredSecondaryIeee,
    };
}

function isErased(data: Uint8Array): boolean {
    return data.every((value) => value === 0xff);
}

async function writeSegments(
    tools: TiTools,
    segments: M33Segment[],
    phase: string,
    totalBytes: number,
    completed: { bytes: number },
    progress: M33ProgramOptions["progress"],
): Promise<void> {
    for (const segment of segments) {
        for (let offset = 0; offset < segment.data.length; offset += WRITE_CHUNK_SIZE) {
            const chunk = segment.data.subarray(offset, Math.min(offset + WRITE_CHUNK_SIZE, segment.data.length));
            if (!isErased(chunk)) await tools.downloadTo(segment.address + offset, chunk);
            completed.bytes += chunk.length;
            progress(Math.round((completed.bytes / totalBytes) * 100), `${phase}: ${completed.bytes} / ${totalBytes}`);
        }
    }
}

async function verifySegments(
    tools: TiTools,
    segments: M33Segment[],
    phase: string,
    log: M33ProgramOptions["log"],
): Promise<void> {
    for (const segment of segments) {
        const targetCrc = await tools.crc32Cc26xx(segment.address, segment.data.length);
        const imageCrc = crc32(segment.data);
        if (targetCrc !== imageCrc) {
            throw new Error(
                `${phase} CRC32 mismatch at ${hex(segment.address)}: device=${hex(targetCrc)}, image=${hex(imageCrc)}`,
            );
        }
        log(`${phase} CRC32 OK at ${hex(segment.address)} (${segment.data.length} bytes)`);
    }
}

// Safely program main flash first, then the independent CCFG sector.
export async function programM33(
    tools: TiTools,
    segments: M33Segment[],
    expectedDevice: M33DeviceInfo,
    options: M33ProgramOptions,
): Promise<void> {
    if (options.erase && !options.write) throw new Error("M33 erase-only operation is disabled for safety");
    if (options.write && !options.erase) throw new Error("M33 writes require main-bank and CCFG erase");
    if (options.write && !options.verify) throw new Error("M33 writes require CRC32 verification");
    if (!options.write && !options.verify) throw new Error("Select Write or Verify for the M33 operation");

    const liveDevice = await readM33DeviceInfo(tools, options.synchronize !== false);
    if (
        liveDevice.profile.key !== expectedDevice.profile.key ||
        liveDevice.chipIdHex !== expectedDevice.chipIdHex ||
        liveDevice.waferId !== expectedDevice.waferId ||
        liveDevice.flashSizeBytes !== expectedDevice.flashSizeBytes
    ) {
        throw new Error("M33 device identity changed after firmware selection; operation was refused");
    }
    // Validate the image before reading the preservation snapshot, and never erase on a bad read.
    prepareM33Image(segments, liveDevice);
    const {memory} = liveDevice.profile;
    const preservedCcfg = await readMemoryRange(tools, memory.ccfgBase, memory.ccfgSizeBytes);
    if (await tools.crc32Cc26xx(memory.ccfgBase, memory.ccfgSizeBytes) !== crc32(preservedCcfg)) {
        throw new Error("CCFG read CRC32 mismatch; flashing was refused before erasing");
    }
    const plan = prepareM33Image(segments, liveDevice, preservedCcfg);
    options.log(
        `M33 image validated: ${plan.main.length} main segment(s), ${plan.ccfg.length} CCFG segment(s), ${plan.totalBytes} bytes`,
    );
    options.log(
        `CCFG.BL_CONFIG=${bytesToHex(plan.bootloaderConfig)}; secondary IEEE ${
            !plan.secondaryIeeePresent
                ? "is unset on the device, so the firmware value is retained"
                : plan.restoredSecondaryIeee
                    ? "will be restored from the device"
                    : "already matches the device"
        }`,
    );

    if (!options.write) {
        await verifySegments(tools, plan.main, "Main flash", options.log);
        await verifySegments(tools, plan.ccfg, "CCFG", options.log);
        options.progress(100, "M33 verification complete");
        return;
    }

    await validateCcfgRewrite(tools, liveDevice.profile, preservedCcfg, plan.ccfg[0].data);
    options.log("Erasing M33 main flash bank...");
    options.progress(0, "Erasing main flash");
    await tools.bankErase();

    const completed = {bytes: 0};
    await writeSegments(tools, plan.main, "Writing main flash", plan.totalBytes, completed, options.progress);
    await verifySegments(tools, plan.main, "Main flash", options.log);

    // Keep the original CCFG intact until the main image has passed CRC verification.
    options.log(`Erasing independent CCFG sector at ${hex(liveDevice.profile.memory.ccfgBase)}...`);
    await tools.sectorErase(liveDevice.profile.memory.ccfgBase);
    await writeSegments(tools, plan.ccfg, "Writing CCFG", plan.totalBytes, completed, options.progress);
    await verifySegments(tools, plan.ccfg, "CCFG", options.log);
    options.progress(100, "M33 write and verification complete");
}
