/**
 * Spinel Protocol Client for OpenThread RCP
 * Used by both Silicon Labs and Texas Instruments chips
 * OpenThread RCP uses Spinel protocol over HDLC-Lite
 */

import { Link } from "../types/index";

// Spinel constants
export const SPINEL_HEADER_FLAG = 0x80;
export const SPINEL_CMD_PROP_VALUE_GET = 0x02;
export const SPINEL_CMD_PROP_VALUE_IS = 0x06;
export const SPINEL_PROP_PROTOCOL_VERSION = 0x01;
export const SPINEL_PROP_NCP_VERSION = 0x02;
export const SPINEL_PROP_CAPS = 0x05;
export const SPINEL_PROP_HWADDR = 0x08; // EUI-64

// HDLC constants
export const HDLC_FLAG = 0x7e;
export const HDLC_ESCAPE = 0x7d;

// FCS-16 lookup table for HDLC
export const FCS_TABLE = new Uint16Array([
  0x0000, 0x1189, 0x2312, 0x329b, 0x4624, 0x57ad, 0x6536, 0x74bf, 0x8c48, 0x9dc1, 0xaf5a, 0xbed3, 0xca6c, 0xdbe5,
  0xe97e, 0xf8f7, 0x1081, 0x0108, 0x3393, 0x221a, 0x56a5, 0x472c, 0x75b7, 0x643e, 0x9cc9, 0x8d40, 0xbfdb, 0xae52,
  0xdaed, 0xcb64, 0xf9ff, 0xe876, 0x2102, 0x308b, 0x0210, 0x1399, 0x6726, 0x76af, 0x4434, 0x55bd, 0xad4a, 0xbcc3,
  0x8e58, 0x9fd1, 0xeb6e, 0xfae7, 0xc87c, 0xd9f5, 0x3183, 0x200a, 0x1291, 0x0318, 0x77a7, 0x662e, 0x54b5, 0x453c,
  0xbdcb, 0xac42, 0x9ed9, 0x8f50, 0xfbef, 0xea66, 0xd8fd, 0xc974, 0x4204, 0x538d, 0x6116, 0x709f, 0x0420, 0x15a9,
  0x2732, 0x36bb, 0xce4c, 0xdfc5, 0xed5e, 0xfcd7, 0x8868, 0x99e1, 0xab7a, 0xbaf3, 0x5285, 0x430c, 0x7197, 0x601e,
  0x14a1, 0x0528, 0x37b3, 0x263a, 0xdecd, 0xcf44, 0xfddf, 0xec56, 0x98e9, 0x8960, 0xbbfb, 0xaa72, 0x6306, 0x728f,
  0x4014, 0x519d, 0x2522, 0x34ab, 0x0630, 0x17b9, 0xef4e, 0xfec7, 0xcc5c, 0xddd5, 0xa96a, 0xb8e3, 0x8a78, 0x9bf1,
  0x7387, 0x620e, 0x5095, 0x411c, 0x35a3, 0x242a, 0x16b1, 0x0738, 0xffcf, 0xee46, 0xdcdd, 0xcd54, 0xb9eb, 0xa862,
  0x9af9, 0x8b70, 0x8408, 0x9581, 0xa71a, 0xb693, 0xc22c, 0xd3a5, 0xe13e, 0xf0b7, 0x0840, 0x19c9, 0x2b52, 0x3adb,
  0x4e64, 0x5fed, 0x6d76, 0x7cff, 0x9489, 0x8500, 0xb79b, 0xa612, 0xd2ad, 0xc324, 0xf1bf, 0xe036, 0x18c1, 0x0948,
  0x3bd3, 0x2a5a, 0x5ee5, 0x4f6c, 0x7df7, 0x6c7e, 0xa50a, 0xb483, 0x8618, 0x9791, 0xe32e, 0xf2a7, 0xc03c, 0xd1b5,
  0x2942, 0x38cb, 0x0a50, 0x1bd9, 0x6f66, 0x7eef, 0x4c74, 0x5dfd, 0xb58b, 0xa402, 0x9699, 0x8710, 0xf3af, 0xe226,
  0xd0bd, 0xc134, 0x39c3, 0x284a, 0x1ad1, 0x0b58, 0x7fe7, 0x6e6e, 0x5cf5, 0x4d7c, 0xc60c, 0xd785, 0xe51e, 0xf497,
  0x8028, 0x91a1, 0xa33a, 0xb2b3, 0x4a44, 0x5bcd, 0x6956, 0x78df, 0x0c60, 0x1de9, 0x2f72, 0x3efb, 0xd68d, 0xc704,
  0xf59f, 0xe416, 0x90a9, 0x8120, 0xb3bb, 0xa232, 0x5ac5, 0x4b4c, 0x79d7, 0x685e, 0x1ce1, 0x0d68, 0x3ff3, 0x2e7a,
  0xe70e, 0xf687, 0xc41c, 0xd595, 0xa12a, 0xb0a3, 0x8238, 0x93b1, 0x6b46, 0x7acf, 0x4854, 0x59dd, 0x2d62, 0x3ceb,
  0x0e70, 0x1ff9, 0xf78f, 0xe606, 0xd49d, 0xc514, 0xb1ab, 0xa022, 0x92b9, 0x8330, 0x7bc7, 0x6a4e, 0x58d5, 0x495c,
  0x3de3, 0x2c6a, 0x1ef1, 0x0f78,
]);

/**
 * Calculate FCS-16 checksum for HDLC
 */
export function fcs16(data: Uint8Array): number {
  let fcs = 0xffff;
  for (const byte of data) {
    fcs = (fcs >> 8) ^ FCS_TABLE[(fcs ^ byte) & 0xff];
  }
  return fcs ^ 0xffff;
}

export interface OpenThreadRcpInfo {
  version: string;
  rawVersion: string;
}

/**
 * Spinel Client for OpenThread RCP communication
 * Works over HDLC-Lite framing
 */
export class SpinelClient {
  private link: Link;
  private buffer: number[] = [];
  private pendingResponse: {
    resolve: (payload: Uint8Array) => void;
    reject: (err: Error) => void;
    timer: number;
  } | null = null;
  private disposed = false;
  private tid = 1;
  private logger: (msg: string) => void = () => {};

  constructor(link: Link) {
    this.link = link;
  }

  public setLogger(logger: (msg: string) => void) {
    this.logger = logger;
  }

  public dispose() {
    this.disposed = true;
    if (this.pendingResponse) {
      window.clearTimeout(this.pendingResponse.timer);
      this.pendingResponse.reject(new Error("Spinel client disposed"));
      this.pendingResponse = null;
    }
  }

  public handleData(chunk: Uint8Array): void {
    if (this.disposed) return;
    for (const byte of chunk) {
      this.buffer.push(byte);
    }
    this.processBuffer();
  }

  private processBuffer() {
    while (true) {
      const startIdx = this.buffer.indexOf(HDLC_FLAG);
      if (startIdx === -1) {
        this.buffer = [];
        return;
      }

      if (startIdx > 0) {
        this.buffer = this.buffer.slice(startIdx);
      }

      const endIdx = this.buffer.indexOf(HDLC_FLAG, 1);
      if (endIdx === -1) return;

      const frameBytes = this.buffer.slice(1, endIdx);
      this.buffer = this.buffer.slice(endIdx + 1);

      if (frameBytes.length < 4) continue; // Too short

      try {
        const unstuffed = this.hdlcUnstuff(new Uint8Array(frameBytes));
        // Verify FCS
        if (unstuffed.length < 3) continue;
        const payload = unstuffed.slice(0, unstuffed.length - 2);
        const receivedFcs = (unstuffed[unstuffed.length - 2] | (unstuffed[unstuffed.length - 1] << 8)) & 0xffff;
        const calculatedFcs = fcs16(payload);
        if (receivedFcs !== calculatedFcs) {
          this.logger(`FCS mismatch: received ${receivedFcs.toString(16)}, calculated ${calculatedFcs.toString(16)}`);
          continue;
        }
        this.handleFrame(payload);
      } catch (e) {
        this.logger(`Spinel frame error: ${e}`);
      }
    }
  }

  private hdlcUnstuff(data: Uint8Array): Uint8Array {
    const out: number[] = [];
    let escaped = false;
    for (const byte of data) {
      if (escaped) {
        out.push(byte ^ 0x20);
        escaped = false;
      } else if (byte === HDLC_ESCAPE) {
        escaped = true;
      } else {
        out.push(byte);
      }
    }
    return new Uint8Array(out);
  }

  private hdlcStuff(data: Uint8Array): Uint8Array {
    const out: number[] = [];
    for (const byte of data) {
      if (byte === HDLC_FLAG || byte === HDLC_ESCAPE || byte < 0x20) {
        out.push(HDLC_ESCAPE, byte ^ 0x20);
      } else {
        out.push(byte);
      }
    }
    return new Uint8Array(out);
  }

  private handleFrame(payload: Uint8Array) {
    if (payload.length < 2) return;

    const cmd = payload[1];
    // this.logger(`RX frame: cmd=${cmd.toString(16)}, len=${payload.length}`);

    if (cmd === SPINEL_CMD_PROP_VALUE_IS && this.pendingResponse) {
      window.clearTimeout(this.pendingResponse.timer);
      this.pendingResponse.resolve(payload.slice(2));
      this.pendingResponse = null;
    }
  }

  private encodeVarint(value: number): Uint8Array {
    if (value < 127) {
      return new Uint8Array([value]);
    }
    const bytes: number[] = [];
    while (value > 0) {
      let b = value & 0x7f;
      value >>= 7;
      if (value > 0) b |= 0x80;
      bytes.push(b);
    }
    return new Uint8Array(bytes);
  }

  private decodeVarint(data: Uint8Array, offset: number): [number, number] {
    let value = 0;
    let shift = 0;
    let idx = offset;
    while (idx < data.length) {
      const b = data[idx++];
      value |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7;
    }
    return [value, idx];
  }

  public async sendCommand(cmd: number, propId: number, value?: Uint8Array, timeoutMs = 3000): Promise<Uint8Array> {
    if (this.pendingResponse) {
      throw new Error("Request already in flight");
    }

    const header = SPINEL_HEADER_FLAG | (this.tid & 0x0f);
    this.tid = (this.tid + 1) & 0x0f || 1;

    const propBytes = this.encodeVarint(propId);
    const payloadLen = 2 + propBytes.length + (value?.length || 0);
    const payload = new Uint8Array(payloadLen);
    payload[0] = header;
    payload[1] = cmd;
    payload.set(propBytes, 2);
    if (value) {
      payload.set(value, 2 + propBytes.length);
    }

    const fcsVal = fcs16(payload);
    const withFcs = new Uint8Array(payload.length + 2);
    withFcs.set(payload);
    withFcs[payload.length] = fcsVal & 0xff;
    withFcs[payload.length + 1] = (fcsVal >> 8) & 0xff;

    const stuffed = this.hdlcStuff(withFcs);
    const frame = new Uint8Array(stuffed.length + 2);
    frame[0] = HDLC_FLAG;
    frame.set(stuffed, 1);
    frame[frame.length - 1] = HDLC_FLAG;

    // this.logger(
    //   `TX: ${Array.from(frame)
    //     .map((b) => b.toString(16).padStart(2, "0"))
    //     .join(" ")}`
    // );

    const responsePromise = new Promise<Uint8Array>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        if (this.pendingResponse) {
          this.pendingResponse.reject(new Error("Spinel timeout"));
          this.pendingResponse = null;
        }
      }, timeoutMs);
      this.pendingResponse = { resolve, reject, timer };
    });

    await this.link.write(frame);
    return responsePromise;
  }

  /**
   * Get EUI-64 hardware address
   */
  public async getEui64(): Promise<string> {
    const response = await this.sendCommand(SPINEL_CMD_PROP_VALUE_GET, SPINEL_PROP_HWADDR);
    const [, dataOffset] = this.decodeVarint(response, 0);
    const eui64 = response.slice(dataOffset, dataOffset + 8);

    if (eui64.length < 8) {
      throw new Error("Invalid EUI64 response");
    }

    return Array.from(eui64)
      .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
      .join(":");
  }

  /**
   * Get NCP version string
   */
  public async getVersion(): Promise<string> {
    const response = await this.sendCommand(SPINEL_CMD_PROP_VALUE_GET, SPINEL_PROP_NCP_VERSION);
    const [, dataOffset] = this.decodeVarint(response, 0);
    // Version is null-terminated string
    const versionBytes = response.slice(dataOffset);
    const nullIdx = versionBytes.indexOf(0);
    const str = new TextDecoder().decode(nullIdx >= 0 ? versionBytes.slice(0, nullIdx) : versionBytes);
    this.logger(`Spinel Version string: ${str}`);
    return str;
  }

  /**
   * Get OpenThread RCP info with parsed version
   */
  public async getOpenThreadInfo(): Promise<OpenThreadRcpInfo | null> {
    try {
      const rawVersion = await this.getVersion();

      if (!rawVersion) {
        return null;
      }

      let version = rawVersion;

      // Try to extract just the OpenThread version part
      // Formats: "OPENTHREAD/20191113-01234; EFR32; ..." or "bla-bla-openthread/version; ..."
      const match = rawVersion.match(/openthread\/([^;]+)/i);
      if (match) {
        version = match[1].trim();
      }

      //   this.logger(`OpenThread RCP version: ${version}`);
      return { version, rawVersion };
    } catch (e) {
      this.logger(`getOpenThreadInfo error: ${e}`);
      return null;
    }
  }

  /**
   * Ping the device by requesting version
   */
  public async ping(timeoutMs = 1000): Promise<boolean> {
    try {
      await this.sendCommand(SPINEL_CMD_PROP_VALUE_GET, SPINEL_PROP_NCP_VERSION, undefined, timeoutMs);
      return true;
    } catch {
      return false;
    }
  }
}
