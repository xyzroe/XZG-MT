// Minimal Web Serial typings for TS
interface SerialOptions {
  baudRate: number;
}

interface SerialPort {
  open(options: SerialOptions): Promise<void>;
  close(): Promise<void>;
  readable?: ReadableStream<Uint8Array>;
  writable?: WritableStream<Uint8Array>;
}

interface Navigator {
  serial: {
    requestPort(options?: any): Promise<SerialPort>;
    getPorts?(): Promise<SerialPort[]>;
  };
}
