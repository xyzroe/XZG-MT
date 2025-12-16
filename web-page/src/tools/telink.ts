import { Link, TelinkFamily } from "../types/index";
import { sleep, toHex, bufToHex } from "../utils/index";
import { saveToFile } from "../utils/http";
import { generateHex } from "../utils/intelhex";
import { flashSizeEl, chipModelEl, ieeeMacEl } from "../ui";
import { downloadFirmwareFromUrl } from "../netfw";

// Telink Floader Protocol Commands
const CMD_VER = 0x00; // Get version, Reset, Write Flash Status reg
const CMD_RBF = 0x01; // Read Block Flash
const CMD_WBF = 0x02; // Write Block Flash
const CMD_EFS = 0x03; // Erase Flash Sectors
const CMD_EAF = 0x04; // Erase All Flash
const CMD_JDC = 0x05; // Get Flash JEDEC ID

const FLASH_SECTOR_SIZE = 4096;

// CRC16 lookup table for Telink protocol
const CRC_TABLE = new Uint16Array([
  0x0000, 0xc0c1, 0xc181, 0x0140, 0xc301, 0x03c0, 0x0280, 0xc241, 0xc601, 0x06c0, 0x0780, 0xc741, 0x0500, 0xc5c1,
  0xc481, 0x0440, 0xcc01, 0x0cc0, 0x0d80, 0xcd41, 0x0f00, 0xcfc1, 0xce81, 0x0e40, 0x0a00, 0xcac1, 0xcb81, 0x0b40,
  0xc901, 0x09c0, 0x0880, 0xc841, 0xd801, 0x18c0, 0x1980, 0xd941, 0x1b00, 0xdbc1, 0xda81, 0x1a40, 0x1e00, 0xdec1,
  0xdf81, 0x1f40, 0xdd01, 0x1dc0, 0x1c80, 0xdc41, 0x1400, 0xd4c1, 0xd581, 0x1540, 0xd701, 0x17c0, 0x1680, 0xd641,
  0xd201, 0x12c0, 0x1380, 0xd341, 0x1100, 0xd1c1, 0xd081, 0x1040, 0xf001, 0x30c0, 0x3180, 0xf141, 0x3300, 0xf3c1,
  0xf281, 0x3240, 0x3600, 0xf6c1, 0xf781, 0x3740, 0xf501, 0x35c0, 0x3480, 0xf441, 0x3c00, 0xfcc1, 0xfd81, 0x3d40,
  0xff01, 0x3fc0, 0x3e80, 0xfe41, 0xfa01, 0x3ac0, 0x3b80, 0xfb41, 0x3900, 0xf9c1, 0xf881, 0x3840, 0x2800, 0xe8c1,
  0xe981, 0x2940, 0xeb01, 0x2bc0, 0x2a80, 0xea41, 0xee01, 0x2ec0, 0x2f80, 0xef41, 0x2d00, 0xedc1, 0xec81, 0x2c40,
  0xe401, 0x24c0, 0x2580, 0xe541, 0x2700, 0xe7c1, 0xe681, 0x2640, 0x2200, 0xe2c1, 0xe381, 0x2340, 0xe101, 0x21c0,
  0x2080, 0xe041, 0xa001, 0x60c0, 0x6180, 0xa141, 0x6300, 0xa3c1, 0xa281, 0x6240, 0x6600, 0xa6c1, 0xa781, 0x6740,
  0xa501, 0x65c0, 0x6480, 0xa441, 0x6c00, 0xacc1, 0xad81, 0x6d40, 0xaf01, 0x6fc0, 0x6e80, 0xae41, 0xaa01, 0x6ac0,
  0x6b80, 0xab41, 0x6900, 0xa9c1, 0xa881, 0x6840, 0x7800, 0xb8c1, 0xb981, 0x7940, 0xbb01, 0x7bc0, 0x7a80, 0xba41,
  0xbe01, 0x7ec0, 0x7f80, 0xbf41, 0x7d00, 0xbdc1, 0xbc81, 0x7c40, 0xb401, 0x74c0, 0x7580, 0xb541, 0x7700, 0xb7c1,
  0xb681, 0x7640, 0x7200, 0xb2c1, 0xb381, 0x7340, 0xb101, 0x71c0, 0x7080, 0xb041, 0x5000, 0x90c1, 0x9181, 0x5140,
  0x9301, 0x53c0, 0x5280, 0x9241, 0x9601, 0x56c0, 0x5780, 0x9741, 0x5500, 0x95c1, 0x9481, 0x5440, 0x9c01, 0x5cc0,
  0x5d80, 0x9d41, 0x5f00, 0x9fc1, 0x9e81, 0x5e40, 0x5a00, 0x9ac1, 0x9b81, 0x5b40, 0x9901, 0x59c0, 0x5880, 0x9841,
  0x8801, 0x48c0, 0x4980, 0x8941, 0x4b00, 0x8bc1, 0x8a81, 0x4a40, 0x4e00, 0x8ec1, 0x8f81, 0x4f40, 0x8d01, 0x4dc0,
  0x4c80, 0x8c41, 0x4400, 0x84c1, 0x8581, 0x4540, 0x8701, 0x47c0, 0x4680, 0x8641, 0x8201, 0x42c0, 0x4380, 0x8341,
  0x4100, 0x81c1, 0x8081, 0x4040,
]);

/**
 * Calculate CRC16 for Telink protocol
 */
function crc16(data: Uint8Array): Uint8Array {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >> 8) ^ CRC_TABLE[(crc ^ data[i]) & 0xff];
  }
  return new Uint8Array([crc & 0xff, (crc >> 8) & 0xff]);
}

/**
 * Add CRC to data block
 */
function crcBlk(data: Uint8Array): Uint8Array {
  const result = new Uint8Array(data.length + 2);
  result.set(data);
  const crc = crc16(data);
  result.set(crc, data.length);
  return result;
}

/**
 * Check CRC of received data
 */
function crcChk(data: Uint8Array): boolean {
  if (data.length < 2) return false;
  const payload = data.slice(0, data.length - 2);
  const receivedCrc = data.slice(data.length - 2);
  const calculatedCrc = crc16(payload);
  return receivedCrc[0] === calculatedCrc[0] && receivedCrc[1] === calculatedCrc[1];
}

/**
 * SWS (Single Wire Serial) encoding for a block of data
 */
function swsCodeBlk(blk: Uint8Array): Uint8Array {
  const pkt: number[] = [];
  let d = [0xe8, 0xef, 0xef, 0xef, 0xef];

  for (let i = 0; i < blk.length; i++) {
    const el = blk[i];

    if (el & 0x80) d[0] &= 0x0f;
    if (el & 0x40) d[1] &= 0xe8;
    if (el & 0x20) d[1] &= 0x0f;
    if (el & 0x10) d[2] &= 0xe8;
    if (el & 0x08) d[2] &= 0x0f;
    if (el & 0x04) d[3] &= 0xe8;
    if (el & 0x02) d[3] &= 0x0f;
    if (el & 0x01) d[4] &= 0xe8;

    pkt.push(...d);
    d = [0xef, 0xef, 0xef, 0xef, 0xef];
  }
  return new Uint8Array(pkt);
}

/**
 * SWS read address command
 */
function swsRdAddr(addr: number, model: number): Uint8Array {
  let data: Uint8Array;
  if (model === TelinkFamily.TLSR825X) {
    // 825x 24-bit addr
    data = new Uint8Array([0x5a, (addr >> 16) & 0xff, (addr >> 8) & 0xff, addr & 0xff, 0x80]);
  } else if (model === TelinkFamily.TLSR826X) {
    // 826x 16-bit addr
    data = new Uint8Array([0x5a, (addr >> 8) & 0xff, addr & 0xff, 0x80]);
  } else {
    throw new Error(`Unknown model: ${model}`);
  }

  const encoded = swsCodeBlk(data);
  const end = swsCodeEnd();
  const result = new Uint8Array(encoded.length + end.length);
  result.set(encoded);
  result.set(end, encoded.length);
  return result;
}

/**
 * SWS code end marker
 */
function swsCodeEnd(): Uint8Array {
  return swsCodeBlk(new Uint8Array([0xff]));
}

/**
 * SWS write address command
 */
function swsWrAddr(addr: number, data: Uint8Array, model: number): Uint8Array {
  let header: Uint8Array;
  if (model === TelinkFamily.TLSR825X) {
    // 825x 24-bit addr
    header = new Uint8Array([0x5a, (addr >> 16) & 0xff, (addr >> 8) & 0xff, addr & 0xff, 0x00]);
  } else if (model === TelinkFamily.TLSR826X) {
    // 826x 16-bit addr
    header = new Uint8Array([0x5a, (addr >> 8) & 0xff, addr & 0xff, 0x00]);
  } else {
    throw new Error(`Unknown model: ${model}`);
  }

  const combined = new Uint8Array(header.length + data.length);
  combined.set(header);
  combined.set(data, header.length);

  const encoded = swsCodeBlk(combined);
  const end = swsCodeEnd();

  const result = new Uint8Array(encoded.length + end.length);
  result.set(encoded);
  result.set(end, encoded.length);

  return result;
}

/**
 * Compare two Uint8Arrays for equality
 */
function compareArrays(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

interface ChipInfo {
  chipId: number;
  chipName: string;
  floaderVersion: string;
  jedecId: number;
  flashSize: number;
}

export class TelinkTools {
  private link: Link;
  private buffer: Uint8Array = new Uint8Array(0);
  private responseQueue: Array<{
    resolve: (data: Uint8Array | null) => void;
    expectedCmd: number;
    expectedSize: number;
  }> = [];

  private logger: (msg: string) => void = () => {};
  private progressCallback: (percent: number, msg: string) => void = () => {};
  private setLinesHandler: ((dtrLevel: boolean, rtsLevel: boolean) => void) | null = null;

  private readonly boundDataHandler = (data: Uint8Array) => this.dataReceived(data);

  private model: TelinkFamily = TelinkFamily.TLSR825X; // Default to 825x
  private floaderLoaded: boolean = false;

  constructor(link: Link) {
    this.link = link;
    this.ensureListener();
  }

  public setLogger(logger: (msg: string) => void) {
    this.logger = logger;
  }

  public setProgressCallback(cb: (percent: number, msg: string) => void) {
    this.progressCallback = cb;
  }

  public setSetLinesHandler(handler: (dtrLevel: boolean, rtsLevel: boolean) => void) {
    this.setLinesHandler = handler;
  }

  public setModel(model: TelinkFamily) {
    if (model !== TelinkFamily.TLSR825X && model !== TelinkFamily.TLSR826X) {
      throw new Error(`Invalid model: ${model}. Must be 8250 or 8260`);
    }
    this.model = model;
  }

  private ensureListener() {
    if (this.link.offData) {
      this.link.offData(this.boundDataHandler);
    }
    this.link.onData(this.boundDataHandler);
  }

  private dataReceived(data: Uint8Array): void {
    const newBuffer = new Uint8Array(this.buffer.length + data.length);
    newBuffer.set(this.buffer);
    newBuffer.set(data, this.buffer.length);
    this.buffer = newBuffer;

    this.processBuffer();
  }

  private processBuffer(): void {
    while (this.responseQueue.length > 0 && this.buffer.length >= 6) {
      const item = this.responseQueue[0];
      // Response format: [CMD(1)] [data(3)] [CRC(2)] = 6 bytes
      const expectedTotalLen = 1 + item.expectedSize + 2;

      if (this.buffer.length < expectedTotalLen) {
        return;
      }

      // Check command byte matches
      if (this.buffer[0] !== item.expectedCmd) {
        // Scan for the expected command in buffered data
        let found = false;
        const scanLimit = Math.min(this.buffer.length - expectedTotalLen + 1, 100);

        for (let i = 1; i < scanLimit; i++) {
          if (this.buffer[i] === item.expectedCmd) {
            // Check if this looks like a valid packet (has enough data + valid CRC)
            if (i + expectedTotalLen <= this.buffer.length) {
              const testPacket = this.buffer.slice(i, i + expectedTotalLen);
              if (crcChk(testPacket)) {
                // Found valid packet! Skip garbage before it
                this.logger(`Skipped ${i} bytes of noise to find valid response`);
                this.buffer = this.buffer.slice(i);
                found = true;
                break;
              }
            }
          }
        }

        if (!found) {
          // Too much garbage, give up on this response
          if (this.buffer.length > 200) {
            this.logger(`Giving up after ${this.buffer.length} bytes of garbage`);
            this.buffer = new Uint8Array(0);
            this.responseQueue.shift();
            item.resolve(null);
          }
        }
        return;
      }

      const responsePacket = this.buffer.slice(0, expectedTotalLen);
      this.buffer = this.buffer.slice(expectedTotalLen);

      if (!crcChk(responsePacket)) {
        this.logger(`CRC check failed for command 0x${item.expectedCmd.toString(16)}`);
        this.responseQueue.shift();
        item.resolve(null);
        return;
      }

      // Extract data: skip cmd(1), remove crc(2) from end
      const responseData = responsePacket.slice(1, responsePacket.length - 2);
      this.responseQueue.shift();
      item.resolve(responseData);
    }
  }

  private async sendCommand(
    cmd: number,
    param1: number,
    param2: number,
    data?: Uint8Array,
    timeoutMs = 400
  ): Promise<Uint8Array | null> {
    // Format: [CMD(1)] [param1(1)] [param2_low(1)] [param2_high(1)] [data...] [CRC(2)]
    const header = new Uint8Array([cmd, param1 & 0xff, param2 & 0xff, (param2 >> 8) & 0xff]);

    let packet: Uint8Array;
    if (data && data.length > 0) {
      packet = new Uint8Array(header.length + data.length);
      packet.set(header);
      packet.set(data, header.length);
    } else {
      packet = header;
    }

    const withCrc = crcBlk(packet);
    await this.link.write(withCrc);

    return new Promise<Uint8Array | null>((resolve) => {
      // Response format: [CMD(1)] [data(3)] [CRC(2)] = 6 bytes total
      const item = { resolve, expectedCmd: cmd, expectedSize: 3 };
      this.responseQueue.push(item);

      setTimeout(() => {
        const idx = this.responseQueue.indexOf(item);
        if (idx !== -1) {
          this.responseQueue.splice(idx, 1);
          resolve(null);
        }
      }, timeoutMs);
    });
  }

  /**
   * Drain input buffer by discarding incoming data for a specified duration
   */
  private async drainBuffer(durationMs: number = 100): Promise<void> {
    const start = Date.now();
    this.buffer = new Uint8Array(0); // Clear current
    while (Date.now() - start < durationMs) {
      await sleep(10);
      if (this.buffer.length > 0) {
        // this.logger(`Drained ${this.buffer.length} bytes`);
        this.buffer = new Uint8Array(0); // Keep clearing as data comes in
      }
    }
  }

  /**
   * Activate bootloader via RTS/DTR and SWS protocol
   */
  private async activateBootloader(floader: Uint8Array, tact: number = 600): Promise<void> {
    if (!this.setLinesHandler) {
      throw new Error("setLinesHandler not set");
    }

    // Stop CPU command: [0x0602]=5
    const stopCmd = swsWrAddr(0x0602, new Uint8Array([0x05]), this.model);

    // Clear any garbage first
    this.buffer = new Uint8Array(0);
    this.responseQueue = [];

    // IMPORTANT: Python sequence from TlsrComProg.py:
    // 1. First send sws_code_end() + stop command
    // 2. Then setDTR(True), setRTS(True) - puts chip in reset
    // 3. Wait 50ms in reset
    // 4. Send 5 stop commands while in reset
    // 5. setRTS(False) - release reset
    // 6. Send 5 stop commands immediately after reset release
    // 7. setDTR(False)
    // 8. Continue sending stop commands for tact duration

    // Step 1: Send initial SWS commands
    await this.link.write(swsCodeEnd());
    await this.link.write(stopCmd);

    if (tact > 0) {
      this.logger(`Activating (${tact} ms)...`);

      // Step 2: Put chip in reset (DTR=True, RTS=True)
      this.setLinesHandler(true, true);

      // Step 3: Wait 50ms in reset
      await sleep(50);

      // Step 4: Send 5 stop commands while in reset
      for (let i = 0; i < 5; i++) {
        await this.link.write(stopCmd);
      }

      // Step 5: Release reset (RTS=False), keep DTR=True
      this.setLinesHandler(true, false);

      // Step 6: Send 5 stop commands immediately - this is critical!
      // These commands must reach the CPU before firmware starts executing
      for (let i = 0; i < 5; i++) {
        await this.link.write(stopCmd);
      }

      // Step 7: DTR=False
      this.setLinesHandler(false, false);
      await this.link.write(stopCmd);

      // Step 8: Continue sending stop commands for tact period
      const startTime = Date.now();
      while (Date.now() - startTime < tact) {
        for (let i = 0; i < 5; i++) {
          await this.link.write(stopCmd);
        }
      }
    }

    // After tact: Python does sleep(0.001) + flush buffers
    await sleep(1);
    this.buffer = new Uint8Array(0);

    // Set SWS speed: [0x00b2] = baudrate divisor (like Python line 447)
    await this.link.write(swsCodeEnd());
    const x = Math.min(127, Math.floor(32000000 / 230400));
    await this.link.write(swsWrAddr(0x00b2, new Uint8Array([x]), this.model));

    // Test read [0x00b2] (Python lines 451-460)
    await this.link.write(swsRdAddr(0x00b2, this.model));
    await sleep(10);
    await this.link.write(new Uint8Array([0xff])); // Start read
    await sleep(10);
    await this.link.write(swsCodeEnd()); // Stop read
    await sleep(10);

    // Clear test data
    this.buffer = new Uint8Array(0);

    // Load floader to RAM
    let startAddr;
    if (this.model === TelinkFamily.TLSR825X) {
      startAddr = 0x40000;
    } else if (this.model === TelinkFamily.TLSR826X) {
      startAddr = 0x8000;
    } else {
      throw new Error(`Unknown model: ${this.model}`);
    }
    this.logger(`Loading floader (${floader.length} bytes) to 0x${startAddr.toString(16)}...`);

    let addr = startAddr;
    let offset = 0;
    const chunkSize = 0x100;

    while (offset < floader.length) {
      const chunk = floader.slice(offset, offset + chunkSize);
      await this.link.write(swsWrAddr(addr, chunk, this.model));
      // Clear any echo/noise
      this.buffer = new Uint8Array(0);

      addr += chunk.length;
      offset += chunk.length;
    }

    this.logger(`Floader loaded: ${offset} bytes written to 0x${startAddr.toString(16)}-0x${addr.toString(16)}`);
    this.logger("Starting CPU...");

    // Start CPU: [0x0602] = 0x88
    await this.link.write(swsWrAddr(0x0602, new Uint8Array([0x88]), this.model));
    await this.link.write(swsCodeEnd());

    // Wait for floader to start
    await sleep(500);

    // Clear any startup output from floader
    const startupBytes = this.buffer.length;
    this.buffer = new Uint8Array(0);
    this.responseQueue = [];

    if (startupBytes > 0) {
      this.logger(`Cleared ${startupBytes} bytes after CPU start`);
    }

    // Additional wait for floader initialization
    await sleep(500);
    this.buffer = new Uint8Array(0);
  }

  /**
   * Detect if floader is already running
   * @param maxRetries Maximum number of retry attempts
   * @param progressiveDelay Use progressive delays like Python code
   */
  private async detectFloader(maxRetries = 1, progressiveDelay = false): Promise<boolean> {
    for (let retry = 0; retry < maxRetries; retry++) {
      if (retry > 0) {
        // Progressive delay like Python: 0.1 -> 0.15 -> 0.25
        let delay = 100;
        if (progressiveDelay) {
          if (retry < 5) delay = 100;
          else if (retry < 10) delay = 150;
          else delay = 250;
        }
        await sleep(delay);
      }

      // Clear buffers before EVERY attempt (Python does this)
      await this.drainBuffer(50);
      this.responseQueue = [];

      try {
        // Use longer timeout for retries after floader load (1000ms instead of 400ms)
        const timeout = retry === 0 ? 400 : 1000;
        const response = await this.sendCommand(CMD_VER, 0, 0, undefined, timeout);
        if (response && response.length >= 3) {
          // Additional validation: check if response looks reasonable
          // ChipID should not be 0xFFFF (empty) or 0x0000 (invalid)
          const chipId = response[1] | (response[2] << 8);
          if (chipId !== 0xffff && chipId !== 0x0000) {
            if (retry > 0) {
              this.logger(`(retry ${retry + 1} succeeded)`);
            }
            return true;
          }
        }
        // Debug: log unexpected response
        if (response) {
          this.logger(`detectFloader: unexpected response length ${response.length}`);
        } else {
          this.logger(`detectFloader retry ${retry + 1}: no response (timeout)`);
        }
      } catch (error) {
        this.logger(`detectFloader retry ${retry + 1}: ${error}`);
      }
    }
    return false;
  }

  /**
   * Get chip information
   */
  public async getChipInfo(): Promise<ChipInfo | null> {
    let floaderData = null;
    try {
      // we need to load ./bins/floader_825x.bin or ./bins/floader_826x.bin as unit8array and pass to telinkTools
      // log("Loading Telink bootloader...");
      let floaderUrl;
      if (this.model === TelinkFamily.TLSR825X) {
        floaderUrl = "./bins/floader_825x.bin";
      } else if (this.model === TelinkFamily.TLSR826X) {
        floaderUrl = "./bins/floader_826x.bin";
      } else {
        throw new Error("Floader URL not specified for the selected model");
      }

      //  const fillByte = getSelectedFamily() === "arduino" ? 0xff : 0x00;
      const img = await downloadFirmwareFromUrl(floaderUrl, 0xff);
      floaderData = img.data;
    } catch (e) {
      this.logger(`Failed to load floader: ${e}`);
      return null;
    }
    try {
      // Initialize signals and clear any garbage (like Python does at start)
      this.setLinesHandler?.(false, false);
      await sleep(50);
      this.buffer = new Uint8Array(0);
      this.responseQueue = [];

      // Try to detect floader first (quick check)
      let detected = await this.detectFloader(2, false);

      // If not detected and floader provided, load it
      if (!detected && floaderData) {
        // NOTE: Do NOT call reset() here! The activateBootloader function handles
        // the reset sequence internally via DTR/RTS signals, and calling reset()
        // separately would cause the chip to output startup garbage that interferes
        // with the SWS protocol commands.
        await this.activateBootloader(floaderData);

        // Try multiple times with progressive delays (like Python does for macOS)
        detected = await this.detectFloader(3, true);
      }

      if (!detected) {
        throw new Error("Failed to communicate with floader");
      }

      this.floaderLoaded = true;

      // Get version - response is 3 bytes: [version, chipId_low, chipId_high]
      // Use longer timeout for first command after floader load
      const verResponse = await this.sendCommand(CMD_VER, 0, 0, undefined, 1000);
      if (!verResponse || verResponse.length < 3) {
        throw new Error("Failed to get version");
      }

      const ver = verResponse[0];
      const chipId = verResponse[1] | (verResponse[2] << 8);

      if (chipId === 0 && ver === 0) {
        throw new Error("Check connection to the module");
      }

      let chipName = "Unknown";
      if (chipId === 0x5562) chipName = "TLSR825X";
      else if (chipId === 0x5325) chipName = "TLSR8266";
      else if (chipId === 0x5327) chipName = "TLSR8269";
      else if (chipId === 0x5326) chipName = "TLSR8267";

      const floaderVersion = `${(ver >> 4) & 0x0f}.${ver & 0x0f}`;

      this.logger(`ChipID: 0x${chipId.toString(16).padStart(4, "0")} (${chipName}), Floader ver: ${floaderVersion}`);

      // Get Flash JEDEC ID - response is 3 bytes: [jedec_low, jedec_mid, jedec_high]
      const jedecResponse = await this.sendCommand(CMD_JDC, 0, 0, undefined, 400);
      if (!jedecResponse || jedecResponse.length < 3) {
        throw new Error("Failed to get JEDEC ID");
      }

      const jedecId = (jedecResponse[0] << 16) | (jedecResponse[1] << 8) | jedecResponse[2];
      const flashSize = jedecId === 0xffffff || jedecId === 0 ? 0 : 1 << jedecResponse[2];

      if (jedecId === 0xffffff) {
        throw new Error("Power off in the module, reset and restart");
      } else if (jedecId === 0) {
        throw new Error("Check connection to the module");
      }

      this.logger(`Flash JEDEC ID: ${jedecId.toString(16).padStart(6, "0")}, Size: ${flashSize >> 10} kbytes`);

      return {
        chipId,
        chipName,
        floaderVersion,
        jedecId,
        flashSize,
      };
    } catch (e: any) {
      this.logger(`Chip info error: ${e?.message || String(e)}`);
      return null;
    }
  }

  /**
   * Unlock flash for writing
   */
  private async unlockFlash(): Promise<boolean> {
    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (attempt > 0) {
        await this.drainBuffer(50);
        await sleep(100);
        this.logger(`Unlock retry (${attempt}/${maxRetries - 1})`);
      }
      const response = await this.sendCommand(CMD_VER, 2, 0, undefined, 600);
      if (response !== null) {
        this.logger("Flash unlocked");
        return true;
      }
    }
    this.logger("Failed to unlock flash after multiple attempts");
    return false;
  }

  /**
   * Erase flash sectors
   */
  private async eraseSectors(offset: number, count: number): Promise<boolean> {
    offset = offset & (0xffffff ^ (FLASH_SECTOR_SIZE - 1));

    for (let i = 0; i < count; i++) {
      const addr = offset + i * FLASH_SECTOR_SIZE;
      //   this.logger(`Erasing sector at 0x${addr.toString(16).padStart(6, "0")}...`);

      const maxRetries = 3;
      let retries = maxRetries;
      while (retries > 0) {
        // Clear buffer before erase command
        if (retries < maxRetries) {
          await this.drainBuffer(30);
          await sleep(100 * (maxRetries - retries)); // Progressive delay
        }
        // Format: CMD_EFS, addr_low, addr_high (word)
        // Erase operations take longer, use 800ms timeout
        const response = await this.sendCommand(CMD_EFS, addr & 0xff, (addr >> 8) & 0xffff, undefined, 800);
        if (response !== null) {
          break;
        }
        retries--;
        if (retries > 0) {
          this.logger(
            `Erase retry at 0x${addr.toString(16).padStart(6, "0")} (${maxRetries - retries}/${maxRetries - 1})`
          );
        } else {
          this.logger(`Error erasing sector at 0x${addr.toString(16).padStart(6, "0")} after ${maxRetries} attempts`);
          return false;
        }
      }
    }

    return true;
  }

  public async reset(): Promise<void> {
    this.logger("Resetting Telink device...");
    this.setLinesHandler?.(false, false);
    await sleep(100);
    this.setLinesHandler?.(false, true);
    await sleep(200);
    this.setLinesHandler?.(false, false);
    await sleep(100);
    // this.logger("Device reset complete");
  }

  /**
   * Erase all flash
   */
  public async eraseAllFlash(): Promise<boolean> {
    if (!this.floaderLoaded) {
      throw new Error("Floader not loaded.");
    }

    this.logger("Erasing all flash...");
    const response = await this.sendCommand(CMD_EAF, 0, 0, undefined, 2500);
    if (response !== null) {
      this.logger("Erased successfully");
      return true;
    }
    throw new Error("Failed to erase all flash");
  }
  /**
   * Write block to flash
   */
  private async writeBlock(offset: number, data: Uint8Array): Promise<boolean> {
    const maxRetries = 3;
    let retries = maxRetries;
    while (retries > 0) {
      // Clear buffer before write to avoid stale data interference
      if (retries < maxRetries) {
        await this.drainBuffer(30);
        await sleep(50 * (maxRetries - retries)); // Progressive delay: 50, 100, 150, 200ms
      }
      // Format: CMD_WBF, addr_low, addr_high (word), data
      const response = await this.sendCommand(CMD_WBF, offset & 0xff, (offset >> 8) & 0xffff, data, 600);
      if (response !== null) {
        return true;
      }
      retries--;
      if (retries > 0) {
        this.logger(
          `Write retry at 0x${offset.toString(16).padStart(6, "0")} (${maxRetries - retries}/${maxRetries - 1})`
        );
      } else {
        this.logger(`Error writing flash at 0x${offset.toString(16).padStart(6, "0")} after ${maxRetries} attempts`);
        return false;
      }
    }
    return false;
  }

  /**
   * Read block from flash
   */
  private async readBlock(offset: number, size: number): Promise<Uint8Array | null> {
    const maxRetries = 3;
    let retries = maxRetries;
    while (retries > 0) {
      // Clear buffer before read to avoid stale data interference
      if (retries < maxRetries) {
        await this.drainBuffer(30);
        await sleep(50 * (maxRetries - retries)); // Progressive delay: 50, 100, 150, 200ms
      }
      // Format: CMD_RBF, addr_low, addr_high (word), size (word)
      const header = new Uint8Array([
        CMD_RBF,
        offset & 0xff,
        (offset >> 8) & 0xff,
        (offset >> 16) & 0xff,
        size & 0xff,
        (size >> 8) & 0xff,
      ]);
      const withCrc = crcBlk(header);
      await this.link.write(withCrc);

      // Response: [CMD(1)] [addr_low(1)] [addr_high(2)] [data(size)] [CRC(2)]
      // Use longer timeout for larger blocks
      const timeout = Math.max(1500, 1000 + Math.ceil(size / 256) * 100);
      const response = await new Promise<Uint8Array | null>((resolve) => {
        const item = {
          resolve,
          expectedCmd: CMD_RBF,
          expectedSize: 3 + size, // 3 bytes addr + data
        };
        this.responseQueue.push(item);

        setTimeout(() => {
          const idx = this.responseQueue.indexOf(item);
          if (idx !== -1) {
            this.responseQueue.splice(idx, 1);
            resolve(null);
          }
        }, timeout);
      });

      if (response && response.length >= 3 + size) {
        // Extract data (skip 3 addr bytes)
        return response.slice(3, 3 + size);
      }

      retries--;
      if (retries > 0) {
        this.logger(
          `Read retry at 0x${offset.toString(16).padStart(6, "0")} (${maxRetries - retries}/${maxRetries - 1})`
        );
      } else {
        this.logger(`Error reading flash at 0x${offset.toString(16).padStart(6, "0")} after ${maxRetries} attempts`);
        return null;
      }
    }
    return null;
  }

  /**
   * Flash firmware to device
   * @param firmware - firmware data to flash
   * @param startAddress - start address in flash
   * @param erase - whether to erase sectors before writing
   * @param verify - whether to verify written data (slower but more reliable)
   */
  public async flash(
    firmware: Uint8Array,
    startAddress: number = 0,
    erase: boolean = true,
    verify: boolean = false
  ): Promise<void> {
    if (!this.floaderLoaded) {
      throw new Error("Floader not loaded.");
    }

    try {
      const wrsize = 1024;
      let offset = startAddress & 0xffffff;
      const totalSize = firmware.length;
      let currentOffset = 0;
      let erasec = 0xffffffff;

      // Clear any stale data before starting
      await this.drainBuffer(50);

      this.logger(`Flashing ${totalSize} bytes starting at 0x${offset.toString(16).padStart(6, "0")}...`);

      while (currentOffset < totalSize) {
        // Erase sector if needed
        if (erase) {
          const wrsec = offset & (0xffffff ^ (FLASH_SECTOR_SIZE - 1));
          if (erasec !== wrsec) {
            // this.logger(`Erasing at 0x${offset.toString(16).padStart(6, "0")}...`);
            if (!(await this.eraseSectors(offset, 1))) {
              throw new Error(`Failed to erase sector at 0x${offset.toString(16).padStart(6, "0")}`);
            }
            erasec = wrsec;
          }
        }

        // Write block
        const chunkSize = Math.min(wrsize, totalSize - currentOffset);
        const chunk = firmware.slice(currentOffset, currentOffset + chunkSize);

        // Check if block needs writing (contains non-0xFF data)
        let needsWrite = false;
        for (let i = 0; i < chunk.length; i++) {
          if (chunk[i] !== 0xff) {
            needsWrite = true;
            break;
          }
        }

        if (needsWrite) {
          // this.logger(`Writing to 0x${offset.toString(16).padStart(6, "0")}...`);
          if (!(await this.writeBlock(offset, chunk))) {
            throw new Error(`Failed to write block at 0x${offset.toString(16).padStart(6, "0")}`);
          }

          // Optional verification of written data
          if (verify) {
            const readBack = await this.readBlock(offset, chunkSize);
            if (!readBack || !compareArrays(chunk, readBack)) {
              throw new Error(`Verification failed at 0x${offset.toString(16).padStart(6, "0")}`);
            }
          }

          // Small delay between writes for stability
          await sleep(5);
        }

        currentOffset += chunkSize;
        offset += chunkSize;

        const percent = Math.round((currentOffset / totalSize) * 100);
        this.progressCallback(percent, `Writing ${currentOffset}/${totalSize}`);
      }

      this.logger("Flashing complete!");
      this.progressCallback(100, "Write complete");
      await sleep(500);
      this.progressCallback(0, "");
    } catch (e: any) {
      this.logger("Flash error: " + (e?.message || String(e)));
      setTimeout(async () => {
        this.progressCallback(0, "");
      }, 500);
      throw e;
    }
  }

  /**
   * Read flash memory
   */
  public async readFlash(startAddress: number, length: number): Promise<Uint8Array> {
    if (!this.floaderLoaded) {
      throw new Error("Floader not loaded.");
    }

    try {
      const rdsize = 1024;
      const result = new Uint8Array(length);
      let offset = startAddress & 0xffffff;
      let currentOffset = 0;

      // this.logger(`Reading ${length} bytes from address 0x${offset.toString(16).padStart(6, "0")}...`);

      // Clear any stale data before starting
      await this.drainBuffer(50);

      while (currentOffset < length) {
        const chunkSize = Math.min(rdsize, length - currentOffset);
        // this.logger(`Reading from 0x${offset.toString(16).padStart(6, "0")}...`);
        const chunk = await this.readBlock(offset, chunkSize);
        if (!chunk) {
          throw new Error(`Failed to read block at 0x${offset.toString(16).padStart(6, "0")}`);
        }

        result.set(chunk, currentOffset);
        currentOffset += chunkSize;
        offset += chunkSize;

        const percent = Math.round((currentOffset / length) * 100);
        this.progressCallback(percent, `Reading ${currentOffset}/${length}`);

        // Small delay between reads for stability
        await sleep(5);
      }

      this.logger("Read complete!");
      this.progressCallback(100, "Read complete");
      await sleep(500);
      this.progressCallback(0, "");

      return result;
    } catch (e: any) {
      this.logger("Read error: " + (e?.message || String(e)));
      setTimeout(async () => {
        this.progressCallback(0, "");
      }, 500);
      throw e;
    }
  }

  /**
   * Dump flash to file
   */
  public async dumpFlash(): Promise<void> {
    const flashSizeStr = flashSizeEl?.value || "";
    // const match = flashSizeStr.match(/(\d+)\s*bytes/i);
    // this.logger("Flash size: " + match);
    // const flashSize = match ? parseInt(match[1], 10) * 1024 : 512 * 1024; // Default 512KB

    const match = flashSizeStr.match(/\((\d+)\s*bytes\)/);
    const flashSize = match ? parseInt(match[1], 10) : 0;

    this.logger(`Dumping ${flashSize} bytes of flash...`);

    const flashData = await this.readFlash(0, flashSize);

    // Convert to Intel HEX format
    // const hexContent = generateHex(flashData, 0);

    this.logger(`Flash read complete: ${flashData.length} bytes`);

    const filename = saveToFile(
      flashData,
      "application/octet-stream",
      "bin",
      "dump",
      chipModelEl?.value,
      undefined,
      String(flashSize / 1024) + "KB"
    );

    this.logger(`Flash saved to ${filename}`);
  }

  public dispose(): void {
    if (this.link.offData) {
      this.link.offData(this.boundDataHandler);
    }
    this.buffer = new Uint8Array(0);
    this.responseQueue = [];
    this.floaderLoaded = false;
  }
}

// ============================================================================
// UART2SWire (PGM Board) Protocol Implementation
// Based on TlsrPgm.py by pvvx
// ============================================================================

// PGM Board Protocol Commands
const PGM_CMD_FUNCS = 0;
const PGM_CMD_FLASH_READ = 1;
const PGM_CMD_FLASH_WRITE = 2;
const PGM_CMD_FLASH_SECT_ERASE = 3;
const PGM_CMD_FLASH_ALL_ERASE = 4;
const PGM_CMD_FLASH_GET_JEDEC_ID = 5;
const PGM_CMD_FLASH_GET_STATUS = 6;
const PGM_CMD_SWIRE_READ = 7;
const PGM_CMD_SWIRE_WRITE = 8;
const PGM_CMD_SWIRE_AREAD = 9;
const PGM_CMD_SWIRE_AWRITE = 10;
const PGM_CMD_SWIRE_FIFO_READ = 11;
const PGM_CMD_SWIRE_FIFO_FWRITE = 12;
const PGM_CMD_FLASH_WRRD = 13;
const PGM_CMD_FLASH_RDCRC = 14;
const PGM_CMD_SWS_PRINTF = 15;
const PGM_CMD_WAIT_RESP = 16;

// PGM Function Codes
const PGM_CMDF_GET_VERSION = 0;
const PGM_CMDF_MCU_REBOOT = 1;
const PGM_CMDF_SWIRE_CFG = 2;
const PGM_CMDF_EXT_POWER = 3;
const PGM_CMDF_SWIRE_ACTIVATE = 4;
const PGM_CMDF_UART_BAUD = 5;

// PGM Error Codes
const PGM_ERR_NONE = 0;
const PGM_ERR_FUNC = 1;
const PGM_ERR_LEN = 2;
const PGM_ERR_READ = 3;
const PGM_ERR_BUSY = 4;
const PGM_ERR_CRC = 5;
const PGM_ERR_BAUD = 6;

const PGM_MAX_BUF_READ_SIZE = 1024;
const PGM_MAX_RESPONSE_SIZE = 1026;
const PGM_MIN_RESPONSE_SIZE = 6;

const PGM_ERR_MESSAGES = [
  "No error",
  "Function number error!",
  "Data length error!",
  "SWire read timeout!",
  "Timeout flag while reading analog register!",
  "CRC error!",
  "Invalid baud rate number!",
];

const PGM_UART_BAUDS = [115200, 230400, 460800, 500000, 921600, 1000000, 1500000, 2000000, 3000000];

interface PgmChipInfo {
  chipId: number;
  chipName: string;
  chipVersion: number;
  jedecId: number;
  flashSize: number;
}

interface PgmBoardInfo {
  version: number[];
  versionInt: number;
  chipId: number;
  chipName: string;
  power: number;
  swDiv: number;
  swAddrLen: number;
  swBuf: Uint8Array;
  swsClock: number;
  swsSpeed: number;
}

/**
 * Telink PGM Tools - UART2SWire adapter (PGM board) protocol implementation
 * Based on TlsrPgm.py by pvvx
 */
export class TelinkPgmTools {
  private link: Link;
  private buffer: Uint8Array = new Uint8Array(0);
  private responseQueue: Array<{
    resolve: (data: Uint8Array | null) => void;
    expectedCmd: number;
    expectedSize: number | null;
  }> = [];

  private logger: (msg: string) => void = () => {};
  private progressCallback: (percent: number, msg: string) => void = () => {};
  private setLinesHandler: ((dtrLevel: boolean, rtsLevel: boolean) => void) | null = null;

  private readonly boundDataHandler = (data: Uint8Array) => this.dataReceived(data);

  // PGM board state
  private pgmVersion: number[] = [0, 0];
  private pgmVersionInt: number = 0;
  private pgmChipId: number = 0;
  private pgmChipName: string = "?";
  private pgmPower: number = 1;
  private pgmSwDiv: number = 5;
  private pgmSwAddrLen: number = 3; // 3 = TLSR825x (24-bit), 2 = TLSR826x (16-bit)
  private pgmSwBuf: Uint8Array = new Uint8Array([0x5a, 0x00, 0x06, 0x02, 0x00, 0x05]);
  private pgmClock: number = 24;
  private pgmSwsSpeed: number = 0.96;

  // External chip state
  private extChipId: number = 0;
  private extChipVersion: number = 0;
  private extChipName: string = "?";
  private extJedecId: number = 0;
  private extFlashSize: number = 0;

  // Last command info
  private lastError: number = 0;
  private lastWcnt: number = 0;

  private connected: boolean = false;

  constructor(link: Link) {
    this.link = link;
    this.ensureListener();
  }

  public setLogger(logger: (msg: string) => void) {
    this.logger = logger;
  }

  public setProgressCallback(cb: (percent: number, msg: string) => void) {
    this.progressCallback = cb;
  }

  public setSetLinesHandler(handler: (dtrLevel: boolean, rtsLevel: boolean) => void) {
    this.setLinesHandler = handler;
  }

  /**
   * Set address length for TLSR826x (2 bytes) or TLSR825x (3 bytes)
   */
  public setAddrLen(addrLen: 2 | 3) {
    this.pgmSwAddrLen = addrLen;
  }

  private ensureListener() {
    if (this.link.offData) {
      this.link.offData(this.boundDataHandler);
    }
    this.link.onData(this.boundDataHandler);
  }

  private dataReceived(data: Uint8Array): void {
    const newBuffer = new Uint8Array(this.buffer.length + data.length);
    newBuffer.set(this.buffer);
    newBuffer.set(data, this.buffer.length);
    this.buffer = newBuffer;

    this.processBuffer();
  }

  private processBuffer(): void {
    while (this.responseQueue.length > 0 && this.buffer.length >= PGM_MIN_RESPONSE_SIZE) {
      const item = this.responseQueue[0];

      // First, read the minimum header to get wcnt
      if (this.buffer.length < PGM_MIN_RESPONSE_SIZE) {
        return;
      }

      // Check command byte
      if (this.buffer[0] !== item.expectedCmd) {
        // Try to find valid packet
        let found = false;
        for (let i = 1; i < Math.min(this.buffer.length - PGM_MIN_RESPONSE_SIZE + 1, 100); i++) {
          if (this.buffer[i] === item.expectedCmd) {
            this.logger(`Skipped ${i} bytes of noise`);
            this.buffer = this.buffer.slice(i);
            found = true;
            break;
          }
        }
        if (!found && this.buffer.length > 200) {
          this.logger(`Giving up after ${this.buffer.length} bytes of garbage`);
          this.buffer = new Uint8Array(0);
          this.responseQueue.shift();
          item.resolve(null);
          return;
        }
        if (!found) return;
      }

      // Parse header: [CMD(1)] [ERR(1)] [WCNT_LOW(1)] [WCNT_HIGH(1)] [data(?)] [CRC(2)]
      const cmd = this.buffer[0];
      const err = this.buffer[1];
      const wcnt = this.buffer[2] | (this.buffer[3] << 8);

      // Calculate data size based on command type
      // For WRITE commands (SWIRE_WRITE, FLASH_WRITE, etc.) - no data in response, wcnt is informational
      // For READ commands (SWIRE_READ, FLASH_READ, etc.) - data size equals wcnt
      // For other commands - check wcnt for data presence
      let dataSize = 0;
      if (
        cmd === PGM_CMD_SWIRE_READ ||
        cmd === PGM_CMD_FLASH_READ ||
        cmd === PGM_CMD_SWIRE_AREAD ||
        cmd === PGM_CMD_SWIRE_FIFO_READ
      ) {
        // Read commands - data size equals wcnt
        dataSize = wcnt;
      } else if (cmd === PGM_CMD_FUNCS) {
        // Function commands have variable response size
        dataSize = wcnt;
      } else if (cmd === PGM_CMD_FLASH_GET_JEDEC_ID) {
        // JEDEC ID returns 3 bytes
        dataSize = wcnt;
      } else if (cmd === PGM_CMD_FLASH_GET_STATUS) {
        // Status returns 1 byte
        dataSize = wcnt;
      } else if (cmd === PGM_CMD_FLASH_RDCRC) {
        // CRC is returned in WCNT field itself, NOT as payload data!
        // Python: rdata[2:4] - bytes 2-3 are WCNT which contains the CRC
        dataSize = 0;
      } else if (cmd === PGM_CMD_WAIT_RESP) {
        // Wait response returns wcnt bytes
        dataSize = wcnt;
      }
      // For WRITE commands (SWIRE_WRITE, FLASH_WRITE, FLASH_SECT_ERASE, FLASH_ALL_ERASE, FLASH_WRRD with rdsize=0, etc.)
      // dataSize remains 0 - no payload in response, wcnt is just informational

      // Calculate total expected size
      const totalSize = 4 + dataSize + 2; // header(4) + data(dataSize) + crc(2)

      if (this.buffer.length < totalSize) {
        return; // Need more data
      }

      const responsePacket = this.buffer.slice(0, totalSize);
      this.buffer = this.buffer.slice(totalSize);

      if (!crcChk(responsePacket)) {
        this.logger(`CRC check failed for command 0x${item.expectedCmd.toString(16)}`);
        this.responseQueue.shift();
        item.resolve(null);
        return;
      }

      // Store error and wcnt
      this.lastError = err;
      this.lastWcnt = wcnt;

      // Return full packet (without CRC)
      this.responseQueue.shift();
      item.resolve(responsePacket.slice(0, totalSize - 2));
    }
  }

  /**
   * Send command to PGM board
   */
  private async sendCommand(cmdData: Uint8Array, timeoutMs = 500): Promise<Uint8Array | null> {
    const withCrc = crcBlk(cmdData);
    await this.link.write(withCrc);

    return new Promise<Uint8Array | null>((resolve) => {
      const item = {
        resolve,
        expectedCmd: cmdData[0],
        expectedSize: null,
      };
      this.responseQueue.push(item);

      setTimeout(() => {
        const idx = this.responseQueue.indexOf(item);
        if (idx !== -1) {
          this.responseQueue.splice(idx, 1);
          resolve(null);
        }
      }, timeoutMs);
    });
  }

  /**
   * Drain input buffer
   */
  private async drainBuffer(durationMs: number = 100): Promise<void> {
    const start = Date.now();
    this.buffer = new Uint8Array(0);
    while (Date.now() - start < durationMs) {
      await sleep(10);
      if (this.buffer.length > 0) {
        this.buffer = new Uint8Array(0);
      }
    }
  }

  /**
   * Get PGM board version and configuration
   */
  public async getVersion(): Promise<PgmBoardInfo | null> {
    await this.drainBuffer(50);

    // CMD_FUNCS with CMDF_GET_VERSION: returns 19 bytes
    const cmd = new Uint8Array([PGM_CMD_FUNCS, PGM_CMDF_GET_VERSION, 0, 0]);
    const response = await this.sendCommand(cmd, 1000);

    if (!response || response.length < 17) {
      this.logger("Error: Failed to get PGM version");
      return null;
    }

    if (this.lastError !== PGM_ERR_NONE) {
      this.logger(`Error[${this.lastError}]: ${PGM_ERR_MESSAGES[this.lastError] || "Unknown error"}`);
      return null;
    }

    // Parse response: [CMD][ERR][WCNT_L][WCNT_H][VER_L][VER_H][CID_L][CID_H][PWR][SWDIV][SWADDRLEN][SWBUF(6)]
    this.pgmVersion = [response[5], response[4]];
    this.pgmVersionInt = (response[5] << 8) | response[4];
    this.pgmChipId = response[6] | (response[7] << 8);
    this.pgmPower = response[8];
    this.pgmSwDiv = response[9];
    this.pgmSwAddrLen = response[10];
    this.pgmSwBuf = response.slice(11, 17);

    // Determine chip and clock
    if (this.pgmChipId === 0x5562) {
      this.pgmChipName = "TLSR825x";
      this.pgmClock = 24;
    } else if (this.pgmChipId === 0x5325) {
      this.pgmChipName = "TLSR8266";
      this.pgmClock = 32;
    } else if (this.pgmChipId === 0x5326) {
      this.pgmChipName = "TLSR8267";
      this.pgmClock = 32;
    } else if (this.pgmChipId === 0x5327) {
      this.pgmChipName = "TLSR8269";
      this.pgmClock = 32;
    } else {
      this.pgmChipName = "?";
      this.pgmClock = 32;
    }

    this.pgmSwsSpeed = this.pgmClock / 5 / this.pgmSwDiv;

    const info: PgmBoardInfo = {
      version: this.pgmVersion,
      versionInt: this.pgmVersionInt,
      chipId: this.pgmChipId,
      chipName: this.pgmChipName,
      power: this.pgmPower,
      swDiv: this.pgmSwDiv,
      swAddrLen: this.pgmSwAddrLen,
      swBuf: this.pgmSwBuf,
      swsClock: this.pgmClock,
      swsSpeed: this.pgmSwsSpeed,
    };

    this.logger(
      `PGM: ChipID: 0x${this.pgmChipId.toString(16).padStart(4, "0")} (${this.pgmChipName}), ver: ${
        this.pgmVersion[0]
      }.${this.pgmVersion[1]}`
    );
    this.logger(`swdiv ${this.pgmSwDiv}, addrlen ${this.pgmSwAddrLen}, pwr ${this.pgmPower ? "On" : "Off"}`);
    this.logger(`SWire bit rate: ${this.pgmSwsSpeed.toFixed(4)} Mbits/s`);

    if (this.pgmVersionInt < 4) {
      this.logger("Warning: This program requires PGM version 0.0.0.4 or higher!");
    }

    this.connected = true;
    return info;
  }

  /**
   * Set PGM board configuration
   */
  public async setPgmConfig(swDiv?: number, swAddrLen?: number, swBuf?: Uint8Array): Promise<boolean> {
    const div = swDiv ?? this.pgmSwDiv;
    const addrLen = swAddrLen ?? this.pgmSwAddrLen;
    const buf = swBuf ?? this.pgmSwBuf;

    // CMD_FUNCS with CMDF_SWIRE_CFG
    const cmd = new Uint8Array(6 + buf.length);
    cmd[0] = PGM_CMD_FUNCS;
    cmd[1] = PGM_CMDF_SWIRE_CFG;
    cmd[2] = 0;
    cmd[3] = 0;
    cmd[4] = div;
    cmd[5] = addrLen;
    cmd.set(buf, 6);

    const response = await this.sendCommand(cmd, 500);

    if (!response || this.lastError !== PGM_ERR_NONE) {
      this.logger(`Error[${this.lastError}]: Set PGM Config failed!`);
      return false;
    }

    this.pgmSwDiv = response[4];
    this.pgmSwAddrLen = response[5];
    this.pgmSwBuf = response.slice(6, 12);

    this.logger(`PGM: swdiv ${this.pgmSwDiv}, addrlen ${this.pgmSwAddrLen}, swbuf [${bufToHex(this.pgmSwBuf)}]`);

    return true;
  }

  /**
   * Set UART baud rate on PGM board
   */
  public async setUartBaud(baud: number): Promise<boolean> {
    const baudIdx = PGM_UART_BAUDS.indexOf(baud);
    if (baudIdx === -1) {
      this.logger(`Invalid PGM baud rate (${baud})!`);
      return false;
    }

    this.logger(`Set Speed UART PGM board ${baud} bits/s...`);

    const cmd = new Uint8Array([PGM_CMD_FUNCS, PGM_CMDF_UART_BAUD, baudIdx & 0xff, (baudIdx >> 8) & 0xff]);
    const response = await this.sendCommand(cmd, 500);

    if (!response || this.lastError !== PGM_ERR_NONE) {
      this.logger(`Error[${this.lastError}]: Set UART baud failed!`);
      return false;
    }

    this.logger("ok");
    return true;
  }

  /**
   * Set RST/Power pin
   */
  public async setPinRST(on: boolean): Promise<boolean> {
    const cmd = new Uint8Array([PGM_CMD_FUNCS, PGM_CMDF_EXT_POWER, on ? 1 : 0, 0]);
    const response = await this.sendCommand(cmd, 500);

    if (!response || this.lastError !== PGM_ERR_NONE) {
      this.logger(`Error[${this.lastError}]: Set pin RST/Power failed!`);
      return false;
    }

    return true;
  }

  /**
   * Activate external chip
   */
  public async activate(timeMs: number): Promise<boolean> {
    const count = Math.min(0xffff, Math.floor(timeMs / (((this.pgmSwAddrLen + 5.7) * 5 * this.pgmSwDiv) / 2400)));

    this.logger(`Activate ${timeMs} ms...`);

    const cmd = new Uint8Array([PGM_CMD_FUNCS, PGM_CMDF_SWIRE_ACTIVATE, count & 0xff, (count >> 8) & 0xff]);

    const timeout = timeMs + 500;
    const response = await this.sendCommand(cmd, timeout);

    if (!response || response.length < 6) {
      this.logger("Timeout response - Check PGM connected!");
      return false;
    }

    if (this.lastError !== PGM_ERR_NONE) {
      if (this.lastError === PGM_ERR_READ) {
        this.logger("Error! Check SWM<->SWS connection or Reset/Activation time!");
      }
      this.logger(`Error[${this.lastError}]: ${PGM_ERR_MESSAGES[this.lastError] || "Unknown error"}`);
      return false;
    }

    if (this.lastWcnt >= 4 && response.length >= 8) {
      const pc = response[4] | (response[5] << 8) | (response[6] << 16) | (response[7] << 24);
      this.logger(`ok. CPU PC=0x${pc.toString(16).padStart(8, "0")}`);
    }

    return true;
  }

  /**
   * Read external chip ID
   */
  public async readChipID(): Promise<boolean> {
    // Read 3 bytes from address 0x7d
    const cmd = new Uint8Array([PGM_CMD_SWIRE_READ, 0x7d, 0x00, 0x00, 3, 0]);
    const response = await this.sendCommand(cmd, 500);

    if (!response || this.lastWcnt !== 3) {
      this.logger(`Error get Chip ID! (${this.lastError})`);
      return false;
    }

    this.extChipVersion = response[4];
    this.extChipId = response[5] | (response[6] << 8);

    if (this.extChipId === 0x5562) {
      this.extChipName = "TLSR825x";
    } else if (this.extChipId === 0x5325) {
      this.extChipName = "TLSR8266";
    } else if (this.extChipId === 0x5326) {
      this.extChipName = "TLSR8267";
    } else if (this.extChipId === 0x5327) {
      this.extChipName = "TLSR8269";
    } else {
      this.extChipName = "?";
    }

    this.logger(
      `Chip ${this.extChipName} ID: 0x${this.extChipId.toString(16).padStart(4, "0")}, rev: 0x${this.extChipVersion
        .toString(16)
        .padStart(2, "0")}`
    );

    return true;
  }

  /**
   * Read Flash JEDEC ID
   */
  public async readFlashJEDECID(): Promise<boolean> {
    const cmd = new Uint8Array([PGM_CMD_FLASH_GET_JEDEC_ID, 0, 0, 0]);
    const response = await this.sendCommand(cmd, 500);

    if (!response || this.lastWcnt !== 3) {
      this.logger(`Error get Flash JEDEC ID! (${this.lastError})`);
      return false;
    }

    this.extJedecId = (response[4] << 16) | (response[5] << 8) | response[6];
    this.extFlashSize = 1 << response[6];

    this.logger(
      `Flash JEDEC ID: 0x${this.extJedecId.toString(16).padStart(6, "0")}, Size: ${this.extFlashSize >> 10} kbytes`
    );

    return true;
  }

  /**
   * Read Flash Status Register
   */
  public async readFlashStatus(): Promise<number | null> {
    const cmd = new Uint8Array([PGM_CMD_FLASH_GET_STATUS, 0, 0, 0]);
    const response = await this.sendCommand(cmd, 500);

    if (!response || this.lastWcnt !== 1) {
      this.logger(`Error get Flash Status! (${this.lastError})`);
      return null;
    }

    const status = response[4];
    this.logger(`Flash Status Register: 0x${status.toString(16).padStart(2, "0")}`);
    return status;
  }

  /**
   * Wait for flash to be ready
   */
  private async waitFlashReady(maxCount: number = 300): Promise<boolean> {
    for (let i = 0; i < maxCount; i++) {
      const cmd = new Uint8Array([PGM_CMD_FLASH_GET_STATUS, 0, 0, 0]);
      const response = await this.sendCommand(cmd, 100);

      if (!response || this.lastWcnt !== 1) {
        this.logger(`Error get Flash Status! (${this.lastError})`);
        return false;
      }

      if ((response[4] & 0x01) === 0) {
        return true;
      }
    }

    this.logger("Timeout! Flash not ready");
    return false;
  }

  /**
   * Write Flash Status Register
   */
  public async writeFlashStatus(status: number): Promise<boolean> {
    // Write Enable (command 6)
    let cmd = new Uint8Array([PGM_CMD_FLASH_WRRD, 0, 0, 0, 0, 0, 6]);
    let response = await this.sendCommand(cmd, 500);
    if (!response) {
      this.logger(`Error Write Flash Status! (${this.lastError})`);
      return false;
    }

    // Write Status Register (command 1)
    cmd = new Uint8Array([PGM_CMD_FLASH_WRRD, 0, 0, 0, 0, 0, 1, status & 0xff]);
    response = await this.sendCommand(cmd, 500);
    if (!response) {
      this.logger(`Error Write Flash Status! (${this.lastError})`);
      return false;
    }

    if (!(await this.waitFlashReady(5))) {
      return false;
    }

    return true;
  }

  /**
   * Unlock Flash
   */
  public async unlockFlash(): Promise<boolean> {
    this.logger("Write 0 to Flash Status Register...");
    if (!(await this.writeFlashStatus(0))) {
      return false;
    }

    const status = await this.readFlashStatus();
    if (status === null || status !== 0) {
      this.logger("Error unlock Flash!");
      return false;
    }

    return true;
  }

  /**
   * Read SWire data (registers/SRAM)
   */
  public async readSwire(offset: number, size: number): Promise<Uint8Array | null> {
    const maxRetries = 3;
    for (let retry = 0; retry < maxRetries; retry++) {
      if (retry > 0) {
        await this.drainBuffer(30);
        await sleep(50 * retry);
      }

      const cmd = new Uint8Array([
        PGM_CMD_SWIRE_READ,
        offset & 0xff,
        (offset >> 8) & 0xff,
        (offset >> 16) & 0xff,
        size & 0xff,
        (size >> 8) & 0xff,
      ]);

      const response = await this.sendCommand(cmd, Math.max(500, size));

      if (response && this.lastError === PGM_ERR_NONE && this.lastWcnt === size) {
        return response.slice(4, 4 + size);
      }

      if (retry < maxRetries - 1) {
        this.logger(`Read SWire retry at 0x${offset.toString(16).padStart(6, "0")} (${retry + 1}/${maxRetries - 1})`);
      }
    }

    this.logger(
      `Error Read SWire data at 0x${offset.toString(16).padStart(6, "0")}! (err=${this.lastError}, wcnt=${
        this.lastWcnt
      })`
    );
    return null;
  }

  /**
   * Write SWire data (registers/SRAM)
   */
  public async writeSwire(offset: number, data: Uint8Array): Promise<boolean> {
    const maxRetries = 3;
    for (let retry = 0; retry < maxRetries; retry++) {
      if (retry > 0) {
        await this.drainBuffer(30);
        await sleep(50 * retry);
      }

      const cmd = new Uint8Array(4 + data.length);
      cmd[0] = PGM_CMD_SWIRE_WRITE;
      cmd[1] = offset & 0xff;
      cmd[2] = (offset >> 8) & 0xff;
      cmd[3] = (offset >> 16) & 0xff;
      cmd.set(data, 4);

      const response = await this.sendCommand(cmd, 500);

      if (response && this.lastError === PGM_ERR_NONE && this.lastWcnt === data.length) {
        return true;
      }

      if (retry < maxRetries - 1) {
        this.logger(`Write SWire retry at 0x${offset.toString(16).padStart(6, "0")} (${retry + 1}/${maxRetries - 1})`);
      }
    }

    this.logger(
      `Error Write SWire data at 0x${offset.toString(16).padStart(6, "0")}! (err=${this.lastError}, wcnt=${
        this.lastWcnt
      })`
    );
    return false;
  }

  /**
   * Read Flash block
   */
  public async readBlockFlash(offset: number, size: number): Promise<Uint8Array | null> {
    const maxRetries = 3;
    for (let retry = 0; retry < maxRetries; retry++) {
      if (retry > 0) {
        await this.drainBuffer(30);
        await sleep(50 * retry);
      }

      const cmd = new Uint8Array([
        PGM_CMD_FLASH_READ,
        offset & 0xff,
        (offset >> 8) & 0xff,
        (offset >> 16) & 0xff,
        size & 0xff,
        (size >> 8) & 0xff,
      ]);

      const timeout = Math.max(1000, 500 + Math.ceil(size / 256) * 100);
      const response = await this.sendCommand(cmd, timeout);

      if (response && this.lastError === PGM_ERR_NONE && this.lastWcnt === size) {
        return response.slice(4, 4 + size);
      }

      if (retry < maxRetries - 1) {
        this.logger(`Read Flash retry at 0x${offset.toString(16).padStart(6, "0")} (${retry + 1}/${maxRetries - 1})`);
      }
    }

    this.logger(
      `Error Read Flash data at 0x${offset.toString(16).padStart(6, "0")}! (err=${this.lastError}, wcnt=${
        this.lastWcnt
      })`
    );
    return null;
  }

  /**
   * Write Flash block (max 256 bytes per write)
   */
  public async writeBlockFlash(offset: number, data: Uint8Array): Promise<boolean> {
    const maxRetries = 3;
    for (let retry = 0; retry < maxRetries; retry++) {
      if (retry > 0) {
        await this.drainBuffer(30);
        await sleep(50 * retry);
      }

      const cmd = new Uint8Array(4 + data.length);
      cmd[0] = PGM_CMD_FLASH_WRITE;
      cmd[1] = offset & 0xff;
      cmd[2] = (offset >> 8) & 0xff;
      cmd[3] = (offset >> 16) & 0xff;
      cmd.set(data, 4);

      const response = await this.sendCommand(cmd, 600);

      if (!response || this.lastError !== PGM_ERR_NONE || this.lastWcnt !== data.length) {
        if (retry < maxRetries - 1) {
          this.logger(
            `Write Flash retry at 0x${offset.toString(16).padStart(6, "0")} (${retry + 1}/${maxRetries - 1})`
          );
        }
        continue;
      }

      // Wait for flash to be ready
      if (!(await this.waitFlashReady())) {
        if (retry < maxRetries - 1) {
          this.logger(`Flash ready timeout, retrying... (${retry + 1}/${maxRetries - 1})`);
        }
        continue;
      }

      // Verify CRC if PGM version >= 0.0.0.3
      if (this.pgmVersionInt >= 3) {
        const crcCmd = new Uint8Array([
          PGM_CMD_FLASH_RDCRC,
          offset & 0xff,
          (offset >> 8) & 0xff,
          (offset >> 16) & 0xff,
          data.length & 0xff,
          (data.length >> 8) & 0xff,
        ]);
        const crcResponse = await this.sendCommand(crcCmd, 500);

        if (crcResponse) {
          // CRC is returned in WCNT field (bytes 2-3 of response), not in payload
          // Python: rdata[2:4] != crc16(data, len(data))
          const expectedCrc = crc16(data);
          const receivedCrcLow = this.lastWcnt & 0xff;
          const receivedCrcHigh = (this.lastWcnt >> 8) & 0xff;
          if (receivedCrcLow !== expectedCrc[0] || receivedCrcHigh !== expectedCrc[1]) {
            if (retry < maxRetries - 1) {
              this.logger(`Flash CRC16 mismatch, retrying... (${retry + 1}/${maxRetries - 1})`);
            }
            continue;
          }
        }
      }

      return true;
    }

    this.logger(
      `Error Write Flash data at 0x${offset.toString(16).padStart(6, "0")}! (err=${this.lastError}, wcnt=${
        this.lastWcnt
      })`
    );
    return false;
  }

  /**
   * Erase flash sector
   */
  public async eraseSectorFlash(offset: number): Promise<boolean> {
    offset = offset & (0xffffff ^ (FLASH_SECTOR_SIZE - 1));
    const maxRetries = 3;

    for (let retry = 0; retry < maxRetries; retry++) {
      if (retry > 0) {
        await this.drainBuffer(30);
        await sleep(100 * retry);
      }

      const cmd = new Uint8Array([
        PGM_CMD_FLASH_SECT_ERASE,
        offset & 0xff,
        (offset >> 8) & 0xff,
        (offset >> 16) & 0xff,
      ]);

      const response = await this.sendCommand(cmd, 800);

      if (!response || this.lastError !== PGM_ERR_NONE) {
        if (retry < maxRetries - 1) {
          this.logger(
            `Erase sector retry at 0x${offset.toString(16).padStart(6, "0")} (${retry + 1}/${maxRetries - 1})`
          );
        }
        continue;
      }

      if (!(await this.waitFlashReady())) {
        if (retry < maxRetries - 1) {
          this.logger(`Flash ready timeout after erase, retrying... (${retry + 1}/${maxRetries - 1})`);
        }
        continue;
      }

      return true;
    }

    this.logger(`Error Erase sector at 0x${offset.toString(16).padStart(6, "0")}! (err=${this.lastError})`);
    return false;
  }

  /**
   * Erase multiple flash sectors
   */
  public async eraseSectorsFlash(offset: number, count: number): Promise<boolean> {
    for (let i = 0; i < count; i++) {
      const addr = (offset & (0xffffff ^ (FLASH_SECTOR_SIZE - 1))) + i * FLASH_SECTOR_SIZE;
      this.logger(`Erase sector at 0x${addr.toString(16).padStart(6, "0")}...`);

      if (!(await this.eraseSectorFlash(addr))) {
        return false;
      }
    }

    return true;
  }

  /**
   * Erase all flash
   */
  public async eraseAllFlash(): Promise<boolean> {
    this.logger("Erasing all flash...");
    const maxRetries = 3;

    for (let retry = 0; retry < maxRetries; retry++) {
      if (retry > 0) {
        await this.drainBuffer(50);
        await sleep(200 * retry);
        this.logger(`Erase all flash retry (${retry}/${maxRetries - 1})`);
      }

      const cmd = new Uint8Array([PGM_CMD_FLASH_ALL_ERASE, 0, 0, 0]);
      const response = await this.sendCommand(cmd, 3000);

      if (!response || this.lastError !== PGM_ERR_NONE) {
        continue;
      }

      if (!(await this.waitFlashReady(3000))) {
        continue;
      }

      this.logger("Erased successfully");
      return true;
    }

    this.logger(`Error Erase All Flash! (${this.lastError})`);
    return false;
  }

  /**
   * Enable CLK ALGM for analog register access on 825x
   */
  private async enableClkALGM(): Promise<boolean> {
    const data = await this.readSwire(0x61, 4);
    if (!data) {
      this.logger("Error Read SWire data!");
      return false;
    }

    // TLSR825x - bit 3, TLSR826x - bit 1
    const mskBit = this.pgmSwAddrLen === 3 ? 0x08 : 0x02;

    if ((data[0] & mskBit) !== 0 || (data[3] & mskBit) === 0) {
      const newData = new Uint8Array(data);
      newData[0] &= ~mskBit;
      newData[3] |= mskBit;

      if (!(await this.writeSwire(0x61, newData))) {
        this.logger("Error Activate ALGM!");
        return false;
      }
    }

    return true;
  }

  /**
   * Read Analog Registers
   */
  public async readAnalogRegs(offset: number, size: number): Promise<Uint8Array | null> {
    if (!(await this.enableClkALGM())) {
      return null;
    }

    const maxRetries = 3;
    for (let retry = 0; retry < maxRetries; retry++) {
      if (retry > 0) {
        await this.drainBuffer(30);
        await sleep(50 * retry);
      }

      const cmd = new Uint8Array([
        PGM_CMD_SWIRE_AREAD,
        offset & 0xff,
        (offset >> 8) & 0xff,
        (offset >> 16) & 0xff,
        size & 0xff,
        (size >> 8) & 0xff,
      ]);

      const response = await this.sendCommand(cmd, Math.max(500, size * 2));

      if (response && this.lastError === PGM_ERR_NONE && this.lastWcnt === size) {
        return response.slice(4, 4 + size);
      }

      if (retry < maxRetries - 1) {
        this.logger(`Read Analog retry at 0x${offset.toString(16).padStart(2, "0")} (${retry + 1}/${maxRetries - 1})`);
      }
    }

    this.logger(
      `Error Read Analog data at 0x${offset.toString(16).padStart(2, "0")}! (err=${this.lastError}, wcnt=${
        this.lastWcnt
      })`
    );
    return null;
  }

  /**
   * Write Analog Registers
   */
  public async writeAnalogRegs(offset: number, data: Uint8Array): Promise<boolean> {
    if (!(await this.enableClkALGM())) {
      return false;
    }

    const maxRetries = 3;
    for (let retry = 0; retry < maxRetries; retry++) {
      if (retry > 0) {
        await this.drainBuffer(30);
        await sleep(50 * retry);
      }

      const cmd = new Uint8Array(4 + data.length);
      cmd[0] = PGM_CMD_SWIRE_AWRITE;
      cmd[1] = offset & 0xff;
      cmd[2] = (offset >> 8) & 0xff;
      cmd[3] = (offset >> 16) & 0xff;
      cmd.set(data, 4);

      const response = await this.sendCommand(cmd, 500);

      if (response && this.lastError === PGM_ERR_NONE && this.lastWcnt === data.length) {
        return true;
      }

      if (retry < maxRetries - 1) {
        this.logger(`Write Analog retry at 0x${offset.toString(16).padStart(2, "0")} (${retry + 1}/${maxRetries - 1})`);
      }
    }

    this.logger(
      `Error Write Analog data at 0x${offset.toString(16).padStart(2, "0")}! (err=${this.lastError}, wcnt=${
        this.lastWcnt
      })`
    );
    return false;
  }

  /**
   * Stop CPU ([0x0602] = 0x05)
   */
  public async stopCPU(): Promise<boolean> {
    this.logger("CPU Stop...");
    if (!(await this.writeSwire(0x602, new Uint8Array([0x05])))) {
      return false;
    }
    this.logger("ok");
    return true;
  }

  /**
   * Stall CPU ([0x0602] = 0x06)
   */
  public async stallCPU(): Promise<boolean> {
    this.logger("CPU Stall...");
    if (!(await this.writeSwire(0x602, new Uint8Array([0x06])))) {
      return false;
    }
    this.logger("ok");
    return true;
  }

  /**
   * Run CPU ([0x0602] = 0x88)
   */
  public async runCPU(): Promise<boolean> {
    this.logger("CPU Run...");
    if (!(await this.writeSwire(0x602, new Uint8Array([0x88])))) {
      return false;
    }
    this.logger("ok");
    return true;
  }

  /**
   * Go CPU ([0x0602] = 0x08)
   */
  public async goCPU(): Promise<boolean> {
    this.logger("CPU Go...");
    if (!(await this.writeSwire(0x602, new Uint8Array([0x08])))) {
      return false;
    }
    this.logger("ok");
    return true;
  }

  /**
   * MCU Reboot ([0x6f] = 0x20)
   */
  public async mcuReboot(): Promise<boolean> {
    this.logger("MCU Reboot...");
    if (!(await this.writeSwire(0x6f, new Uint8Array([0x20])))) {
      return false;
    }
    this.logger("ok");
    return true;
  }

  /**
   * Read CPU PC register
   */
  public async readCPUPC(): Promise<number | null> {
    const pcData = await this.readSwire(0x6bc, 4);
    if (!pcData) {
      return null;
    }

    const pc = pcData[0] | (pcData[1] << 8) | (pcData[2] << 16) | (pcData[3] << 24);
    this.logger(`CPU PC=0x${pc.toString(16).padStart(8, "0")}`);
    return pc;
  }

  /**
   * Get chip information
   */
  public async getChipInfo(): Promise<PgmChipInfo | null> {
    try {
      // Get PGM board version first
      const pgmInfo = await this.getVersion();
      if (!pgmInfo) {
        return null;
      }

      // Hard reset and activate
      this.logger("Hard reset Ext.MCU 50 ms...");
      if (!(await this.setPinRST(false))) {
        return null;
      }
      await sleep(50);
      this.logger("ok");

      // Activate
      if (!(await this.activate(100))) {
        return null;
      }

      // Stop CPU
      if (!(await this.stopCPU())) {
        return null;
      }

      // Read chip ID
      if (!(await this.readChipID())) {
        return null;
      }

      // Read Flash JEDEC ID
      if (!(await this.readFlashJEDECID())) {
        return null;
      }

      return {
        chipId: this.extChipId,
        chipName: this.extChipName,
        chipVersion: this.extChipVersion,
        jedecId: this.extJedecId,
        flashSize: this.extFlashSize,
      };
    } catch (e: any) {
      this.logger(`Chip info error: ${e?.message || String(e)}`);
      return null;
    }
  }

  /**
   * Flash firmware to device
   */
  public async flash(
    firmware: Uint8Array,
    startAddress: number = 0,
    erase: boolean = true,
    verify: boolean = false
  ): Promise<void> {
    if (!this.connected) {
      throw new Error("PGM board not connected");
    }

    try {
      const wrsize = 256; // Flash write max 256 bytes per operation
      let offset = startAddress & 0xffffff;
      const totalSize = firmware.length;
      let currentOffset = 0;
      let erasec = 0xffffffff;

      // Unlock flash before writing
      if (!(await this.unlockFlash())) {
        throw new Error("Failed to unlock flash");
      }

      // Stop CPU before flashing
      if (!(await this.stopCPU())) {
        throw new Error("Failed to stop CPU");
      }

      this.logger(`Flashing ${totalSize} bytes starting at 0x${offset.toString(16).padStart(6, "0")}...`);

      while (currentOffset < totalSize) {
        // Erase sector if needed
        if (erase) {
          const wrsec = offset & (0xffffff ^ (FLASH_SECTOR_SIZE - 1));
          if (erasec !== wrsec) {
            if (!(await this.eraseSectorFlash(offset))) {
              throw new Error(`Failed to erase sector at 0x${offset.toString(16).padStart(6, "0")}`);
            }
            erasec = wrsec;
          }
        }

        // Write block
        const chunkSize = Math.min(wrsize, totalSize - currentOffset);
        const chunk = firmware.slice(currentOffset, currentOffset + chunkSize);

        // Check if block needs writing
        let needsWrite = false;
        for (let i = 0; i < chunk.length; i++) {
          if (chunk[i] !== 0xff) {
            needsWrite = true;
            break;
          }
        }

        if (needsWrite) {
          if (!(await this.writeBlockFlash(offset, chunk))) {
            throw new Error(`Failed to write block at 0x${offset.toString(16).padStart(6, "0")}`);
          }
        }
        if (verify) {
          const readBack = await this.readBlockFlash(offset, chunkSize);
          if (!readBack || !compareArrays(chunk, readBack)) {
            throw new Error(`Verification failed at 0x${offset.toString(16).padStart(6, "0")}`);
          }
        }

        // Small delay between writes for stability
        await sleep(5);

        currentOffset += chunkSize;
        offset += chunkSize;

        const percent = Math.round((currentOffset / totalSize) * 100);
        this.progressCallback(percent, `Writing ${currentOffset}/${totalSize}`);
      }

      this.logger("Flashing complete!");
      this.progressCallback(100, "Write complete");
      await sleep(500);
      this.progressCallback(0, "");

      // Run CPU after flashing
      await this.runCPU();
    } catch (e: any) {
      this.logger("Flash error: " + (e?.message || String(e)));
      setTimeout(() => {
        this.progressCallback(0, "");
      }, 500);
      throw e;
    }
  }

  /**
   * Read flash memory
   */
  public async readFlash(startAddress: number, length: number): Promise<Uint8Array> {
    if (!this.connected) {
      throw new Error("PGM board not connected");
    }

    try {
      const rdsize = PGM_MAX_BUF_READ_SIZE;
      const result = new Uint8Array(length);
      let offset = startAddress & 0xffffff;
      let currentOffset = 0;

      // Stop CPU before reading
      if (!(await this.stopCPU())) {
        throw new Error("Failed to stop CPU");
      }

      this.logger(`Reading ${length} bytes from address 0x${offset.toString(16).padStart(6, "0")}...`);

      while (currentOffset < length) {
        const chunkSize = Math.min(rdsize, length - currentOffset);
        const chunk = await this.readBlockFlash(offset, chunkSize);

        if (!chunk) {
          throw new Error(`Failed to read block at 0x${offset.toString(16).padStart(6, "0")}`);
        }

        result.set(chunk, currentOffset);
        currentOffset += chunkSize;
        offset += chunkSize;

        const percent = Math.round((currentOffset / length) * 100);
        this.progressCallback(percent, `Reading ${currentOffset}/${length}`);
      }

      this.logger("Read complete!");
      this.progressCallback(100, "Read complete");
      await sleep(500);
      this.progressCallback(0, "");

      return result;
    } catch (e: any) {
      this.logger("Read error: " + (e?.message || String(e)));
      setTimeout(() => {
        this.progressCallback(0, "");
      }, 500);
      throw e;
    }
  }

  /**
   * Dump flash to file
   */
  public async dumpFlash(): Promise<void> {
    const flashSizeStr = flashSizeEl?.value || "";
    const match = flashSizeStr.match(/\((\d+)\s*bytes\)/);
    const flashSize = match ? parseInt(match[1], 10) : 0;

    if (flashSize === 0) {
      this.logger("Error: Unknown flash size");
      return;
    }

    this.logger(`Dumping ${flashSize} bytes of flash...`);

    const flashData = await this.readFlash(0, flashSize);
    this.logger(`Flash read complete: ${flashData.length} bytes`);

    const filename = saveToFile(
      flashData,
      "application/octet-stream",
      "bin",
      "dump",
      chipModelEl?.value,
      undefined,
      String(flashSize / 1024) + "KB"
    );

    this.logger(`Flash saved to ${filename}`);
  }

  public dispose(): void {
    if (this.link.offData) {
      this.link.offData(this.boundDataHandler);
    }
    this.buffer = new Uint8Array(0);
    this.responseQueue = [];
    this.connected = false;
  }

  public pgmReboot(): void {
    if (!this.setLinesHandler) {
      this.logger("Error: PGM reboot not supported for this link");
      return;
    }
    this.setLinesHandler(false, false);
    sleep(100);
    this.setLinesHandler(false, true);
    sleep(100);
    this.setLinesHandler(false, false);
    sleep(100);
    this.logger("PGM board rebooted");
  }
}
