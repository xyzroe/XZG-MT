import { Link } from "../types/index";
import { sleep, toHex, bufToHex } from "../utils/index";
import { saveToFile } from "../utils/http";
import { generateHex } from "../utils/intelhex";
import { flashSizeEl, chipModelEl, ieeeMacEl } from "../ui";

// STK500 Protocol Commands
const STK_GET_SYNC = 0x30;
const STK_GET_PARAMETER = 0x41;
const STK_ENTER_PROGMODE = 0x50;
const STK_LEAVE_PROGMODE = 0x51;
const STK_LOAD_ADDRESS = 0x55;
const STK_PROG_PAGE = 0x64;
const STK_READ_PAGE = 0x74;
const STK_READ_SIGN = 0x75;
const STK_UNIVERSAL = 0x56;

const STK_OK = 0x10;
const STK_INSYNC = 0x14;

const CRC_EOP = 0x20;

// Parameters
const STK_PARM_SW_MAJOR = 0x81;
const STK_PARM_SW_MINOR = 0x82;

// Board signatures for ATmega328P (Uno, Nano, Pro Mini)
const SIGNATURE_ATMEGA328P = [0x1e, 0x95, 0x0f];
const SIGNATURE_ATMEGA2560 = [0x1e, 0x98, 0x01];
const SIGNATURE_ATMEGA32U4 = [0x1e, 0x95, 0x87];

// Chip definitions with flash sizes
const CHIP_DEFINITIONS: {
  [key: string]: { name: string; flashSize: number };
} = {
  "1e950f": { name: "ATmega328P", flashSize: 32768 }, // 32KB
  "1e9801": { name: "ATmega2560", flashSize: 262144 }, // 256KB
  "1e9587": { name: "ATmega32U4", flashSize: 32768 }, // 32KB
  "1e9514": { name: "ATmega328", flashSize: 32768 }, // 32KB
  "1e9406": { name: "ATmega168", flashSize: 16384 }, // 16KB
  "1e9307": { name: "ATmega88", flashSize: 8192 }, // 8KB
};

interface BoardInfo {
  signature: number[];
  chipName: string;
  manufacturer: string;
  flashSize?: number;
  serialNumber?: string;
  swMajor?: number;
  swMinor?: number;
}

export class ArduinoTools {
  private link: Link;
  private buffer: Uint8Array = new Uint8Array(0);
  private responseQueue: Array<{ resolve: (data: Uint8Array | null) => void; expectedSize: number }> = [];

  private logger: (msg: string) => void = () => {};
  private progressCallback: (percent: number, msg: string) => void = () => {};
  private setLinesHandler: ((dtrLevel: boolean, rtsLevel: boolean) => void) | null = null;

  private readonly boundDataHandler = (data: Uint8Array) => this.dataReceived(data);

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
   * Reset Arduino by toggling DTR line
   */
  public async resetArduino(): Promise<void> {
    if (!this.setLinesHandler) {
      throw new Error("setLinesHandler not set");
    }
    this.logger("Resetting Arduino...");
    // Toggle DTR to reset Arduino (DTR low = reset)
    this.setLinesHandler(false, true); // DTR=false (low), RTS=true (high)
    await sleep(250);
    this.setLinesHandler(true, true); // DTR=true (high), RTS=true (high)
    await sleep(50); // Wait for bootloader to start
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

    // Try to process responses
    this.processBuffer();
  }

  private processBuffer(): void {
    // Look for STK_INSYNC ... [data] ... STK_OK pattern
    while (this.responseQueue.length > 0 && this.buffer.length > 0) {
      const item = this.responseQueue[0];

      // Check for STK_INSYNC
      const insyncIdx = this.buffer.indexOf(STK_INSYNC);
      if (insyncIdx === -1) {
        // No insync found, might need more data
        if (this.buffer.length > 200) {
          // Too much garbage, clear buffer and reject
          this.buffer = new Uint8Array(0);
          this.responseQueue.shift();
          item.resolve(null);
        }
        return;
      }

      // Skip garbage before insync
      if (insyncIdx > 0) {
        this.buffer = this.buffer.slice(insyncIdx);
      }

      // Calculate expected total length: STK_INSYNC + data + STK_OK
      const expectedTotalLen = 1 + item.expectedSize + 1;

      // Wait for all expected data
      if (this.buffer.length < expectedTotalLen) {
        // Need more data
        return;
      }

      // Check that STK_OK is at the expected position
      const okIdx = 1 + item.expectedSize;
      if (this.buffer[okIdx] !== STK_OK) {
        // Protocol error - STK_OK not where expected
        this.buffer = new Uint8Array(0);
        this.responseQueue.shift();
        item.resolve(null);
        return;
      }

      // Extract response data (between insync and ok)
      const responseData = this.buffer.slice(1, okIdx);
      this.buffer = this.buffer.slice(okIdx + 1);

      // Resolve the promise
      this.responseQueue.shift();
      item.resolve(responseData);
    }
  }

  private async sendCommand(
    cmd: number,
    params: number[] = [],
    timeoutMs = 400,
    expectedSize = 0
  ): Promise<Uint8Array | null> {
    const packet = new Uint8Array([cmd, ...params, CRC_EOP]);
    await this.link.write(packet);

    return new Promise<Uint8Array | null>((resolve) => {
      const item = { resolve, expectedSize };
      this.responseQueue.push(item);

      setTimeout(() => {
        // Timeout - remove from queue and reject
        const idx = this.responseQueue.indexOf(item);
        if (idx !== -1) {
          this.responseQueue.splice(idx, 1);
          resolve(null);
        }
      }, timeoutMs);
    });
  }

  /**
   * Synchronize with the bootloader
   */
  public async sync(retries = 3): Promise<boolean> {
    for (let i = 0; i < retries; i++) {
      // Clear buffer and queue before each attempt
      this.buffer = new Uint8Array(0);
      this.responseQueue = [];

      const response = await this.sendCommand(STK_GET_SYNC, [], 400, 0);
      if (response !== null && response.length === 0) {
        this.logger("Sync successful");
        return true;
      }
      if (i < retries - 1) {
        await sleep(100);
      }
    }
    this.logger("Sync failed after " + retries + " attempts");
    return false;
  }

  /**
   * Get bootloader parameter
   */
  private async getParameter(param: number): Promise<number | null> {
    const response = await this.sendCommand(STK_GET_PARAMETER, [param], 400, 1);
    if (response !== null && response.length === 1) {
      return response[0];
    }
    return null;
  }

  /**
   * Read device signature
   */
  public async readSignature(): Promise<number[] | null> {
    const response = await this.sendCommand(STK_READ_SIGN, [], 400, 3);
    if (response !== null && response.length === 3) {
      return Array.from(response);
    }
    return null;
  }

  /**
   * Send universal SPI command (for reading fuses, lock bits, etc.)
   * This allows direct access to AVR programming commands
   */
  private async universalCommand(a: number, b: number, c: number, d: number): Promise<number | null> {
    const response = await this.sendCommand(STK_UNIVERSAL, [a, b, c, d], 400, 1);
    if (response !== null && response.length === 1) {
      return response[0];
    }
    return null;
  }

  /**
   * Read fuse bytes (low, high, extended)
   * These contain configuration data but can be used to generate a unique identifier
   */
  private async readFuseBits(): Promise<{ low: number; high: number; extended: number } | null> {
    try {
      // Read low fuse: 0x50, 0x00, 0x00, 0x00
      const lowFuse = await this.universalCommand(0x50, 0x00, 0x00, 0x00);
      // Read high fuse: 0x58, 0x08, 0x00, 0x00
      const highFuse = await this.universalCommand(0x58, 0x08, 0x00, 0x00);
      // Read extended fuse: 0x50, 0x08, 0x00, 0x00
      const extFuse = await this.universalCommand(0x50, 0x08, 0x00, 0x00);

      if (lowFuse !== null && highFuse !== null && extFuse !== null) {
        return { low: lowFuse, high: highFuse, extended: extFuse };
      }
    } catch (e) {
      // Fuse reading might not be supported by all bootloaders
      this.logger("Note: Could not read fuse bits (not supported by this bootloader)");
    }
    return null;
  }

  /**
   * Generate a pseudo-serial number from signature and fuse bits
   * Arduino doesn't have a true unique serial number, but we can create an identifier
   */
  private async getDeviceIdentifier(signature: number[]): Promise<string> {
    const fuseBits = await this.readFuseBits();

    if (fuseBits) {
      // Combine signature and fuse bits to create a unique-ish identifier
      const id = [signature[0], signature[1], signature[2], fuseBits.low, fuseBits.high, fuseBits.extended]
        .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
        .join("");
      return id;
    }

    // Fallback: just use signature
    return signature.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join("");
  }

  /**
   * Get board information
   */
  public async getBoardInfo(): Promise<BoardInfo | null> {
    try {
      // Sync first
      if (!(await this.sync())) {
        throw new Error("Failed to sync with bootloader");
      }

      // Read signature
      const signature = await this.readSignature();
      if (!signature) {
        throw new Error("Failed to read device signature");
      }

      // Get software version
      const swMajor = await this.getParameter(STK_PARM_SW_MAJOR);
      const swMinor = await this.getParameter(STK_PARM_SW_MINOR);

      // Create signature key for lookup
      const sigKey = signature.map((b) => b.toString(16).padStart(2, "0")).join("");

      // Identify chip and flash size from signature
      const chipDef = CHIP_DEFINITIONS[sigKey];
      let chipName = chipDef?.name || "Unknown AVR";
      let flashSize = chipDef?.flashSize;
      const manufacturer = "Atmel/Microchip";

      // Get device identifier (pseudo-serial number)
      const serialNumber = await this.getDeviceIdentifier(signature);

      const boardInfo: BoardInfo = {
        signature,
        chipName,
        manufacturer,
        flashSize,
        serialNumber,
        swMajor: swMajor ?? undefined,
        swMinor: swMinor ?? undefined,
      };

      this.logger(
        `Board detected: ${chipName} (Signature: ${signature
          .map((b) => "0x" + b.toString(16).padStart(2, "0"))
          .join(" ")})`
      );
      if (flashSize) {
        this.logger(`Flash size: ${flashSize} bytes (${(flashSize / 1024).toFixed(0)}KB)`);
      }
      if (serialNumber) {
        this.logger(`Device ID: ${serialNumber}`);
      }
      if (swMajor !== null && swMinor !== null) {
        this.logger(`Bootloader version: ${swMajor}.${swMinor}`);
      }

      return boardInfo;
    } catch (e: any) {
      this.logger("Board info error: " + (e?.message || String(e)));
      return null;
    }
  }

  /**
   * Enter programming mode
   */
  public async enterProgrammingMode(): Promise<boolean> {
    const response = await this.sendCommand(STK_ENTER_PROGMODE, [], 400, 0);
    if (response !== null && response.length === 0) {
      this.logger("Entered programming mode");
      return true;
    }
    this.logger("Failed to enter programming mode");
    return false;
  }

  /**
   * Leave programming mode
   */
  public async leaveProgrammingMode(): Promise<boolean> {
    const response = await this.sendCommand(STK_LEAVE_PROGMODE, [], 400, 0);
    if (response !== null && response.length === 0) {
      this.logger("Left programming mode");
      return true;
    }
    this.logger("Failed to leave programming mode");
    return false;
  }

  /**
   * Load address (word address for flash)
   */
  private async loadAddress(address: number): Promise<boolean> {
    // Address is in words (16-bit) for flash
    const wordAddr = address >> 1;
    const addrLow = wordAddr & 0xff;
    const addrHigh = (wordAddr >> 8) & 0xff;

    const response = await this.sendCommand(STK_LOAD_ADDRESS, [addrLow, addrHigh], 400, 0);
    if (response !== null && response.length === 0) {
      return true;
    }
    this.logger(`Failed to load address 0x${address.toString(16)}`);
    return false;
  }

  /**
   * Program a page
   */
  private async programPage(address: number, data: Uint8Array): Promise<boolean> {
    if (!(await this.loadAddress(address))) {
      return false;
    }

    const sizeHigh = (data.length >> 8) & 0xff;
    const sizeLow = data.length & 0xff;
    const memType = 0x46; // 'F' for Flash

    const params = [sizeHigh, sizeLow, memType, ...Array.from(data)];
    const response = await this.sendCommand(STK_PROG_PAGE, params, 2000, 0);

    if (response !== null && response.length === 0) {
      return true;
    }
    this.logger(`Failed to program page at address 0x${address.toString(16)}`);
    return false;
  }

  /**
   * Read a page
   */
  private async readPage(address: number, size: number): Promise<Uint8Array | null> {
    if (!(await this.loadAddress(address))) {
      return null;
    }

    const sizeHigh = (size >> 8) & 0xff;
    const sizeLow = size & 0xff;
    const memType = 0x46; // 'F' for Flash

    const response = await this.sendCommand(STK_READ_PAGE, [sizeHigh, sizeLow, memType], 2000, size);

    if (response !== null && response.length === size) {
      return response;
    }
    this.logger(`Failed to read page at address 0x${address.toString(16)}`);
    return null;
  }

  /**
   * Flash firmware to the device
   */
  public async flash(firmware: Uint8Array, pageSize = 128, verify = false): Promise<void> {
    try {
      // Reset Arduino to enter bootloader
      if (this.setLinesHandler) {
        await this.resetArduino();
      }

      if (!(await this.sync())) {
        throw new Error("Failed to sync with bootloader");
      }

      // Enter programming mode
      if (!(await this.enterProgrammingMode())) {
        throw new Error("Failed to enter programming mode");
      }

      const totalPages = Math.ceil(firmware.length / pageSize);
      let currentPage = 0;

      // Flash pages
      this.logger(`Flashing ${firmware.length} bytes (${totalPages} pages of ${pageSize} bytes)...`);
      for (let address = 0; address < firmware.length; address += pageSize) {
        const pageData = firmware.slice(address, address + pageSize);

        // Pad with 0xFF if needed
        const paddedPage = new Uint8Array(pageSize);
        paddedPage.fill(0xff);
        paddedPage.set(pageData);

        if (!(await this.programPage(address, paddedPage))) {
          throw new Error(`Failed to program page at 0x${address.toString(16)}`);
        }

        currentPage++;
        const percent = Math.round((currentPage / totalPages) * 100);
        this.progressCallback(percent, `Writing ${currentPage}/${totalPages}`);
      }
      this.progressCallback(100, "Writing complete");
      await sleep(500);
      this.progressCallback(0, "");
      // Verify if requested
      if (verify) {
        this.logger(`Verifying ${firmware.length} bytes...`);
        currentPage = 0;
        for (let address = 0; address < firmware.length; address += pageSize) {
          const expectedData = firmware.slice(address, address + pageSize);

          // Pad with 0xFF if needed
          const paddedExpected = new Uint8Array(pageSize);
          paddedExpected.fill(0xff);
          paddedExpected.set(expectedData);

          const readData = await this.readPage(address, pageSize);
          if (!readData) {
            throw new Error(`Failed to read page at 0x${address.toString(16)}`);
          }

          // Compare
          for (let i = 0; i < pageSize; i++) {
            if (readData[i] !== paddedExpected[i]) {
              throw new Error(
                `Verify failed at address 0x${(address + i).toString(16)}: expected 0x${paddedExpected[i]
                  .toString(16)
                  .padStart(2, "0")}, got 0x${readData[i].toString(16).padStart(2, "0")}`
              );
            }
          }

          currentPage++;
          const percent = Math.round((currentPage / totalPages) * 100);
          this.progressCallback(percent, `Verifying ${currentPage}/${totalPages}`);
        }
        this.logger("Verification successful");
        this.progressCallback(100, "Verify complete");
        await sleep(500);
      }

      // Leave programming mode
      await this.leaveProgrammingMode();

      this.logger("Flashing complete!");
      //   this.progressCallback(100, "Done");
      //   await sleep(500);
      this.progressCallback(0, "");
    } catch (e: any) {
      this.logger("Flash error: " + (e?.message || String(e)));
      throw e;
    }
  }

  /**
   * Read flash memory
   */
  public async readFlash(startAddress: number, length: number, pageSize = 128): Promise<Uint8Array> {
    try {
      // Reset Arduino to enter bootloader
      if (this.setLinesHandler) {
        await this.resetArduino();
      }

      if (!(await this.sync())) {
        throw new Error("Failed to sync with bootloader");
      }

      // Enter programming mode
      if (!(await this.enterProgrammingMode())) {
        throw new Error("Failed to enter programming mode");
      }

      const result = new Uint8Array(length);
      const totalPages = Math.ceil(length / pageSize);
      let currentPage = 0;

      this.logger(`Reading ${length} bytes from address 0x${startAddress.toString(16)}...`);

      for (let offset = 0; offset < length; offset += pageSize) {
        const address = startAddress + offset;
        const readSize = Math.min(pageSize, length - offset);

        const pageData = await this.readPage(address, readSize);
        if (!pageData) {
          throw new Error(`Failed to read page at 0x${address.toString(16)}`);
        }

        result.set(pageData.slice(0, readSize), offset);

        currentPage++;
        const percent = Math.round((currentPage / totalPages) * 100);
        this.progressCallback(percent, `Reading ${currentPage}/${totalPages}`);
      }

      // Leave programming mode
      await this.leaveProgrammingMode();

      this.logger("Read complete!");
      this.progressCallback(100, "Read complete");
      await sleep(500);
      this.progressCallback(0, "");

      return result;
    } catch (e: any) {
      this.logger("Read error: " + (e?.message || String(e)));
      throw e;
    }
  }

  public async dumpFlash(): Promise<void> {
    const pageSize = 128; // Standard page size for most Arduino boards

    this.logger("Reading flash memory...");

    //get number from UI if available from (32KB (32768 bytes)) we need 32768
    const flashSizeStr = flashSizeEl?.value || "";
    const match = flashSizeStr.match(/\((\d+)\s*bytes\)/);
    const flashSize = match ? parseInt(match[1], 10) : 0;

    const flashData = await this.readFlash(0, flashSize, pageSize);

    // Convert to Intel HEX format
    const hexContent = generateHex(flashData, 0);

    this.logger(`Flash read complete: ${flashData.length} bytes`);
    this.progressCallback(100, "Done");

    const filename = saveToFile(hexContent, "text/plain", "hex", "dump", chipModelEl?.value, ieeeMacEl?.value);

    this.logger(`Flash saved to ${filename}`);

    // Reset to normal mode after read
    await this.resetArduino();
  }

  public dispose(): void {
    if (this.link.offData) {
      this.link.offData(this.boundDataHandler);
    }
    this.buffer = new Uint8Array(0);
    this.responseQueue = [];
  }
}
