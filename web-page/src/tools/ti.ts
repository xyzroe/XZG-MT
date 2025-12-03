import { Link } from "../types/index";
import { sleep, toHex } from "../utils/index";
import { saveToFile } from "../utils/http";

export type TiChipFamily = "cc26xx" | "cc2538";

interface NvramBundle {
  LEGACY?: Record<string, string>;
  legacy?: Record<string, string>;
  [section: string]: Record<string, string> | undefined;
}

// ---------------- NVRAM Class ----------------
class NVRAM {
  private link: Link;
  private logger: (msg: string) => void = () => {};
  // private progressCallback: (percent: number, msg: string) => void = () => {};

  constructor(link: Link) {
    this.link = link;
  }

  public setLogger(logger: (msg: string) => void) {
    this.logger = logger;
  }

  // public setProgressCallback(cb: (percent: number, msg: string) => void) {
  //   this.progressCallback = cb;
  // }

  // --------------- MT/ZNP helpers ---------------
  private xorFcs(bytes: number[]): number {
    return bytes.reduce((a, b) => a ^ (b & 0xff), 0);
  }

  private async sendMtAndWait(
    cmd0: number,
    cmd1: number,
    payload: number[] = [],
    timeoutMs = 1500
  ): Promise<{ cmd0: number; cmd1: number; payload: Uint8Array } | null> {
    const len = payload.length & 0xff;
    const fcs = this.xorFcs([len, cmd0 & 0xff, cmd1 & 0xff, ...payload]);
    const frame = new Uint8Array([0xfe, len, cmd0 & 0xff, cmd1 & 0xff, ...payload, fcs & 0xff]);
    await this.link.write(frame);
    const chunks: number[] = [];

    return await new Promise((resolve) => {
      let done = false;
      const clearDone = (res: { cmd0: number; cmd1: number; payload: Uint8Array } | null) => {
        if (done) return;
        done = true;
        try {
          if (timer != null) window.clearTimeout(timer);
        } catch {
          // ignore
        }
        resolve(res);
      };

      const timer = timeoutMs > 0 ? window.setTimeout(() => clearDone(null), timeoutMs) : null;

      const onData = (chunk: Uint8Array) => {
        if (done) return;
        for (let i = 0; i < chunk.length; i++) chunks.push(chunk[i]);

        // Try to parse one or more frames from buffer
        parseLoop: while (true) {
          // find start byte 0xFE
          const startIdx = chunks.indexOf(0xfe);
          if (startIdx === -1) {
            chunks.length = 0;
            break;
          }
          if (chunks.length - startIdx < 5) break;
          const plLen = chunks[startIdx + 1] & 0xff;
          const fullLen = 5 + plLen;
          if (chunks.length - startIdx < fullLen) break;

          const frameBytes = chunks.splice(startIdx, fullLen);
          const rlen = frameBytes[1];
          const rcmd0 = frameBytes[2];
          const rcmd1 = frameBytes[3];
          const rpayload = frameBytes.slice(4, 4 + rlen);
          const rfcs = frameBytes[4 + rlen] & 0xff;
          const calc = this.xorFcs([rlen & 0xff, rcmd0 & 0xff, rcmd1 & 0xff, ...rpayload]) & 0xff;
          if (calc !== rfcs) {
            continue parseLoop;
          }
          clearDone({ cmd0: rcmd0, cmd1: rcmd1, payload: new Uint8Array(rpayload) });
          return;
        }
      };

      try {
        this.link.onData(onData);
      } catch {
        // if onData registration fails, just rely on timeout
      }
    });
  }

  private statusOk(status: number): boolean {
    return status === 0;
  }

  private osalIdFromHex(hex: string): number {
    if (/^0x/i.test(hex)) return parseInt(hex, 16) & 0xffff;
    return parseInt(hex, 10) & 0xffff;
  }

  // ----------- Legacy OSAL NV -----------
  private async sysOsalNvLength(id: number): Promise<number | null> {
    const idLo = id & 0xff,
      idHi = (id >> 8) & 0xff;
    const resp = await this.sendMtAndWait(0x21, 0x13, [idLo, idHi], 1500);
    if (!resp) return null;
    const len = (resp.payload[0] | (resp.payload[1] << 8)) >>> 0;
    return len;
  }

  private async sysOsalNvReadExtAll(id: number, totalLen: number): Promise<Uint8Array> {
    const idLo = id & 0xff,
      idHi = (id >> 8) & 0xff;
    const out: number[] = [];
    let offset = 0;
    while (offset < totalLen) {
      const offLo = offset & 0xff,
        offHi = (offset >> 8) & 0xff;
      const resp = await this.sendMtAndWait(0x21, 0x1c, [idLo, idHi, offLo, offHi], 2000);
      if (!resp) break;
      const st = resp.payload[0] ?? 1;
      if (!this.statusOk(st)) break;
      const chunk = Array.from(resp.payload.subarray(1));
      if (chunk.length === 0) break;
      out.push(...chunk);
      offset += chunk.length;
      if (chunk.length < 1) break;
    }
    return new Uint8Array(out.slice(0, totalLen));
  }

  private async sysOsalNvItemInit(id: number, length: number): Promise<boolean> {
    const idLo = id & 0xff,
      idHi = (id >> 8) & 0xff;
    const lenLo = length & 0xff,
      lenHi = (length >> 8) & 0xff;
    const resp = await this.sendMtAndWait(0x21, 0x07, [idLo, idHi, lenLo, lenHi], 2000);
    if (!resp) return false;
    const st = resp.payload[0] ?? 1;
    return this.statusOk(st) || st === 9;
  }

  private async sysOsalNvWrite(id: number, value: Uint8Array, offset = 0): Promise<boolean> {
    const idLo = id & 0xff,
      idHi = (id >> 8) & 0xff;
    const offLo = offset & 0xff,
      offHi = (offset >> 8) & 0xff;
    const len = value.length & 0xff;
    const payload = [idLo, idHi, offLo, offHi, len, ...Array.from(value)];
    const resp = await this.sendMtAndWait(0x21, 0x09, payload, 4000);
    if (!resp) return false;
    return this.statusOk(resp.payload[0] ?? 1);
  }

  private async sysOsalNvDelete(id: number): Promise<boolean> {
    const idLo = id & 0xff,
      idHi = (id >> 8) & 0xff;
    const resp = await this.sendMtAndWait(0x21, 0x12, [idLo, idHi], 2000);
    if (!resp) return false;
    return this.statusOk(resp.payload[0] ?? 1);
  }

  // ----------- Extended NV -----------
  private async sysNvLength(itemId: number, subId: number): Promise<number | null> {
    const sysId = 0x01;
    const payload = [sysId, itemId & 0xff, (itemId >> 8) & 0xff, subId & 0xff, (subId >> 8) & 0xff];
    const resp = await this.sendMtAndWait(0x21, 0x32, payload, 1500);
    if (!resp) return null;
    const p = resp.payload;
    if (p.length < 4) return null;
    const len = (p[0] | (p[1] << 8) | (p[2] << 16) | (p[3] << 24)) >>> 0;
    return len;
  }

  private async sysNvRead(itemId: number, subId: number, totalLen: number): Promise<Uint8Array | null> {
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
      const resp = await this.sendMtAndWait(0x21, 0x33, payload, 2000);
      if (!resp) return null;
      const st = resp.payload[0] ?? 1;
      if (!this.statusOk(st)) return null;
      const chunk = Array.from(resp.payload.subarray(1));
      if (chunk.length === 0) break;
      out.push(...chunk);
      offset += chunk.length;
      if (chunk.length < 1) break;
    }
    return new Uint8Array(out.slice(0, totalLen));
  }

  private async sysNvCreate(itemId: number, subId: number, length: number): Promise<boolean> {
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
    const resp = await this.sendMtAndWait(0x21, 0x30, payload, 2000);
    if (!resp) return false;
    return this.statusOk(resp.payload[0] ?? 1) || (resp.payload[0] ?? 1) === 0x0a;
  }

  private async sysNvWrite(itemId: number, subId: number, value: Uint8Array): Promise<boolean> {
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
      const resp = await this.sendMtAndWait(0x21, 0x34, payload, 3000);
      if (!resp || !this.statusOk(resp.payload[0] ?? 1)) return false;
    }
    return true;
  }

  private async sysNvDelete(itemId: number, subId: number): Promise<boolean> {
    const sysId = 0x01;
    const payload = [sysId, itemId & 0xff, (itemId >> 8) & 0xff, subId & 0xff, (subId >> 8) & 0xff];
    const resp = await this.sendMtAndWait(0x21, 0x31, payload, 1500);
    if (!resp) return false;
    return this.statusOk(resp.payload[0] ?? 1);
  }

  // ----------- Read helpers -----------
  private async readLegacyFull(progress?: (pct: number, label?: string) => void): Promise<Record<string, string>> {
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
          const len = await this.sysOsalNvLength(id);
          if (!len || len === 0) continue;
          const val = await this.sysOsalNvReadExtAll(id, Math.min(len, 4096));
          if (!val || val.length === 0) continue;
          out["0x" + id.toString(16).toUpperCase().padStart(4, "0")] = Array.from(val)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
        } catch {
          // ignore
        } finally {
          processed++;
          progress?.((processed / totalIds) * 35, `Legacy ${processed} / ${totalIds}`);
        }
      }
    }
    return out;
  }

  private async readExtendedAll(
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
    const probe = await this.sysNvLength(0x0001, 0x0000);
    if (probe === null) return null;
    const tableIds = Object.keys(exNames).map((k) => parseInt(k, 10));
    let tIndex = 0;
    for (const itemId of tableIds) {
      const itemObj: Record<string, string> = {};
      for (let subId = 0; subId <= 0xffff; subId++) {
        try {
          const len = await this.sysNvLength(itemId, subId);
          if (!len || len === 0) break;
          const val = await this.sysNvRead(itemId, subId, Math.min(len, 65535));
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

  // ============== Public Methods ==============

  public async readAll(progress?: (pct: number, label?: string) => void): Promise<NvramBundle> {
    // const progressCb = progress || ((pct: number, label?: string) => this.progressCallback(pct, label || ""));
    progress?.(0, "Reading...");
    const legacy = await this.readLegacyFull(progress);
    const extended = await this.readExtendedAll(progress);
    const payload: NvramBundle = { LEGACY: legacy };
    if (extended) Object.assign(payload, extended);
    progress?.(100, "Done");
    return payload;
  }

  public async eraseAll(progress?: (pct: number, label?: string) => void): Promise<void> {
    // const progressCb = progress || ((pct: number, label?: string) => this.progressCallback(pct, label || ""));
    progress?.(0, "Erasing...");
    const legacy = await this.readLegacyFull(progress);
    const totalL = Math.max(1, Object.keys(legacy).length);
    let doneL = 0;
    for (const key of Object.keys(legacy)) {
      try {
        await this.sysOsalNvDelete(this.osalIdFromHex(key));
      } catch {
        // ignore
      }
      doneL++;
      progress?.(Math.min(50, (doneL / totalL) * 50), `Erase legacy ${doneL}/${totalL}`);
    }
    const extended = await this.readExtendedAll(progress);
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
          const ok = await this.sysNvDelete(itemId, subId);
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

  public async writeAll(
    obj: NvramBundle,
    log?: (s: string) => void,
    progress?: (pct: number, label?: string) => void
  ): Promise<void> {
    const logCb = log || this.logger;
    // const progressCb = progress || ((pct: number, label?: string) => this.progressCallback(pct, label || ""));
    progress?.(0, "Writing...");
    const legacy: Record<string, string> = obj.legacy || obj.LEGACY || {};
    const total = Math.max(1, Object.keys(legacy).length);
    let count = 0;
    for (const key of Object.keys(legacy)) {
      const id = this.osalIdFromHex(key);
      const hex = legacy[key];
      if (!hex) continue;
      const bytes = new Uint8Array(hex.match(/.{1,2}/g)?.map((h: string) => parseInt(h, 16)) || []);
      try {
        await this.sysOsalNvItemInit(id, bytes.length);
        await this.sysOsalNvWrite(id, bytes, 0);
        logCb(`NVRAM LEGACY write 0x${id.toString(16)} len=${bytes.length} => OK`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logCb(`NVRAM LEGACY write fail id=0x${id.toString(16)}: ${message}`);
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
    const extSupported = (await this.sysNvLength(0x0001, 0x0000)) !== null;
    if (extSupported) {
      const names = Object.keys(nameToId);
      let idx = 0;
      for (const [name, itemId] of Object.entries(nameToId)) {
        const section = obj[name];
        if (!section) continue;
        idx++;
        for (const subKey of Object.keys(section)) {
          const subId = this.osalIdFromHex(subKey);
          const hex = section[subKey];
          if (!hex) continue;
          const bytes = new Uint8Array(hex.match(/.{1,2}/g)?.map((h: string) => parseInt(h, 16)) || []);
          try {
            const created = await this.sysNvCreate(itemId, subId, bytes.length);
            if (!created) {
              await this.sysNvDelete(itemId, subId);
              await this.sysNvCreate(itemId, subId, bytes.length);
            }
            const ok = await this.sysNvWrite(itemId, subId, bytes);
            logCb(
              `NVRAM EX ${name}[${"0x" + subId.toString(16).toUpperCase().padStart(4, "0")}] len=${bytes.length} => ${
                ok ? "OK" : "ERR"
              }`
            );
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logCb(
              `NVRAM EX write fail ${name}[${"0x" + subId.toString(16).toUpperCase().padStart(4, "0")}] : ${message}`
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
}

// ---------------- TiTools Class ----------------
export interface TiDeviceInfo {
  chipIdHex: string;
  chipModel?: string;
  flashSizeBytes?: number;
  ieeeMac?: string;
  family?: TiChipFamily;
}

export class TiTools {
  private link: Link;
  private logger: (msg: string) => void = () => {};
  private progressCallback: (percent: number, msg: string) => void = () => {};
  private setLinesHandler: (rstLevel: boolean, bslLevel: boolean) => void = () => {};

  // BSL protocol state
  private rxBuf: number[] = [];

  // NVRAM helper
  public nvram: NVRAM;

  constructor(link: Link) {
    this.link = link;
    this.link.onData((d) => this.rxBuf.push(...d));
    this.nvram = new NVRAM(link);
  }

  public setLogger(logger: (msg: string) => void) {
    this.logger = logger;
    this.nvram.setLogger(logger);
  }

  public setProgressCallback(cb: (percent: number, msg: string) => void) {
    this.progressCallback = cb;
  }

  public setSetLinesHandler(handler: (rstLevel: boolean, bslLevel: boolean) => void) {
    this.setLinesHandler = handler;
  }

  private async setLines(rstLevel: boolean, bslLevel: boolean): Promise<void> {
    if (!this.setLinesHandler) {
      throw new Error("setLinesHandler not set");
    }
    this.setLinesHandler(rstLevel, bslLevel);
  }

  // ---------------- Chip description ----------------
  private getChipDescription(chipIdPkt: Uint8Array, wafer_id: number, pg_rev: number, mode_cfg: number): string {
    const chip_id = ((chipIdPkt[0] << 8) | chipIdPkt[1]) >>> 0;
    if (chip_id === 0xb964 || chip_id === 0xb965) return "CC2538";
    if (chip_id === 0x1202 && wafer_id === 0xbb77 && pg_rev === 0x1) return "CC2652P7";
    if (chip_id === 0x1282 && wafer_id === 0xbb77 && pg_rev === 0x1) return "CC1352P7";
    if (chip_id === 0x3202 && wafer_id === 0xbb41 && pg_rev === 0x3 && mode_cfg === 0xc1) return "CC2652P2_launchpad";
    if (chip_id === 0x3202 && wafer_id === 0xbb41 && pg_rev === 0x3 && mode_cfg === 0xfa) return "CC2652P2_other";
    if (chip_id === 0x3202 && wafer_id === 0xbb41 && pg_rev === 0x3) return "CC2652P2";
    if (chip_id === 0x3102 && wafer_id === 0xbb41 && pg_rev === 0x3) return "CC2652RB";
    return `Unknown (C:${chip_id.toString(16).toUpperCase()},W:${wafer_id.toString(16).toUpperCase()},P:${pg_rev
      .toString(16)
      .toUpperCase()},M:${mode_cfg.toString(16).toUpperCase()})`;
  }

  // --------------- MT/ZNP helpers ---------------
  private xorFcs(bytes: number[]): number {
    return bytes.reduce((a, b) => a ^ (b & 0xff), 0);
  }

  private async sendMtAndWait(
    cmd0: number,
    cmd1: number,
    payload: number[] = [],
    timeoutMs = 1500
  ): Promise<{ cmd0: number; cmd1: number; payload: Uint8Array } | null> {
    const len = payload.length & 0xff;
    const fcs = this.xorFcs([len, cmd0 & 0xff, cmd1 & 0xff, ...payload]);
    const frame = new Uint8Array([0xfe, len, cmd0 & 0xff, cmd1 & 0xff, ...payload, fcs & 0xff]);
    await this.link.write(frame);
    const chunks: number[] = [];

    return await new Promise((resolve) => {
      let done = false;
      const clearDone = (res: { cmd0: number; cmd1: number; payload: Uint8Array } | null) => {
        if (done) return;
        done = true;
        try {
          if (timer != null) window.clearTimeout(timer);
        } catch {
          // ignore
        }
        resolve(res);
      };

      const timer = timeoutMs > 0 ? window.setTimeout(() => clearDone(null), timeoutMs) : null;

      const onData = (chunk: Uint8Array) => {
        if (done) return;
        for (let i = 0; i < chunk.length; i++) chunks.push(chunk[i]);

        // Try to parse one or more frames from buffer
        parseLoop: while (true) {
          // find start byte 0xFE
          const startIdx = chunks.indexOf(0xfe);
          if (startIdx === -1) {
            // nothing useful
            chunks.length = 0;
            break;
          }
          // need at least start + len + cmd0 + cmd1 + fcs (minimal payload 0) => 5 bytes
          if (chunks.length - startIdx < 5) break;
          const plLen = chunks[startIdx + 1] & 0xff;
          const fullLen = 5 + plLen; // total bytes from start including fcs
          if (chunks.length - startIdx < fullLen) break; // wait for more

          // extract frame
          const frameBytes = chunks.splice(startIdx, fullLen);
          const rlen = frameBytes[1];
          const rcmd0 = frameBytes[2];
          const rcmd1 = frameBytes[3];
          const rpayload = frameBytes.slice(4, 4 + rlen);
          const rfcs = frameBytes[4 + rlen] & 0xff;
          const calc = this.xorFcs([rlen & 0xff, rcmd0 & 0xff, rcmd1 & 0xff, ...rpayload]) & 0xff;
          if (calc !== rfcs) {
            // bad frame, continue searching for next 0xFE
            continue parseLoop;
          }
          // valid frame — resolve if matching command family (0x61 responses)
          // We'll return any frame; callers check cmd0/cmd1
          clearDone({ cmd0: rcmd0, cmd1: rcmd1, payload: new Uint8Array(rpayload) });
          return;
        }
      };

      try {
        this.link.onData(onData);
      } catch {
        // if onData registration fails, just rely on timeout
      }
    });
  }
  // ============== BSL Protocol Methods ==============

  // cc2538-bsl wire protocol: sync with 0x55 0x55 then expect ACK
  public async sync(): Promise<void> {
    this.rxBuf = [];
    await this.link.write(new Uint8Array([0x55, 0x55]));
    const ok = await this.waitForAck(1000);
    if (!ok) throw new Error("CCTOOLS: no ACK on sync");
    await sleep(20);
  }

  private async waitForAck(timeoutMs = 2000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      // Accept either single-byte ACK/NACK (0xCC / 0x33) or 0x00-prefixed pairs (0x00 0xCC / 0x00 0x33)
      for (let i = 0; i < this.rxBuf.length; i++) {
        const b = this.rxBuf[i];
        if (b === 0xcc) {
          this.rxBuf.splice(0, i + 1);
          return true;
        }
        if (b === 0x33) {
          this.rxBuf.splice(0, i + 1);
          return false;
        }
        if (i + 1 < this.rxBuf.length && b === 0x00) {
          const n = this.rxBuf[i + 1];
          if (n === 0xcc || n === 0x33) {
            this.rxBuf.splice(0, i + 2);
            return n === 0xcc;
          }
        }
      }
      await sleep(5);
    }
    throw new Error("CCTOOLS: timeout waiting for ACK/NACK");
  }

  private async receivePacket(timeoutMs = 1500): Promise<Uint8Array> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (this.rxBuf.length >= 2) {
        const size = this.rxBuf[0];
        if (this.rxBuf.length >= size) {
          const chks = this.rxBuf[1];
          const data = this.rxBuf.slice(2, size);
          const sum = data.reduce((s, b) => (s + b) & 0xff, 0);
          // drop the packet from rx
          this.rxBuf.splice(0, size);
          if (sum !== chks) throw new Error("CCTOOLS: packet checksum error");
          // send ACK only when checksum is OK
          await this.link.write(new Uint8Array([0x00, 0xcc]));
          return new Uint8Array(data);
        }
      }
      await sleep(5);
    }
    throw new Error("CCTOOLS: timeout receiving packet");
  }

  private encodeAddr(addr: number): Uint8Array {
    // Big-endian: [byte0..byte3] where byte0 = addr >> 24
    const byte3 = (addr >> 0) & 0xff;
    const byte2 = (addr >> 8) & 0xff;
    const byte1 = (addr >> 16) & 0xff;
    const byte0 = (addr >> 24) & 0xff;
    return new Uint8Array([byte0, byte1, byte2, byte3]);
  }

  private async sendCommandRaw(
    content: Uint8Array,
    expectPacket = false,
    ackTimeout = 2000
  ): Promise<Uint8Array | null> {
    // content starts with CMD byte
    const len = content.length + 2; // include size+checksum bytes per protocol
    const chks = content.reduce((s, b) => (s + b) & 0xff, 0);
    this.rxBuf = [];
    const frame = new Uint8Array(2 + content.length);
    frame[0] = len & 0xff;
    frame[1] = chks & 0xff;
    frame.set(content, 2);
    await this.link.write(frame);
    const ackOk = await this.waitForAck(ackTimeout);
    if (!ackOk) {
      console.log(`CCTOOLS: NACK for command ${toHex(content[0])}`);
      throw new Error("CCTOOLS: NACK");
    }
    if (expectPacket) {
      return await this.receivePacket();
    }
    return null;
  }

  private async checkLastCmd(): Promise<boolean> {
    // Get Status (0x23) returns a packet; first byte is status
    const pkt = await this.sendCommandRaw(new Uint8Array([0x23]), true);
    if (!pkt || pkt.length === 0) return false;
    const status = pkt[0];
    // 0x40 = Success
    return status === 0x40;
  }

  public async chipId(): Promise<Uint8Array> {
    const pkt = await this.sendCommandRaw(new Uint8Array([0x28]), true);
    if (!pkt) throw new Error("CCTOOLS: no chip id packet");
    const ok = await this.checkLastCmd();
    if (!ok) throw new Error("CCTOOLS: chip id status failed");
    return pkt;
  }

  public async erase(address: number, length: number): Promise<void> {
    // CC2538 style: 0x26 with addr(4) + size(4).
    const content = new Uint8Array(1 + 4 + 4);
    content[0] = 0x26;
    content.set(this.encodeAddr(address), 1);
    content.set(this.encodeAddr(length >>> 0), 1 + 4);
    await this.sendCommandRaw(content, false, 10000);
    const ok = await this.checkLastCmd();
    if (!ok) throw new Error("CCTOOLS: erase failed");
  }

  public async sectorErase(address: number): Promise<void> {
    // CC26xx/CC13xx sector erase: cmd 0x26 with addr only
    const content = new Uint8Array(1 + 4);
    content[0] = 0x26;
    content.set(this.encodeAddr(address), 1);
    await this.sendCommandRaw(content, false, 10000);
    const ok = await this.checkLastCmd();
    if (!ok) throw new Error("CCTOOLS: sector erase failed");
  }

  public async bankErase(): Promise<void> {
    // CC26xx/CC13xx bank erase: cmd 0x2C with no payload
    const content = new Uint8Array([0x2c]);
    await this.sendCommandRaw(content, false, 15000);
    const ok = await this.checkLastCmd();
    if (!ok) throw new Error("CCTOOLS: bank erase failed");
  }

  public async downloadTo(address: number, chunk: Uint8Array): Promise<void> {
    // For each chunk: cmdDownload(addr, size) then cmdSendData(data)
    // size must be multiple of 4 and data payload up to ~248 bytes per packet
    let data = chunk;
    // round up to 4 with 0xFF padding if needed
    if (data.length % 4 !== 0) {
      const pad = 4 - (data.length % 4);
      const tmp = new Uint8Array(data.length + pad);
      tmp.set(data, 0);
      for (let i = 0; i < pad; i++) tmp[data.length + i] = 0xff;
      data = tmp;
    }

    const maxRetries = 3; // Maximum 3 attempts per chunk
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // DOWNLOAD (0x21)
        const dl = new Uint8Array(1 + 4 + 4);
        dl[0] = 0x21;
        dl.set(this.encodeAddr(address), 1);
        dl.set(this.encodeAddr(data.length), 1 + 4);
        await this.sendCommandRaw(dl);
        const ok1 = await this.checkLastCmd();
        if (!ok1) throw new Error("CCTOOLS: download header failed");

        // SEND DATA (0x24)
        const sdHeader = new Uint8Array(1 + data.length);
        sdHeader[0] = 0x24;
        sdHeader.set(data, 1);
        await this.sendCommandRaw(sdHeader, false, 5000);
        const ok2 = await this.checkLastCmd();
        if (!ok2) throw new Error("CCTOOLS: send data failed");

        // Success — exit loop
        return;
      } catch (error) {
        console.log(`Retry ${attempt + 1} for chunk at ${address.toString(16)}`);

        if (attempt === maxRetries - 1) {
          // Last attempt — throw error
          throw error;
        }

        await sleep(500); // Delay before retry
      }
    }
  }

  public async crc32(address: number, length: number): Promise<number> {
    // CC2538/legacy CRC32 read: 0x27 addr+size
    const content = new Uint8Array(1 + 4 + 4);
    content[0] = 0x27;
    content.set(this.encodeAddr(address), 1);
    content.set(this.encodeAddr(length >>> 0), 1 + 4);
    const pkt = await this.sendCommandRaw(content, true);
    if (!pkt || pkt.length < 4) throw new Error("CCTOOLS: CRC packet too short");
    const ok = await this.checkLastCmd();
    if (!ok) throw new Error("CCTOOLS: CRC status failed");
    // Big-endian decoding
    const crc = (pkt[3] | (pkt[2] << 8) | (pkt[1] << 16) | (pkt[0] << 24)) >>> 0;
    return crc;
  }

  public async crc32Cc26xx(address: number, length: number): Promise<number> {
    // CC26xx/CC13xx CRC32: 0x27 addr+size+reads(0)
    const content = new Uint8Array(1 + 4 + 4 + 4);
    content[0] = 0x27;
    content.set(this.encodeAddr(address), 1);
    content.set(this.encodeAddr(length >>> 0), 1 + 4);
    content.set(this.encodeAddr(0), 1 + 8); // number of reads = 0
    const pkt = await this.sendCommandRaw(content, true);
    if (!pkt || pkt.length < 4) throw new Error("CCTOOLS: CRC packet too short");
    const ok = await this.checkLastCmd();
    if (!ok) throw new Error("CCTOOLS: CRC status failed");
    // Big-endian decoding
    const crc = (pkt[3] | (pkt[2] << 8) | (pkt[1] << 16) | (pkt[0] << 24)) >>> 0;
    return crc;
  }

  public async memRead(addr: number, widthCode?: number, count?: number): Promise<Uint8Array> {
    // Read Memory (0x2A) with two variants:
    // CC2538: addr(4) + width(1) where width is byte count (typically 4)
    // CC26xx: addr(4) + widthCode(1) + count(1) where widthCode=1 means 32-bit
    let content: Uint8Array;

    if (widthCode !== undefined && count !== undefined) {
      // CC26xx style: addr + widthCode + count
      content = new Uint8Array(1 + 4 + 1 + 1);
      content[0] = 0x2a;
      content.set(this.encodeAddr(addr), 1);
      content[5] = widthCode & 0xff;
      content[6] = count & 0xff;
    } else {
      // CC2538 style: addr + width (4 bytes)
      content = new Uint8Array(1 + 4 + 1);
      content[0] = 0x2a;
      content.set(this.encodeAddr(addr), 1);
      content[5] = 0x04; // width in bytes
    }

    const pkt = await this.sendCommandRaw(content, true);
    if (!pkt) throw new Error("CCTOOLS: no memRead packet");
    const ok = await this.checkLastCmd();
    if (!ok) throw new Error("CCTOOLS: memRead status failed");
    return pkt;
  }

  public async memRead32(addr: number): Promise<Uint8Array> {
    // CC26xx style: widthCode=1 (32-bit), count=1 → expect 4 bytes
    return this.memRead(addr, 1, 1);
  }

  // ============== Application Protocol Methods ==============

  public async pingApp(timeoutMs = 3000): Promise<boolean> {
    const resp = await this.sendMtAndWait(0x21, 0x01, [], timeoutMs);
    return !!(resp && resp.cmd0 === 0x61 && resp.cmd1 === 0x01);
  }

  public async getFwVersion(): Promise<{
    transportrev: number;
    product: number;
    major: number;
    minor: number;
    maint: number;
    fwRev: number;
    payload: Uint8Array;
  } | null> {
    const resp = await this.sendMtAndWait(0x21, 0x02, [], 3000);
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

  public async readDeviceInfo(): Promise<TiDeviceInfo> {
    await this.sync();
    const id = await this.chipId();
    const chipHex = Array.from(id as Uint8Array)
      .map((b: number) => b.toString(16).padStart(2, "0"))
      .join("");
    this.logger(`BSL OK. ChipId packet: ${chipHex}`);

    const info: TiDeviceInfo = { chipIdHex: chipHex };

    // cc2538-bsl treats unknown IDs as CC26xx/13xx. Known CC2538 IDs: 0xb964/0xb965
    let chipIsCC26xx = false;
    chipIsCC26xx = !(chipHex === "0000b964" || chipHex === "0000b965");

    let chipIsCC2538 = false;
    chipIsCC2538 = chipHex === "0000b964" || chipHex === "0000b965";

    if (chipIsCC26xx) {
      this.logger("Chip family: CC26xx/CC13xx");
    }
    if (chipIsCC2538) {
      this.logger("Chip family: CC2538");
    }

    if (chipIsCC26xx) {
      info.family = "cc26xx";
      try {
        const FLASH_SIZE = 0x4003002c;
        const IEEE_ADDR_PRIMARY = 0x500012f0;
        const ICEPICK_DEVICE_ID = 0x50001318;
        const TESXT_ID = 0x57fb4;

        const dev = await this.memRead32(ICEPICK_DEVICE_ID);
        const usr = await this.memRead32(TESXT_ID);
        if (dev && usr && dev.length >= 4 && usr.length >= 4) {
          const wafer_id = ((((dev[3] & 0x0f) << 16) | (dev[2] << 8) | (dev[1] & 0xf0)) >>> 4) >>> 0;
          const pg_rev = (dev[3] & 0xf0) >> 4;
          const model = this.getChipDescription(id, wafer_id, pg_rev, usr[1]);
          this.logger(`Chip model: ${model}`);
          info.chipModel = model;
        }

        const flashSz = await this.memRead32(FLASH_SIZE);
        if (flashSz && flashSz.length >= 4) {
          const pages = flashSz[0];
          let size = pages * 8192;
          //if (size >= 64 * 1024) size -= 8192;
          this.logger(`Flash size estimate: ${size} bytes`);
          info.flashSizeBytes = size;
        }

        const mac_lo = await this.memRead32(IEEE_ADDR_PRIMARY + 0);
        const mac_hi = await this.memRead32(IEEE_ADDR_PRIMARY + 4);
        if (mac_hi && mac_lo && mac_hi.length >= 4 && mac_lo.length >= 4) {
          const mac = [...mac_lo, ...mac_hi]
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("")
            .toUpperCase();
          const macFmt = mac
            .match(/.{1,2}/g)
            ?.reverse()
            ?.join(":");
          if (macFmt) {
            this.logger(`IEEE MAC: ${macFmt}`);
            info.ieeeMac = macFmt;
          }
        }
      } catch {
        // ignore
      }
    } else if (chipIsCC2538) {
      info.family = "cc2538";
      // Read flash size from FLASH_CTRL_DIECFG0
      const FLASH_CTRL_DIECFG0 = 0x400d3014;
      const model = await this.memRead(FLASH_CTRL_DIECFG0);
      if (model && model.length >= 4) {
        const sizeCode = (model[3] & 0x70) >> 4;
        let flashSizeBytes = 0x10000; // default 64KB
        if (sizeCode > 0 && sizeCode <= 4) {
          flashSizeBytes = sizeCode * 0x20000; // 128KB per unit
        }
        this.logger(`Flash size estimate: ${flashSizeBytes} bytes`);
        info.flashSizeBytes = flashSizeBytes;
      }

      // Read primary IEEE address from 0x00280028
      const addr_ieee_address_primary = 0x00280028;
      const ti_oui = [0x00, 0x12, 0x4b];
      const ieee_addr_start = await this.memRead(addr_ieee_address_primary);
      const ieee_addr_end = await this.memRead(addr_ieee_address_primary + 4);
      if (ieee_addr_start && ieee_addr_end && ieee_addr_start.length >= 4 && ieee_addr_end.length >= 4) {
        let ieee_addr: Uint8Array;
        if (ieee_addr_start.slice(0, 3).every((b: number, i: number) => b === ti_oui[i])) {
          // TI OUI at start, append end
          ieee_addr = new Uint8Array([...ieee_addr_start, ...ieee_addr_end]);
        } else {
          // Otherwise, end first, then start
          ieee_addr = new Uint8Array([...ieee_addr_end, ...ieee_addr_start]);
        }
        const macFmt = Array.from(ieee_addr)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(":")
          .toUpperCase();
        this.logger(`IEEE MAC: ${macFmt}`);
        info.ieeeMac = macFmt;
      }
      // Set chip model
      info.chipModel = "CC2538";
    }
    return info;
  }

  // NVRAM methods - delegated to NVRAM
  public async nvramReadAll(progress?: (pct: number, label?: string) => void): Promise<NvramBundle> {
    return this.nvram.readAll(progress);
  }

  public async nvramEraseAll(progress?: (pct: number, label?: string) => void): Promise<void> {
    return this.nvram.eraseAll(progress);
  }

  public async nvramWriteAll(
    obj: NvramBundle,
    log?: (s: string) => void,
    progress?: (pct: number, label?: string) => void
  ): Promise<void> {
    return this.nvram.writeAll(obj, log, progress);
  }

  public async enterBootloader(implyGate: boolean): Promise<void> {
    this.logger(`TI entry bootloader, implyGate=${implyGate}`);
    if (!implyGate) {
      await this.setLines(true, true);
      await sleep(250);
      await this.setLines(true, false);
      await sleep(250);
      await this.setLines(false, false);
      await sleep(250);
      await this.setLines(true, false);
      await sleep(500);
      await this.setLines(true, true);
      await sleep(500);
    }
    if (implyGate) {
      await this.setLines(true, true);
      await sleep(250);
      await this.setLines(true, false);
      await sleep(250);
      await this.setLines(false, true);
      await sleep(450);
      await this.setLines(false, false);
      await sleep(250);
    }
  }

  public async reset(implyGate: boolean): Promise<void> {
    this.logger(`TI reset`);
    await this.setLines(true, true);
    await sleep(500);
    await this.setLines(false, true);
    await sleep(500);
    await this.setLines(true, true);
    await sleep(1000);
  }

  // ============== Flash Dump Methods ==============

  /**
   * Read memory block from CC26xx (up to 253 bytes at a time)
   * @param addr - Start address
   * @param length - Number of bytes to read (max 252, must be multiple of 4)
   */
  public async memReadBlock(addr: number, length: number): Promise<Uint8Array> {
    // CC26xx style: addr + widthCode + count
    // widthCode: 1 = 32-bit (4 bytes per read)
    // count: number of 32-bit words to read
    const words = Math.floor(length / 4);
    if (words === 0 || words > 63) {
      throw new Error(`Invalid word count: ${words}, must be 1-63`);
    }

    const content = new Uint8Array(1 + 4 + 1 + 1);
    content[0] = 0x2a;
    content.set(this.encodeAddr(addr), 1);
    content[5] = 1; // widthCode = 1 (32-bit)
    content[6] = words & 0xff; // count of 32-bit words

    const pkt = await this.sendCommandRaw(content, true, 3000);
    if (!pkt) throw new Error("CCTOOLS: no memReadBlock packet");
    const ok = await this.checkLastCmd();
    if (!ok) throw new Error("CCTOOLS: memReadBlock status failed");
    return pkt;
  }

  /**
   * Read memory block from CC2538 (4 bytes at a time, inverted order)
   * CC2538 doesn't support block reads, so we read 4 bytes at a time
   */
  private async readBlockCc2538(addr: number, length: number): Promise<Uint8Array> {
    const result = new Uint8Array(length);
    for (let offset = 0; offset < length; offset += 4) {
      const data = await this.memRead(addr + offset);
      // CC2538 returns bytes in inverted order
      result[offset] = data[3];
      result[offset + 1] = data[2];
      result[offset + 2] = data[1];
      result[offset + 3] = data[0];
    }
    return result;
  }

  /**
   * Read memory block from CC26xx (up to 252 bytes at a time)
   */
  private async readBlockCc26xx(addr: number, length: number): Promise<Uint8Array> {
    return await this.memReadBlock(addr, length);
  }
  /**
   * Dump flash memory from the device and save to file
   * @param progress - Optional progress callback (percent, label)
   */
  public async dumpFlash(): Promise<void> {
    this.logger("Starting flash dump...");
    this.progressCallback(0, "Reading device info...");

    await this.enterBootloader(false);
    await sleep(500);
    // First, sync and get device info
    //await this.sync();
    const deviceInfo = await this.readDeviceInfo();

    const family = deviceInfo.family;
    const flashSize = deviceInfo.flashSizeBytes;

    if (!flashSize || flashSize === 0) {
      throw new Error("Cannot determine flash size");
    }

    this.logger(`Flash size: ${flashSize} bytes (${flashSize / 1024} KB)`);
    this.logger(`Chip family: ${family || "unknown"}`);

    // Determine flash start address and block size based on chip family
    let flashStartAddr: number;
    let blockSize: number;
    let readBlock: (addr: number, len: number) => Promise<Uint8Array>;

    if (family === "cc2538") {
      flashStartAddr = 0x00200000;
      blockSize = 4; // CC2538 only supports 4 bytes at a time
      readBlock = this.readBlockCc2538.bind(this);
      this.logger(`CC2538: Flash starts at 0x${flashStartAddr.toString(16)}, block size: ${blockSize} bytes`);
    } else {
      // CC26xx/CC13xx - can read up to 252 bytes (63 words * 4 bytes) at a time
      flashStartAddr = 0x00000000;
      blockSize = 252; // 63 * 4 = 252 bytes per request
      readBlock = this.readBlockCc26xx.bind(this);
      this.logger(`CC26xx: Flash starts at 0x${flashStartAddr.toString(16)}, block size: ${blockSize} bytes`);
    }

    // Round up length to 4-byte boundary
    const length = (flashSize + 3) & ~0x03;
    const totalBlocks = Math.ceil(length / blockSize);

    this.logger(`Reading ${length} bytes in ${totalBlocks} blocks...`);
    this.progressCallback(0, "Reading flash...");

    const flashData = new Uint8Array(length);
    let lastPercent = 0;
    let offset = 0;

    while (offset < length) {
      const addr = flashStartAddr + offset;
      const remaining = length - offset;
      const chunkSize = Math.min(blockSize, remaining);
      // Ensure chunk size is multiple of 4
      const alignedChunkSize = (chunkSize + 3) & ~0x03;

      try {
        const data = await readBlock(addr, alignedChunkSize);
        // Copy only the bytes we need (in case of padding)
        const bytesToCopy = Math.min(data.length, remaining);
        flashData.set(data.subarray(0, bytesToCopy), offset);
      } catch (e) {
        this.logger(`Warning: Failed to read at 0x${addr.toString(16)}: ${e}`);
        // Fill with 0xFF on error (erased state)
        for (let i = 0; i < chunkSize; i++) {
          flashData[offset + i] = 0xff;
        }
      }

      offset += chunkSize;

      // Update progress
      const percent = Math.floor((offset / length) * 100);
      if (percent !== lastPercent) {
        lastPercent = percent;
        this.progressCallback(percent, `Reading ${offset}/${length}`);
      }
    }

    this.progressCallback(100, "Read complete");
    this.logger(`Flash read complete: ${flashData.length} bytes`);

    const filename = saveToFile(
      flashData,
      "application/octet-stream",
      "bin",
      "dump",
      deviceInfo.chipModel,
      deviceInfo.ieeeMac?.replace(/:/g, "")
    );

    this.logger(`Flash dump saved to ${filename}`);
  }
}
