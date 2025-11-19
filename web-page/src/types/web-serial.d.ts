// Minimal Web Serial typings for TS
interface SerialOptions {
  baudRate: number;
}

interface SerialPort {
  open(options: SerialOptions): Promise<void>;
  close(): Promise<void>;
  setSignals?: (signals: SerialSignals) => Promise<void>;
  readable?: ReadableStream<Uint8Array>;
  writable?: WritableStream<Uint8Array>;
}

interface Navigator {
  serial: {
    requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>;
    getPorts?(): Promise<SerialPort[]>;
  };
}

interface SerialPortRequestOptions {
  filters?: SerialPortFilter[];
}

interface SerialPortFilter {
  usbVendorId?: number;
  usbProductId?: number;
}

interface SerialSignals {
  dataTerminalReady?: boolean;
  requestToSend?: boolean;
  break?: boolean;
}
