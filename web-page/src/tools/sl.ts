import { Link } from "../types/index";
import { sleep } from "../utils/index";
import { padToMultiple } from "../utils/crc";
import { crc16 } from "../utils/crc";
import { XmodemCRCPacket, XModemPacketType, XMODEM_BLOCK_SIZE } from "../utils/xmodem";
import { changeBaud } from "../flasher";
import { SpinelClient } from "./spinel";

// Re-export SpinelClient for backwards compatibility
export { SpinelClient } from "./spinel";

enum State {
  WAITING_FOR_MENU = "waiting_for_menu",
  IN_MENU = "in_menu",
  WAITING_XMODEM_READY = "waiting_xmodem_ready",
  XMODEM_UPLOADING = "xmodem_uploading",
  WAITING_UPLOAD_DONE = "waiting_upload_done",
  UPLOAD_DONE = "upload_done",
}

export class SilabsTools {
  private link: Link;
  private buffer: Uint8Array = new Uint8Array(0);
  private state: State = State.WAITING_FOR_MENU;
  private version: string | null = null;
  private uploadStatus: string | null = null;
  private ezspClient: EzspAshClient | null = null;
  private spinelClient: SpinelClient | null = null;

  // XMODEM state
  private xmodemFirmware: Uint8Array | null = null;
  private xmodemChunkIndex: number = 0;
  private xmodemTotalChunks: number = 0;
  private xmodemRetries: number = 0;
  private xmodemMaxRetries: number = 3;
  private xmodemProgressCallback: ((current: number, total: number) => void) | null = null;
  private xmodemResolve: (() => void) | null = null;
  private xmodemReject: ((error: Error) => void) | null = null;
  private xmodemTimeout: ReturnType<typeof setTimeout> | null = null;

  // Menu regex to parse Gecko Bootloader menu
  // More tolerant menu regex: allow optional spaces, CR/LF combos, GBL/EBL wording, and optional space before prompt
  private menuRegex =
    /(?:^|[\r\n])(?:Gecko|\w+\s*Serial)\s+Bootloader v([0-9.]+)[\r\n]+1\. upload (?:gbl|ebl)[\r\n]+2\. run[\r\n]+3\. (?:ebl|gbl) info[\r\n]+(?:\d+\. .*?[\r\n]+)*BL ?>/i;

  // Simple version-only regex (fallback if full menu doesn't match)
  private versionOnlyRegex = /(?:Gecko|\w+\s*Serial)\s+Bootloader\s+v([0-9.]+)/i;

  // eslint-disable-next-line no-control-regex
  private uploadCompleteRegex = /\r\nSerial upload (complete|aborted)\r\n(.*?)\x00?/s;
  private promptRegex = /(?:^|[\r\n])BL ?> ?/i;

  private readonly boundDataHandler = (data: Uint8Array) => this.dataReceived(data);

  private logger: (msg: string) => void = () => {};
  private progressCallback: (percent: number, msg: string) => void = () => {};
  private setLinesHandler: (rstLevel: boolean, bslLevel: boolean) => void = () => {};

  public setLogger(logger: (msg: string) => void) {
    this.logger = logger;
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

  constructor(link: Link) {
    this.link = link;

    // Set up data reception handler
    // this.link.onData((data: Uint8Array) => {
    //   this.dataReceived(data);
    // });
    this.ensureListener();
  }

  private ensureListener() {
    if (this.link.offData) {
      this.link.offData(this.boundDataHandler);
    }
    this.link.onData(this.boundDataHandler);
  }

  private dataReceived(data: Uint8Array): void {
    //console.log(`[dataReceived] received ${data.length} bytes, current state=${this.state}, ezspClient=${!!this.ezspClient}`);

    if (this.ezspClient) {
      this.ezspClient.handleData(data);
      return;
    }
    // Append to buffer
    const newBuffer = new Uint8Array(this.buffer.length + data.length);
    newBuffer.set(this.buffer);
    newBuffer.set(data, this.buffer.length);
    this.buffer = newBuffer;

    // Handle XMODEM state separately
    if (this.state === State.XMODEM_UPLOADING) {
      this.handleXmodemResponse();
      return;
    }

    // Parse line-based protocol
    while (this.buffer.length > 0) {
      const currentState = this.state;

      if (currentState === State.WAITING_FOR_MENU) {
        const text = new TextDecoder().decode(this.buffer);

        // Try full menu regex first
        const match = text.match(this.menuRegex);
        if (match) {
          this.version = match[1];
          console.log(`Detected Gecko Bootloader v${this.version} (full menu)`);
          this.buffer = new Uint8Array(0);
          this.state = State.IN_MENU;
          continue;
        }

        // Try version-only regex (works even without full menu)
        const versionMatch = text.match(this.versionOnlyRegex);
        if (versionMatch) {
          this.version = versionMatch[1];
          console.log(`Detected Gecko Bootloader v${this.version} (version-only)`);

          // Wait for prompt before marking as IN_MENU
          if (this.promptRegex.test(text)) {
            console.log(`Prompt detected, entering IN_MENU state`);
            this.buffer = new Uint8Array(0);
            this.state = State.IN_MENU;
            continue;
          } else {
            console.log(`Version found, waiting for prompt... (breaking to wait for more data)`);
            // Exit loop, wait for more data (prompt) to arrive
            break;
          }
        }

        // No version yet, need more data
        break;
      } else if (currentState === State.WAITING_XMODEM_READY) {
        // Wait for 'C' character indicating XMODEM-CRC mode (may appear repeatedly)
        // Check presence anywhere in buffer to be resilient to framing
        const hasC = this.buffer.includes?.(0x43) || new TextDecoder().decode(this.buffer).includes("C");
        if (!hasC) {
          break;
        }

        // console.log("XMODEM ready, starting transfer");
        this.buffer = new Uint8Array(0);
        this.state = State.XMODEM_UPLOADING;
        this.xmodemSendChunkOrEOT();
      } else if (currentState === State.WAITING_UPLOAD_DONE) {
        const text = new TextDecoder().decode(this.buffer);
        const match = text.match(this.uploadCompleteRegex);

        if (!match) {
          break;
        }

        this.uploadStatus = match[1];
        // console.log(`Upload status: ${this.uploadStatus}`);

        this.buffer = new Uint8Array(0);
        this.state = State.UPLOAD_DONE;

        // Try to detect menu immediately after upload
        this.state = State.WAITING_FOR_MENU;
      } else if (currentState === State.IN_MENU) {
        // In menu state, ignore spurious data
        this.buffer = new Uint8Array(0);
      }
    }
  }

  private async write(data: Uint8Array): Promise<void> {
    await this.link.write(data);
  }

  private async writeString(text: string): Promise<void> {
    const encoder = new TextEncoder();
    await this.write(encoder.encode(text));
  }

  public async getChipInfo() {
    // Query bootloader version first
    const blVersion = await this.getBootloaderVersion();

    return {
      manufacturer: "Silabs",
      chipName: "EFR32MG21", // Generic, could be parsed from app
      revision: "Unknown",
      bootloaderVersion: blVersion,
    };
  }

  // public async enterBootloader() {
  //   console.log("Bootloader entry for Silabs should be done via DTR/RTS reset sequence");
  //   // This is typically done via hardware reset before connecting
  //   // The actual implementation is in flasher.ts with setLines()
  // }

  public async getBootloaderVersion(timeoutMs: number = 2000, forceQuery: boolean = false): Promise<string> {
    this.ensureListener();

    // Reset state BEFORE creating promise (synchronously) if needed
    const needsQuery = forceQuery || !(this.state === State.IN_MENU && this.version);

    if (needsQuery) {
      this.state = State.WAITING_FOR_MENU;
      this.version = null;
    }

    return new Promise((resolve, reject) => {
      (async () => {
        try {
          if (needsQuery) {
            // Request bootloader info (option 3)
            await this.writeString("\n3\n");
          }

          // Wait for dataReceived() to process the response
          const timeout = setTimeout(() => {
            reject(new Error("Timeout waiting for bootloader version"));
          }, timeoutMs);

          // Simple polling: just wait for dataReceived() to set version
          const checkInterval = setInterval(() => {
            if (this.state === State.IN_MENU && this.version) {
              clearInterval(checkInterval);
              clearTimeout(timeout);
              this.logger(`SL Bootloader: v${this.version}`);
              resolve(this.version);
            }
          }, 50);
        } catch (error) {
          reject(error);
        }
      })();
    });
  }

  private xmodemSendChunkOrEOT(): void {
    if (this.xmodemChunkIndex >= this.xmodemTotalChunks) {
      // Send EOT (End of Transmission)
      // console.log("Sending EOT");
      this.write(new Uint8Array([XModemPacketType.EOT]));
    } else {
      // Send next chunk
      //console.log(`Sending chunk ${this.xmodemChunkIndex + 1}/${this.xmodemTotalChunks}`);

      const start = this.xmodemChunkIndex * XMODEM_BLOCK_SIZE;
      const end = start + XMODEM_BLOCK_SIZE;
      const payload = this.xmodemFirmware!.slice(start, end);

      const packet = new XmodemCRCPacket((this.xmodemChunkIndex + 1) & 0xff, payload);

      this.write(packet.serialize());
    }

    // Set timeout for response (2 seconds)
    this.xmodemTimeout = setTimeout(() => {
      // console.warn("XMODEM timeout, retrying");
      this.xmodemRetryChunk();
    }, 2000);
  }

  private xmodemRetryChunk(): void {
    if (this.xmodemRetries >= this.xmodemMaxRetries) {
      this.xmodemAbort(new Error(`XMODEM transfer failed after ${this.xmodemMaxRetries} retries`));
      return;
    }

    this.xmodemRetries++;
    // console.log(`Retry attempt ${this.xmodemRetries} for chunk ${this.xmodemChunkIndex}`);
    this.xmodemSendChunkOrEOT();
  }

  private xmodemAbort(error: Error): void {
    if (this.xmodemTimeout) {
      clearTimeout(this.xmodemTimeout);
      this.xmodemTimeout = null;
    }

    if (this.xmodemReject) {
      this.xmodemReject(error);
      this.xmodemReject = null;
      this.xmodemResolve = null;
    }
  }

  private handleXmodemResponse(): void {
    if (this.buffer.length === 0) {
      return;
    }

    // Clear timeout since we got a response
    if (this.xmodemTimeout) {
      clearTimeout(this.xmodemTimeout);
      this.xmodemTimeout = null;
    }

    const response = this.buffer[0];
    this.buffer = this.buffer.slice(1);

    if (response === XModemPacketType.ACK) {
      if (this.xmodemChunkIndex >= this.xmodemTotalChunks) {
        // EOT was ACKed, transfer complete
        // console.log("XMODEM transfer complete");
        this.state = State.WAITING_UPLOAD_DONE;

        // Progress callback: 100%
        if (this.xmodemProgressCallback && this.xmodemFirmware) {
          this.xmodemProgressCallback(this.xmodemFirmware.length, this.xmodemFirmware.length);
        }

        // Resolve promise after upload status is received
        setTimeout(() => {
          if (this.xmodemResolve) {
            this.xmodemResolve();
            this.xmodemResolve = null;
            this.xmodemReject = null;
          }
        }, 1000);

        return;
      }

      // Chunk was ACKed, move to next
      const offset = (this.xmodemChunkIndex + 1) * XMODEM_BLOCK_SIZE;
      if (this.xmodemProgressCallback && this.xmodemFirmware) {
        this.xmodemProgressCallback(offset, this.xmodemFirmware.length);
      }

      // console.log(
      //   `Chunk ${this.xmodemChunkIndex + 1} ACKed, progress: ${((offset / this.xmodemFirmware!.length) * 100).toFixed(
      //     1
      //   )}%`
      // );

      this.xmodemChunkIndex++;
      this.xmodemRetries = 0;
      this.xmodemSendChunkOrEOT();
    } else if (response === XModemPacketType.NAK) {
      // console.warn("Got NAK, retrying chunk");
      this.xmodemRetryChunk();
    } else if (response === XModemPacketType.CAN) {
      this.xmodemAbort(new Error("Transfer cancelled by receiver"));
    } else {
      // console.warn(`Invalid XMODEM response: 0x${response.toString(16)}`);
      this.xmodemRetryChunk();
    }
  }

  public async flash(firmware: Uint8Array): Promise<void> {
    return new Promise((resolve, reject) => {
      (async () => {
        try {
          // Clear EZSP client to ensure bootloader data is processed correctly
          this.ezspClient = null;

          // Pad firmware to XMODEM block size
          const paddedFirmware = padToMultiple(firmware, XMODEM_BLOCK_SIZE, 0xff);
          // console.log(`Flashing ${paddedFirmware.length} bytes (original: ${firmware.length})`);

          // First, query bootloader info (force fresh query to reset state machine)
          await this.getBootloaderVersion(2000, true);

          // Give time for any buffered menu responses to be processed
          await sleep(200);

          // Initialize XMODEM state
          this.xmodemFirmware = paddedFirmware;
          this.xmodemChunkIndex = 0;
          this.xmodemTotalChunks = paddedFirmware.length / XMODEM_BLOCK_SIZE;
          this.xmodemRetries = 0;
          this.xmodemMaxRetries = 3;

          const onProgress = (current: number, total: number) => {
            const pct = Math.round((current / total) * 100);
            this.progressCallback(pct, `${current} / ${total}`);
          };

          this.xmodemProgressCallback = onProgress;

          // Set up promise callbacks
          this.xmodemResolve = resolve;
          this.xmodemReject = reject;

          // Initial progress
          onProgress(0, paddedFirmware.length);

          //console.log(`Starting XMODEM upload: ${this.xmodemTotalChunks} chunks`);
          // Select upload option (option 1)
          this.state = State.WAITING_XMODEM_READY;
          await this.writeString("1");

          // Wait for XMODEM ready 'C' character
          await sleep(500);

          // Note: xmodemSendChunkOrEOT will be called when state changes to XMODEM_UPLOADING
          // This happens in dataReceived when we detect the 'C' character
        } catch (error) {
          reject(error);
        }
      })();
    });
  }

  public async getApplicationVersion(
    doReset: boolean = false,
    implyGate: boolean = false
  ): Promise<{ version: string; deviceModel?: string }> {
    // Re-register handler to ensure we are listening
    this.ensureListener();

    // Reset the device to trigger automatic CPC frame
    if (doReset) {
      await this.reset(implyGate);
      await sleep(1000); // Wait for device to boot and send CPC frame
    }

    if (!this.ezspClient) {
      this.ezspClient = new EzspAshClient(this.link, this.logger);
    }

    // Initialize EZSP and get version
    const { version, mfgString, boardName } = await this.ezspClient.readVersion();

    // Log all information
    this.logger(`Application version: ${version}`);
    // if (mfgString) {
    this.logger(`MFG_STRING: ${mfgString}`);
    // }
    // if (boardName) {
    this.logger(`MFG_BOARD_NAME: ${boardName}`);
    // }

    if (mfgString && boardName) {
      return { version, deviceModel: `${mfgString} ${boardName}` };
    }

    return { version };
  }

  /**
   * Read the secondary IEEE address (EUI64) from SiLabs chip
   * @returns 8-byte IEEE address as Uint8Array
   */
  public async readSecondaryIeeeAddress(): Promise<Uint8Array> {
    this.ensureListener();

    if (!this.ezspClient) {
      this.ezspClient = new EzspAshClient(this.link, this.logger);
    }

    try {
      const ieeeAddress = await this.ezspClient.readSecondaryIeeeAddress();
      // this.logger(
      //   `Read IEEE address: ${Array.from(ieeeAddress)
      //     .map((b) => b.toString(16).padStart(2, "0"))
      //     .join(":")}`
      // );
      return ieeeAddress;
    } catch (error) {
      this.logger(`Failed to read IEEE address: ${error}`);
      throw error;
    }
  }

  /**
   * Write the secondary IEEE address (EUI64) to SiLabs chip
   * @param ieeeAddress - 8-byte IEEE address as Uint8Array
   */
  public async writeSecondaryIeeeAddress(ieeeAddress: Uint8Array, force: boolean): Promise<void> {
    if (ieeeAddress.length !== 8) {
      throw new Error("IEEE address must be 8 bytes");
    }

    this.ensureListener();

    if (!this.ezspClient) {
      this.ezspClient = new EzspAshClient(this.link, this.logger);
    }

    if (force) {
      this.logger("Warning! Force writing IEEE address!");
      await sleep(1000);
    }

    try {
      await this.ezspClient.writeSecondaryIeeeAddress(ieeeAddress, force);
    } catch (error) {
      throw error;
    }
  }

  public async getSpinelVersion(doReset: boolean = false, implyGate: boolean = false): Promise<string> {
    this.spinelClient = new SpinelClient(this.link);
    const spinelHandler = (data: Uint8Array) => this.spinelClient?.handleData(data);
    this.link.offData?.(this.boundDataHandler);
    this.link.onData(spinelHandler);

    // Reset the device
    if (doReset) {
      await this.reset(implyGate);
      await sleep(1000); // Router needs more time to boot
    }

    try {
      const info = await this.spinelClient.getOpenThreadInfo();
      if (!info || !info.version) {
        throw new Error("Failed to get Spinel info");
      }
      this.logger(`Spinel version: ${info.version} `);
      return info.version;
    } finally {
      this.link.offData?.(spinelHandler);
      this.link.onData(this.boundDataHandler);
      this.spinelClient?.dispose();
      this.spinelClient = null;
    }
  }

  public async getCpcVersion(doReset: boolean = false, implyGate: boolean = false): Promise<string> {
    const cpcClient = new CpcSpinelClient(this.link);
    const cpcHandler = (data: Uint8Array) => {
      cpcClient.handleData(data);
    };

    // Switch handler BEFORE reset so we can capture the automatic CPC frame
    this.link.offData?.(this.boundDataHandler);
    this.link.onData(cpcHandler);

    try {
      // Reset the device to trigger automatic CPC frame
      if (doReset) {
        await this.reset(implyGate);
        await sleep(1000); // Wait for device to boot and send CPC frame
      }

      await cpcClient.init();

      // Try multiple times with increasing delays
      for (let attempt = 0; attempt < 10; attempt++) {
        try {
          const version = await cpcClient.getVersion();
          this.logger(`CPC version: ${version}`);
          return version;
        } catch {
          // Wait a bit more for data
          await sleep(100);
        }
      }

      throw new Error("No CPC data received");
    } finally {
      this.link.offData?.(cpcHandler);
      this.link.onData(this.boundDataHandler);
      cpcClient.dispose();
    }
  }

  /**
   * Get version from Router CLI firmware
   * Router firmware uses a text CLI interface with "version" command
   * Response format: "stack ver. [X.X.X]"
   */
  public async getRouterVersion(doReset: boolean = false, implyGate: boolean = false): Promise<string> {
    const routerClient = new RouterClient(this.link);
    const routerHandler = (data: Uint8Array) => {
      routerClient.handleData(data);
    };

    // Switch handler
    this.link.offData?.(this.boundDataHandler);
    this.link.onData(routerHandler);

    try {
      // Reset the device
      if (doReset) {
        await this.reset(implyGate);
        await sleep(1000); // Router needs more time to boot
      }

      // Try to activate CLI prompt
      const hasPrompt = await routerClient.activatePrompt(3000);
      if (!hasPrompt) {
        throw new Error("No Router CLI prompt detected");
      }

      routerClient.clearBuffer();

      // Get version
      const version = await routerClient.getVersion(2000);
      this.logger(`Router version: ${version}`);
      return `${version}`;
    } finally {
      this.link.offData?.(routerHandler);
      this.link.onData(this.boundDataHandler);
      routerClient.dispose();
    }
  }

  /**
   * Try to detect RCP firmware type and get version
   * Tries: OT-RCP (Spinel) -> MultiPAN (CPC)
   */
  public async getRcpVersion(): Promise<string> {
    // Try pure Spinel first (OT-RCP)
    try {
      const version = await this.getSpinelVersion();
      return `OT-RCP: ${version}`;
    } catch (e) {
      console.log("Spinel failed, trying CPC:", e);
    }

    // Try CPC (MultiPAN RCP)
    try {
      const version = await this.getCpcVersion();
      return version;
    } catch (e) {
      console.log("CPC failed:", e);
    }

    throw new Error("Failed to detect RCP firmware version");
  }

  /**
   * Firmware type for Silicon Labs devices
   */
  public static readonly FirmwareType = {
    AUTO: "auto",
    EZSP: "ezsp", // NCP - Zigbee coordinator/router with EZSP protocol
    CPC: "cpc", // MultiPAN RCP - Co-Processor Communication protocol
    SPINEL: "spinel", // OT-RCP - OpenThread RCP with Spinel protocol
    ROUTER: "router", // Zigbee Router with CLI interface
  } as const;

  /**
   * Universal firmware detection and version probe
   *
   * @param firmwareType - Type of firmware to probe: "auto", "ezsp", "cpc", "spinel", "router"
   * @param baudrate - Baudrate to use: number or "auto" to try common baudrates
   * @param doReset - Whether to perform reset before probing
   * @param implyGate - Whether to use transistor gate scheme for reset
   * @param baudrateCandidates - List of baudrates to try in auto mode
   * @returns Object with detected firmware type, version, and working baudrate
   */
  public async probe(
    firmwareType: "auto" | "ezsp" | "cpc" | "spinel" | "router" = "auto",
    baudrate: number | "auto" = "auto",
    doReset: boolean = true,
    implyGate: boolean = true,
    baudrateCandidates: number[] = [115200, 460800, 230400]
  ): Promise<{ firmwareType: string; version: string; baudrate: number; deviceModel?: string }> {
    const tryBaudrates = baudrate === "auto" ? baudrateCandidates : [baudrate];

    // Define probe order based on firmware type
    const probeOrder: Array<"ezsp" | "cpc" | "spinel" | "router"> =
      firmwareType === "auto" ? ["ezsp", "cpc", "spinel", "router"] : [firmwareType];

    const errors: string[] = [];

    for (const br of tryBaudrates) {
      this.logger(`Probing at ${br} baud...`);

      // Change baudrate if link supports it
      await changeBaud(br);
      // if ((this.link as any).setBaudrate) {
      //   try {
      //     await (this.link as any).setBaudrate(br);
      //     await sleep(100);
      //   } catch (e: any) {
      //     this.logger(`Failed to set baudrate ${br}: ${e?.message || String(e)}`);
      //     continue;
      //   }
      // }

      for (const fwType of probeOrder) {
        try {
          let version: string;

          switch (fwType) {
            case "ezsp":
              this.logger(`Trying EZSP (NCP)...`);
              let result = await this.getApplicationVersion(doReset, implyGate);
              return {
                firmwareType: "ezsp",
                version: result.version + " (ZB Coordinator)",
                baudrate: br,
                deviceModel: result.deviceModel,
              };

            case "cpc":
              this.logger(`Trying CPC (MultiPAN RCP)...`);
              version = await this.getCpcVersion(doReset, implyGate);
              return { firmwareType: "cpc", version: version + " (MultiPAN)", baudrate: br };

            case "spinel":
              this.logger(`Trying Spinel (OT-RCP)...`);
              version = await this.getSpinelVersion(doReset, implyGate);
              return { firmwareType: "spinel", version: version + " (OpenThread)", baudrate: br };

            case "router":
              this.logger(`Trying Router CLI...`);
              version = await this.getRouterVersion(doReset, implyGate);
              return { firmwareType: "router", version: version + " (ZB Router)", baudrate: br };
          }
        } catch (e: any) {
          const errMsg = `${fwType}@${br}: ${e?.message || String(e)}`;
          errors.push(errMsg);
          this.logger(`${fwType} probe failed: ${e?.message || String(e)}`);
        }
      }
    }

    throw new Error(`Failed to detect firmware.`);
  }

  public async enterBootloader(implyGate: boolean): Promise<void> {
    this.logger("Silabs entry bootloader, implyGate=" + implyGate);

    // Assume standard scheme:
    // RTS controls RESET (Active Low - 0 resets)
    // DTR controls BOOT/GPIO (Active Low - 0 activates bootloader)

    // 1. Initial state: All released (High)
    // (RTS=1, DTR=1) -> (false, false) in setLines logic, if false=High/Inactive
    // In setLines: rstLevel=true -> RTS=1 (High), rstLevel=false -> RTS=0 (Low)
    // Usually: true = active level (Low for reset), false = inactive (High)
    // But let's check your setLines logic.
    // In flasher.ts: log(`CTRL(tcp): setting RTS=${rst ? "1" : "0"} ...`)
    // Usually USB-UART adapters invert signals, but drivers operate with logical levels.

    // Let's try the classic sequence for "bare" UART (without auto-reset scheme like ESP):

    if (!implyGate) {
      // Step 0: Make sure everything is at high level (VCC), chip is running
      // RTS=0 (High/3.3V), DTR=0 (High/3.3V)
      await this.setLines(false, false);
      await sleep(100);

      // Step 1: Press RESET (RTS -> Low/GND)
      // Don't touch DTR yet (or keep High)
      // RTS=1 (Low/GND), DTR=0 (High/3.3V)
      await this.setLines(true, false);
      await sleep(100);

      // Step 2: Press BOOT (DTR -> Low/GND), while RESET is still pressed
      // RTS=1 (Low/GND), DTR=1 (Low/GND)
      await this.setLines(true, true);
      await sleep(100);

      // Step 3: Release RESET (RTS -> High/3.3V), but keep BOOT pressed!
      // Chip wakes up, sees pressed BOOT and enters bootloader.
      // RTS=0 (High/3.3V), DTR=1 (Low/GND)
      await this.setLines(false, true);
      await sleep(200); // Give time for bootloader to initialize

      // Step 4: Release BOOT (DTR -> High/3.3V)
      // RTS=0 (High/3.3V), DTR=0 (High/3.3V)
      await this.setLines(false, false);
      await sleep(100);
    }

    // Logic for scheme with two transistors:

    // Truth table for such scheme:
    // DTR=0, RTS=0 -> Idle (VCC, VCC)
    // DTR=0, RTS=1 -> Reset (VCC, GND) -> CHIP IN RESET
    // DTR=1, RTS=0 -> Boot  (GND, VCC) -> CHIP IN BOOT MODE
    // DTR=1, RTS=1 -> Idle  (VCC, VCC) -> Protection from simultaneous pressing
    if (implyGate) {
      // 1. Initial state (Idle)
      await this.setLines(false, false);
      await sleep(100);

      // 2. Press RESET (RTS=True, DTR=False)
      // Chip stops
      await this.setLines(true, false);
      await sleep(100);

      // 3. Switch to BOOT mode (RTS=False, DTR=True)
      // At this moment Reset is released (becomes High), and Boot is pressed to ground (Low).
      // Chip starts, sees low level on Boot pin and enters bootloader.
      await this.setLines(false, true);
      await sleep(250); // Give time for bootloader to initialize

      // 4. Release everything (Idle)
      // Boot pin returns to VCC
      await this.setLines(false, false);
      await sleep(100);
    }
  }

  public async reset(implyGate: boolean): Promise<void> {
    this.logger("Silabs reset, implyGate=" + implyGate);
    await sleep(1000);
    if (!implyGate) {
      // Just pull Reset
      await this.setLines(false, false); // Release Reset
      await sleep(500);
      await this.setLines(true, false); // Press Reset
      await sleep(200);
      await this.setLines(false, false); // Release Reset
      await sleep(500);
    }

    if (implyGate) {
      // Simple reset for transistor scheme
      // 1. Idle
      await this.setLines(false, false);
      await sleep(50);

      // 2. Reset (RTS=True, DTR=False)
      await this.setLines(true, false);
      await sleep(200);

      // 3. Back to Idle
      await this.setLines(false, false);
      await sleep(300);
    }
  }
}

const ASH_FLAG = 0x7e;
const ASH_ESCAPE = 0x7d;
const ASH_XON = 0x11;
const ASH_XOFF = 0x13;
const ASH_CANCEL = 0x1a;
const ASH_SUBSTITUTE = 0x18;

const PSEUDO_RANDOM_SEQUENCE = (() => {
  const seq = new Uint8Array(256);
  let rand = 0x42;
  for (let i = 0; i < 256; i++) {
    seq[i] = rand;
    if ((rand & 0x01) === 0) {
      rand = rand >> 1;
    } else {
      rand = ((rand >> 1) ^ 0xb8) & 0xff;
    }
  }
  return seq;
})();

type AshFrame =
  | { kind: "data"; frmNum: number; reTx: boolean; ackNum: number; payload: Uint8Array }
  | { kind: "ack"; ackNum: number }
  | { kind: "nak"; ackNum: number }
  | { kind: "rstack"; resetCode: number }
  | { kind: "rst" }
  | { kind: "error"; resetCode: number };

class EzspAshClient {
  private link: Link;
  private buffer: number[] = [];
  private discardingUntilFlag = false;
  private rxSeq = 0;
  private txSeq = 0;
  private awaitingAckFrame: number | null = null;
  private pendingAckResolve: (() => void) | null = null;
  private pendingAckReject: ((err: Error) => void) | null = null;
  private ezspSeq = 0;
  private pendingResponse: {
    seq: number;
    resolve: (payload: Uint8Array) => void;
    reject: (err: Error) => void;
    timer: number;
  } | null = null;
  private readyPromise: Promise<void> | null = null;
  private readyResolve: (() => void) | null = null;
  private readyReject: ((err: Error) => void) | null = null;
  private initialized = false;
  private disposed = false;
  private logger: (msg: string) => void;

  constructor(link: Link, logger: (msg: string) => void) {
    this.link = link;
    this.logger = logger;
  }

  public dispose() {
    this.disposed = true;
    this.buffer = [];
    if (this.pendingResponse) {
      window.clearTimeout(this.pendingResponse.timer);
      this.pendingResponse.reject(new Error("EZSP client disposed"));
      this.pendingResponse = null;
    }
    if (this.pendingAckReject) {
      this.pendingAckReject(new Error("EZSP client disposed"));
    }
    if (this.readyReject) {
      this.readyReject(new Error("EZSP client disposed"));
    }
    this.readyResolve = null;
    this.readyReject = null;
    this.readyPromise = null;
  }

  public handleData(chunk: Uint8Array): void {
    if (this.disposed) return;
    for (const byte of chunk) {
      this.buffer.push(byte);
    }
    this.processBuffer();
  }

  public async reset(): Promise<void> {
    const cancelPrefix = new Uint8Array(32).fill(ASH_CANCEL);
    const rstControl = 0xc0;
    const rstBody = new Uint8Array([rstControl]);
    const crc = crc16(rstBody, 0xffff);
    const rstFrame = new Uint8Array([ASH_FLAG, rstControl, crc & 0xff, (crc >> 8) & 0xff, ASH_FLAG]);

    const fullReset = new Uint8Array(cancelPrefix.length + rstFrame.length);
    fullReset.set(cancelPrefix, 0);
    fullReset.set(rstFrame, cancelPrefix.length);

    await this.link.write(fullReset);

    this.rxSeq = 0;
    this.txSeq = 0;
    this.ezspSeq = 0;

    await sleep(500);
  }

  public async initialize(): Promise<{ version: number; stackType: number; stackVersion: number }> {
    // Only reset if not already initialized
    if (!this.initialized) {
      await this.reset();
    }

    const frameId = 0x00;
    const response1 = await this.sendEzspCommand(frameId, new Uint8Array([4]), 4000);

    if (response1.length < 4) {
      throw new Error("Invalid EZSP version response");
    }

    const actualVersion = response1[0];
    const stackType = response1[1];
    const stackVersion = response1[2] | (response1[3] << 8);

    if (actualVersion !== 4) {
      const response2 = await this.sendEzspCommand(frameId, new Uint8Array([actualVersion]), 4000);
      if (response2.length < 4 || response2[0] !== actualVersion) {
        throw new Error("EZSP version negotiation failed");
      }
    }

    this.initialized = true;
    return { version: actualVersion, stackType, stackVersion };
  }

  private async readMfgToken(tokenId: number): Promise<string | undefined> {
    try {
      const getMfgTokenFrameId = 0x000b;
      const payload = new Uint8Array([tokenId]);
      const response = await this.sendEzspCommand(getMfgTokenFrameId, payload, 4000);

      // Response format: [length, ...token_data]
      // First byte is the length, actual data starts from byte 1
      if (response.length > 1) {
        const tokenLength = response[0];
        const tokenData = response.slice(1, 1 + tokenLength);

        // Check if all bytes are 0xFF (empty/unprogrammed token)
        const isEmpty = tokenData.every((byte) => byte === 0xff);
        if (isEmpty) {
          return undefined;
        }

        // Find null terminator or use full token length
        let endIdx = tokenData.indexOf(0);
        if (endIdx === -1) endIdx = tokenData.length;

        const stringData = tokenData.slice(0, endIdx);

        // Check if token data contains only printable ASCII characters
        const isPrintable = stringData.every((byte) => byte >= 0x20 && byte <= 0x7e);
        if (!isPrintable) {
          return undefined;
        }

        return new TextDecoder().decode(stringData);
      }
    } catch (error) {
      console.warn(`Failed to get MFG token 0x${tokenId.toString(16)}:`, error);
    }
    return undefined;
  }

  public async readVersion(): Promise<{ version: string; mfgString?: string; boardName?: string }> {
    await this.ensureReady();

    // Initialize EZSP protocol first
    const { version: protocolVersion, stackType, stackVersion } = await this.initialize();

    // Parse stack version into readable format
    const digits = [
      (stackVersion >> 12) & 0xf,
      (stackVersion >> 8) & 0xf,
      (stackVersion >> 4) & 0xf,
      stackVersion & 0xf,
    ];
    console.log(`EZSP Stack Version Digits: ${digits.join(".")}`);
    const versionParts = digits.map((digit) => digit.toString(10));
    const versionText = versionParts.join(".");

    // Try to get build number from additional version info
    let buildNumber: number | null = null;
    try {
      // getValue with VALUE_VERSION_INFO (0x11)
      const getValueFrameId = 0x00aa;
      const valueId = 0x11; // VALUE_VERSION_INFO
      const getValuePayload = new Uint8Array([valueId]);
      const getValueResponse = await this.sendEzspCommand(getValueFrameId, getValuePayload, 4000);

      // Response: [status, length, ...value_bytes]
      if (getValueResponse.length >= 2 && getValueResponse[0] === 0x00) {
        const valueLength = getValueResponse[1];
        if (valueLength >= 7 && getValueResponse.length >= 2 + valueLength) {
          // VALUE_VERSION_INFO format: [build, major, minor, patch, special, type, ...]
          buildNumber = getValueResponse[2] | (getValueResponse[3] << 8);
          console.log(`EZSP: Got build number from VALUE_VERSION_INFO: ${buildNumber}`);
        }
      }
    } catch (error) {
      console.warn("Failed to get VALUE_VERSION_INFO:", error);
    }

    // Read MFG tokens
    const mfgString = await this.readMfgToken(0x01);
    const boardName = await this.readMfgToken(0x02);

    console.log(`EZSP: MFG_STRING = ${mfgString ? `"${mfgString}"` : "(empty)"}`);
    console.log(`EZSP: MFG_BOARD_NAME = ${boardName ? `"${boardName}"` : "(empty)"}`);

    const machineVersion = buildNumber !== null ? `${versionText}.${buildNumber}` : versionText;
    const summary = buildNumber !== null ? `${versionText} build ${buildNumber}` : versionText;
    const details = [`EZSP v${protocolVersion}`, `stack type ${stackType}`, machineVersion];
    const version = `${summary} (${details.join(", ")})`;

    return { version, mfgString, boardName };
  }

  /**
   * Read the EUI64 (IEEE address) from the SiLabs chip
   * Uses getEui64 command (0x0026) after proper EZSP initialization
   * @returns 8-byte IEEE address as Uint8Array
   */
  public async readSecondaryIeeeAddress(): Promise<Uint8Array> {
    await this.ensureReady();
    await this.initialize();

    const response = await this.sendEzspCommand(0x0026, new Uint8Array([]), 4000);

    if (response.length >= 8) {
      return response.slice(0, 8);
    }

    throw new Error(`Failed to read EUI64: invalid response length ${response.length}`);
  }

  /**
   * Write the EUI64 (IEEE address) to the SiLabs chip
   * Follows bellows implementation strategy:
   * 1. Try NV3 tokens (rewritable)
   * 2. Fallback to MFG_CUSTOM_EUI_64 (one-time write) if explicitly allowed
   * @param ieeeAddress - 8-byte IEEE address as Uint8Array
   * @param burnIntoUserdata - Allow ONE-TIME write to MFG_CUSTOM_EUI_64 (permanent!)
   */
  public async writeSecondaryIeeeAddress(ieeeAddress: Uint8Array, burnIntoUserdata: boolean = false): Promise<void> {
    if (ieeeAddress.length !== 8) {
      throw new Error("IEEE address must be 8 bytes");
    }

    await this.ensureReady();
    await this.initialize();

    // Check if current EUI64 is already the target
    const currentEui64 = await this.readSecondaryIeeeAddress();
    if (this.arraysEqual(currentEui64, ieeeAddress)) {
      this.logger("EUI64 already matches target, skipping write");
      return;
    }

    // Try to find writable NV3 token (CREATOR or NVM3KEY variant)
    const nv3TokenId = await this.getNv3RestoredEui64Key();

    if (nv3TokenId !== null) {
      // NV3 token exists - use it (rewritable)
      try {
        this.logger(`Using NV3 token 0x${nv3TokenId.toString(16).padStart(8, "0")}`);
        await this.setTokenData(nv3TokenId, 0, ieeeAddress);
        this.logger("✓ EUI64 written to NV3 storage (rewritable)");
        return;
      } catch (error) {
        this.logger(`Failed to write NV3 token: ${error}`);
      }
    }

    // NV3 not available, check MFG_CUSTOM_EUI_64
    const mfgCustomEui64 = await this.getMfgCustomEui64();

    if (mfgCustomEui64 === null && burnIntoUserdata) {
      // MFG token is empty and user explicitly allowed burning
      this.logger("Using MFG_CUSTOM_EUI_64 token (ONE-TIME write, permanent!)");
      await this.setMfgToken(0x0c, ieeeAddress); // MFG_CUSTOM_EUI_64 = 0x0C
      this.logger("✓ EUI64 written to MFG_CUSTOM_EUI_64 (PERMANENT)");
      return;
    }

    if (mfgCustomEui64 === null && !burnIntoUserdata) {
      throw new Error(
        `Firmware does not support NV3 tokens. ` +
          `Custom IEEE will not be written unless you pass select "Force" option. ` +
          `WARNING: MFG_CUSTOM_EUI_64 is ONE-TIME write and cannot be changed afterward!`
      );
    }

    // MFG token already written
    throw new Error(
      `Custom IEEE address has already been ` +
        `written once to MFG_CUSTOM_EUI_64 (${Array.from(mfgCustomEui64!)
          .reverse()
          .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
          .join(":")}) ` +
        `and cannot be changed!`
    );
  }

  /**
   * Get NV3 key for restored EUI64 if it exists (bellows: _get_nv3_restored_eui64_key)
   * Tries both CREATOR_STACK_RESTORED_EUI64 (NCP) and NVM3KEY_STACK_RESTORED_EUI64 (RCP)
   */
  private async getNv3RestoredEui64Key(): Promise<number | null> {
    const tokens = [
      0x0000e12a, // CREATOR_STACK_RESTORED_EUI64 (NCP firmware)
      0x0001e12a, // NVM3KEY_STACK_RESTORED_EUI64 (RCP firmware)
    ];

    for (const tokenId of tokens) {
      try {
        const data = await this.getTokenData(tokenId, 0);
        if (data) {
          console.log(
            `Found NV3 token 0x${tokenId.toString(16).padStart(8, "0")}: ${Array.from(data)
              .map((b) => b.toString(16).padStart(2, "0"))
              .join(":")}`
          );
          return tokenId;
        }
      } catch (error) {
        // Token doesn't exist or not supported, try next
        continue;
      }
    }

    return null;
  }

  /**
   * Get MFG_CUSTOM_EUI_64 token if it's valid (bellows: _get_mfg_custom_eui_64)
   * Returns null if token is empty (0xFF * 8) or doesn't exist
   */
  private async getMfgCustomEui64(): Promise<Uint8Array | null> {
    try {
      const getMfgTokenFrameId = 0x000b;
      const payload = new Uint8Array([0x0c]); // MFG_CUSTOM_EUI_64 = 0x0C
      const response = await this.sendEzspCommand(getMfgTokenFrameId, payload, 4000);

      if (response.length < 9) {
        return null; // RCP firmware - no MFG tokens
      }

      const tokenLength = response[0];
      if (tokenLength !== 8) {
        return null;
      }

      const tokenData = response.slice(1, 9);

      // Check if empty (all 0xFF)
      const isEmpty = tokenData.every((byte) => byte === 0xff);
      if (isEmpty) {
        return null;
      }

      return tokenData;
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if EUI64 can be rewritten (bellows: can_rewrite_custom_eui64)
   */
  public async canRewriteCustomEui64(): Promise<boolean> {
    return (await this.getNv3RestoredEui64Key()) !== null;
  }

  /**
   * Check if EUI64 can be burned once (bellows: can_burn_userdata_custom_eui64)
   */
  public async canBurnUserdataCustomEui64(): Promise<boolean> {
    return (await this.getMfgCustomEui64()) === null;
  }

  /**
   * Read token data using getTokenData (0x0102)
   */
  private async getTokenData(tokenId: number, index: number): Promise<Uint8Array | null> {
    const payload = new Uint8Array(8);
    payload[0] = tokenId & 0xff;
    payload[1] = (tokenId >> 8) & 0xff;
    payload[2] = (tokenId >> 16) & 0xff;
    payload[3] = (tokenId >> 24) & 0xff;
    payload[4] = index & 0xff;
    payload[5] = (index >> 8) & 0xff;
    payload[6] = (index >> 16) & 0xff;
    payload[7] = (index >> 24) & 0xff;

    const response = await this.sendEzspCommand(0x0102, payload, 4000);

    if (response.length < 1) {
      return null;
    }

    const status = response[0];
    if (status !== 0x00) {
      return null;
    }

    // Response format (EZSP v9+): [status, value_length_low, value_length_high, ...value_data]
    if (response.length < 3) {
      return null;
    }

    const valueLength = response[1] | (response[2] << 8);
    if (response.length < 3 + valueLength) {
      return null;
    }

    return response.slice(3, 3 + valueLength);
  }

  /**
   * Write token data using setTokenData (0x0103)
   */
  private async setTokenData(tokenId: number, index: number, data: Uint8Array): Promise<void> {
    const payload = new Uint8Array(4 + 4 + 1 + data.length);

    // Token ID (little-endian)
    payload[0] = tokenId & 0xff;
    payload[1] = (tokenId >> 8) & 0xff;
    payload[2] = (tokenId >> 16) & 0xff;
    payload[3] = (tokenId >> 24) & 0xff;

    // Index (little-endian)
    payload[4] = index & 0xff;
    payload[5] = (index >> 8) & 0xff;
    payload[6] = (index >> 16) & 0xff;
    payload[7] = (index >> 24) & 0xff;

    // Length (1 byte) + Data
    payload[8] = data.length;
    payload.set(data, 9);

    const response = await this.sendEzspCommand(0x0103, payload, 4000);

    if (response.length < 1) {
      throw new Error("Invalid setTokenData response");
    }

    const status = response[0];
    if (status !== 0x00) {
      throw new Error(
        `setTokenData failed with status 0x${status.toString(16).padStart(2, "0")} (${this.getEmberStatusName(status)})`
      );
    }
  }

  /**
   * Write MFG token using setMfgToken (0x0C)
   */
  private async setMfgToken(tokenId: number, data: Uint8Array): Promise<void> {
    const payload = new Uint8Array(1 + 1 + data.length);
    payload[0] = tokenId;
    payload[1] = data.length;
    payload.set(data, 2);

    const response = await this.sendEzspCommand(0x000c, payload, 4000);

    if (response.length < 1) {
      throw new Error("Invalid setMfgToken response");
    }

    const status = response[0];
    if (status !== 0x00) {
      throw new Error(
        `setMfgToken failed with status 0x${status.toString(16).padStart(2, "0")} (${this.getEmberStatusName(status)})`
      );
    }
  }

  private arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  /**
   * Get human-readable name for EmberStatus code
   */
  private getEmberStatusName(status: number): string {
    const statusNames: { [key: number]: string } = {
      0x00: "SUCCESS",
      0x01: "ERR_FATAL",
      0x02: "BAD_ARGUMENT",
      0x03: "NOT_FOUND",
      0xb2: "KEY_INVALID",
      0xb4: "TABLE_FULL",
      0xb6: "TABLE_ENTRY_ERASED",
      0xc0: "NVM3_TOKEN_NO_VALID_PAGES",
      0xc1: "NVM3_ERR_OPENED_WITH_OTHER_PARAMETERS",
    };
    return statusNames[status] || `UNKNOWN_${status}`;
  }

  private async ensureReady(): Promise<void> {
    if (this.disposed) throw new Error("EZSP client disposed");
    if (this.initialized) return;
    if (!this.readyPromise) {
      this.readyPromise = new Promise<void>((resolve, reject) => {
        this.readyResolve = resolve;
        this.readyReject = reject;
      });
      this.sendResetFrame().catch((err) => {
        this.readyReject?.(err instanceof Error ? err : new Error(String(err)));
      });
    }
    await Promise.race([
      this.readyPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timed out waiting for EZSP reset")), 4000)),
    ]);
    this.initialized = true;
  }

  private resolveReady() {
    this.readyResolve?.();
    this.readyResolve = null;
    this.readyReject = null;
  }

  private async sendEzspCommand(frameId: number, payload: Uint8Array, timeoutMs = 2000): Promise<Uint8Array> {
    if (this.pendingResponse) throw new Error("EZSP request already in flight");
    const seq = this.ezspSeq;
    this.ezspSeq = (this.ezspSeq + 1) & 0xff;

    // EZSP v8+ uses 16-bit frame IDs with extended frame format
    // Frame structure: [seq, frameControl, 0x01, frameId_low, frameId_high, ...payload]
    const frame = new Uint8Array(5 + payload.length);
    frame[0] = seq;
    frame[1] = 0x00; // frame control (request)
    frame[2] = 0x01; // Extended frame format marker (indicates 16-bit frame ID follows)
    frame[3] = frameId & 0xff; // Frame ID low byte
    frame[4] = (frameId >> 8) & 0xff; // Frame ID high byte
    frame.set(payload, 5);

    // console.log(
    //   `sendEzspCommand: frameId=0x${frameId.toString(16).padStart(4, "0")}, seq=${seq}, payload length=${
    //     payload.length
    //   }, full frame:`,
    //   Array.from(frame)
    //     .map((b) => "0x" + b.toString(16).padStart(2, "0"))
    //     .join(" ")
    // );

    const responsePromise = new Promise<Uint8Array>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        if (this.pendingResponse && this.pendingResponse.seq === seq) {
          this.pendingResponse.reject(new Error("EZSP response timeout"));
          this.pendingResponse = null;
        }
      }, timeoutMs);
      this.pendingResponse = { seq, resolve, reject, timer };
    });

    await this.writeDataFrame(frame);
    return responsePromise;
  }

  private async writeDataFrame(ezspPayload: Uint8Array): Promise<void> {
    const frmNum = this.txSeq;
    this.txSeq = (this.txSeq + 1) & 0x7;
    const control = (frmNum << 4) | (0 << 3) | (this.rxSeq & 0x7);
    const randomized = this.randomize(ezspPayload);
    const body = new Uint8Array(1 + randomized.length);
    body[0] = control;
    body.set(randomized, 1);
    await this.sendAshFrame(body);
    await this.waitForAck(frmNum, 1000);
  }

  private async sendAshFrame(body: Uint8Array): Promise<void> {
    const withCrc = this.appendCrc(body);
    const stuffed = this.stuff(withCrc);
    const out = new Uint8Array(stuffed.length + 2);
    out[0] = ASH_FLAG;
    out.set(stuffed, 1);
    out[out.length - 1] = ASH_FLAG;
    await this.link.write(out);
  }

  private async waitForAck(frmNum: number, timeoutMs: number): Promise<void> {
    if (this.pendingAckReject) {
      this.pendingAckReject(new Error("Overwriting pending ACK wait"));
    }
    this.awaitingAckFrame = frmNum;
    await new Promise<void>((resolve, reject) => {
      this.pendingAckResolve = resolve;
      this.pendingAckReject = reject;
      window.setTimeout(() => {
        if (this.awaitingAckFrame === frmNum) {
          this.awaitingAckFrame = null;
          reject(new Error("ACK timeout"));
        }
      }, timeoutMs);
    }).catch((err) => {
      throw err;
    });
  }

  private randomize(data: Uint8Array): Uint8Array {
    const out = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) {
      out[i] = data[i] ^ PSEUDO_RANDOM_SEQUENCE[i];
    }
    return out;
  }

  private derandomize(data: Uint8Array): Uint8Array {
    return this.randomize(data);
  }

  private appendCrc(data: Uint8Array): Uint8Array {
    const crc = crc16(data, 0xffff);

    const out = new Uint8Array(data.length + 2);
    out.set(data, 0);
    out[out.length - 2] = (crc >> 8) & 0xff;
    out[out.length - 1] = crc & 0xff;
    return out;
  }

  private stuff(data: Uint8Array): Uint8Array {
    const out: number[] = [];
    for (const byte of data) {
      if (
        byte === ASH_FLAG ||
        byte === ASH_ESCAPE ||
        byte === ASH_XON ||
        byte === ASH_XOFF ||
        byte === ASH_SUBSTITUTE ||
        byte === ASH_CANCEL
      ) {
        out.push(ASH_ESCAPE, byte ^ 0x20);
      } else {
        out.push(byte);
      }
    }
    return new Uint8Array(out);
  }

  private unstuff(data: Uint8Array): Uint8Array {
    const out: number[] = [];
    let escaped = false;
    for (const byte of data) {
      if (escaped) {
        out.push(byte ^ 0x20);
        escaped = false;
      } else if (byte === ASH_ESCAPE) {
        escaped = true;
      } else {
        out.push(byte);
      }
    }
    if (escaped) throw new Error("Dangling escape byte");
    return new Uint8Array(out);
  }

  private processBuffer() {
    while (this.buffer.length) {
      if (this.discardingUntilFlag) {
        const flagIdx = this.buffer.indexOf(ASH_FLAG);
        if (flagIdx === -1) {
          this.buffer = [];
          return;
        }
        this.buffer = this.buffer.slice(flagIdx + 1);
        this.discardingUntilFlag = false;
        continue;
      }

      const reservedInfo = this.findNextReserved();
      if (!reservedInfo) return;
      const [idx, byte] = reservedInfo;
      if (byte === ASH_FLAG) {
        const frameBytes = this.buffer.slice(0, idx);
        this.buffer = this.buffer.slice(idx + 1);
        if (!frameBytes.length) continue;
        try {
          const parsed = this.parseFrame(this.unstuff(new Uint8Array(frameBytes)));
          this.handleFrame(parsed);
        } catch (err) {
          // console.warn("ASH frame parse error", err);
          this.sendNak();
        }
        continue;
      }
      if (byte === ASH_CANCEL) {
        this.buffer = this.buffer.slice(idx + 1);
        continue;
      }
      if (byte === ASH_SUBSTITUTE) {
        this.discardingUntilFlag = true;
        this.buffer = this.buffer.slice(idx + 1);
        continue;
      }
      if (byte === ASH_XON || byte === ASH_XOFF) {
        this.buffer.splice(idx, 1);
        continue;
      }
      break;
    }
  }

  private findNextReserved(): [number, number] | null {
    const bytes = [ASH_FLAG, ASH_CANCEL, ASH_SUBSTITUTE, ASH_XON, ASH_XOFF];
    let bestIdx = -1;
    let bestByte = 0;
    for (const b of bytes) {
      const idx = this.buffer.indexOf(b);
      if (idx !== -1 && (bestIdx === -1 || idx < bestIdx)) {
        bestIdx = idx;
        bestByte = b;
      }
    }
    return bestIdx === -1 ? null : [bestIdx, bestByte];
  }

  private parseFrame(data: Uint8Array): AshFrame {
    if (data.length < 3) throw new Error("Frame too short");
    const control = data[0];
    const crc = (data[data.length - 2] << 8) | data[data.length - 1];
    const body = data.slice(0, data.length - 2);
    const calc = crc16(body, 0xffff);
    if (calc !== crc) throw new Error("Invalid frame CRC");

    if ((control & 0x80) === 0) {
      return {
        kind: "data",
        frmNum: (control >> 4) & 0x7,
        reTx: ((control >> 3) & 0x1) === 1,
        ackNum: control & 0x7,
        payload: this.derandomize(data.slice(1, data.length - 2)),
      };
    } else if ((control & 0xe0) === 0x80) {
      return { kind: "ack", ackNum: control & 0x7 };
    } else if ((control & 0xe0) === 0xa0) {
      return { kind: "nak", ackNum: control & 0x7 };
    } else if (control === 0xc0) {
      return { kind: "rst" };
    } else if (control === 0xc1) {
      if (data.length < 5) throw new Error("Invalid RSTACK body");
      return { kind: "rstack", resetCode: data[2] };
    } else if (control === 0xc2) {
      if (data.length < 5) throw new Error("Invalid ERROR frame");
      return { kind: "error", resetCode: data[2] };
    }
    throw new Error(`Unknown ASH control byte 0x${control.toString(16)}`);
  }

  private handleFrame(frame: AshFrame) {
    // console.log(`handleFrame: frame kind=${frame.kind}`, frame);

    if (frame.kind === "data") {
      // console.log(
      //   `DATA frame: frmNum=${frame.frmNum}, ackNum=${frame.ackNum}, payload length=${frame.payload.length}, payload:`,
      //   Array.from(frame.payload)
      //     .map((b) => "0x" + b.toString(16).padStart(2, "0"))
      //     .join(" ")
      // );
      this.handleAckInfo(frame.ackNum);
      if (frame.frmNum === this.rxSeq || frame.reTx) {
        if (frame.frmNum === this.rxSeq) {
          this.rxSeq = (this.rxSeq + 1) & 0x7;
        }
        this.sendAckFrame();
        this.handleEzspPayload(frame.payload);
      } else {
        this.sendNak();
      }
    } else if (frame.kind === "ack" || frame.kind === "nak") {
      this.handleAckInfo(frame.ackNum);
    } else if (frame.kind === "rstack") {
      this.rxSeq = 0;
      this.txSeq = 0;
      this.resolveReady();
    } else if (frame.kind === "error") {
      if (this.pendingResponse) {
        window.clearTimeout(this.pendingResponse.timer);
        this.pendingResponse.reject(new Error(`NCP error: ${frame.resetCode}`));
        this.pendingResponse = null;
      }
      this.readyReject?.(new Error(`NCP error: ${frame.resetCode}`));
      this.readyPromise = null;
      this.readyResolve = null;
      this.readyReject = null;
    }
  }

  private handleAckInfo(ackNum: number) {
    if (this.awaitingAckFrame === null) return;
    const expected = (this.awaitingAckFrame + 1) & 0x7;
    if (ackNum === expected) {
      this.awaitingAckFrame = null;
      this.pendingAckResolve?.();
      this.pendingAckResolve = null;
      this.pendingAckReject = null;
    }
  }

  private handleEzspPayload(payload: Uint8Array) {
    if (!this.pendingResponse) return;

    const seq = payload[0];
    const frameControl = payload[1];

    // EZSP v8+ uses extended frame format with 16-bit frame IDs
    // Format: [seq, frameControl, 0x01, frameId_low, frameId_high, ...body]
    // We check payload[2] to see if it's 0x01 (extended format marker)
    let frameId: number;
    let body: Uint8Array;

    if (payload.length >= 5 && payload[2] === 0x01) {
      // Extended format (EZSP v8+): 16-bit frame ID
      frameId = payload[3] | (payload[4] << 8);
      body = payload.slice(5);
    } else {
      // Legacy format (EZSP v4-v7): 8-bit frame ID
      frameId = payload[2];
      body = payload.slice(3);
    }

    // console.log(
    //   `handleEzspPayload: seq=${seq}, frameControl=0x${frameControl.toString(16)}, frameId=0x${frameId
    //     .toString(16)
    //     .padStart(4, "0")}, body length=${body.length}, body:`,
    //   Array.from(body)
    //     .map((b) => "0x" + b.toString(16).padStart(2, "0"))
    //     .join(" ")
    // );

    if ((frameControl & 0x80) === 0 && this.pendingResponse.seq !== seq) {
      return; // callback frame; ignore for now
    }
    if (this.pendingResponse.seq !== seq) return;
    window.clearTimeout(this.pendingResponse.timer);
    this.pendingResponse.resolve(body);
    this.pendingResponse = null;
  }

  private sendAckFrame() {
    const control = 0x80 | (this.rxSeq & 0x7);
    const body = new Uint8Array([control]);
    this.sendAshFrame(body).catch(() => {});
  }

  private sendNak() {
    const control = 0xa0 | (this.rxSeq & 0x7);
    const body = new Uint8Array([control]);
    this.sendAshFrame(body).catch(() => {});
  }

  private async sendResetFrame() {
    const control = 0xc0;
    const body = new Uint8Array([control]);
    const withCrc = this.appendCrc(body);
    const stuffed = this.stuff(withCrc);
    const prefix = new Uint8Array(33);
    prefix.fill(ASH_CANCEL);
    prefix[prefix.length - 1] = ASH_FLAG;
    const out = new Uint8Array(prefix.length + stuffed.length + 1);
    out.set(prefix, 0);
    out.set(stuffed, prefix.length);
    out[out.length - 1] = ASH_FLAG;
    await this.link.write(out);
  }
}

// =====================================================
// CPC (Co-Processor Communication) Client for MultiPAN RCP
// Silicon Labs proprietary protocol used in multipan firmware
// =====================================================

// CPC Frame format (CPC v5):
// | FLAG (0x14) | Header (4 bytes) | HCS (2 bytes) | [Payload] | [FCS (2 bytes)] |
// Note: FLAG at end is optional, frame length is determined by header

const CPC_FLAG = 0x14;

// CPC Endpoint IDs
const CPC_ENDPOINT_SYSTEM = 0; // System endpoint for queries

// CPC Frame Types (bits 6-7 of control byte)
const CPC_FRAME_TYPE_UNNUMBERED = 3; // U-frame

// CPC UnnumberedFrameType (bits 0-5 of control byte)
// POLL_FINAL = 0x04 (from cpc_types.py)
const CPC_UFRAME_POLL_FINAL = 0x04;

// CPC Commands (System endpoint)
const CPC_CMD_SYSTEM_PROP_VALUE_GET = 0x02;
const CPC_CMD_SYSTEM_PROP_VALUE_IS = 0x06;

// CPC System Properties (4-byte property IDs, but only low byte used for common ones)
const CPC_PROP_LAST_STATUS = 0x00;
const CPC_PROP_PROTOCOL_VERSION = 0x01;
const CPC_PROP_CAPABILITIES = 0x02;
const CPC_PROP_SECONDARY_CPC_VERSION = 0x03; // Returns 3 x uint32_t (major, minor, patch)
const CPC_PROP_SECONDARY_APP_VERSION = 0x04; // Returns version string
const CPC_PROP_RX_CAPABILITY = 0x20;

// CPC CRC16-CCITT calculation (non-reflected, init=0x0000)
// Different from HDLC CRC16-Kermit!
// Parameters: width=16, poly=0x1021, init=0x0000, final_xor=0x0000, no reflection
function cpcCrc16(data: Uint8Array): number {
  let crc = 0x0000; // init = 0
  for (const byte of data) {
    crc ^= byte << 8; // XOR byte into high byte
    for (let i = 0; i < 8; i++) {
      if (crc & 0x8000) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc; // no final XOR
}

class CpcClient {
  private link: Link;
  private buffer: number[] = [];
  private disposed = false;
  private lastReceivedPayload: Uint8Array | null = null;
  private commandSeq = 0;
  private pendingResponse: {
    resolve: (payload: Uint8Array) => void;
    reject: (err: Error) => void;
    timer: number;
  } | null = null;

  constructor(link: Link) {
    this.link = link;
  }

  public dispose() {
    this.disposed = true;
    if (this.pendingResponse) {
      window.clearTimeout(this.pendingResponse.timer);
      this.pendingResponse.reject(new Error("CPC client disposed"));
      this.pendingResponse = null;
    }
  }

  /**
   * Build a CPC frame
   * Frame format: FLAG(1) + endpoint(1) + length(2) + control(1) + HCS(2) + [payload] + [FCS(2)]
   */
  private buildFrame(endpoint: number, payload: Uint8Array, controlByte?: number): Uint8Array {
    const payloadLen = payload.length > 0 ? payload.length + 2 : 0; // +2 for FCS if payload exists
    const control = controlByte ?? CPC_FRAME_TYPE_UNNUMBERED << 6; // Default: Unnumbered frame

    // Header for CRC: FLAG(1) + endpoint(1) + length(2) + control(1) = 5 bytes
    // HCS is calculated over FLAG + endpoint + length + control (5 bytes total)
    const headerForHcs = new Uint8Array([
      CPC_FLAG,
      endpoint & 0x0f,
      payloadLen & 0xff,
      (payloadLen >> 8) & 0xff,
      control,
    ]);

    // Calculate HCS over 5 bytes (FLAG + header)
    const hcs = cpcCrc16(headerForHcs);

    if (payload.length === 0) {
      // Frame without payload (e.g., ACK)
      const frame = new Uint8Array(1 + 4 + 2);
      let offset = 0;
      frame[offset++] = CPC_FLAG;
      frame[offset++] = endpoint & 0x0f;
      frame[offset++] = payloadLen & 0xff;
      frame[offset++] = (payloadLen >> 8) & 0xff;
      frame[offset++] = control;
      frame[offset++] = hcs & 0xff;
      frame[offset++] = (hcs >> 8) & 0xff;
      return frame;
    }

    // Calculate FCS over payload only
    const fcs = cpcCrc16(payload);

    // Build complete frame with payload
    const frame = new Uint8Array(1 + 4 + 2 + payload.length + 2);
    let offset = 0;

    frame[offset++] = CPC_FLAG;
    frame[offset++] = endpoint & 0x0f;
    frame[offset++] = payloadLen & 0xff;
    frame[offset++] = (payloadLen >> 8) & 0xff;
    frame[offset++] = control;
    frame[offset++] = hcs & 0xff;
    frame[offset++] = (hcs >> 8) & 0xff;
    frame.set(payload, offset);
    offset += payload.length;
    frame[offset++] = fcs & 0xff;
    frame[offset++] = (fcs >> 8) & 0xff;

    return frame;
  }

  /**
   * Build an UnnumberedFrame payload for CPC System endpoint
   * Format: command_id(1) + command_seq(1) + length(2 LE) + property_payload
   * Property payload: property_id(4 LE) + value
   */
  private buildUnnumberedPayload(
    commandId: number,
    propertyId: number,
    value: Uint8Array = new Uint8Array(0)
  ): Uint8Array {
    // Property payload: property_id (4 bytes LE) + value
    const propertyPayload = new Uint8Array(4 + value.length);
    propertyPayload[0] = propertyId & 0xff;
    propertyPayload[1] = (propertyId >> 8) & 0xff;
    propertyPayload[2] = (propertyId >> 16) & 0xff;
    propertyPayload[3] = (propertyId >> 24) & 0xff;
    propertyPayload.set(value, 4);

    // UnnumberedFrame: command_id(1) + command_seq(1) + length(2 LE) + property_payload
    const unnumberedFrame = new Uint8Array(4 + propertyPayload.length);
    unnumberedFrame[0] = commandId;
    unnumberedFrame[1] = this.commandSeq;
    unnumberedFrame[2] = propertyPayload.length & 0xff;
    unnumberedFrame[3] = (propertyPayload.length >> 8) & 0xff;
    unnumberedFrame.set(propertyPayload, 4);

    this.commandSeq = (this.commandSeq + 1) & 0xff;

    return unnumberedFrame;
  }

  /**
   * Send a CPC unnumbered frame with POLL_FINAL control
   * Control byte: (UNNUMBERED << 6) | POLL_FINAL = 0xC0 | 0x04 = 0xC4
   */
  public async sendUnnumberedCommand(
    propertyId: number,
    value: Uint8Array = new Uint8Array(0),
    timeout = 1000
  ): Promise<Uint8Array> {
    const unnumberedPayload = this.buildUnnumberedPayload(CPC_CMD_SYSTEM_PROP_VALUE_GET, propertyId, value);

    // Control byte: U-frame (0xC0) + POLL_FINAL (0x04) = 0xC4
    const control = (CPC_FRAME_TYPE_UNNUMBERED << 6) | CPC_UFRAME_POLL_FINAL;
    const frame = this.buildFrame(CPC_ENDPOINT_SYSTEM, unnumberedPayload, control);

    // console.log(
    //   `CPC TX: ${Array.from(frame)
    //     .map((b) => b.toString(16).padStart(2, "0"))
    //     .join(" ")}`
    // );

    return new Promise((resolve, reject) => {
      this.pendingResponse = {
        resolve,
        reject,
        timer: window.setTimeout(() => {
          this.pendingResponse = null;
          reject(new Error("CPC response timeout"));
        }, timeout),
      };

      this.link.write(frame);
    });
  }

  /**
   * Request CPC version from device (like Python universal-silabs-flasher)
   * Uses proper UnnumberedFrame format: command_id + command_seq + length + property_payload
   */
  public async requestVersion(): Promise<string | null> {
    // Try SECONDARY_CPC_VERSION first (returns 3 x uint32_t) - like get_cpc_version() in Python
    try {
      const response = await this.sendUnnumberedCommand(CPC_PROP_SECONDARY_CPC_VERSION, new Uint8Array(0), 1000);

      // console.log(
      //   `CPC version response: ${Array.from(response)
      //     .map((b) => b.toString(16).padStart(2, "0"))
      //     .join(" ")}`
      // );

      // Parse UnnumberedFrame response: cmd(1) + seq(1) + len(2) + prop_payload
      // prop_payload: property_id(4) + 3 x uint32(12)
      if (response.length >= 8 && response[0] === CPC_CMD_SYSTEM_PROP_VALUE_IS) {
        const payloadLen = response[2] | (response[3] << 8);
        // CPC version: property_id(4) + 3 x uint32(12) = 16 bytes
        if (payloadLen >= 16 && response.length >= 20) {
          const propId = response[4] | (response[5] << 8) | (response[6] << 16) | (response[7] << 24);
          if (propId === CPC_PROP_SECONDARY_CPC_VERSION) {
            // 3 x uint32 little-endian starting at offset 8
            const major = response[8] | (response[9] << 8) | (response[10] << 16) | (response[11] << 24);
            const minor = response[12] | (response[13] << 8) | (response[14] << 16) | (response[15] << 24);
            const patch = response[16] | (response[17] << 8) | (response[18] << 16) | (response[19] << 24);
            return `${major}.${minor}.${patch}`;
          }
        }
      }
    } catch {
      // Continue to try APP version
    }

    // Try SECONDARY_APP_VERSION (returns string like "4.4.0") - like get_secondary_version() in Python
    try {
      const response = await this.sendUnnumberedCommand(CPC_PROP_SECONDARY_APP_VERSION, new Uint8Array(0), 1000);

      // console.log(
      //   `CPC app version response: ${Array.from(response)
      //     .map((b) => b.toString(16).padStart(2, "0"))
      //     .join(" ")}`
      // );

      if (response.length >= 8 && response[0] === CPC_CMD_SYSTEM_PROP_VALUE_IS) {
        const payloadLen = response[2] | (response[3] << 8);
        if (payloadLen >= 4 && response.length >= 4 + payloadLen) {
          const propId = response[4] | (response[5] << 8) | (response[6] << 16) | (response[7] << 24);
          if (propId === CPC_PROP_SECONDARY_APP_VERSION) {
            // Value starts at offset 8
            const versionBytes = response.slice(8, 4 + payloadLen);
            const version = new TextDecoder().decode(versionBytes).replace(/\0/g, "").trim();
            if (version && version !== "UNDEFINED") return version;
          }
        }
      }
    } catch {
      // No response from system endpoint
    }

    return null;
  }

  public handleData(chunk: Uint8Array): void {
    if (this.disposed) return;
    // console.log(
    //   `CPC handleData: ${chunk.length} bytes:`,
    //   Array.from(chunk)
    //     .map((b) => b.toString(16).padStart(2, "0"))
    //     .join(" ")
    // );
    for (const byte of chunk) {
      this.buffer.push(byte);
    }
    this.processBuffer();
  }

  private processBuffer() {
    while (this.buffer.length > 0) {
      // Look for CPC frame start flag
      const startIdx = this.buffer.indexOf(CPC_FLAG);
      if (startIdx === -1) {
        this.buffer = [];
        return;
      }

      if (startIdx > 0) {
        this.buffer = this.buffer.slice(startIdx);
      }

      // CPC v5 frame format:
      // Byte 0: FLAG (0x14)
      // Byte 1: endpoint ID
      // Byte 2-3: length (little-endian)
      // Byte 4: control
      // Byte 5-6: HCS (Header Check Sequence)
      // Byte 7+: payload (length bytes)
      // Last 2 bytes of payload area: FCS (if present)

      // Need at least FLAG(1) + header(4) + HCS(2) = 7 bytes
      if (this.buffer.length < 7) return;

      const endpoint = this.buffer[1] & 0x0f;
      const payloadLen = this.buffer[2] | (this.buffer[3] << 8);
      const control = this.buffer[4];
      // HCS is at bytes 5-6

      // Total frame size: FLAG(1) + header(4) + HCS(2) + payload
      const frameSize = 7 + payloadLen;

      // Check if we have enough data
      if (this.buffer.length < frameSize) return;

      // Extract frame data
      const frameData = new Uint8Array(this.buffer.slice(0, frameSize));
      this.buffer = this.buffer.slice(frameSize);

      // Skip trailing FLAG if present
      if (this.buffer.length > 0 && this.buffer[0] === CPC_FLAG) {
        this.buffer = this.buffer.slice(1);
      }

      const frameType = (control >> 6) & 0x03;
      const unnumberedType = control & 0x3f;

      // console.log(
      //   `CPC frame: endpoint=${endpoint}, type=${frameType}, ctrl=0x${control.toString(
      //     16
      //   )}, utype=0x${unnumberedType.toString(16)}, payloadLen=${payloadLen}`
      // );
      // console.log(
      //   `CPC raw: ${Array.from(frameData)
      //     .map((b) => b.toString(16).padStart(2, "0"))
      //     .join(" ")}`
      // );

      // Extract payload (starts at offset 7)
      if (payloadLen > 0) {
        const payload = frameData.slice(7, 7 + payloadLen);
        this.lastReceivedPayload = payload;

        // console.log(
        //   `CPC payload: ${Array.from(payload)
        //     .map((b) => b.toString(16).padStart(2, "0"))
        //     .join(" ")}`
        // );

        // If we have a pending response, resolve it
        if (this.pendingResponse) {
          window.clearTimeout(this.pendingResponse.timer);
          this.pendingResponse.resolve(payload);
          this.pendingResponse = null;
        }
      }
    }
  }

  public getLastPayload(): Uint8Array | null {
    return this.lastReceivedPayload;
  }

  /**
   * Try to parse version info from the initial CPC frame that MultiPAN sends on reset
   * The initial frame is typically a reset notification, not version info.
   * Format: cmd(1) + prop_id(1) + data + FCS(2)
   *
   * CPC System endpoint commands:
   * 0x01 = CMD_PROP_VALUE_GET
   * 0x02 = CMD_PROP_VALUE_SET
   * 0x06 = CMD_PROP_VALUE_IS (response/notification)
   *
   * System properties:
   * 0x00 = PROP_LAST_STATUS
   * 0x01 = PROP_PROTOCOL_VERSION
   * 0x02 = PROP_CAPABILITIES
   * 0x03 = PROP_SECONDARY_CPC_VERSION (3 x uint32)
   * 0x04 = PROP_SECONDARY_APP_VERSION (string)
   */
  public parseVersionFromPayload(payload: Uint8Array): string | null {
    if (!payload || payload.length < 2) return null;

    const cmd = payload[0];

    // console.log(`CPC parseVersion: cmd=0x${cmd.toString(16)}, len=${payload.length}`);
    // console.log(
    //   `CPC payload hex: ${Array.from(payload)
    //     .map((b) => b.toString(16).padStart(2, "0"))
    //     .join(" ")}`
    // );

    // Command 0x06 = CMD_PROP_VALUE_IS (property notification/response)
    if (cmd === CPC_CMD_SYSTEM_PROP_VALUE_IS) {
      // Property ID can be 1 byte (old) or 4 bytes (new CPC)
      // For reset notification the second byte is 0x00
      const propIdByte1 = payload[1];

      // Property 0x00 = PROP_LAST_STATUS (reset notification)
      if (propIdByte1 === CPC_PROP_LAST_STATUS) {
        // Reset notification - CPC is running
        // console.log(`CPC reset notification received, payload len=${payload.length}`);
        return "detected"; // Confirmed CPC/MultiPAN is running
      }

      // Check for 4-byte property ID format
      if (payload.length >= 5) {
        const propId = payload[1] | (payload[2] << 8) | (payload[3] << 16) | (payload[4] << 24);

        // Property 0x03 = PROP_SECONDARY_CPC_VERSION (3 x uint32_t)
        if (propId === CPC_PROP_SECONDARY_CPC_VERSION && payload.length >= 17) {
          const major = payload[5] | (payload[6] << 8) | (payload[7] << 16) | (payload[8] << 24);
          const minor = payload[9] | (payload[10] << 8) | (payload[11] << 16) | (payload[12] << 24);
          const patch = payload[13] | (payload[14] << 8) | (payload[15] << 16) | (payload[16] << 24);
          return `${major}.${minor}.${patch}`;
        }

        // Property 0x04 = PROP_SECONDARY_APP_VERSION (string)
        if (propId === CPC_PROP_SECONDARY_APP_VERSION && payload.length > 7) {
          const versionBytes = payload.slice(5, -2); // Skip CMD+PropID, exclude FCS
          const version = new TextDecoder().decode(versionBytes).replace(/\0/g, "").trim();
          if (version) return version;
        }
      }
    }

    // Try ASCII for other responses
    try {
      const text = new TextDecoder().decode(payload);
      const versionMatch = text.match(/(\d+\.\d+\.\d+)/);
      if (versionMatch) {
        return versionMatch[1];
      }
      if (/^[\x20-\x7e]+$/.test(text)) {
        return text.trim();
      }
    } catch {
      // Not valid UTF-8
    }

    // Return hex dump for debugging
    const hexStr = Array.from(payload.slice(0, Math.min(8, payload.length)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return `raw:${hexStr}`;
  }
}

class CpcSpinelClient {
  private link: Link;
  private cpc: CpcClient;

  constructor(link: Link) {
    this.link = link;
    this.cpc = new CpcClient(link);
  }

  public dispose() {
    this.cpc.dispose();
  }

  public handleData(chunk: Uint8Array): void {
    this.cpc.handleData(chunk);
  }

  public async init(): Promise<void> {
    // Wait a bit for any automatic frames from the device
    await sleep(200);
  }

  public async getVersion(): Promise<string> {
    // First check if we already received the reset notification (confirms CPC is running)
    const payload = this.cpc.getLastPayload();
    if (!payload) {
      throw new Error("No CPC data received - device may not be MultiPAN RCP");
    }

    // Confirm it's CPC by parsing the initial frame
    const initialParse = this.cpc.parseVersionFromPayload(payload);
    if (!initialParse) {
      throw new Error("Invalid CPC data received");
    }

    // Try to get CPC version first
    const cpcVersion = await this.cpc.requestVersion();

    // If we got CPC version, try to also get app version
    if (cpcVersion) {
      return `${cpcVersion} (MultiPAN RCP)`;
    }

    // Fallback - we detected CPC but couldn't get version
    return "? (MultiPAN RCP)";
  }
}

// ===================== Router CLI Client =====================
// For Zigbee Router firmware with CLI interface
// Sends "version\r\n" command and parses "stack ver. [X.X.X]" response

const ROUTER_VERSION_REGEX = /stack ver\. \[([^\]]+)\]/;

class RouterClient {
  private link: Link;
  private buffer: string = "";
  private disposed = false;
  private pendingResponse: {
    resolve: (value: string) => void;
    reject: (error: Error) => void;
    timer: number;
  } | null = null;

  constructor(link: Link) {
    this.link = link;
  }

  public dispose() {
    this.disposed = true;
    if (this.pendingResponse) {
      window.clearTimeout(this.pendingResponse.timer);
      this.pendingResponse.reject(new Error("Router client disposed"));
      this.pendingResponse = null;
    }
  }

  public handleData(chunk: Uint8Array): void {
    if (this.disposed) return;

    // Convert to string and append to buffer
    const text = new TextDecoder().decode(chunk);
    this.buffer += text;

    // console.log(`Router RX: ${JSON.stringify(text)}`);
    // console.log(`Router buffer: ${JSON.stringify(this.buffer)}`);

    // Check for prompt (ready state)
    if (this.buffer.includes(">")) {
      // Check for version response
      const match = ROUTER_VERSION_REGEX.exec(this.buffer);
      if (match && this.pendingResponse) {
        const version = match[1];
        // console.log(`Router detected version: ${version}`);
        window.clearTimeout(this.pendingResponse.timer);
        this.pendingResponse.resolve(version);
        this.pendingResponse = null;
        this.buffer = "";
        return;
      }
    }
  }

  public hasPrompt(): boolean {
    return this.buffer.includes(">");
  }

  public clearBuffer(): void {
    this.buffer = "";
  }

  /**
   * Activate CLI prompt by sending Enter
   */
  public async activatePrompt(timeout = 2000): Promise<boolean> {
    this.buffer = "";

    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        resolve(false);
      }, timeout);

      const checkPrompt = () => {
        if (this.hasPrompt()) {
          window.clearTimeout(timer);
          resolve(true);
        } else {
          setTimeout(checkPrompt, 50);
        }
      };

      // Send \r\n to activate prompt
      // console.log("Router: Sending \\r\\n to activate prompt");
      this.link.write(new Uint8Array([0x0d, 0x0a]));
      checkPrompt();
    });
  }

  /**
   * Send version command and wait for response
   */
  public async getVersion(timeout = 2000): Promise<string> {
    this.buffer = "";

    return new Promise((resolve, reject) => {
      this.pendingResponse = {
        resolve,
        reject,
        timer: window.setTimeout(() => {
          this.pendingResponse = null;
          reject(new Error("Router version timeout"));
        }, timeout),
      };

      // Send "version\r\n" command
      // console.log("Router: Sending version command");
      const cmd = new TextEncoder().encode("version\r\n");
      this.link.write(cmd);
    });
  }
}
