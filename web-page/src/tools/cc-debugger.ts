interface HexSection {
  address: number;
  data: Uint8Array;
}

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
} from "../ui";

function parseHex(content: string): HexSection[] {
  const lines = content.split(/\r?\n/);
  const sections: HexSection[] = [];
  let currentSection: HexSection | null = null;
  let addressPrefix = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (!line.startsWith(":")) {
      throw new Error(`Invalid HEX record at line ${i + 1}: Missing ':'`);
    }

    if (line.length % 2 !== 1) {
      throw new Error(`Invalid HEX record at line ${i + 1}: Odd length`);
    }

    const byteCount = parseInt(line.substring(1, 3), 16);
    if (isNaN(byteCount)) {
      throw new Error(`Invalid HEX record at line ${i + 1}: Invalid byte count`);
    }

    // Check line length: : (1) + count (2) + addr (4) + type (2) + data (2*count) + checksum (2)
    // Total = 1 + 2 + 4 + 2 + 2*count + 2 = 11 + 2*count
    if (line.length !== 11 + byteCount * 2) {
      throw new Error(
        `Invalid HEX record at line ${i + 1}: Length mismatch (expected ${11 + byteCount * 2}, got ${line.length})`
      );
    }

    const address = parseInt(line.substring(3, 7), 16);
    const recordType = parseInt(line.substring(7, 9), 16);
    const dataStr = line.substring(9, 9 + byteCount * 2);
    const checksum = parseInt(line.substring(9 + byteCount * 2, 9 + byteCount * 2 + 2), 16);

    if (isNaN(address) || isNaN(recordType) || isNaN(checksum)) {
      throw new Error(`Invalid HEX record at line ${i + 1}: Invalid hex digits`);
    }

    let sum = byteCount + (address >> 8) + (address & 0xff) + recordType + checksum;
    const dataBytes = new Uint8Array(byteCount);
    for (let j = 0; j < byteCount; j++) {
      const byte = parseInt(dataStr.substring(j * 2, j * 2 + 2), 16);
      if (isNaN(byte)) {
        throw new Error(`Invalid HEX record at line ${i + 1}: Invalid data byte`);
      }
      dataBytes[j] = byte;
      sum += byte;
    }

    if ((sum & 0xff) !== 0) {
      throw new Error(`Checksum mismatch at line ${i + 1}`);
    }

    if (recordType === 0x00) {
      // Data
      const fullAddress = addressPrefix | address;
      if (currentSection && currentSection.address + currentSection.data.length === fullAddress) {
        const newData = new Uint8Array(currentSection.data.length + dataBytes.length);
        newData.set(currentSection.data);
        newData.set(dataBytes, currentSection.data.length);
        currentSection.data = newData;
      } else {
        if (currentSection) sections.push(currentSection);
        currentSection = { address: fullAddress, data: dataBytes };
      }
    } else if (recordType === 0x01) {
      // EOF
      break;
    } else if (recordType === 0x02) {
      // Extended Segment Address
      const segment = (dataBytes[0] << 8) | dataBytes[1];
      addressPrefix = segment << 4;
    } else if (recordType === 0x04) {
      // Extended Linear Address
      const upper = (dataBytes[0] << 8) | dataBytes[1];
      addressPrefix = upper << 16;
    }
  }
  if (currentSection) sections.push(currentSection);
  return sections;
}

// Generate Intel HEX format from binary data
export function generateHex(data: Uint8Array, baseAddress: number = 0): string {
  const lines: string[] = [];
  const BYTES_PER_LINE = 16;

  // Helper to calculate checksum
  function calculateChecksum(bytes: number[]): number {
    let sum = 0;
    for (const b of bytes) {
      sum += b;
    }
    return -sum & 0xff;
  }

  // Helper to format hex byte
  function toHex(value: number, digits: number = 2): string {
    return value.toString(16).toUpperCase().padStart(digits, "0");
  }

  let currentExtendedAddress = -1;

  for (let offset = 0; offset < data.length; offset += BYTES_PER_LINE) {
    const address = baseAddress + offset;
    const highAddress = (address >> 16) & 0xffff;

    // Emit Extended Linear Address record if needed
    if (highAddress !== currentExtendedAddress) {
      currentExtendedAddress = highAddress;
      const recordData = [
        0x02, // byte count
        0x00,
        0x00, // address (always 0000 for type 04)
        0x04, // record type (Extended Linear Address)
        (highAddress >> 8) & 0xff,
        highAddress & 0xff,
      ];
      const checksum = calculateChecksum(recordData);
      lines.push(`:02000004${toHex(highAddress, 4)}${toHex(checksum)}`);
    }

    // Emit data record
    const lineAddress = address & 0xffff;
    const count = Math.min(BYTES_PER_LINE, data.length - offset);
    const recordData = [
      count,
      (lineAddress >> 8) & 0xff,
      lineAddress & 0xff,
      0x00, // record type (Data)
    ];

    let dataHex = "";
    for (let i = 0; i < count; i++) {
      const byte = data[offset + i];
      recordData.push(byte);
      dataHex += toHex(byte);
    }

    const checksum = calculateChecksum(recordData);
    lines.push(`:${toHex(count)}${toHex(lineAddress, 4)}00${dataHex}${toHex(checksum)}`);
  }

  // Emit EOF record
  lines.push(":00000001FF");

  return lines.join("\n") + "\n";
}

// Minimal WebUSB Type Definitions
interface USBDevice {
  opened: boolean;
  configuration: USBConfiguration | null;
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(configurationValue: number): Promise<void>;
  claimInterface(interfaceNumber: number): Promise<void>;
  controlTransferIn(setup: USBControlTransferParameters, length: number): Promise<USBInTransferResult>;
  controlTransferOut(setup: USBControlTransferParameters, data?: BufferSource): Promise<USBOutTransferResult>;
  transferIn(endpointNumber: number, length: number): Promise<USBInTransferResult>;
  transferOut(endpointNumber: number, data: BufferSource): Promise<USBOutTransferResult>;
  productName?: string;
  manufacturerName?: string;
  serialNumber?: string;
}

interface USBConfiguration {
  configurationValue: number;
  interfaces: USBInterface[];
}

interface USBInterface {
  interfaceNumber: number;
  alternate: USBAlternateInterface;
}

interface USBAlternateInterface {
  alternateSetting: number;
  endpoints: USBEndpoint[];
}

interface USBEndpoint {
  endpointNumber: number;
  direction: "in" | "out";
  type: "bulk" | "interrupt" | "isochronous";
}

interface USBControlTransferParameters {
  requestType: "standard" | "class" | "vendor";
  recipient: "device" | "interface" | "endpoint" | "other";
  request: number;
  value: number;
  index: number;
}

interface USBInTransferResult {
  data?: DataView;
  status: "ok" | "stall" | "babble";
}

interface USBOutTransferResult {
  bytesWritten: number;
  status: "ok" | "stall";
}

interface Navigator {
  usb: {
    requestDevice(options: { filters: { vendorId?: number; productId?: number }[] }): Promise<USBDevice>;
  };
}

interface CCDebuggerInfo {
  chipId: number;
  fwVersion: number;
  fwRevision: number;
}

export enum VerifyMethod {
  BY_READ = "read",
  BY_CRC = "crc",
}

export enum WriteMethod {
  FAST = "fast",
  SLOW = "slow",
}

export class CCDebugger {
  public device: USBDevice | null = null;
  private interfaceNumber = 0;
  private endpointIn: USBEndpoint | null = null;
  private endpointOut: USBEndpoint | null = null;

  // CC Debugger Vendor ID and Product ID
  private static readonly VID_CC = 0x0451;
  private static readonly PID_CC = 0x16a2;

  private static readonly VID_RF = 0x11a0;
  private static readonly PID_RF = 0xeb20;

  // Control Requests (from cc-tool)
  private static readonly REQ_GET_STATE = 0xc0;
  private static readonly REQ_SET_SPEED = 0xcf;
  private static readonly REQ_PREPARE_DEBUG_MODE = 0xc5; // Prepare for debug mode
  private static readonly REQ_SET_CHIP_INFO = 0xc8; // Set chip info (string)
  private static readonly REQ_RESET = 0xc9; // Reset target

  // Debug Commands (CC Debugger Protocol Wrappers inferred from cc-tool)
  private static readonly CMD_EXEC_3BYTE = 0xbe; // Execute 3-byte instruction (e.g. MOV DPTR, #data16)
  private static readonly CMD_EXEC_2BYTE = 0x8e; // Execute 2-byte instruction (e.g. MOV A, #data)
  private static readonly CMD_EXEC_2BYTE_READ = 0x8f; // Execute 2-byte instruction and read result (e.g. MOV A, direct)
  private static readonly CMD_EXEC_1BYTE = 0x5e; // Execute 1-byte instruction (e.g. MOV @DPTR, A)
  private static readonly CMD_EXEC_1BYTE_READ = 0x4e; // Execute 1-byte instruction and read result (e.g. MOVX A, @DPTR)

  // 8051 Opcodes
  private static readonly ASM_MOV_DPTR_IMM16 = 0x90; // MOV DPTR, #data16
  private static readonly ASM_MOV_A_IMM8 = 0x74; // MOV A, #data8
  private static readonly ASM_MOVX_A_AT_DPTR = 0xe0; // MOVX A, @DPTR
  private static readonly ASM_MOVX_AT_DPTR_A = 0xf0; // MOVX @DPTR, A
  private static readonly ASM_INC_DPTR = 0xa3; // INC DPTR
  private static readonly ASM_MOV_DIRECT_IMM = 0x75; // MOV direct, #data
  private static readonly ASM_MOV_A_DIRECT = 0xe5; // MOV A, direct

  // SFR Addresses (NOT USED for flash - use XDATA instead!)
  // These are kept for reference only

  // XDATA Addresses for Flash Control Registers (from cc-tool)
  private static readonly XREG_FWDATA = 0x6273;
  private static readonly XREG_FCTL = 0x6270;
  private static readonly XREG_FADDRL = 0x6271;
  private static readonly XREG_FADDRH = 0x6272;
  private static readonly XREG_DMA0CFGH = 0x70d5;
  private static readonly XREG_DMA0CFGL = 0x70d4;
  private static readonly XREG_DMAARM = 0x70d6;
  private static readonly XREG_DMAREQ = 0x70d7;
  private static readonly XREG_DMAIRQ = 0x70d1;
  private static readonly XREG_RNDL = 0x70bc;
  private static readonly XREG_RNDH = 0x70bd;
  private static readonly XREG_MEMCTR = 0x70c7;

  // RAM Addresses for DMA (from cc-tool)
  private static readonly ADDR_DMA_DESC = 0x0f00;
  private static readonly ADDR_BUFFER = 0x0000; // NOT 0x1000!

  // CRC Verification Constants
  private static readonly VERIFY_BLOCK_SIZE = 1024;
  private static readonly XBANK_OFFSET = 0x8000;
  private static readonly FLASH_BANK_SIZE = 32768; // 32KB bank size

  // Debug Interface Commands (TI AN118)
  private static readonly DEBUG_CMD_CHIP_ERASE = 0x14;
  private static readonly DEBUG_CMD_WR_CONFIG = 0x1d;
  private static readonly DEBUG_CMD_READ_STATUS = 0x34; // Fixed: 0x34 (was 0x30)
  private static readonly DEBUG_CMD_DEBUG_INSTR_1 = 0x55; // Execute 1 byte
  private static readonly DEBUG_CMD_DEBUG_INSTR_2 = 0x56; // Execute 2 bytes
  private static readonly DEBUG_CMD_DEBUG_INSTR_3 = 0x57; // Execute 3 bytes

  // Debug Command Wrappers (for Debug Commands, not Instructions)
  private static readonly WRAPPER_DEBUG_EXEC = 0x1c; // Execute Debug Command (no return)
  private static readonly WRAPPER_DEBUG_EXEC_READ = 0x1f; // Execute Debug Command and Read 1 byte
  private static readonly WRAPPER_DEBUG_EXEC_ARG = 0x4c; // Execute Debug Command with 1 byte argument

  // Footer sent after XDATA operations (from cc-tool)
  private static readonly CMD_FOOTER = new Uint8Array([0xd4, 0x57, 0x90, 0xc2, 0x57, 0x75, 0x92, 0x90, 0x56, 0x74]);

  // CC2530 XDATA Addresses
  private static readonly ADDR_INFO_PAGE = 0x7800;
  private static readonly ADDR_IEEE_PRIMARY = 0x780c; // Primary IEEE address

  // Header sent before XDATA operations (from cc-tool)
  // 0x40: ?
  // 0x55 0x00: DEBUG_INSTR_1 NOP
  // 0x72: ?
  // 0x56 0xE5 0x92: DEBUG_INSTR_2 MOV A, DPS (0x92)
  // 0xBE 0x57 0x75 0x92 0x00: CMD_EXEC_3BYTE DEBUG_INSTR_3 MOV DPS, #00
  // 0x74: ?
  // 0x56 0xE5 0x83: DEBUG_INSTR_2 MOV A, DPH (0x83)
  // 0x76: ?
  // 0x56 0xE5 0x82: DEBUG_INSTR_2 MOV A, DPL (0x82)
  private static readonly CMD_HEADER = new Uint8Array([
    0x40, 0x55, 0x00, 0x72, 0x56, 0xe5, 0x92, 0xbe, 0x57, 0x75, 0x92, 0x00, 0x74, 0x56, 0xe5, 0x83, 0x76, 0x56, 0xe5,
    0x82,
  ]);

  // private logger: (msg: string) => void = log;
  private logger: (msg: string) => void = () => {};
  private progressCallback: (percent: number, msg: string) => void = () => {};
  private initialized = false;
  private debugLogging = false;

  constructor() {}

  public setLogger(logger: (msg: string) => void) {
    this.logger = logger;
  }

  public setProgressCallback(cb: (percent: number, msg: string) => void) {
    this.progressCallback = cb;
  }

  public setDebugLogging(enabled: boolean) {
    this.debugLogging = enabled;
  }

  private logTX(data: Uint8Array | number[], label: string = "") {
    if (!this.debugLogging) return;
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ");
    this.logger(`TX ${label}(${bytes.length}): ${hex}`);
  }

  private logRX(data: DataView, label: string = "") {
    if (!this.debugLogging) return;
    const hex = Array.from(new Uint8Array(data.buffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ");
    this.logger(`RX ${label}(${data.byteLength}): ${hex}`);
  }

  public async connect(): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.device = await (navigator as any).usb.requestDevice({
        filters: [
          { vendorId: CCDebugger.VID_CC, productId: CCDebugger.PID_CC },
          { vendorId: CCDebugger.VID_RF, productId: CCDebugger.PID_RF },
        ],
      });

      if (!this.device) throw new Error("Device not selected");

      await this.device.open();
      await this.device.selectConfiguration(1);

      // Find interface and endpoints
      const interface0 = this.device.configuration?.interfaces[0];
      if (!interface0) throw new Error("Interface 0 not found");
      this.interfaceNumber = interface0.interfaceNumber;

      await this.device.claimInterface(this.interfaceNumber);

      // Find Bulk endpoints (endpoint 4 for both IN and OUT)
      for (const ep of interface0.alternate.endpoints) {
        if (ep.type === "bulk" && ep.endpointNumber === 4) {
          if (ep.direction === "in") {
            this.endpointIn = ep;
          } else if (ep.direction === "out") {
            this.endpointOut = ep;
          }
        }
      }

      if (!this.endpointIn || !this.endpointOut) {
        throw new Error("Bulk endpoints not found");
      }

      this.logger(
        "Connected to " +
          this.device.productName +
          " by " +
          this.device.manufacturerName +
          " (SN: " +
          this.device.serialNumber +
          ")"
      );

      // deviceNameSpan.textContent = this.device.productName || "-";
      // manufacturerNameSpan.textContent = this.device.manufacturerName || "-";
      // serialNumberSpan.textContent = this.device.serialNumber || "-";
    } catch (error) {
      console.error("Connection failed:", error);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    if (this.device) {
      await this.device.close();
      this.device = null;
    }
  }

  public isConnected(): boolean {
    return this.device !== null && this.device.opened;
  }

  public async setSpeed(fast: boolean): Promise<void> {
    if (!this.device) throw new Error("Device not connected 1");

    // USB_SET_DEBUG_INTERFACE_SPEED (0xCF)
    // Value: 0 = Fast, 1 = Slow
    await this.controlTransferOut(CCDebugger.REQ_SET_SPEED, fast ? 0 : 1, 0);
  }

  private async controlTransferOut(request: number, value: number, index: number, data?: Uint8Array): Promise<void> {
    if (!this.device) throw new Error("Device not connected 2");
    // let msg = `TX Control: Req=0x${request.toString(16)} Val=${value} Idx=${index}`;
    // if (data) {
    //   msg += ` Data=${Array.from(data)
    //     .map((b) => b.toString(16).padStart(2, "0"))
    //     .join(" ")}`;
    // }
    // this.logger(msg);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await this.device.controlTransferOut(
      {
        requestType: "vendor",
        recipient: "device",
        request: request,
        value: value,
        index: index,
      },
      data as any
    );

    // Log the result status
    if (result.status !== "ok") {
      this.logger(`Control transfer OUT failed: ${result.status}`);
      throw new Error(`Control transfer OUT failed: ${result.status}`);
    }
  }

  private async controlTransferIn(request: number, value: number, index: number, length: number): Promise<DataView> {
    if (!this.device) throw new Error("Device not connected 3");
    // this.logger(`TX Control: Req=0x${request.toString(16)} Val=${value} Idx=${index} Len=${length}`);
    const result = await this.device.controlTransferIn(
      {
        requestType: "vendor",
        recipient: "device",
        request: request,
        value: value,
        index: index,
      },
      length
    );

    if (result.status !== "ok" || !result.data) {
      throw new Error(`Control transfer failed: ${result.status}`);
    }

    this.logRX(result.data, "Control");
    return result.data;
  }

  public async getDeviceInfo(): Promise<CCDebuggerInfo> {
    if (!this.device) throw new Error("Device not connected 4");

    // USB_REQUEST_GET_STATE (0xC0)
    const result = await this.controlTransferIn(CCDebugger.REQ_GET_STATE, 0, 0, 8);

    const view = new DataView(result.buffer);
    const chipId = view.getUint16(0, true); // Little endian
    const fwVersion = view.getUint16(2, true);
    const fwRevision = view.getUint16(4, true);

    return { chipId, fwVersion, fwRevision };
  }

  // Prepare debug mode - sends chip name and debugger ID to CC Debugger
  private async prepareDebugMode(): Promise<void> {
    if (!this.device) throw new Error("Device not connected 5");

    // First: USB_PREPARE_DEBUG_MODE (0xC5)
    await this.controlTransferOut(CCDebugger.REQ_PREPARE_DEBUG_MODE, 0, 0);

    // Second: USB_SET_CHIP_INFO (0xC8) with chip name and debugger ID
    // Buffer size: 0x30 for TI protocol
    const commandSize = 0x30;
    const command = new Uint8Array(commandSize);
    command.fill(0x20); // Fill with spaces

    // Get target chip info from GET_STATE
    const info = await this.getDeviceInfo();

    // Format chip name from target chip ID
    const chipName =
      "CC" +
      ((info.chipId >> 8) & 0xff).toString(16).padStart(2, "0").toUpperCase() +
      (info.chipId & 0xff).toString(16).padStart(2, "0").toUpperCase();
    const chipNameBytes = new TextEncoder().encode(chipName);
    command.set(chipNameBytes, 0x00);

    // Copy "DID:" at offset 0x10
    const didLabel = new TextEncoder().encode("DID:");
    command.set(didLabel, 0x10);

    // Debugger ID should come from bcdDevice (device descriptor)
    // From GET_STATE response bytes [2-3]: fwVersion (which is actually from bcdDevice)
    // Format: high byte, low byte in hex
    const did =
      ((info.fwVersion >> 8) & 0xff).toString(16).padStart(2, "0").toUpperCase() +
      (info.fwVersion & 0xff).toString(16).padStart(2, "0").toUpperCase();
    const didBytes = new TextEncoder().encode(did);
    command.set(didBytes, 0x15);

    // this.logger(`Sending chip info: ${chipName}, DID: ${did}`);
    await this.controlTransferOut(CCDebugger.REQ_SET_CHIP_INFO, 1, 0, command);
  }

  // Initialize debug interface
  private async initDebugInterface(): Promise<void> {
    if (!this.device) throw new Error("Device not connected 6");

    this.logger("Initializing debug interface...");

    await this.prepareDebugMode();
    await this.reset();

    // Wait
    await new Promise((resolve) => setTimeout(resolve, 1000));

    try {
      await this.sendDebugInstructions(
        new Uint8Array([CCDebugger.WRAPPER_DEBUG_EXEC_READ, CCDebugger.DEBUG_CMD_READ_STATUS])
      );
      const statusData = await this.readBulkData(1);

      // Configure (DEBUG_CONFIG_TIMER_SUSPEND | DEBUG_CONFIG_SOFT_POWER_MODE = 0x02 | 0x20 = 0x22)
      await this.sendDebugInstructions(
        new Uint8Array([CCDebugger.WRAPPER_DEBUG_EXEC_ARG, CCDebugger.DEBUG_CMD_WR_CONFIG, 0x22])
      );

      this.initialized = true;
      this.logger("Initialized successfully WITH reset");
    } catch (e) {
      this.logger(`FAILED even with reset: ${e}`);
      throw new Error(`Cannot establish bulk communication: ${e}`);
    }
  }

  // Helper to execute a sequence of debug instructions via Bulk OUT
  private async sendDebugInstructions(instructions: Uint8Array): Promise<void> {
    if (!this.device || !this.endpointOut) throw new Error("Device not connected 7");

    this.logTX(instructions);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await this.device.transferOut(this.endpointOut.endpointNumber, instructions as any);
    // this.logger(`Bulk OUT result: status=${result.status}, bytesWritten=${result.bytesWritten}`);

    if (result.status !== "ok") {
      throw new Error(`Bulk OUT failed: ${result.status}`);
    }
  }

  // Send raw data directly to bulk endpoint (for special commands like 0xEE)
  private async sendRawData(data: Uint8Array): Promise<void> {
    if (!this.device || !this.endpointOut) throw new Error("Device not connected 8");

    this.logTX(data, "(RAW)");
    // this.logger(`Raw Bulk OUT to endpoint ${this.endpointOut.endpointNumber}`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await this.device.transferOut(this.endpointOut.endpointNumber, data as any);
    // this.logger(`Raw Bulk OUT result: status=${result.status}, bytesWritten=${result.bytesWritten}`);

    if (result.status !== "ok") {
      throw new Error(`Raw Bulk OUT failed: ${result.status}`);
    }
  }

  // Helper to read data via Bulk IN
  private async readBulkData(length: number): Promise<DataView> {
    if (!this.device || !this.endpointIn) throw new Error("Device not connected 9");

    // this.logger(`Attempting Bulk IN from endpoint ${this.endpointIn.endpointNumber}, length=${length}`);

    // Add timeout to prevent hanging - increased to 10 seconds for first read after reset
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Bulk read timed out")), 10000)
    );

    const transferPromise = this.device.transferIn(this.endpointIn.endpointNumber, length);

    const result = await Promise.race([transferPromise, timeoutPromise]);

    // this.logger(`Bulk IN result: status=${result.status}`);

    if (result.status !== "ok" || !result.data) throw new Error("Bulk read failed");

    if (result.data.byteLength === 0 && length > 0) {
      this.logger("Error: Bulk read returned 0 bytes");
      throw new Error("Bulk read returned 0 bytes");
    }

    this.logRX(result.data);

    return result.data;
  }

  public async readXData(address: number, length: number): Promise<Uint8Array> {
    // Ensure debug interface is initialized
    if (!this.initialized) await this.initDebugInterface();

    const result = new Uint8Array(length);
    const chunkSize = 512;

    for (let i = 0; i < length; i += chunkSize) {
      const currentChunkSize = Math.min(chunkSize, length - i);
      const currentAddress = address + i;

      const cmdBuffer: number[] = [];

      // Append Header
      CCDebugger.CMD_HEADER.forEach((b) => cmdBuffer.push(b));

      // Load DPTR
      // 0xBE: CMD_EXEC_3BYTE
      // 0x57: DEBUG_INSTR_3
      // 0x90: MOV DPTR, #data16
      cmdBuffer.push(
        CCDebugger.CMD_EXEC_3BYTE,
        CCDebugger.DEBUG_CMD_DEBUG_INSTR_3,
        CCDebugger.ASM_MOV_DPTR_IMM16,
        (currentAddress >> 8) & 0xff,
        currentAddress & 0xff
      );

      for (let j = 0; j < currentChunkSize; j++) {
        let cmd = CCDebugger.CMD_EXEC_1BYTE_READ;
        // Flush buffer on last item or every 64th item
        if (j === currentChunkSize - 1 || (j + 1) % 64 === 0) {
          cmd |= 1;
        }

        cmdBuffer.push(cmd, CCDebugger.DEBUG_CMD_DEBUG_INSTR_1, CCDebugger.ASM_MOVX_A_AT_DPTR);
        cmdBuffer.push(CCDebugger.CMD_EXEC_1BYTE, CCDebugger.DEBUG_CMD_DEBUG_INSTR_1, CCDebugger.ASM_INC_DPTR);
      }

      // Append Footer
      CCDebugger.CMD_FOOTER.forEach((b) => cmdBuffer.push(b));

      await this.sendDebugInstructions(new Uint8Array(cmdBuffer));
      const data = await this.readBulkData(currentChunkSize);
      for (let j = 0; j < currentChunkSize; j++) {
        result[i + j] = data.getUint8(j);
      }
    }

    return result;
  }

  public async writeXData(address: number, data: Uint8Array, silent = false): Promise<void> {
    if (!this.initialized) await this.initDebugInterface();

    const chunkSize = 512;
    for (let i = 0; i < data.length; i += chunkSize) {
      if (!silent) {
        const percent = Math.round((i / data.length) * 100);
        this.progressCallback(percent, `Writing XDATA... ${percent}%`);
      }

      const currentChunkSize = Math.min(chunkSize, data.length - i);
      const currentAddress = address + i;

      const cmdBuffer: number[] = [];

      // Append Header
      CCDebugger.CMD_HEADER.forEach((b) => cmdBuffer.push(b));

      // Load DPTR
      cmdBuffer.push(
        CCDebugger.CMD_EXEC_3BYTE,
        CCDebugger.DEBUG_CMD_DEBUG_INSTR_3,
        CCDebugger.ASM_MOV_DPTR_IMM16,
        (currentAddress >> 8) & 0xff,
        currentAddress & 0xff
      );

      for (let j = 0; j < currentChunkSize; j++) {
        const byte = data[i + j];
        cmdBuffer.push(CCDebugger.CMD_EXEC_2BYTE, CCDebugger.DEBUG_CMD_DEBUG_INSTR_2, CCDebugger.ASM_MOV_A_IMM8, byte);
        cmdBuffer.push(CCDebugger.CMD_EXEC_1BYTE, CCDebugger.DEBUG_CMD_DEBUG_INSTR_1, CCDebugger.ASM_MOVX_AT_DPTR_A);
        cmdBuffer.push(CCDebugger.CMD_EXEC_1BYTE, CCDebugger.DEBUG_CMD_DEBUG_INSTR_1, CCDebugger.ASM_INC_DPTR);
      }

      // Append Footer
      CCDebugger.CMD_FOOTER.forEach((b) => cmdBuffer.push(b));

      await this.sendDebugInstructions(new Uint8Array(cmdBuffer));
    }
  }

  public async readIEEEAddress(): Promise<string> {
    if (!this.initialized) await this.initDebugInterface();

    // Read 8 bytes from Info Page (0x780C)
    const ieeeBytes = await this.readXData(CCDebugger.ADDR_IEEE_PRIMARY, 8);

    // Convert to hex string (Big Endian display - reverse the bytes)
    const ieee = Array.from(ieeeBytes)
      .reverse()
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(":");

    // this.logger(
    //   `IEEE raw bytes: ${Array.from(ieeeBytes)
    //     .map((b) => b.toString(16).padStart(2, "0"))
    //     .join(" ")}`
    // );
    return ieee;
  }

  public async chipErase(): Promise<void> {
    if (!this.device) throw new Error("Device not connected 10");
    if (!this.initialized) await this.initDebugInterface();

    this.progressCallback(0, "Erasing chip...");

    // Send CHIP_ERASE command (0x14) wrapped in 0x1C
    await this.sendDebugInstructions(new Uint8Array([CCDebugger.WRAPPER_DEBUG_EXEC, CCDebugger.DEBUG_CMD_CHIP_ERASE]));

    // Wait for erase to complete by polling status (like cc-tool)
    const MAX_ERASE_TIME = 8000; // 8 seconds
    const startTime = Date.now();
    let erased = false;

    while (Date.now() - startTime < MAX_ERASE_TIME) {
      // Check status
      // 0x1F, 0x34 (READ_STATUS)
      await this.sendDebugInstructions(
        new Uint8Array([CCDebugger.WRAPPER_DEBUG_EXEC_READ, CCDebugger.DEBUG_CMD_READ_STATUS])
      );
      const statusData = await this.readBulkData(1);
      const status = statusData.getUint8(0);

      // DEBUG_STATUS_CHIP_ERASE_BUSY = 0x80
      if (!(status & 0x80)) {
        erased = true;
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
      this.progressCallback(0, "Erasing...");
    }

    if (!erased) {
      throw new Error("Chip erase timed out");
    }

    this.progressCallback(100, "Erase complete");

    // After erase, chip needs re-initialization
    this.initialized = false;
  }

  public async reset(debugMode = true): Promise<void> {
    if (!this.device) throw new Error("Device not connected 11");

    this.logger(`Resetting target to ${debugMode ? "Debug" : "Normal"} mode...`);
    // USB_REQUEST_RESET (0xC9)
    // Index: 1 = Debug Mode, 0 = Normal Mode
    await this.controlTransferOut(CCDebugger.REQ_RESET, 0, debugMode ? 1 : 0);

    await new Promise((resolve) => setTimeout(resolve, 100));
    this.initialized = false;
  }

  private async writeSfr(address: number, value: number): Promise<void> {
    // MOV direct, #data
    // 0xBE: CMD_EXEC_3BYTE
    // 0x57: DEBUG_INSTR_3
    // 0x75: MOV direct, #data
    const command: number[] = [];

    // Short header (from cc-tool write_sfr)
    command.push(0x40, 0x55, 0x00);

    command.push(
      CCDebugger.CMD_EXEC_3BYTE,
      CCDebugger.DEBUG_CMD_DEBUG_INSTR_3,
      CCDebugger.ASM_MOV_DIRECT_IMM,
      address,
      value
    );

    // Short footer (from cc-tool write_sfr)
    command.push(0x90, 0x56, 0x74);

    await this.sendDebugInstructions(new Uint8Array(command));
  }

  private async readSfr(address: number): Promise<number> {
    // From cc-tool: uses SHORT header (3 bytes) + 0x7F command + SHORT footer (3 bytes)
    // NOT the full XDATA header/footer!
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const command: number[] = [];

        // Short header (from cc-tool read_sfr)
        command.push(0x40, 0x55, 0x00);

        // MOV A, direct with read
        // 0x7F: Read SFR command (from cc-tool)
        // 0x56: DEBUG_INSTR_2
        // 0xE5: MOV A, direct
        command.push(0x7f, 0x56, 0xe5, address);

        // Short footer (from cc-tool read_sfr)
        command.push(0x90, 0x56, 0x74);

        await this.sendDebugInstructions(new Uint8Array(command));
        const data = await this.readBulkData(1);
        if (data.byteLength < 1) {
          throw new Error("Bulk read returned 0 bytes");
        }
        return data.getUint8(0);
      } catch (e) {
        if (attempt < 3) {
          this.logger(`readSfr(0x${address.toString(16)}) attempt ${attempt} failed: ${e}. Retrying...`);
          await new Promise((resolve) => setTimeout(resolve, 100));
        } else {
          throw e;
        }
      }
    }
    throw new Error("readSfr failed after retries");
  }

  // Fast flash write for CC2530 (like cc-tool)
  // Uses 4 DMA channels with double buffering
  private async writeFlashBlockFast(data: Uint8Array, wordAddress: number): Promise<void> {
    // Buffers (from cc-tool)
    const ADDR_BUF0 = 0x0000; // 1K buffer
    const ADDR_BUF1 = 0x0400; // 1K buffer
    const ADDR_DMA_DESC = 0x0800; // 32 bytes

    // DMA Channels (from cc-tool)
    const CH_DBG_TO_BUF0 = 0x02;
    const CH_DBG_TO_BUF1 = 0x04;
    const CH_BUF0_TO_FLASH = 0x08;
    const CH_BUF1_TO_FLASH = 0x10;

    const PROG_BLOCK_SIZE = 1024;

    // DMA descriptors (exactly like cc-tool)
    const dmaDesc = new Uint8Array([
      // Debug Interface -> Buffer 0 (Channel 1)
      0x62,
      0x60, // XREG_DBGDATA src[15:8], src[7:0]
      0x00,
      0x00, // ADDR_BUF0 dest[15:8], dest[7:0]
      0x04,
      0x00, // PROG_BLOCK_SIZE[15:8], PROG_BLOCK_SIZE[7:0]
      31, // trigger DBG_BW
      0x11, // increment destination

      // Debug Interface -> Buffer 1 (Channel 2)
      0x62,
      0x60, // XREG_DBGDATA src[15:8], src[7:0]
      0x04,
      0x00, // ADDR_BUF1 dest[15:8], dest[7:0]
      0x04,
      0x00, // PROG_BLOCK_SIZE[15:8], PROG_BLOCK_SIZE[7:0]
      31, // trigger DBG_BW
      0x11, // increment destination

      // Buffer 0 -> Flash controller (Channel 3)
      0x00,
      0x00, // ADDR_BUF0 src[15:8], src[7:0]
      0x62,
      0x73, // XREG_FWDATA dest[15:8], dest[7:0]
      0x04,
      0x00, // PROG_BLOCK_SIZE[15:8], PROG_BLOCK_SIZE[7:0]
      18, // trigger FLASH
      0x42, // increment source

      // Buffer 1 -> Flash controller (Channel 4)
      0x04,
      0x00, // ADDR_BUF1 src[15:8], src[7:0]
      0x62,
      0x73, // XREG_FWDATA dest[15:8], dest[7:0]
      0x04,
      0x00, // PROG_BLOCK_SIZE[15:8], PROG_BLOCK_SIZE[7:0]
      18, // trigger FLASH
      0x42, // increment source
    ]);

    // Load DMA descriptors
    await this.writeXData(ADDR_DMA_DESC, dmaDesc, true);

    // Set DMA descriptors pointer
    await this.writeXData(0x70d2, new Uint8Array([ADDR_DMA_DESC & 0xff]), true); // XREG_DMA1CFGL
    await this.writeXData(0x70d3, new Uint8Array([(ADDR_DMA_DESC >> 8) & 0xff]), true); // XREG_DMA1CFGH

    // Set initial FADDR
    let currentWordAddr = wordAddress;
    await this.writeXData(CCDebugger.XREG_FADDRL, new Uint8Array([currentWordAddr & 0xff]), true);
    await this.writeXData(CCDebugger.XREG_FADDRH, new Uint8Array([(currentWordAddr >> 8) & 0xff]), true);

    // Pad data to block size (like cc-tool)
    const paddedLength = Math.ceil(data.length / PROG_BLOCK_SIZE) * PROG_BLOCK_SIZE;
    const paddedData = new Uint8Array(paddedLength);
    paddedData.set(data);
    paddedData.fill(0xff, data.length); // Fill with 0xFF like cc-tool

    let dbgArm: number, flashArm: number;
    for (let i = 0; i < paddedData.length / PROG_BLOCK_SIZE; i++) {
      // Note: We do NOT skip empty blocks in Fast Write mode (unlike Slow Write).
      // cc-tool does not skip them either. This ensures the DMA pipeline (double buffering)
      // stays synchronized and FADDR auto-increments correctly.
      // Skipping blocks would require waiting for the previous write to finish and
      // manually updating FADDR, which breaks the pipeline efficiency and can cause race conditions.

      // Alternate buffers
      if ((i & 0x01) === 0) {
        dbgArm = CH_DBG_TO_BUF0;
        flashArm = CH_BUF0_TO_FLASH;
      } else {
        dbgArm = CH_DBG_TO_BUF1;
        flashArm = CH_BUF1_TO_FLASH;
      }

      // Arm debug transfer
      await this.writeXData(0x70d6, new Uint8Array([dbgArm]), true); // XREG_DMAARM

      // Send data via special 0xEE command (from cc-tool) - RAW, no header/footer!
      const command = new Uint8Array(PROG_BLOCK_SIZE + 3);
      command[0] = 0xee; // Special debug write command
      command[1] = 0x84; // ?
      command[2] = 0x00; // ?
      command.set(paddedData.slice(i * PROG_BLOCK_SIZE, (i + 1) * PROG_BLOCK_SIZE), 3);

      await this.sendRawData(command);

      // Wait for debug transfer to complete
      // This effectively waits for the PREVIOUS flash write to finish (if any)
      let fctl: number;
      do {
        const fctlData = await this.readXData(CCDebugger.XREG_FCTL, 1);
        fctl = fctlData[0];
      } while (fctl & 0x80); // BUSY bit

      // Arm flash transfer
      await this.writeXData(0x70d6, new Uint8Array([flashArm]), true); // XREG_DMAARM

      // Trigger flash write
      await this.writeXData(CCDebugger.XREG_FCTL, new Uint8Array([0x06]), true); // FCTL_WRITE

      this.progressCallback(
        Math.min(100, Math.round((((i + 1) * PROG_BLOCK_SIZE) / paddedData.length) * 100)),
        `Writing... ${Math.min(100, Math.round((((i + 1) * PROG_BLOCK_SIZE) / paddedData.length) * 100))}%`
      );
    }

    // Wait for last transfer
    let fctl: number;
    do {
      const fctlData = await this.readXData(CCDebugger.XREG_FCTL, 1);
      fctl = fctlData[0];
    } while (fctl & 0x80); // BUSY bit

    // Note: We do NOT reset here. cc-tool does not reset after flash write.
    // The caller (UI) should handle the reset to Normal Mode.
  }

  // Slow flash write for CC254x (like cc-tool write_flash_slow)
  private async writeFlashBlockSlow(
    data: Uint8Array,
    startAddress: number,
    progressStart: number = 0,
    progressEnd: number = 100
  ): Promise<void> {
    // Use DMA for writing (single channel)
    // Max DMA length is 8KB (13 bits).
    // Use 512 bytes blocks for CC254x small units (limited RAM)
    const blockSize = 512;
    const ADDR_DMA_DESC_SLOW = 0x0200; // Fits in 1KB RAM with 512b buffer

    // Pad data to block size (like cc-tool)
    const paddedLength = Math.ceil(data.length / blockSize) * blockSize;
    const paddedData = new Uint8Array(paddedLength);
    paddedData.set(data);
    paddedData.fill(0xff, data.length);

    // 1. Create DMA Descriptor (EXACT format from cc-tool!)
    // SRCADDR: ADDR_BUFFER (0x0000)
    // DESTADDR: FWDATA (0x6273)
    // LEN: blockSize (512)
    // TRIG: 18 (FLASH)
    // SRCINC: 1
    // DESTINC: 0
    // WORDSIZE: 0 (8 bits)
    // TMODE: 0 (Single)
    // VLEN: 0 (Use LENH/LENL directly)
    // PRI: 0 (Normal)
    // IRQMASK: 0
    // M8: 0

    const len = blockSize;
    const src = CCDebugger.ADDR_BUFFER; // 0x0000 from cc-tool!
    const dest = 0x6273; // FWDATA

    // Exact cc-tool DMA descriptor format (8 bytes)
    const dmaDesc = new Uint8Array([
      (src >> 8) & 0xff, // SRCADDR[15:8]
      src & 0xff, // SRCADDR[7:0]
      (dest >> 8) & 0xff, // DESTADDR[15:8]
      dest & 0xff, // DESTADDR[7:0]
      (len >> 8) & 0xff, // LEN[15:8] (no VLEN bit!)
      len & 0xff, // LEN[7:0]
      18, // TRIG=18 (FLASH)
      0x42, // SRCINC=1, DESTINC=0, PRI=0
    ]);

    // 2. Write DMA Descriptor to XDATA (ONCE outside loop)
    await this.writeXData(ADDR_DMA_DESC_SLOW, dmaDesc, true);

    // 3. Set DMA0CFG to point to descriptor (ONCE outside loop)
    await this.writeXData(CCDebugger.XREG_DMA0CFGH, new Uint8Array([(ADDR_DMA_DESC_SLOW >> 8) & 0xff]), true);
    await this.writeXData(CCDebugger.XREG_DMA0CFGL, new Uint8Array([ADDR_DMA_DESC_SLOW & 0xff]), true);

    for (let i = 0; i < paddedData.length; i += blockSize) {
      const localPercent = i / paddedData.length;
      const percent = Math.round(progressStart + localPercent * (progressEnd - progressStart));
      this.progressCallback(percent, `Writing... ${percent}%`);

      const chunk = paddedData.slice(i, i + blockSize);

      // Check for empty block (like cc-tool)
      let isEmpty = true;
      for (let j = 0; j < chunk.length; j++) {
        if (chunk[j] !== 0xff) {
          isEmpty = false;
          break;
        }
      }

      if (isEmpty) {
        //this.progressCallback(percent, `Skipping empty block (Slow)... ${percent}%`);
        this.logger(`Skipping empty block at offset 0x${(startAddress + i).toString(16)} (Slow Write)`);
        continue;
      }

      // Update FADDR for current block (word address) - use XDATA not SFR!
      // Always set address for each block (don't assume sequential)
      const currentWordAddr = (startAddress + i) / 4;
      await this.writeXData(CCDebugger.XREG_FADDRL, new Uint8Array([currentWordAddr & 0xff]), true);
      await this.writeXData(CCDebugger.XREG_FADDRH, new Uint8Array([(currentWordAddr >> 8) & 0xff]), true);

      try {
        // 4. Write data to XDATA buffer
        await this.writeXData(CCDebugger.ADDR_BUFFER, chunk, true);

        // 5. Arm DMA Channel 0 - use XDATA not SFR!
        await this.writeXData(CCDebugger.XREG_DMAARM, new Uint8Array([0x01]), true);

        // 6. Set FCTL.WRITE (0x06 for CC2530, not 0x02!) - use XDATA not SFR!
        // From cc-tool: reg_info.fctl_write = 0x06
        await this.writeXData(CCDebugger.XREG_FCTL, new Uint8Array([0x06]), true);

        // 7. Wait for completion - poll FCTL BUSY bit using XDATA
        let busy = true;
        let retries = 0;
        while (busy && retries < 500) {
          const fctlData = await this.readXData(CCDebugger.XREG_FCTL, 1);
          const fctl = fctlData[0];
          if (!(fctl & 0x80)) {
            // BUSY bit cleared
            busy = false;
          } else {
            retries++;
          }
        }

        if (busy) {
          throw new Error(`Flash write timed out (DMA) at block ${i}`);
        }
      } catch (e) {
        this.logger(`Failed to write block at offset ${i} (0x${i.toString(16)}): ${e}`);
        throw e;
      }
    }
  }

  // Flash read functions (for verify)
  private async flashReadStart(): Promise<void> {
    if (!this.device) throw new Error("Device not connected 12");

    // USB_PREPARE (0xC6) - prepare for flash read
    await this.controlTransferIn(0xc6, 0, 0, 1);

    // Send header to set up flash reading
    const header = new Uint8Array([
      0x40, 0x55, 0x00, 0x72, 0x56, 0xe5, 0xd0, 0x74, 0x56, 0xe5, 0x92, 0xbe, 0x57, 0x75, 0x92, 0x00, 0x76, 0x56, 0xe5,
      0x83, 0x78, 0x56, 0xe5, 0x82, 0x7a, 0x56, 0xe5, 0x9f,
    ]);
    await this.sendRawData(header);
  }

  private async flashReadEnd(): Promise<void> {
    const command = new Uint8Array([
      0xca, 0x57, 0x75, 0x9f, 0xd6, 0x57, 0x90, 0xc4, 0x57, 0x75, 0x92, 0xc2, 0x57, 0x75, 0xd0, 0x90, 0x56, 0x74,
    ]);
    await this.sendRawData(command);
  }

  private createReadProc(count: number): Uint8Array {
    const clr_a = new Uint8Array([0x5e, 0x55, 0xe4]);
    const mov_c_a_dptr_a = new Uint8Array([0x4e, 0x55, 0x93]);
    const inc_dptr = new Uint8Array([0x5e, 0x55, 0xa3]);

    const proc: number[] = [];
    for (let i = 0; i < count; i++) {
      proc.push(...clr_a);
      if ((i + 1) % 64 === 0 || i === count - 1) {
        mov_c_a_dptr_a[0] |= 0x01;
      }
      proc.push(...mov_c_a_dptr_a);
      mov_c_a_dptr_a[0] &= ~0x01;
      proc.push(...inc_dptr);
    }
    return new Uint8Array(proc);
  }

  private async flashReadNear(address: number, size: number): Promise<Uint8Array> {
    const FLASH_READ_CHUNK_SIZE = 128;
    const data: number[] = [];

    // Load DPTR (Data Pointer)
    const load_dtpr = new Uint8Array([0xbe, 0x57, 0x90, (address >> 8) & 0xff, address & 0xff]);
    await this.sendRawData(load_dtpr);

    // Read in chunks
    for (let i = 0; i < Math.floor(size / FLASH_READ_CHUNK_SIZE); i++) {
      const command = this.createReadProc(FLASH_READ_CHUNK_SIZE);
      await this.sendRawData(command);
      const chunkData = await this.readBulkData(FLASH_READ_CHUNK_SIZE);
      for (let j = 0; j < FLASH_READ_CHUNK_SIZE; j++) {
        data.push(chunkData.getUint8(j));
      }
    }

    // Read remaining bytes
    const remaining = size % FLASH_READ_CHUNK_SIZE;
    if (remaining > 0) {
      const command = this.createReadProc(remaining);
      await this.sendRawData(command);
      const chunkData = await this.readBulkData(remaining);
      for (let j = 0; j < remaining; j++) {
        data.push(chunkData.getUint8(j));
      }
    }

    return new Uint8Array(data);
  }

  private async flashRead(offset: number, size: number): Promise<Uint8Array> {
    const FLASH_BANK_SIZE = 0x8000; // 32KB
    const XBANK_OFFSET = 0x8000;
    const XREG_FMAP = 0x709f;
    const allData: number[] = [];

    let flashBank = 0xff;

    while (size > 0) {
      const bankOffset = offset % FLASH_BANK_SIZE;
      let count = Math.min(size, 0x8000);
      const flashBank0 = Math.floor(offset / FLASH_BANK_SIZE);
      const flashBank1 = Math.floor((offset + count) / FLASH_BANK_SIZE);

      if (flashBank0 !== flashBank1) {
        count = FLASH_BANK_SIZE - (offset % FLASH_BANK_SIZE);
      }

      if (flashBank !== flashBank0) {
        flashBank = flashBank0;
        await this.writeXData(XREG_FMAP, new Uint8Array([flashBank]), true);
      }

      const chunkData = await this.flashReadNear(bankOffset + XBANK_OFFSET, count);
      allData.push(...chunkData);

      size -= count;
      offset += count;
    }

    return new Uint8Array(allData);
  }

  // CRC-16 calculation (polynomial 0x8005, init 0xFFFF, no final XOR, no reflection)
  // This matches boost::crc_optimal<16, 0x8005, 0xFFFF, 0, false, false>
  private calculateCRC16(data: Uint8Array): number {
    let crc = 0xffff;
    for (let i = 0; i < data.length; i++) {
      crc ^= data[i] << 8; // XOR byte into high byte of CRC
      for (let j = 0; j < 8; j++) {
        if (crc & 0x8000) {
          // Check MSB (no reflection)
          crc = (crc << 1) ^ 0x8005;
        } else {
          crc = crc << 1;
        }
      }
    }
    return crc & 0xffff;
  }

  // Calculate CRC on device using DMA
  private async calcBlockCRC(): Promise<number> {
    // Initialize CRC registers
    await this.writeXData(CCDebugger.XREG_RNDL, new Uint8Array([0xff]), true);
    await this.writeXData(CCDebugger.XREG_RNDL, new Uint8Array([0xff]), true);

    // Arm and trigger DMA
    await this.writeXData(CCDebugger.XREG_DMAARM, new Uint8Array([0x01]), true);
    await this.writeXData(CCDebugger.XREG_DMAREQ, new Uint8Array([0x01]), true);

    // Wait for DMA to complete
    let irq = 0;
    while (!(irq & 0x01)) {
      const irqData = await this.readXData(CCDebugger.XREG_DMAIRQ, 1);
      irq = irqData[0];
    }

    // Read CRC result (little-endian)
    const crcData = await this.readXData(CCDebugger.XREG_RNDL, 2);
    return crcData[0] | (crcData[1] << 8);
  }

  // Verify flash using CRC method
  private async verifyByCRC(sections: HexSection[]): Promise<boolean> {
    // Disable DMA
    const dmaDesc = new Uint8Array([
      (CCDebugger.XBANK_OFFSET >> 8) & 0xff, // src[15:8]
      CCDebugger.XBANK_OFFSET & 0xff, // src[7:0]
      (CCDebugger.XREG_RNDH >> 8) & 0xff, // dest[15:8]
      CCDebugger.XREG_RNDH & 0xff, // dest[7:0]
      (CCDebugger.VERIFY_BLOCK_SIZE >> 8) & 0xff, // block size[15:8]
      CCDebugger.VERIFY_BLOCK_SIZE & 0xff, // block size[7:0]
      0x20, // no trigger event, block mode
      0x42, // increment source
    ]);

    // Disable DMA
    await this.writeXData(CCDebugger.XREG_DMAARM, new Uint8Array([0x00]), true);

    // Set the pointer to the DMA descriptors
    await this.writeXData(CCDebugger.XREG_DMA0CFGL, new Uint8Array([CCDebugger.ADDR_DMA_DESC & 0xff]), true);
    await this.writeXData(CCDebugger.XREG_DMA0CFGH, new Uint8Array([(CCDebugger.ADDR_DMA_DESC >> 8) & 0xff]), true);

    let flashBank = 0xff;
    let totalSize = 0;
    for (const section of sections) {
      totalSize += section.data.length;
    }

    let processedSize = 0;
    let currentPercent = 0;
    this.progressCallback(0, "Verifying...");

    for (const section of sections) {
      let sectionOffset = section.address;
      let totalSectionSize = section.data.length;

      while (totalSectionSize > 0) {
        const count = Math.min(totalSectionSize, CCDebugger.VERIFY_BLOCK_SIZE);
        const flashBank0 = Math.floor(sectionOffset / CCDebugger.FLASH_BANK_SIZE);
        const flashBank1 = Math.floor((sectionOffset + count) / CCDebugger.FLASH_BANK_SIZE);

        let actualCount = count;
        if (flashBank0 !== flashBank1) {
          actualCount = CCDebugger.FLASH_BANK_SIZE - (sectionOffset % CCDebugger.FLASH_BANK_SIZE);
        }

        if (flashBank !== flashBank0) {
          flashBank = flashBank0;
          await this.writeXData(CCDebugger.XREG_MEMCTR, new Uint8Array([flashBank]), true);
        }

        const bankOffset = sectionOffset % CCDebugger.FLASH_BANK_SIZE;

        // Update DMA descriptor with current address and size
        const updatedDesc = new Uint8Array(dmaDesc);
        updatedDesc[0] = ((bankOffset + CCDebugger.XBANK_OFFSET) >> 8) & 0xff;
        updatedDesc[1] = (bankOffset + CCDebugger.XBANK_OFFSET) & 0xff;
        updatedDesc[4] = (actualCount >> 8) & 0xff;
        updatedDesc[5] = actualCount & 0xff;
        await this.writeXData(CCDebugger.ADDR_DMA_DESC, updatedDesc, true);

        // Calculate expected CRC
        const dataOffset = section.data.length - totalSectionSize;
        const dataChunk = section.data.slice(dataOffset, dataOffset + actualCount);
        const expectedCRC = this.calculateCRC16(dataChunk);

        // Calculate actual CRC from device
        const actualCRC = await this.calcBlockCRC();

        if (actualCRC !== expectedCRC) {
          this.logger(
            `CRC mismatch at address 0x${sectionOffset.toString(16)}: expected 0x${expectedCRC
              .toString(16)
              .padStart(4, "0")}, got 0x${actualCRC.toString(16).padStart(4, "0")}`
          );
          this.progressCallback(100, "Verify FAILED");
          return false;
        }

        totalSectionSize -= actualCount;
        sectionOffset += actualCount;
        processedSize += actualCount;

        const percent = Math.floor((processedSize / totalSize) * 100);
        while (currentPercent < percent) {
          currentPercent++;
          this.progressCallback(currentPercent, `Verifying... ${currentPercent}%`);
        }
      }
    }

    this.progressCallback(100, "Verify OK");
    return true;
  }

  // Verify flash by reading and comparing
  public async verifyBin(expectedData: Uint8Array, method: VerifyMethod = VerifyMethod.BY_READ): Promise<boolean> {
    this.logger(`Verifying BIN: ${expectedData.length} bytes using ${method.toUpperCase()} method`);

    if (!this.initialized) await this.initDebugInterface();

    // If CRC method requested, convert to sections and use CRC verify
    if (method === VerifyMethod.BY_CRC) {
      const sections: HexSection[] = [{ address: 0, data: expectedData }];
      return await this.verifyByCRC(sections);
    }

    // Otherwise use read method
    // Get actual flash size to avoid reading beyond chip capacity
    const deviceInfo = await this.getDeviceInfo();
    const flashSizeKB = this.getFlashSize(deviceInfo.chipId);
    const maxFlashSize = flashSizeKB * 1024;

    // Only verify up to actual flash size or data size, whichever is smaller
    const verifySize = Math.min(expectedData.length, maxFlashSize);

    if (expectedData.length > maxFlashSize) {
      this.logger(
        `WARNING: Data size (${expectedData.length} bytes) exceeds flash size (${maxFlashSize} bytes). Will verify only first ${maxFlashSize} bytes.`
      );
    }

    this.progressCallback(0, "Verifying...");

    await this.flashReadStart();

    try {
      // Read flash data in chunks to avoid timeout
      const VERIFY_CHUNK_SIZE = 4096; // 4KB chunks
      let allMatch = true;
      let currentPercent = 0;

      for (let offset = 0; offset < verifySize; offset += VERIFY_CHUNK_SIZE) {
        const chunkSize = Math.min(VERIFY_CHUNK_SIZE, verifySize - offset);
        const flashData = await this.flashRead(offset, chunkSize);

        // Compare byte by byte and update progress every 1%
        for (let i = 0; i < chunkSize; i++) {
          const globalIndex = offset + i;
          const percent = Math.floor((globalIndex / verifySize) * 100);
          while (currentPercent < percent) {
            currentPercent++;
            this.progressCallback(currentPercent, `Verifying... ${currentPercent}%`);
          }
          if (flashData[i] !== expectedData[globalIndex]) {
            this.logger(
              `Verify FAILED at offset ${globalIndex} (0x${globalIndex.toString(16)}): expected 0x${expectedData[
                globalIndex
              ]
                .toString(16)
                .padStart(2, "0")}, got 0x${flashData[i].toString(16).padStart(2, "0")}`
            );
            await this.flashReadEnd();
            this.progressCallback(100, "Verify FAILED");
            return false;
          }
        }
      }

      await this.flashReadEnd();
      this.progressCallback(100, "Verify OK");
      return true;
    } catch (e) {
      await this.flashReadEnd();
      this.logger(`Verify error: ${e}`);
      throw e;
    }
  }

  private getFlashSize(chipId: number): number {
    // Return flash size in KB based on chip ID
    switch (chipId) {
      case 0x2530:
      case 0x2531:
      case 0x2533:
        return 128; // CC2530/31/33 can have up to 128KB (but also 32KB, 64KB variants)
      case 0x2540:
      case 0x2541:
        return 128; // CC2540/41 up to 128KB
      case 0x2543:
      case 0x2544:
      case 0x2545:
        return 32; // CC2543/44/45 up to 32KB
      default:
        return 128; // Default to max
    }
  }

  // Read actual flash size from chip registers (like cc-tool does)
  private async getActualFlashSize(chipId: number): Promise<number> {
    const isSmallUnit = chipId === 0x2543 || chipId === 0x2544 || chipId === 0x2545;

    // Read SFR registers at 0x6276 (2 bytes)
    const sfr = await this.readXData(0x6276, 2);
    const flashSizeId = (sfr[0] >> 4) & 0x07;

    let flashSizeKB = 0;

    if (isSmallUnit) {
      // CC2543/44/45
      if (flashSizeId === 0x01) {
        flashSizeKB = 18;
      } else if (flashSizeId === 0x07) {
        flashSizeKB = 32;
      }
    } else {
      // CC2530/31/33/40/41
      switch (flashSizeId) {
        case 0x01:
          flashSizeKB = 32;
          break;
        case 0x02:
          flashSizeKB = 64;
          break;
        case 0x03:
          flashSizeKB = chipId === 0x2533 ? 96 : 128;
          break;
        case 0x04:
          flashSizeKB = 256;
          break;
      }
    }

    // If we couldn't determine, use default max
    if (flashSizeKB === 0) {
      flashSizeKB = this.getFlashSize(chipId);
    }

    this.logger(`Detected flash size: ${flashSizeKB} KB (flash_size_id=0x${flashSizeId.toString(16)})`);
    return flashSizeKB;
  }

  public async verifyHex(hexContent: string, method: VerifyMethod = VerifyMethod.BY_READ): Promise<boolean> {
    const sections = parseHex(hexContent);
    if (sections.length === 0) return true;

    this.logger(`Verifying HEX: ${sections.length} sections using ${method.toUpperCase()} method`);

    if (!this.initialized) await this.initDebugInterface();

    // If CRC method requested, use CRC verify
    if (method === VerifyMethod.BY_CRC) {
      return await this.verifyByCRC(sections);
    }

    // Otherwise use read method
    this.progressCallback(0, "Verifying...");

    await this.flashReadStart();

    try {
      let totalSize = 0;
      for (const section of sections) {
        totalSize += section.data.length;
      }

      let processedSize = 0;
      let currentPercent = 0;

      for (const section of sections) {
        this.logger(`Verifying section: ${section.data.length} bytes at 0x${section.address.toString(16)}`);

        const flashData = await this.flashRead(section.address, section.data.length);

        for (let i = 0; i < section.data.length; i++) {
          const globalIndex = processedSize + i;
          const percent = Math.floor((globalIndex / totalSize) * 100);
          while (currentPercent < percent) {
            currentPercent++;
            this.progressCallback(currentPercent, `Verifying... ${currentPercent}%`);
          }
          if (flashData[i] !== section.data[i]) {
            this.logger(
              `Verify FAILED at address 0x${(section.address + i).toString(16)}: expected 0x${section.data[i]
                .toString(16)
                .padStart(2, "0")}, got 0x${flashData[i].toString(16).padStart(2, "0")}`
            );
            await this.flashReadEnd();
            this.progressCallback(100, "Verify FAILED");
            return false;
          }
        }

        processedSize += section.data.length;
      }

      await this.flashReadEnd();
      this.progressCallback(100, "Verify OK");
      return true;
    } catch (e) {
      await this.flashReadEnd();
      this.logger(`Verify error: ${e}`);
      throw e;
    }
  }

  public async writeBin(data: Uint8Array, method: WriteMethod = WriteMethod.FAST): Promise<void> {
    this.logger(`Writing BIN data: ${data.length} bytes using ${method} method`);

    if (!this.initialized) await this.initDebugInterface();

    const useFast = method === WriteMethod.FAST;

    if (useFast) {
      this.logger("Using FAST flash write");

      // Align/Pad to 1024 bytes (PROG_BLOCK_SIZE)
      const PROG_BLOCK_SIZE = 1024;
      const paddedLength = Math.ceil(data.length / PROG_BLOCK_SIZE) * PROG_BLOCK_SIZE;
      let finalImage = data;
      if (data.length < paddedLength) {
        finalImage = new Uint8Array(paddedLength);
        finalImage.fill(0xff);
        finalImage.set(data);
      }

      this.logger(`Writing full image: ${finalImage.length} bytes starting at 0x0000`);
      await this.writeFlashBlockFast(finalImage, 0);
    } else {
      this.logger("Using SLOW flash write");
      await this.writeFlashBlockSlow(data, 0);
    }

    this.progressCallback(100, "Write complete");
  }

  public async writeHex(hexContent: string, method: WriteMethod = WriteMethod.FAST): Promise<void> {
    const sections = parseHex(hexContent);
    if (sections.length === 0) return;

    this.logger(`Parsed ${sections.length} sections from HEX file using ${method} method`);

    if (!this.initialized) await this.initDebugInterface();

    const useFast = method === WriteMethod.FAST;

    if (useFast) {
      this.logger("Using FAST flash write");
      // Use FAST flash write for CC2530 and others

      // Calculate max address
      let maxAddress = 0;
      for (const section of sections) {
        const end = section.address + section.data.length;
        if (end > maxAddress) maxAddress = end;
      }

      // Create image filled with 0xFF
      const image = new Uint8Array(maxAddress);
      image.fill(0xff);
      for (const section of sections) {
        image.set(section.data, section.address);
      }

      // Align/Pad to 1024 bytes (PROG_BLOCK_SIZE)
      const PROG_BLOCK_SIZE = 1024;
      const paddedLength = Math.ceil(image.length / PROG_BLOCK_SIZE) * PROG_BLOCK_SIZE;
      let finalImage = image;
      if (image.length < paddedLength) {
        finalImage = new Uint8Array(paddedLength);
        finalImage.fill(0xff);
        finalImage.set(image);
      }

      this.logger(`Writing full image: ${finalImage.length} bytes starting at 0x0000`);

      // Write from 0
      await this.writeFlashBlockFast(finalImage, 0);
    } else {
      this.logger("Using SLOW flash write");

      // For slow write, create a single image from all sections (like cc-tool does)
      // Calculate max address
      let maxAddress = 0;
      for (const section of sections) {
        const end = section.address + section.data.length;
        if (end > maxAddress) maxAddress = end;
      }

      // Create image filled with 0xFF
      const image = new Uint8Array(maxAddress);
      image.fill(0xff);
      for (const section of sections) {
        image.set(section.data, section.address);
      }

      this.logger(`Writing full image (slow): ${image.length} bytes starting at 0x0000`);
      await this.writeFlashBlockSlow(image, 0, 0, 100);
    }

    this.progressCallback(100, "Write complete");
  }

  public async readFlash(size?: number): Promise<Uint8Array> {
    if (!this.initialized) await this.initDebugInterface();

    // Get chip info to determine flash size if not specified
    const deviceInfo = await this.getDeviceInfo();
    let flashSize: number;

    if (size) {
      flashSize = size;
    } else {
      // Read actual flash size from chip registers
      const flashSizeKB = await this.getActualFlashSize(deviceInfo.chipId);
      flashSize = flashSizeKB * 1024;
    }

    this.logger(`Reading ${flashSize} bytes from flash...`);
    this.progressCallback(0, "Reading...");

    await this.flashReadStart();

    try {
      const CHUNK_SIZE = 4096; // 4KB chunks
      const data: number[] = [];
      let currentPercent = 0;

      for (let offset = 0; offset < flashSize; offset += CHUNK_SIZE) {
        const chunkSize = Math.min(CHUNK_SIZE, flashSize - offset);
        const chunkData = await this.flashRead(offset, chunkSize);
        data.push(...chunkData);

        const percent = Math.floor(((offset + chunkSize) / flashSize) * 100);
        while (currentPercent < percent) {
          currentPercent++;
          this.progressCallback(currentPercent, `Reading... ${currentPercent}%`);
        }
      }

      await this.flashReadEnd();
      this.progressCallback(100, "Read complete");
      this.logger(`Read ${data.length} bytes from flash`);

      return new Uint8Array(data);
    } catch (e) {
      await this.flashReadEnd();
      this.logger(`Read error: ${e}`);
      throw e;
    }
  }

  public async dumpFlash(): Promise<void> {
    if (!this.device) throw new Error("Device not connected");
    if (!this.initialized) await this.initDebugInterface();

    log("Reading flash memory...");
    const flashData = await this.readFlash();

    // Convert to Intel HEX format
    const hexContent = generateHex(flashData, 0);

    // Create download link
    const blob = new Blob([hexContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;

    // Generate filename with timestamp
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, "-").slice(0, -5);

    const targetId = targetIdEl?.value || "unknown";
    const targetIeee = targetIeeeEl?.value || "unknown";
    a.download = `dump_${targetId}_${targetIeee}_${timestamp}.hex`;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.logger(`Flash saved to ${a.download}`);

    // Reset to normal mode after read
    await this.reset(false);
  }

  public async refreshInfo(): Promise<void> {
    try {
      const info = await this.getDeviceInfo();
      const ieee = await this.readIEEEAddress();
      if (debugFwVersionEl)
        debugFwVersionEl.textContent = `v${(info.fwVersion >> 8).toString(16)}.${(info.fwVersion & 0xff)
          .toString(16)
          .toUpperCase()}`;
      if (targetIdEl) targetIdEl.textContent = `CC${info.chipId.toString(16).toUpperCase()}`;
      if (targetIeeeEl) targetIeeeEl.textContent = ieee;
    } catch (e: any) {
      this.logger(`Failed to read info: ${e.message}`);
    }
  }

  public async flashAction(): Promise<void> {
    const firmwareFile = localFile.files?.[0];

    if (!optErase && !optWrite && !optVerify) {
      this.logger("Please select at least one operation");
      return;
    }

    if ((optWrite || optVerify) && !firmwareFile) {
      this.logger("Please select a firmware file for write/verify operations");
      return;
    }

    try {
      if (optErase) {
        this.logger("Erasing chip...");
        await this.chipErase();
        this.logger("Chip erase complete!");
      }

      if (optWrite && firmwareFile) {
        this.logger(`Writing firmware: ${firmwareFile.name}`);
        const reader = new FileReader();

        if (firmwareFile.name.toLowerCase().endsWith(".bin")) {
          const content = await new Promise<ArrayBuffer>((resolve, reject) => {
            reader.onload = (e) => resolve(e.target?.result as ArrayBuffer);
            reader.onerror = reject;
            reader.readAsArrayBuffer(firmwareFile);
          });
          await this.writeBin(new Uint8Array(content), writeMethodSelect);
        } else {
          const content = await new Promise<string>((resolve, reject) => {
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = reject;
            reader.readAsText(firmwareFile);
          });
          await this.writeHex(content, writeMethodSelect);
        }

        this.logger("Write complete!");

        // Only reset to normal mode if we're not going to verify
        // (verify needs debug mode, reset will be done after verify)
        if (!optVerify) {
          // log("Resetting device to normal mode...");
          await this.reset(false);
          // log("Device reset complete!");
        }
      }

      if (optVerify && firmwareFile) {
        this.logger(`Verifying firmware: ${firmwareFile.name}`);
        const reader = new FileReader();

        let verifyResult = false;
        if (firmwareFile.name.toLowerCase().endsWith(".bin")) {
          const content = await new Promise<ArrayBuffer>((resolve, reject) => {
            reader.onload = (e) => resolve(e.target?.result as ArrayBuffer);
            reader.onerror = reject;
            reader.readAsArrayBuffer(firmwareFile);
          });
          verifyResult = await this.verifyBin(new Uint8Array(content), verifyMethodSelect);
        } else {
          const content = await new Promise<string>((resolve, reject) => {
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = reject;
            reader.readAsText(firmwareFile);
          });
          verifyResult = await this.verifyHex(content, verifyMethodSelect);
        }

        if (verifyResult) {
          this.logger("Verify successful - firmware matches!");
        } else {
          this.logger("Verify FAILED - firmware does not match!");
        }

        // Reset to normal mode after verify
        // log("Resetting device to normal mode...");
        await this.reset(false);
        // log("Device reset complete!");
      }

      this.logger("All operations complete!");
    } catch (err: any) {
      this.logger(`Operation failed: ${err.message}`);
    }
  }
}

// UI Logic
// const ccDebugger = new CCDebugger();
