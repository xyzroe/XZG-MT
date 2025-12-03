export type Transport = "serial" | "tcp";

export type Link = {
  write: (d: Uint8Array) => Promise<void>;
  onData: (cb: (d: Uint8Array) => void) => void;
  offData?: (cb: (d: Uint8Array) => void) => void;
};

export interface TcpConnectParams {
  host: string;
  port: number;
}
export interface SerialOpenParams {
  path?: string;
  bitrate: number;
}

export interface FlashOptions {
  erase: boolean;
  verify: boolean;
  address?: number; // start address override; default comes from HEX
}

export interface HexImage {
  startAddress: number;
  data: Uint8Array; // linear, dense image with gaps padded as 0xFF
}
