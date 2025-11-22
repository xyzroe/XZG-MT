import { Link } from "./ti";
import { sleep } from "../utils/index";
import { padToMultiple } from "../utils/crc";
import { crc16 } from "../utils/crc";
import { XmodemCRCPacket, XModemPacketType, XMODEM_BLOCK_SIZE } from "../utils/xmodem";
import { setLines } from "../flasher";

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

  // eslint-disable-next-line no-control-regex
  private uploadCompleteRegex = /\r\nSerial upload (complete|aborted)\r\n(.*?)\x00?/s;
  private promptRegex = /(?:^|[\r\n])BL ?> ?/i;

  private readonly boundDataHandler = (data: Uint8Array) => this.dataReceived(data);

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
        const match = text.match(this.menuRegex);

        if (match) {
          this.version = match[1];
          console.log(`Detected Gecko Bootloader v${this.version}`);
          this.buffer = new Uint8Array(0);
          this.state = State.IN_MENU;
        } else if (this.promptRegex.test(text)) {
          // If we see "Bootloader" or "Gecko", it might be an incomplete menu. Do not clear buffer.
          if (/(?:Gecko|Bootloader)/i.test(text)) {
            break;
          }

          // Prompt seen but no version header yet; still in menu
          console.log("Detected Gecko Bootloader prompt (no header)");
          this.buffer = new Uint8Array(0);
          if (this.version) {
            this.state = State.IN_MENU;
          } else {
            console.log("Version not detected yet, staying in WAITING_FOR_MENU");
          }
        } else {
          break; // Need more data
        }
      } else if (currentState === State.WAITING_XMODEM_READY) {
        // Wait for 'C' character indicating XMODEM-CRC mode (may appear repeatedly)
        // Check presence anywhere in buffer to be resilient to framing
        const hasC = this.buffer.includes?.(0x43) || new TextDecoder().decode(this.buffer).includes("C");
        if (!hasC) {
          break;
        }

        console.log("XMODEM ready, starting transfer");
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
        console.log(`Upload status: ${this.uploadStatus}`);

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
    await enterSilabsBootloader();
    // Give BL a brief moment, then query menu/version
    await sleep(200);
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

  public async getBootloaderVersion(timeoutMs: number = 2000): Promise<string> {
    this.ensureListener();

    return new Promise((resolve, reject) => {
      (async () => {
        try {
          // Reset state machine and request EBL info exactly like USF
          this.state = State.WAITING_FOR_MENU;
          this.version = null;
          // Clear buffer to ensure we don't parse old garbage data from previous sessions
          this.buffer = new Uint8Array(0);

          // Ember bootloader requires a newline before option
          await this.writeString("\n");
          await this.writeString("3");

          // Wait for menu to appear (with timeout)
          const timeout = setTimeout(() => {
            reject(new Error("Timeout waiting for bootloader menu"));
          }, Math.max(500, timeoutMs));

          const checkMenu = setInterval(() => {
            if (this.state === State.IN_MENU && this.version) {
              clearInterval(checkMenu);
              clearTimeout(timeout);
              resolve(this.version);
              console.log(`Bootloader version detected: v${this.version}`);
              return;
            }
            try {
              const t = new TextDecoder().decode(this.buffer);
              console.log(`Checking for menu:\n${t}`);
              const mm = t.match(this.menuRegex);
              if (mm) {
                this.version = mm[1];
                this.buffer = new Uint8Array(0);
                this.state = State.IN_MENU;
                clearInterval(checkMenu);
                clearTimeout(timeout);
                resolve(this.version);
              }
            } catch {
              // ignore
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
      console.log("Sending EOT");
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
      console.warn("XMODEM timeout, retrying");
      this.xmodemRetryChunk();
    }, 2000);
  }

  private xmodemRetryChunk(): void {
    if (this.xmodemRetries >= this.xmodemMaxRetries) {
      this.xmodemAbort(new Error(`XMODEM transfer failed after ${this.xmodemMaxRetries} retries`));
      return;
    }

    this.xmodemRetries++;
    console.log(`Retry attempt ${this.xmodemRetries} for chunk ${this.xmodemChunkIndex}`);
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
        console.log("XMODEM transfer complete");
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
      console.warn("Got NAK, retrying chunk");
      this.xmodemRetryChunk();
    } else if (response === XModemPacketType.CAN) {
      this.xmodemAbort(new Error("Transfer cancelled by receiver"));
    } else {
      console.warn(`Invalid XMODEM response: 0x${response.toString(16)}`);
      this.xmodemRetryChunk();
    }
  }

  public async flash(firmware: Uint8Array, onProgress: (current: number, total: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      (async () => {
        try {
          // Pad firmware to XMODEM block size
          const paddedFirmware = padToMultiple(firmware, XMODEM_BLOCK_SIZE, 0xff);
          console.log(`Flashing ${paddedFirmware.length} bytes (original: ${firmware.length})`);

          // First, query bootloader info
          await this.getBootloaderVersion();

          // Initialize XMODEM state
          this.xmodemFirmware = paddedFirmware;
          this.xmodemChunkIndex = 0;
          this.xmodemTotalChunks = paddedFirmware.length / XMODEM_BLOCK_SIZE;
          this.xmodemRetries = 0;
          this.xmodemMaxRetries = 3;
          this.xmodemProgressCallback = onProgress;

          // Set up promise callbacks
          this.xmodemResolve = resolve;
          this.xmodemReject = reject;

          // Initial progress
          onProgress(0, paddedFirmware.length);

          console.log(`Starting XMODEM upload: ${this.xmodemTotalChunks} chunks`);
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

  public async getApplicationVersion(): Promise<string> {
    // Re-register handler to ensure we are listening
    this.ensureListener();

    this.ezspClient = new EzspAshClient(this.link);
    try {
      const info = await this.ezspClient.readVersion();
      return info;
    } finally {
      this.ezspClient.dispose();
      this.ezspClient = null;
    }
  }
}

//export type SetLinesHandler = (rstLow: boolean, bslLow: boolean) => Promise<void>;

export async function enterSilabsBootloader(log?: (msg: string) => void): Promise<void> {
  log?.("Silabs entry bootloader: RTS/DTR exact pattern");

  // await setLines(false, true);
  // await sleep(1000);

  //work with direct logic
  // await setLines(true, false);
  // await sleep(100);

  // await setLines(true, true);
  // await sleep(50);

  // // my gate work
  // await setLines(false, false);
  // await sleep(200);
  // await setLines(false, true);
  // await sleep(200);
  // await setLines(true, true);
  // await sleep(200);
  // await setLines(false, true);
  // await sleep(200);
  // await setLines(false, false);
  // await sleep(200);

  await setLines(true, true);
  await sleep(50);
  await setLines(true, false);
  await sleep(100);
  await setLines(false, true);
  await sleep(100);
  // await setLines(true, false);
  // await sleep(500);
  // await setLines(true, true);
  // await setLines(false, false);
  // await sleep(1000);
  // await setLines(false, true);
  // await sleep(1000);
  // await setLines(true, true);
  // await sleep(1000);
}

export async function resetSilabs(log?: (msg: string) => void): Promise<void> {
  log?.("Silabs reset: RTS/DTR exact pattern");

  // log("Sending '2' to bootloader to run application");
  // const encoder = new TextEncoder();
  // await getActiveLink().write(encoder.encode("2\r\n"));
  // await sleep(500); // Give time for bootloader to process
  //await resetUseLines(); // Then reset the device

  // work with inverted logic
  // await setLines(true, true);
  // await sleep(500);
  // await setLines(false, true);
  // await sleep(500);
  // await setLines(true, true);
  // await sleep(1000);

  // await setLines(true, true);
  // await sleep(100);
  // await setLines(false, true);
  // await sleep(500);
  // await setLines(true, true);
  // await setLines(false, false);
  // await sleep(300);
  await setLines(true, false);
  await sleep(300);
  await setLines(false, false);
  await sleep(300);
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

  constructor(link: Link) {
    this.link = link;
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

  public async readVersion(): Promise<string> {
    await this.ensureReady();
    const desiredProtocolVersion = 4;
    const frameId = 0x00;
    const payload = new Uint8Array([desiredProtocolVersion]);
    const response = await this.sendEzspCommand(frameId, payload, 4000);
    console.log("Response bytes:", response);
    if (response.length < 4) {
      throw new Error("Invalid EZSP version response");
    }
    const protocolVersion = response[0];
    const stackType = response[1];
    const stackVersion = response[2] | (response[3] << 8);
    const digits = [
      (stackVersion >> 12) & 0xf,
      (stackVersion >> 8) & 0xf,
      (stackVersion >> 4) & 0xf,
      stackVersion & 0xf,
    ];
    console.log(`EZSP Stack Version Digits: ${digits.join(".")}`);
    const versionParts = digits.map((digit) => digit.toString(10));
    const versionText = versionParts.join(".");
    let buildNumber: number | null = null;
    if (response.length >= 6) {
      buildNumber = response[4] | (response[5] << 8);
    }

    // // If buildNumber was not obtained from version, request from mfglibGetVersion
    // if (buildNumber === null || buildNumber === 0) {
    //   try {
    //     const mfglibFrameId = 0x0c; // mfglibGetVersion
    //     const mfglibPayload = new Uint8Array([]);
    //     const mfglibResponse = await this.sendEzspCommand(mfglibFrameId, mfglibPayload, 4000);
    //     console.log("mfglibGetVersion Response bytes:", mfglibResponse);
    //     if (mfglibResponse.length >= 3 && mfglibResponse[0] === 0) {
    //       // status OK
    //       buildNumber = mfglibResponse[1] | (mfglibResponse[2] << 8);
    //     }
    //   } catch (error) {
    //     console.warn("Failed to get build number from mfglibGetVersion:", error);
    //   }
    // }

    const machineVersion = buildNumber !== null ? `${versionText}.${buildNumber}` : versionText;
    const summary = buildNumber !== null ? `${versionText} build ${buildNumber}` : versionText;
    const details = [`EZSP v${protocolVersion}`, `stack type ${stackType}`, machineVersion];
    return `${summary} (${details.join(", ")})`;
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
    const frame = new Uint8Array(3 + payload.length);
    frame[0] = seq;
    frame[1] = 0x00; // frame control (request)
    frame[2] = frameId;
    frame.set(payload, 3);

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
          console.warn("ASH frame parse error", err);
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
    if (frame.kind === "data") {
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
    const body = payload.slice(3);
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
