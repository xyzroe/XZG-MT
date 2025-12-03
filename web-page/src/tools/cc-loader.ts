import { sleep } from "../utils/index";
import { parseIntelHex } from "../utils/intelhex";
import { saveToFile } from "../utils/http";

import {
  //log,
  optErase,
  optWrite,
  optVerify,
  verifyMethodSelect,
  writeMethodSelect,
  localFile,
  targetIdEl,
  targetIeeeEl,
  debugFwVersionEl,
  debugModelEl,
  debugManufEl,
} from "../ui";

export type Link = {
  write: (d: Uint8Array) => Promise<void>;
  onData: (cb: (d: Uint8Array) => void) => void;
  offData?: (cb: (d: Uint8Array) => void) => void;
};

// Protocol commands
const SBEGIN = 0x01;
const SDATA = 0x02;
const SRSP = 0x03;
const SEND = 0x04;
const ERRO = 0x05;
const CHIP_ID = 0x11;
const SDUMP = 0x12;
const FBLOCK = 0x13;

enum State {
  IDLE = "idle",
  WAITING_FOR_CHIP_ID = "waiting_for_chip_id",
  WAITING_FOR_RESPONSE = "waiting_for_response",
  FLASHING = "flashing",
  READING = "reading",
  COMPLETED = "completed",
  ERROR = "error",
}

interface ChipInfo {
  manufacturer: string;
  chipId: number;
  chipName: string;
  revision: number;
  ieee?: string;
}

export class CCLoader {
  private link: Link;
  private buffer: Uint8Array = new Uint8Array(0);
  private state: State = State.IDLE;

  // Flash write state
  private firmware: Uint8Array | null = null;
  private blockTotal: number = 0;
  private blockNum: number = 0;
  //private progressCallback: ((current: number, total: number) => void) | null = null;
  private flashResolve: (() => void) | null = null;
  private flashReject: ((error: Error) => void) | null = null;
  private verifyMode: boolean = false;

  // Flash read state
  private dumpData: Uint8Array[] = [];
  private dumpResolve: ((data: Uint8Array) => void) | null = null;
  private dumpReject: ((error: Error) => void) | null = null;

  // Chip ID state
  private chipIdResolve: ((info: ChipInfo) => void) | null = null;
  private chipIdReject: ((error: Error) => void) | null = null;
  private chipIdTimeout: any = null;

  // Activity timeout
  private timeoutTimer: any = null;

  private readonly boundDataHandler = (data: Uint8Array) => this.dataReceived(data);

  constructor(link: Link) {
    this.link = link;
    this.ensureListener();
  }

  private logger: (msg: string) => void = () => {};
  private progressCallback: (percent: number, msg: string) => void = () => {};

  public setLogger(logger: (msg: string) => void) {
    this.logger = logger;
  }

  public setProgressCallback(cb: (percent: number, msg: string) => void) {
    this.progressCallback = cb;
  }

  private ensureListener() {
    if (this.link.offData) {
      // Remove any existing listener to avoid duplicates
      this.link.offData(this.boundDataHandler);
    }
    this.link.onData(this.boundDataHandler);
  }

  private dataReceived(data: Uint8Array): void {
    // Append to buffer
    const newBuffer = new Uint8Array(this.buffer.length + data.length);
    newBuffer.set(this.buffer);
    newBuffer.set(data, this.buffer.length);
    this.buffer = newBuffer;

    // Process buffer based on current state
    this.processBuffer();
  }

  private processBuffer(): void {
    if (this.buffer.length === 0) return;

    // Process byte by byte, looking for command markers
    while (this.buffer.length > 0) {
      const commandByte = this.buffer[0];
      let consumed = false;

      switch (commandByte) {
        case CHIP_ID:
          consumed = this.handleChipId();
          if (!consumed) return; // Wait for more data
          break;

        case SRSP:
          this.handleResponse();
          // SRSP is always consumed (1 byte removed inside)
          break;

        case FBLOCK:
          consumed = this.handleFlashBlock();
          if (!consumed) return; // Wait for more data
          break;

        case ERRO:
          this.handleError();
          break;

        default:
          // Unknown/garbage byte, skip it
          this.buffer = this.buffer.slice(1);
          break;
      }
    }
  }

  private handleChipId(): boolean {
    // If we have full packet (1 + 10 bytes), process immediately
    if (this.buffer.length >= 11) {
      if (this.chipIdTimeout) {
        clearTimeout(this.chipIdTimeout);
        this.chipIdTimeout = null;
      }
      this.processChipId(true);
      return true;
    }

    // If we have minimal packet (1 + 2 bytes)
    if (this.buffer.length >= 3) {
      if (!this.chipIdTimeout) {
        // Wait a bit for the rest of the packet (IEEE address)
        this.chipIdTimeout = setTimeout(() => {
          this.chipIdTimeout = null;
          // Timeout expired, process what we have
          if (this.buffer.length >= 3 && this.buffer[0] === CHIP_ID) {
            this.processChipId(false);
            // Continue processing buffer if there is more data
            this.processBuffer();
          }
        }, 100); // 100ms wait
      }
      return false;
    }
    return false;
  }

  private processChipId(full: boolean): void {
    const chipId = this.buffer[1];
    const revision = this.buffer[2];

    let ieeeBytes: Uint8Array | undefined;

    if (this.buffer.length >= 11) {
      ieeeBytes = this.buffer.slice(3, 11);
      this.buffer = this.buffer.slice(11);
    } else {
      this.buffer = this.buffer.slice(3);
    }

    const chipInfo = this.parseChipId(chipId, revision, ieeeBytes);

    if (this.chipIdResolve) {
      this.chipIdResolve(chipInfo);
      this.chipIdResolve = null;
      this.chipIdReject = null;
    }

    // Only change state to COMPLETED if we were waiting for it
    // If we are flashing or reading, this might be a spurious ID packet (e.g. after reset)
    if (this.state === State.WAITING_FOR_CHIP_ID) {
      this.state = State.COMPLETED;
    }
  }

  private parseChipId(chipId: number, revision: number, ieeeBytes?: Uint8Array): ChipInfo {
    const chipModels: { [key: number]: string } = {
      0xa5: "CC2530",
      0xb5: "CC2531",
      0x95: "CC2533",
      0x8d: "CC2540",
      0x41: "CC2541",
      0x91: "CC2543",
      0x43: "CC2543",
      0x44: "CC2544",
      0x45: "CC2545",
    };

    const chipName = chipModels[chipId] || "Unknown";
    let ieee: string | undefined;

    if (ieeeBytes && ieeeBytes.length === 8) {
      // Format as MAC address (reverse order)
      const parts: string[] = [];
      for (let i = 7; i >= 0; i--) {
        parts.push(ieeeBytes[i].toString(16).padStart(2, "0").toUpperCase());
      }
      ieee = parts.join(":");
    }

    return {
      manufacturer: "Texas Instruments",
      chipId,
      chipName,
      revision,
      ieee,
    };
  }

  private handleResponse(): void {
    // SRSP received - ready for next block or end
    this.buffer = this.buffer.slice(1);
    this.resetTimeout(); // Reset timeout on activity

    if (this.state === State.FLASHING) {
      if (this.blockNum >= this.blockTotal) {
        // All blocks sent, send END command
        this.sendEndCommand();
        this.state = State.COMPLETED;

        if (this.timeoutTimer) clearTimeout(this.timeoutTimer);

        if (this.flashResolve) {
          this.flashResolve();
          this.flashResolve = null;
          this.flashReject = null;
        }
      } else {
        // Send next block
        this.sendNextBlock();
      }
    }
  }

  private handleFlashBlock(): boolean {
    // Reading flash block: 1 byte command + 512 bytes data + 2 bytes checksum
    if (this.buffer.length < 515) return false;

    const blockData = this.buffer.slice(1, 513);
    const checksumReceived = (this.buffer[513] << 8) | this.buffer[514];
    this.buffer = this.buffer.slice(515);
    this.resetTimeout(); // Reset timeout on activity

    // If we are already done, just ignore this extra block to prevent crashes
    if (this.state === State.COMPLETED || this.blockNum >= this.blockTotal) {
      console.warn("Received extra flash block after completion, ignoring.");
      return true;
    }

    // Verify checksum
    let checksumCalculated = 0;
    for (let i = 0; i < blockData.length; i++) {
      checksumCalculated += blockData[i];
    }
    checksumCalculated &= 0xffff;

    if (checksumCalculated !== checksumReceived) {
      console.warn(
        `Block ${this.blockNum + 1}: checksum mismatch (calc: ${checksumCalculated.toString(
          16
        )}, recv: ${checksumReceived.toString(16)})`
      );
    }

    this.dumpData.push(blockData);
    this.blockNum++;

    if (this.progressCallback) {
      //this.progressCallback(this.blockNum, this.blockTotal);
      this.progressCallback(
        Math.round((this.blockNum / this.blockTotal) * 100),
        `Reading ${this.blockNum} / ${this.blockTotal}`
      );
    }

    if (this.blockNum >= this.blockTotal) {
      // Reading complete
      const fullDump = new Uint8Array(this.blockTotal * 512);
      for (let i = 0; i < this.dumpData.length; i++) {
        fullDump.set(this.dumpData[i], i * 512);
      }

      if (this.timeoutTimer) clearTimeout(this.timeoutTimer);

      if (this.dumpResolve) {
        console.warn("Resolving dump promise");
        this.dumpResolve(fullDump);
        this.dumpResolve = null;
        this.dumpReject = null;
      }

      this.state = State.COMPLETED;
    }
    return true;
  }

  private handleError(error?: Error): void {
    if (this.timeoutTimer) clearTimeout(this.timeoutTimer);
    this.timeoutTimer = null;

    if (this.buffer.length > 0) {
      this.buffer = this.buffer.slice(1);
    }

    const errorMsg = error
      ? error.message
      : this.state === State.FLASHING
      ? "Verify failed or flash error"
      : "No chip detected or communication error";

    if (this.flashReject) {
      this.flashReject(new Error(errorMsg));
      this.flashResolve = null;
      this.flashReject = null;
    } else if (this.dumpReject) {
      this.dumpReject(new Error(errorMsg));
      this.dumpResolve = null;
      this.dumpReject = null;
    } else if (this.chipIdReject) {
      this.chipIdReject(new Error(errorMsg));
      this.chipIdResolve = null;
      this.chipIdReject = null;
    }

    this.state = State.ERROR;
  }

  private resetTimeout(ms: number = 30000) {
    if (this.timeoutTimer) clearTimeout(this.timeoutTimer);
    this.timeoutTimer = setTimeout(() => {
      this.handleError(new Error("Timeout waiting for device response"));
    }, ms);
  }

  private async sendEndCommand(): Promise<void> {
    const cmd = new Uint8Array([SEND]);
    await this.link.write(cmd);
  }

  private async sendNextBlock(): Promise<void> {
    if (!this.firmware) return;

    const offset = this.blockNum * 512;
    const blockData = this.firmware.slice(offset, offset + 512);

    // Pad with 0xFF if needed
    const paddedBlock = new Uint8Array(512);
    paddedBlock.fill(0xff);
    paddedBlock.set(blockData);

    // Calculate checksum
    let checksum = 0;
    for (let i = 0; i < 512; i++) {
      checksum += paddedBlock[i];
    }

    // Build packet: SDATA + 512 bytes + 2 bytes checksum (big-endian)
    const packet = new Uint8Array(515);
    packet[0] = SDATA;
    packet.set(paddedBlock, 1);
    packet[513] = (checksum >> 8) & 0xff;
    packet[514] = checksum & 0xff;

    await this.link.write(packet);
    this.blockNum++;

    if (this.progressCallback) {
      //this.progressCallback(this.blockNum, this.blockTotal);
      this.progressCallback(
        Math.round((this.blockNum / this.blockTotal) * 100),
        `Writing ${this.blockNum} / ${this.blockTotal}`
      );
    }
  }

  /**
   * Get chip information
   */
  public async getChipInfo(): Promise<void> {
    this.ensureListener();
    this.state = State.WAITING_FOR_CHIP_ID;

    const chipInfo = await new Promise<ChipInfo>(async (resolve, reject) => {
      this.chipIdResolve = resolve;
      this.chipIdReject = reject;

      // Clear buffer from Arduino initialization garbage
      this.buffer = new Uint8Array(0);

      // Send CHIP_ID command (5 bytes like in C code: cmd_buf[5] = {CHIP_ID, 0, 0, 0, 0})
      const cmd = new Uint8Array([CHIP_ID, 0, 0, 0, 0]);
      await this.link.write(cmd);

      // Timeout after 10 seconds
      setTimeout(() => {
        if (this.chipIdReject) {
          this.chipIdReject(new Error("Timeout waiting for chip ID response"));
          this.chipIdResolve = null;
          this.chipIdReject = null;
        }
      }, 10000);
    });

    if (chipInfo) {
      this.updateChipInfoUI(chipInfo);
    }
  }

  /**
   * Flash firmware to the chip
   * @param firmware - Binary firmware data
   * @param verify - Enable verification (slower but safer)
   * @param onProgress - Progress callback (current block, total blocks)
   */
  public async flash(
    firmware: Uint8Array,
    verify: boolean = false
    //onProgress?: (current: number, total: number) => void
  ): Promise<void> {
    this.ensureListener();
    this.state = State.FLASHING;

    this.firmware = firmware;
    this.blockTotal = Math.ceil(firmware.length / 512);
    this.blockNum = 0;
    this.verifyMode = verify;
    //this.progressCallback = onProgress || null;

    return new Promise(async (resolve, reject) => {
      this.flashResolve = resolve;
      this.flashReject = reject;

      // Reset Arduino to ensure clean state (match main.c behavior)
      await this.resetCCLoader(0);

      // Clear buffer from Arduino initialization garbage
      this.buffer = new Uint8Array(0);

      // Send SBEGIN command with verify flag
      const cmd = new Uint8Array([SBEGIN, verify ? 1 : 0, 0, 0, 0]);
      await this.link.write(cmd);
      this.resetTimeout(); // Start silence timeout
    });
  }

  /**
   * Read flash from the chip
   * @param startBlock - Starting block number (0 = beginning)
   * @param numBlocks - Number of 512-byte blocks to read
   * @param onProgress - Progress callback (current block, total blocks)
   */
  public async readFlash(
    startBlock: number = 0,
    numBlocks: number = 512
    // onProgress?: (current: number, total: number) => void
  ): Promise<Uint8Array> {
    this.ensureListener();
    this.state = State.READING;

    this.dumpData = [];
    this.blockTotal = numBlocks;
    this.blockNum = 0;
    //this.progressCallback = onProgress || null;

    return new Promise(async (resolve, reject) => {
      this.dumpResolve = resolve;
      this.dumpReject = reject;

      // Reset Arduino to ensure clean state (match main.c behavior)
      await this.resetCCLoader(0);

      // Clear buffer from Arduino initialization garbage
      this.buffer = new Uint8Array(0);

      // Small delay to ensure line is quiet
      await sleep(100);

      // Send SDUMP command: cmd + total_blocks(2) + start_block(2)
      const cmd = new Uint8Array([
        SDUMP,
        (numBlocks >> 8) & 0xff,
        numBlocks & 0xff,
        (startBlock >> 8) & 0xff,
        startBlock & 0xff,
      ]);
      await this.link.write(cmd);
      this.resetTimeout(); // Start silence timeout
    });
  }

  public async flashAction(): Promise<void> {
    try {
      // Get firmware file
      const file = localFile?.files?.[0];
      if (!file) {
        throw new Error("Please select a firmware file (.bin or .hex)");
      }

      if (optWrite.checked === false) {
        this.logger("Write option not selected, skipping flash.");
        return;
      }

      this.logger(`Reading firmware file: ${file.name}`);

      let firmware: Uint8Array;

      if (file.name.toLowerCase().endsWith(".hex")) {
        const text = await file.text();
        const { startAddress, data } = parseIntelHex(text, 0xff);

        // Create full image starting at 0 if needed
        // If startAddress > 0, we need to pad
        const totalSize = startAddress + data.length;
        firmware = new Uint8Array(totalSize);
        firmware.fill(0xff); // Fill with 0xFF (erased state)
        firmware.set(data, startAddress);

        this.logger(
          `Parsed HEX: ${data.length} bytes at 0x${startAddress.toString(16)}, total image size: ${firmware.length}`
        );
      } else {
        const arrayBuffer = await file.arrayBuffer();
        firmware = new Uint8Array(arrayBuffer);
      }

      this.logger(`Firmware size: ${firmware.length} bytes (${Math.ceil(firmware.length / 512)} blocks)`);

      // Flash firmware
      //fwProgressReset("Flashing...");
      await this.flash(firmware, optVerify.checked);

      this.logger("Flashing complete!");
      //fwProgress(100, "Done");
    } catch (e: any) {
      this.logger("CC Loader flash error: " + (e?.message || String(e)));
      throw e;
    }
  }

  public async dumpFlash(): Promise<void> {
    // Read flash using CC Loader
    try {
      this.logger("Reading flash memory...");
      this.progressCallback(0, "Reading flash...");

      // Read 512 blocks (256KB - full flash of CC2530)
      const flashData = await this.readFlash(0, 512);

      this.logger(`Flash read complete: ${flashData.length} bytes`);
      this.progressCallback(100, "Done");

      const filename = saveToFile(
        flashData,
        "application/octet-stream",
        "bin",
        "dump",
        targetIdEl?.value,
        targetIeeeEl?.value
      );

      this.logger(`Flash dump saved to ${filename}`);
    } catch (e: any) {
      this.logger("Flash read error: " + (e?.message || String(e)));
      throw e;
    }
  }

  public dispose(): void {
    if (this.link.offData) {
      this.link.offData(this.boundDataHandler);
    }
    if (this.chipIdTimeout) {
      clearTimeout(this.chipIdTimeout);
      this.chipIdTimeout = null;
    }
    this.buffer = new Uint8Array(0);
    this.state = State.IDLE;
    this.flashResolve = null;
    this.flashReject = null;
    this.dumpResolve = null;
    this.dumpReject = null;
    this.chipIdResolve = null;
    this.chipIdReject = null;
  }

  /**
   * Reset Arduino/CC Loader using DTR/RTS lines
   * Device type 0: Default (UNO) - DTR off, RTS off
   * Device type 1: Leonardo - DTR on, RTS off
   */
  public async resetCCLoader(deviceType: number = 0): Promise<void> {
    this.logger(`CC Loader reset: device type ${deviceType}`);

    // Import setLines from flasher
    const { setLines } = await import("../flasher");

    if (deviceType === 0) {
      // Default (UNO): DTR off, RTS off
      this.logger("Setting DTR=off, RTS=off for UNO-like device");
      await setLines(false, false);
    } else {
      // Leonardo: DTR on, RTS off
      this.logger("Setting DTR=on, RTS=off for Leonardo-like device");
      await setLines(true, false);
    }

    await sleep(1000);
  }

  public updateChipInfoUI(chipInfo: ChipInfo): void {
    if (targetIdEl) targetIdEl.value = chipInfo.chipName;
    if (targetIeeeEl && chipInfo.ieee) targetIeeeEl.value = chipInfo.ieee;
    if (debugModelEl) debugModelEl.value = "CC Loader";
    if (debugManufEl) debugManufEl.value = "Arduino";

    this.logger(
      `CC Loader connected: ${chipInfo.chipName} (ID: 0x${chipInfo.chipId.toString(
        16
      )}, Rev: 0x${chipInfo.revision.toString(16)})`
    );
    if (chipInfo.ieee) {
      this.logger(`IEEE Address: ${chipInfo.ieee}`);
    }
  }
}
