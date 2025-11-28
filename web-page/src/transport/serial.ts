type NativeSerialPort = globalThis.SerialPort;

declare global {
  interface USBDevice {
    opened: boolean;
    vendorId: number;
    productId: number;
    deviceClass: number;
    deviceSubclass: number;
    deviceProtocol: number;
    configurations: USBConfiguration[];
    configuration: USBConfiguration | null;
    open(): Promise<void>;
    close(): Promise<void>;
    selectConfiguration(configurationValue: number): Promise<void>;
    claimInterface(interfaceNumber: number): Promise<void>;
    releaseInterface(interfaceNumber: number): Promise<void>;
    transferIn(endpointNumber: number, length: number): Promise<USBInTransferResult>;
    transferOut(endpointNumber: number, data: BufferSource): Promise<USBOutTransferResult>;
    controlTransferOut(setup: USBControlTransferParameters, data?: BufferSource): Promise<USBOutTransferResult>;
  }

  interface USBConfiguration {
    configurationValue: number;
    configurationName?: string;
    interfaces: USBInterface[];
  }

  interface USBInterface {
    interfaceNumber: number;
    alternates: USBAlternateInterface[];
  }

  interface USBAlternateInterface {
    alternateSetting: number;
    interfaceClass: number;
    interfaceSubclass: number;
    interfaceProtocol: number;
    endpoints: USBEndpoint[];
  }

  interface USBEndpoint {
    endpointNumber: number;
    direction: "in" | "out";
    type: "bulk" | "interrupt" | "isochronous";
    packetSize: number;
  }

  interface USBInTransferResult {
    data?: DataView;
    status: "ok" | "stall" | "babble";
  }

  interface USBOutTransferResult {
    bytesWritten: number;
    status: "ok" | "stall";
  }

  interface USBControlTransferParameters {
    requestType: "standard" | "class" | "vendor";
    recipient: "device" | "interface" | "endpoint" | "other";
    request: number;
    value: number;
    index: number;
  }

  interface USB {
    getDevices(): Promise<USBDevice[]>;
    requestDevice(options?: USBDeviceRequestOptions): Promise<USBDevice>;
  }

  interface USBDeviceRequestOptions {
    filters: USBDeviceFilter[];
  }

  interface USBDeviceFilter {
    vendorId?: number;
    productId?: number;
    classCode?: number;
    subclassCode?: number;
    protocolCode?: number;
    serialNumber?: string;
  }

  interface Navigator {
    usb?: USB;
  }
}

export class SerialPort {
  private port: NativeSerialPort | null = null;
  private usbDevice: USBDevice | null = null;
  private usbInterface: number = 0;
  private usbEndpointIn: number = 0;
  private usbEndpointOut: number = 0;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private onDataCbs: Array<(data: Uint8Array) => void> = [];
  private onTxCb: ((data: Uint8Array) => void) | null = null;
  private readonly bitrate: number;
  private usbReadLoopActive = false;

  constructor(bitrate: number) {
    this.bitrate = bitrate;
  }

  static isSupported(): boolean {
    return (
      (typeof navigator !== "undefined" && !!navigator.serial) || (typeof navigator !== "undefined" && !!navigator.usb)
    );
  }

  static isWebSerialSupported(): boolean {
    return typeof navigator !== "undefined" && !!navigator.serial;
  }

  static isWebUSBSupported(): boolean {
    return typeof navigator !== "undefined" && !!navigator.usb;
  }

  private startIO(): void {
    if (!this.port) return;
    // Start read loop
    const readable = this.port.readable;
    if (readable) {
      this.reader = readable.getReader();
      (async () => {
        try {
          while (true) {
            const r = this.reader;
            if (!r) break;
            const { value, done } = await r.read();
            if (done) break;
            if (value) {
              for (const cb of this.onDataCbs) {
                try {
                  cb(value);
                } catch {
                  // ignore
                }
              }
            }
          }
        } catch {
          // reader canceled/closed
        }
      })();
    }
    const writable = this.port.writable;
    if (writable) this.writer = writable.getWriter();
  }

  private async startUSBReadLoop(): Promise<void> {
    if (!this.usbDevice) return;
    this.usbReadLoopActive = true;

    while (this.usbReadLoopActive && this.usbDevice) {
      try {
        const result = await this.usbDevice.transferIn(this.usbEndpointIn, 64);
        if (result.data && result.data.byteLength > 0) {
          const data = new Uint8Array(result.data.buffer);
          for (const cb of this.onDataCbs) {
            try {
              cb(data);
            } catch {
              // ignore
            }
          }
        }
      } catch (err) {
        if (this.usbReadLoopActive) {
          // Only log if we didn't intentionally stop
          console.error("USB read error:", err);
        }
        break;
      }
    }
  }

  async requestAndOpen(): Promise<void> {
    // On mobile, prefer WebUSB over Web Serial (which only shows Bluetooth)
    const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);

    if (isMobile) {
      // Mobile: try WebUSB first, fall back to Web Serial (Bluetooth) if no USB
      if (SerialPort.isWebUSBSupported()) {
        try {
          await this.requestAndOpenUSB();
          return;
        } catch (err) {
          console.log("WebUSB failed, trying Web Serial (Bluetooth):", err);
          // Fall through to Web Serial
        }
      }
    }

    // Desktop or mobile fallback: use Web Serial
    if (SerialPort.isWebSerialSupported()) {
      const port = await navigator.serial!.requestPort();
      await port.open({ baudRate: this.bitrate });
      this.port = port;
      this.startIO();
    } else if (SerialPort.isWebUSBSupported()) {
      // Last resort: WebUSB on desktop
      await this.requestAndOpenUSB();
    } else {
      throw new Error("Neither Web Serial nor WebUSB is supported");
    }
  }

  private async requestAndOpenUSB(): Promise<void> {
    // Request USB device (filter for CDC-ACM devices)
    const device = await navigator.usb!.requestDevice({
      filters: [],
    });

    await this.openUSBDevice(device);
  }

  private async openUSBDevice(device: USBDevice): Promise<void> {
    await device.open();

    // Find CDC interface or first available interface
    let interfaceNumber = 0;
    let endpointIn = 0;
    let endpointOut = 0;

    for (const config of device.configurations) {
      for (const iface of config.interfaces) {
        for (const alt of iface.alternates) {
          // Look for bulk endpoints
          const epIn = alt.endpoints.find((ep) => ep.direction === "in" && ep.type === "bulk");
          const epOut = alt.endpoints.find((ep) => ep.direction === "out" && ep.type === "bulk");

          if (epIn && epOut) {
            interfaceNumber = iface.interfaceNumber;
            endpointIn = epIn.endpointNumber;
            endpointOut = epOut.endpointNumber;
            break;
          }
        }
      }
    }

    if (device.configuration === null) {
      await device.selectConfiguration(1);
    }

    await device.claimInterface(interfaceNumber);

    // Set line coding (baud rate) for CDC devices
    try {
      await device.controlTransferOut(
        {
          requestType: "class",
          recipient: "interface",
          request: 0x20, // SET_LINE_CODING
          value: 0,
          index: interfaceNumber,
        },
        new Uint8Array([
          this.bitrate & 0xff,
          (this.bitrate >> 8) & 0xff,
          (this.bitrate >> 16) & 0xff,
          (this.bitrate >> 24) & 0xff,
          0, // 1 stop bit
          0, // no parity
          8, // 8 data bits
        ])
      );
    } catch {
      // Not all devices support this
    }

    this.usbDevice = device;
    this.usbInterface = interfaceNumber;
    this.usbEndpointIn = endpointIn;
    this.usbEndpointOut = endpointOut;

    this.startUSBReadLoop();
  }

  async openGranted(): Promise<void> {
    if (SerialPort.isWebSerialSupported()) {
      const ports = await navigator.serial.getPorts?.();
      if (!ports || ports.length === 0) throw new Error("No previously granted serial ports");
      const port = ports[0];
      await port.open({ baudRate: this.bitrate });
      this.port = port;
      this.startIO();
    } else if (SerialPort.isWebUSBSupported()) {
      const devices = await navigator.usb.getDevices();
      if (!devices || devices.length === 0) throw new Error("No previously granted USB devices");
      await this.openUSBDevice(devices[0]);
    }
  }

  useExistingPortAndStart(port: NativeSerialPort): void {
    this.port = port;
    this.startIO();
  }

  async reopenWithBaudrate(baud: number): Promise<void> {
    if (this.port) {
      // Web Serial
      const p = this.port;
      if (!p) throw new Error("serial not open");
      try {
        if (this.reader) {
          try {
            await this.reader.cancel();
          } catch {
            // ignore
          }
          try {
            this.reader.releaseLock?.();
          } catch {
            // ignore
          }
          this.reader = null;
        }
        if (this.writer) {
          try {
            await this.writer.close();
          } catch {
            // ignore
          }
          try {
            this.writer.releaseLock?.();
          } catch {
            // ignore
          }
          this.writer = null;
        }
        try {
          await p.close();
        } catch {
          // ignore
        }
        await p.open({ baudRate: baud });
        this.startIO();
      } catch (err) {
        this.reader = null;
        this.writer = null;
        throw err;
      }
    } else if (this.usbDevice) {
      // WebUSB - send SET_LINE_CODING
      try {
        await this.usbDevice.controlTransferOut(
          {
            requestType: "class",
            recipient: "interface",
            request: 0x20,
            value: 0,
            index: this.usbInterface,
          },
          new Uint8Array([baud & 0xff, (baud >> 8) & 0xff, (baud >> 16) & 0xff, (baud >> 24) & 0xff, 0, 0, 8])
        );
      } catch {
        // ignore if not supported
      }
    }
  }

  async write(data: Uint8Array): Promise<void> {
    try {
      this.onTxCb?.(data);
    } catch {
      // ignore
    }

    if (this.writer) {
      await this.writer.write(data);
    } else if (this.usbDevice) {
      await this.usbDevice.transferOut(this.usbEndpointOut, data);
    } else {
      throw new Error("serial not open");
    }
  }

  async setSignals(signals: SerialSignals): Promise<void> {
    if (this.port && this.port.setSignals) {
      await this.port.setSignals(signals);
    } else if (this.usbDevice) {
      // Set control line state for CDC devices (DTR/RTS)
      const controlSignals = (signals.dataTerminalReady ? 0x01 : 0) | (signals.requestToSend ? 0x02 : 0);

      try {
        await this.usbDevice.controlTransferOut({
          requestType: "class",
          recipient: "interface",
          request: 0x22, // SET_CONTROL_LINE_STATE
          value: controlSignals,
          index: this.usbInterface,
        });
      } catch {
        // ignore if not supported
      }
    }
  }

  onData(cb: (data: Uint8Array) => void) {
    this.onDataCbs.push(cb);
  }

  offData(cb: (data: Uint8Array) => void) {
    const idx = this.onDataCbs.indexOf(cb);
    if (idx >= 0) {
      this.onDataCbs.splice(idx, 1);
    }
  }

  onTx(cb: (data: Uint8Array) => void) {
    this.onTxCb = cb;
  }

  async close() {
    if (this.port) {
      try {
        await this.reader?.cancel();
      } catch {
        // ignore
      }
      try {
        await this.writer?.close();
      } catch {
        // ignore
      }
      try {
        await this.port?.close();
      } catch {
        // ignore
      }
      this.reader = null;
      this.writer = null;
      this.port = null;
    }

    if (this.usbDevice) {
      this.usbReadLoopActive = false;
      try {
        await this.usbDevice.releaseInterface(this.usbInterface);
      } catch {
        // ignore
      }
      try {
        await this.usbDevice.close();
      } catch {
        // ignore
      }
      this.usbDevice = null;
    }

    this.onDataCbs = [];
    this.onTxCb = null;
  }
}
