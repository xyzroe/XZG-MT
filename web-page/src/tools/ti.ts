import { sleep, toHex } from "../utils/index";

export type Link = {
  write: (d: Uint8Array) => Promise<void>;
  onData: (cb: (d: Uint8Array) => void) => void;
};

// ---------------- CCTOOLS (formerly BSL) ----------------
export interface CCToolsLink {
  write(data: Uint8Array): Promise<void>;
  onData(cb: (data: Uint8Array) => void): void;
}

export class CCToolsClient {
  private link: CCToolsLink;
  private rxBuf: number[] = [];

  constructor(link: CCToolsLink) {
    this.link = link;
    link.onData((d) => this.rxBuf.push(...d));
  }

  // cc2538-bsl wire protocol: sync with 0x55 0x55 then expect ACK
  async sync(): Promise<void> {
    this.rxBuf = [];
    await this.link.write(new Uint8Array([0x55, 0x55]));
    const ok = await this.waitForAck(1000);
    if (!ok) throw new Error("CCTOOLS: no ACK on sync");
    await sleep(20);
  }

  // --- low level helpers ---
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

  async chipId(): Promise<Uint8Array> {
    const pkt = await this.sendCommandRaw(new Uint8Array([0x28]), true);
    if (!pkt) throw new Error("CCTOOLS: no chip id packet");
    const ok = await this.checkLastCmd();
    if (!ok) throw new Error("CCTOOLS: chip id status failed");
    return pkt;
  }

  async erase(address: number, length: number): Promise<void> {
    // CC2538 style: 0x26 with addr(4) + size(4).
    const content = new Uint8Array(1 + 4 + 4);
    content[0] = 0x26;
    content.set(this.encodeAddr(address), 1);
    content.set(this.encodeAddr(length >>> 0), 1 + 4);
    await this.sendCommandRaw(content, false, 10000);
    const ok = await this.checkLastCmd();
    if (!ok) throw new Error("CCTOOLS: erase failed");
  }

  async sectorErase(address: number): Promise<void> {
    // CC26xx/CC13xx sector erase: cmd 0x26 with addr only
    const content = new Uint8Array(1 + 4);
    content[0] = 0x26;
    content.set(this.encodeAddr(address), 1);
    await this.sendCommandRaw(content, false, 10000);
    const ok = await this.checkLastCmd();
    if (!ok) throw new Error("CCTOOLS: sector erase failed");
  }

  async bankErase(): Promise<void> {
    // CC26xx/CC13xx bank erase: cmd 0x2C with no payload
    const content = new Uint8Array([0x2c]);
    await this.sendCommandRaw(content, false, 15000);
    const ok = await this.checkLastCmd();
    if (!ok) throw new Error("CCTOOLS: bank erase failed");
  }

  async write(data: Uint8Array): Promise<void> {
    // Not used directly; see downloadTo()
    await this.sendCommandRaw(new Uint8Array([0x24, ...data]));
    const ok = await this.checkLastCmd();
    if (!ok) throw new Error("CCTOOLS: send data failed");
  }

  async downloadTo(address: number, chunk: Uint8Array): Promise<void> {
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
        // Add delay after DOWNLOAD to let device process
        //await sleep(10); // 10 ms — adjust based on speed
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

  async verifyCrc(address: number, length: number): Promise<boolean> {
    // CRC32 (0x27) addr(4) + size(4). Returns 4B CRC (LSB first)
    const content = new Uint8Array(1 + 4 + 4);
    content[0] = 0x27;
    content.set(this.encodeAddr(address), 1);
    content.set(this.encodeAddr(length >>> 0), 1 + 4);
    const pkt = await this.sendCommandRaw(content, true);
    if (!pkt || pkt.length < 4) return false;
    const ok = await this.checkLastCmd();
    if (!ok) return false;
    return true; // caller can be updated later to compare CRCs explicitly
  }

  async crc32(address: number, length: number): Promise<number> {
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

  async crc32Cc26xx(address: number, length: number): Promise<number> {
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

  async memRead(addr: number, widthCode?: number, count?: number): Promise<Uint8Array> {
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

  async memRead32(addr: number): Promise<Uint8Array> {
    // CC26xx style: widthCode=1 (32-bit), count=1 → expect 4 bytes
    return this.memRead(addr, 1, 1);
  }
}

export class LinkAdapter implements CCToolsLink {
  constructor(
    private writeFn: (d: Uint8Array) => Promise<void>,
    private onDataHook: (cb: (d: Uint8Array) => void) => void
  ) {}
  write(data: Uint8Array): Promise<void> {
    return this.writeFn(data);
  }
  onData(cb: (data: Uint8Array) => void): void {
    this.onDataHook(cb);
  }
}

export async function sync(link: Link): Promise<CCToolsClient> {
  const client = new CCToolsClient(new LinkAdapter(link.write, link.onData));
  await client.sync();
  return client;
}

// ---------------- Chip description ----------------
export function getChipDescription(chipIdPkt: Uint8Array, wafer_id: number, pg_rev: number, mode_cfg: number): string {
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
export function xorFcs(bytes: number[]): number {
  return bytes.reduce((a, b) => a ^ (b & 0xff), 0);
}

// ...existing code...
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
        const calc = xorFcs([rlen & 0xff, rcmd0 & 0xff, rcmd1 & 0xff, ...rpayload]) & 0xff;
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
      link.onData(onData);
    } catch {
      // if onData registration fails, just rely on timeout
    }
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
  const resp = await sendMtAndWait(link, 0x21, 0x02, [], 3000);
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

export interface TiDeviceInfo {
  chipIdHex: string;
  chipModel?: string;
  flashSizeBytes?: number;
  ieeeMac?: string;
}

export async function readDeviceInfo(link: Link, log?: (msg: string) => void): Promise<TiDeviceInfo> {
  const bsl = await sync(link);
  const id = await bsl.chipId();
  const chipHex = Array.from(id as Uint8Array)
    .map((b: number) => b.toString(16).padStart(2, "0"))
    .join("");
  log?.(`BSL OK. ChipId packet: ${chipHex}`);

  const info: TiDeviceInfo = { chipIdHex: chipHex };

  try {
    const FLASH_SIZE = 0x4003002c;
    const IEEE_ADDR_PRIMARY = 0x500012f0;
    const ICEPICK_DEVICE_ID = 0x50001318;
    const TESXT_ID = 0x57fb4;

    const dev = await bsl.memRead32(ICEPICK_DEVICE_ID);
    const usr = await bsl.memRead32(TESXT_ID);
    if (dev && usr && dev.length >= 4 && usr.length >= 4) {
      const wafer_id = ((((dev[3] & 0x0f) << 16) | (dev[2] << 8) | (dev[1] & 0xf0)) >>> 4) >>> 0;
      const pg_rev = (dev[3] & 0xf0) >> 4;
      info.chipModel = getChipDescription(id, wafer_id, pg_rev, usr[1]);
      log?.(`Chip model: ${info.chipModel}`);
    }

    const flashSz = await bsl.memRead32(FLASH_SIZE);
    if (flashSz && flashSz.length >= 4) {
      const pages = flashSz[0];
      let size = pages * 8192;
      if (size >= 64 * 1024) size -= 8192;
      info.flashSizeBytes = size;
      log?.(`Flash size estimate: ${size} bytes`);
    }

    const mac_lo = await bsl.memRead32(IEEE_ADDR_PRIMARY + 0);
    const mac_hi = await bsl.memRead32(IEEE_ADDR_PRIMARY + 4);
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
        info.ieeeMac = macFmt;
        log?.(`IEEE MAC: ${macFmt}`);
      }
    }
  } catch (err) {
    log?.(`TI device info read partially failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  return info;
}

export interface TiFlashImage {
  startAddress: number;
  data: Uint8Array;
}

export interface TiFlashOptions {
  chunkSize?: number;
  erase: boolean;
  write: boolean;
  verify: boolean;
  log?: (msg: string) => void;
  onProgress?: (pct: number, label?: string) => void;
  onChunkDelay?: () => Promise<void>;
}

export async function pingApp(link: Link, timeoutMs = 3000): Promise<boolean> {
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
        // ignore
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

export interface NvramBundle {
  LEGACY?: Record<string, string>;
  legacy?: Record<string, string>;
  [section: string]: Record<string, string> | undefined;
}

export async function nvramReadAll(link: Link, progress?: (pct: number, label?: string) => void): Promise<NvramBundle> {
  progress?.(0, "Reading...");
  const legacy = await nvramReadLegacyFull(link, progress);
  const extended = await nvramReadExtendedAll(link, progress);
  const payload: NvramBundle = { LEGACY: legacy };
  if (extended) Object.assign(payload, extended);
  progress?.(100, "Done");
  return payload;
}

export async function nvramEraseAll(link: Link, progress?: (pct: number, label?: string) => void): Promise<void> {
  progress?.(0, "Erasing...");
  const legacy = await nvramReadLegacyFull(link, progress);
  const totalL = Math.max(1, Object.keys(legacy).length);
  let doneL = 0;
  for (const key of Object.keys(legacy)) {
    try {
      await sysOsalNvDelete(link, osalIdFromHex(key));
    } catch {
      // ignore
    }
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
  obj: NvramBundle,
  log?: (s: string) => void,
  progress?: (pct: number, label?: string) => void
): Promise<void> {
  progress?.(0, "Writing...");
  const legacy: Record<string, string> = obj.legacy || obj.LEGACY || {};
  const total = Math.max(1, Object.keys(legacy).length);
  let count = 0;
  for (const key of Object.keys(legacy)) {
    const id = osalIdFromHex(key);
    const hex = legacy[key];
    if (!hex) continue;
    const bytes = new Uint8Array(hex.match(/.{1,2}/g)?.map((h: string) => parseInt(h, 16)) || []);
    try {
      await sysOsalNvItemInit(link, id, bytes.length);
      await sysOsalNvWrite(link, id, bytes, 0);
      log?.(`NVRAM LEGACY write 0x${id.toString(16)} len=${bytes.length} => OK`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log?.(`NVRAM LEGACY write fail id=0x${id.toString(16)}: ${message}`);
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
        const hex = section[subKey];
        if (!hex) continue;
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
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          log?.(
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
