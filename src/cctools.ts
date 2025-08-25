import { BslClient, LinkAdapter } from "./protocols/bsl";

export type Link = {
  write: (d: Uint8Array) => Promise<void>;
  onData: (cb: (d: Uint8Array) => void) => void;
};

// ---------------- BSL ----------------
export async function bslSync(link: Link): Promise<BslClient> {
  const bsl = new BslClient(new LinkAdapter(link.write, link.onData));
  await bsl.sync();
  return bsl;
}

// ---------------- Chip description ----------------
export function getChipDescription(chipIdPkt: Uint8Array, wafer_id: number, pg_rev: number, mode_cfg: number): string {
  const chip_id = ((chipIdPkt[0] << 8) | chipIdPkt[1]) >>> 0;
  if (chip_id === 0xb964 || chip_id === 0xb965) return "CC2538";
  if (chip_id === 0x1202 && wafer_id === 0xbb77 && pg_rev === 0x1) return "CC2652P7";
  if (chip_id === 0x3202 && wafer_id === 0xbb41 && pg_rev === 0x3 && mode_cfg === 0xc1) return "CC2652P2_launchpad";
  if (chip_id === 0x3202 && wafer_id === 0xbb41 && pg_rev === 0x3 && mode_cfg === 0xfa) return "CC2652P2_other";
  if (chip_id === 0x3202 && wafer_id === 0xbb41 && pg_rev === 0x3) return "CC2652P2";
  if (chip_id === 0x3102 && wafer_id === 0xbb41 && pg_rev === 0x3) return "CC2652RB";
  return `Unknown (C:${chip_id.toString(16).toUpperCase()},W:${wafer_id.toString(16).toUpperCase()},P:${pg_rev
    .toString(16)
    .toUpperCase()},M:${mode_cfg.toString(16).toUpperCase()})`;
}

// --------------- MT/ZNP helpers ---------------
export function xorFcs(bytes: number[]): number {
  return bytes.reduce((a, b) => a ^ (b & 0xff), 0);
}

export async function sendMtAndWait(
  link: Link,
  cmd0: number,
  cmd1: number,
  payload: number[] = [],
  timeoutMs = 1500
): Promise<{ cmd0: number; cmd1: number; payload: Uint8Array } | null> {
  const len = payload.length & 0xff;
  const fcs = xorFcs([len, cmd0 & 0xff, cmd1 & 0xff, ...payload]);
  const frame = new Uint8Array([0xfe, len, cmd0 & 0xff, cmd1 & 0xff, ...payload, fcs & 0xff]);
  await link.write(frame);
  const chunks: number[] = [];
  return await new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const onData = (d: Uint8Array) => {
      chunks.push(...d);
      for (let i = 0; i < chunks.length; i++) {
        if (chunks[i] !== 0xfe) continue;
        if (i + 4 >= chunks.length) break;
        const l = chunks[i + 1];
        const end = i + 5 + l - 1;
        if (end >= chunks.length) break;
        const cmd0r = chunks[i + 2];
        const cmd1r = chunks[i + 3];
        const payloadR = chunks.slice(i + 4, i + 4 + l);
        const fcsr = chunks[i + 4 + l];
        const calc = xorFcs([l, cmd0r, cmd1r, ...payloadR]);
        if ((calc & 0xff) === (fcsr & 0xff)) {
          resolve({ cmd0: cmd0r, cmd1: cmd1r, payload: new Uint8Array(payloadR) });
          return;
        }
      }
      if (Date.now() > deadline) resolve(null);
    };
    link.onData(onData);
  });
}

export function statusOk(status: number): boolean {
  return status === 0; // 0 = SUCCESS
}

export function osalIdFromHex(hex: string): number {
  if (/^0x/i.test(hex)) return parseInt(hex, 16) & 0xffff;
  return parseInt(hex, 10) & 0xffff;
}

export async function getFwVersion(link: Link): Promise<{
  transportrev: number;
  product: number;
  major: number;
  minor: number;
  maint: number;
  fwRev: number;
  payload: Uint8Array;
} | null> {
  const resp = await sendMtAndWait(link, 0x21, 0x02, [], 2000);
  if (!resp || resp.cmd0 !== 0x61 || resp.cmd1 !== 0x02) return null;
  const p = resp.payload;
  if (p.length >= 9) {
    const transportrev = p[0];
    const product = p[1];
    const major = p[2];
    const minor = p[3];
    const maint = p[4];
    const fwRev = (p[5] | (p[6] << 8) | (p[7] << 16) | (p[8] << 24)) >>> 0;
    return { transportrev, product, major, minor, maint, fwRev, payload: p };
  }
  return null;
}

export async function pingApp(link: Link, timeoutMs = 500): Promise<boolean> {
  const resp = await sendMtAndWait(link, 0x21, 0x01, [], timeoutMs);
  return !!(resp && resp.cmd0 === 0x61 && resp.cmd1 === 0x01);
}

// ----------- Legacy OSAL NV -----------
export async function sysOsalNvLength(link: Link, id: number): Promise<number | null> {
  const idLo = id & 0xff,
    idHi = (id >> 8) & 0xff;
  const resp = await sendMtAndWait(link, 0x21, 0x13, [idLo, idHi], 1500);
  if (!resp) return null;
  const len = (resp.payload[0] | (resp.payload[1] << 8)) >>> 0;
  return len;
}

export async function sysOsalNvRead(link: Link, id: number, offset = 0, length?: number): Promise<Uint8Array | null> {
  const idLo = id & 0xff,
    idHi = (id >> 8) & 0xff;
  const offLo = offset & 0xff,
    offHi = (offset >> 8) & 0xff;
  const len = typeof length === "number" ? length : 0;
  const resp = await sendMtAndWait(link, 0x21, 0x08, [idLo, idHi, offLo, offHi, len & 0xff], 2000);
  if (!resp) return null;
  const st = resp.payload[0] ?? 1;
  if (!statusOk(st)) return null;
  const l = resp.payload[1] ?? 0;
  return new Uint8Array(resp.payload.subarray(2, 2 + l));
}

export async function sysOsalNvReadExtAll(link: Link, id: number, totalLen: number): Promise<Uint8Array> {
  const idLo = id & 0xff,
    idHi = (id >> 8) & 0xff;
  const out: number[] = [];
  let offset = 0;
  while (offset < totalLen) {
    const offLo = offset & 0xff,
      offHi = (offset >> 8) & 0xff;
    const resp = await sendMtAndWait(link, 0x21, 0x1c, [idLo, idHi, offLo, offHi], 2000);
    if (!resp) break;
    const st = resp.payload[0] ?? 1;
    if (!statusOk(st)) break;
    const chunk = Array.from(resp.payload.subarray(1));
    if (chunk.length === 0) break;
    out.push(...chunk);
    offset += chunk.length;
    if (chunk.length < 1) break;
  }
  return new Uint8Array(out.slice(0, totalLen));
}

export async function sysOsalNvItemInit(link: Link, id: number, length: number): Promise<boolean> {
  const idLo = id & 0xff,
    idHi = (id >> 8) & 0xff;
  const lenLo = length & 0xff,
    lenHi = (length >> 8) & 0xff;
  const resp = await sendMtAndWait(link, 0x21, 0x07, [idLo, idHi, lenLo, lenHi], 2000);
  if (!resp) return false;
  const st = resp.payload[0] ?? 1;
  return statusOk(st) || st === 9;
}

export async function sysOsalNvWrite(link: Link, id: number, value: Uint8Array, offset = 0): Promise<boolean> {
  const idLo = id & 0xff,
    idHi = (id >> 8) & 0xff;
  const offLo = offset & 0xff,
    offHi = (offset >> 8) & 0xff;
  const len = value.length & 0xff;
  const payload = [idLo, idHi, offLo, offHi, len, ...Array.from(value)];
  const resp = await sendMtAndWait(link, 0x21, 0x09, payload, 4000);
  if (!resp) return false;
  return statusOk(resp.payload[0] ?? 1);
}

export async function sysOsalNvDelete(link: Link, id: number): Promise<boolean> {
  const idLo = id & 0xff,
    idHi = (id >> 8) & 0xff;
  const resp = await sendMtAndWait(link, 0x21, 0x12, [idLo, idHi], 2000);
  if (!resp) return false;
  return statusOk(resp.payload[0] ?? 1);
}

// ----------- Extended NV -----------
export async function sysNvLength(link: Link, itemId: number, subId: number): Promise<number | null> {
  const sysId = 0x01;
  const payload = [sysId, itemId & 0xff, (itemId >> 8) & 0xff, subId & 0xff, (subId >> 8) & 0xff];
  const resp = await sendMtAndWait(link, 0x21, 0x32, payload, 1500);
  if (!resp) return null;
  const p = resp.payload;
  if (p.length < 4) return null;
  const len = (p[0] | (p[1] << 8) | (p[2] << 16) | (p[3] << 24)) >>> 0;
  return len;
}

export async function sysNvRead(
  link: Link,
  itemId: number,
  subId: number,
  totalLen: number
): Promise<Uint8Array | null> {
  const sysId = 0x01;
  const out: number[] = [];
  let offset = 0;
  while (offset < totalLen) {
    const payload = [
      sysId,
      itemId & 0xff,
      (itemId >> 8) & 0xff,
      subId & 0xff,
      (subId >> 8) & 0xff,
      offset & 0xff,
      (offset >> 8) & 0xff,
      Math.min(244, totalLen - offset) & 0xff,
    ];
    const resp = await sendMtAndWait(link, 0x21, 0x33, payload, 2000);
    if (!resp) return null;
    const st = resp.payload[0] ?? 1;
    if (!statusOk(st)) return null;
    const chunk = Array.from(resp.payload.subarray(1));
    if (chunk.length === 0) break;
    out.push(...chunk);
    offset += chunk.length;
    if (chunk.length < 1) break;
  }
  return new Uint8Array(out.slice(0, totalLen));
}

export async function sysNvCreate(link: Link, itemId: number, subId: number, length: number): Promise<boolean> {
  const sysId = 0x01;
  const payload = [
    sysId,
    itemId & 0xff,
    (itemId >> 8) & 0xff,
    subId & 0xff,
    (subId >> 8) & 0xff,
    length & 0xff,
    (length >> 8) & 0xff,
    (length >> 16) & 0xff,
    (length >> 24) & 0xff,
  ];
  const resp = await sendMtAndWait(link, 0x21, 0x30, payload, 2000);
  if (!resp) return false;
  return statusOk(resp.payload[0] ?? 1) || (resp.payload[0] ?? 1) === 0x0a;
}

export async function sysNvWrite(link: Link, itemId: number, subId: number, value: Uint8Array): Promise<boolean> {
  const sysId = 0x01;
  for (let offset = 0; offset < value.length; offset += 244) {
    const slice = value.subarray(offset, Math.min(value.length, offset + 244));
    const payload = [
      sysId,
      itemId & 0xff,
      (itemId >> 8) & 0xff,
      subId & 0xff,
      (subId >> 8) & 0xff,
      offset & 0xff,
      (offset >> 8) & 0xff,
      ...Array.from(slice),
    ];
    const resp = await sendMtAndWait(link, 0x21, 0x34, payload, 3000);
    if (!resp || !statusOk(resp.payload[0] ?? 1)) return false;
  }
  return true;
}

export async function sysNvDelete(link: Link, itemId: number, subId: number): Promise<boolean> {
  const sysId = 0x01;
  const payload = [sysId, itemId & 0xff, (itemId >> 8) & 0xff, subId & 0xff, (subId >> 8) & 0xff];
  const resp = await sendMtAndWait(link, 0x21, 0x31, payload, 1500);
  if (!resp) return false;
  return statusOk(resp.payload[0] ?? 1);
}

export async function nvramReadLegacyFull(
  link: Link,
  progress?: (pct: number, label?: string) => void
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const ranges: Array<[number, number]> = [
    [0x0001, 0x03ff],
    [0x0f00, 0x0fff],
  ];
  let totalIds = 0;
  for (const [s, e] of ranges) totalIds += e - s + 1;
  let processed = 0;
  for (const [start, end] of ranges) {
    for (let id = start; id <= end; id++) {
      try {
        const len = await sysOsalNvLength(link, id);
        if (!len || len === 0) continue;
        const val = await sysOsalNvReadExtAll(link, id, Math.min(len, 4096));
        if (!val || val.length === 0) continue;
        out["0x" + id.toString(16).toUpperCase().padStart(4, "0")] = Array.from(val)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      } catch {
      } finally {
        processed++;
        progress?.((processed / totalIds) * 35, `Legacy ${processed} / ${totalIds}`);
      }
    }
  }
  return out;
}

export async function nvramReadExtendedAll(
  link: Link,
  progress?: (pct: number, label?: string) => void
): Promise<Record<string, Record<string, string>> | null> {
  const exNames: Record<number, string> = {
    0x0001: "ADDRMGR",
    0x0002: "BINDING_TABLE",
    0x0003: "DEVICE_LIST",
    0x0004: "TCLK_TABLE",
    0x0005: "TCLK_IC_TABLE",
    0x0006: "APS_KEY_DATA_TABLE",
    0x0007: "NWK_SEC_MATERIAL_TABLE",
  };
  const out: Record<string, Record<string, string>> = {};
  const probe = await sysNvLength(link, 0x0001, 0x0000);
  if (probe === null) return null;
  const tableIds = Object.keys(exNames).map((k) => parseInt(k, 10));
  let tIndex = 0;
  for (const itemId of tableIds) {
    const itemObj: Record<string, string> = {};
    for (let subId = 0; subId <= 0xffff; subId++) {
      try {
        const len = await sysNvLength(link, itemId, subId);
        if (!len || len === 0) break;
        const val = await sysNvRead(link, itemId, subId, Math.min(len, 65535));
        if (!val) break;
        itemObj["0x" + subId.toString(16).toUpperCase().padStart(4, "0")] = Array.from(val)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        progress?.(
          35 + Math.min(55, (tIndex / Math.max(1, tableIds.length)) * 55),
          `${exNames[itemId]}:${"0x" + subId.toString(16).toUpperCase().padStart(4, "0")}`
        );
      } catch {
        break;
      }
    }
    if (Object.keys(itemObj).length > 0) out[exNames[itemId]] = itemObj;
    tIndex++;
  }
  return out;
}

export async function nvramReadAll(link: Link, progress?: (pct: number, label?: string) => void): Promise<any> {
  progress?.(0, "Reading…");
  const legacy = await nvramReadLegacyFull(link, progress);
  const extended = await nvramReadExtendedAll(link, progress);
  const payload: any = { LEGACY: legacy };
  if (extended) Object.assign(payload, extended);
  progress?.(100, "Done");
  return payload;
}

export async function nvramEraseAll(link: Link, progress?: (pct: number, label?: string) => void): Promise<void> {
  progress?.(0, "Erasing…");
  const legacy = await nvramReadLegacyFull(link, progress);
  let totalL = Math.max(1, Object.keys(legacy).length);
  let doneL = 0;
  for (const key of Object.keys(legacy)) {
    try {
      await sysOsalNvDelete(link, osalIdFromHex(key));
    } catch {}
    doneL++;
    progress?.(Math.min(50, (doneL / totalL) * 50), `Erase legacy ${doneL}/${totalL}`);
  }
  const extended = await nvramReadExtendedAll(link, progress);
  if (extended) {
    const nameToId: Record<string, number> = {
      ADDRMGR: 0x0001,
      BINDING_TABLE: 0x0002,
      DEVICE_LIST: 0x0003,
      TCLK_TABLE: 0x0004,
      TCLK_IC_TABLE: 0x0005,
      APS_KEY_DATA_TABLE: 0x0006,
      NWK_SEC_MATERIAL_TABLE: 0x0007,
    };
    const names = Object.keys(extended);
    let idx = 0;
    for (const name of names) {
      const itemId = nameToId[name];
      if (!itemId) continue;
      idx++;
      for (let subId = 0; subId <= 0xffff; subId++) {
        const ok = await sysNvDelete(link, itemId, subId);
        if (!ok) break;
        progress?.(
          50 + Math.min(45, ((idx - 1) / Math.max(1, names.length)) * 45),
          `${name}:${"0x" + subId.toString(16).toUpperCase().padStart(4, "0")}`
        );
      }
    }
  }
  progress?.(100, "Erase done");
}

export async function nvramWriteAll(
  link: Link,
  obj: any,
  log?: (s: string) => void,
  progress?: (pct: number, label?: string) => void
): Promise<void> {
  progress?.(0, "Writing…");
  const legacy = (obj.legacy || obj.LEGACY || {}) as Record<string, string>;
  let total = Math.max(1, Object.keys(legacy).length);
  let count = 0;
  for (const key of Object.keys(legacy)) {
    const id = osalIdFromHex(key);
    const hex = legacy[key];
    const bytes = new Uint8Array(hex.match(/.{1,2}/g)?.map((h: string) => parseInt(h, 16)) || []);
    try {
      await sysOsalNvItemInit(link, id, bytes.length);
      await sysOsalNvWrite(link, id, bytes, 0);
      log?.(`NVRAM LEGACY write 0x${id.toString(16)} len=${bytes.length} => OK`);
    } catch (e: any) {
      log?.(`NVRAM LEGACY write fail id=0x${id.toString(16)}: ${e?.message || String(e)}`);
    }
    count++;
    progress?.(Math.min(40, (count / total) * 40), `Legacy ${count}/${total}`);
  }
  const nameToId: Record<string, number> = {
    ADDRMGR: 0x0001,
    BINDING_TABLE: 0x0002,
    DEVICE_LIST: 0x0003,
    TCLK_TABLE: 0x0004,
    TCLK_IC_TABLE: 0x0005,
    APS_KEY_DATA_TABLE: 0x0006,
    NWK_SEC_MATERIAL_TABLE: 0x0007,
  };
  const extSupported = (await sysNvLength(link, 0x0001, 0x0000)) !== null;
  if (extSupported) {
    const names = Object.keys(nameToId);
    let idx = 0;
    for (const [name, itemId] of Object.entries(nameToId)) {
      const section = obj[name];
      if (!section) continue;
      idx++;
      for (const subKey of Object.keys(section)) {
        const subId = osalIdFromHex(subKey);
        const hex = section[subKey] as string;
        const bytes = new Uint8Array(hex.match(/.{1,2}/g)?.map((h: string) => parseInt(h, 16)) || []);
        try {
          const created = await sysNvCreate(link, itemId, subId, bytes.length);
          if (!created) {
            await sysNvDelete(link, itemId, subId);
            await sysNvCreate(link, itemId, subId, bytes.length);
          }
          const ok = await sysNvWrite(link, itemId, subId, bytes);
          log?.(
            `NVRAM EX ${name}[${"0x" + subId.toString(16).toUpperCase().padStart(4, "0")}] len=${bytes.length} => ${
              ok ? "OK" : "ERR"
            }`
          );
        } catch (e: any) {
          log?.(
            `NVRAM EX write fail ${name}[${"0x" + subId.toString(16).toUpperCase().padStart(4, "0")}]: ${
              e?.message || String(e)
            }`
          );
        }
        progress?.(
          40 + Math.min(55, ((idx - 1) / Math.max(1, names.length)) * 55),
          `${name}:${"0x" + subId.toString(16).toUpperCase().padStart(4, "0")}`
        );
      }
    }
  }
  progress?.(100, "Write done");
}
