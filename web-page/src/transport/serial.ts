type NativeSerialPort = globalThis.SerialPort;

export class SerialPort {
  private port: NativeSerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private onDataCbs: Array<(data: Uint8Array) => void> = [];
  private onTxCb: ((data: Uint8Array) => void) | null = null;
  private readonly bitrate: number;

  constructor(bitrate: number) {
    this.bitrate = bitrate;
  }

  static isSupported(): boolean {
    return typeof navigator !== "undefined" && !!navigator.serial;
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

  async requestAndOpen(): Promise<void> {
    // Must be called from a user gesture (click) to show chooser
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: this.bitrate });
    this.port = port;
    this.startIO();
  }

  async openGranted(): Promise<void> {
    const ports = await navigator.serial.getPorts?.();
    if (!ports || ports.length === 0) throw new Error("No previously granted serial ports");
    const port = ports[0];
    await port.open({ baudRate: this.bitrate });
    this.port = port;
    this.startIO();
  }

  useExistingPortAndStart(port: NativeSerialPort): void {
    this.port = port;
    this.startIO();
  }

  // async reopenWithBaudrate(baud: number): Promise<void> {
  //     const p: any = this.port as any;
  //     if (!p) throw new Error("serial not open");
  //     // Tear down current IO and re-open at new baudrate
  //     try { await this.reader?.cancel(); } catch {}
  //     try { await this.writer?.close(); } catch {}
  //     try { await p.close?.(); } catch {}
  //     await p.open?.({ baudRate: baud });
  //     this.startIO();
  // }

  async reopenWithBaudrate(baud: number): Promise<void> {
    const p = this.port;
    if (!p) throw new Error("serial not open");
    // Tear down current IO and re-open at new baudrate
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
      // leave object in consistent state on error
      this.reader = null;
      this.writer = null;
      throw err;
    }
  }

  // async openByPath(_path?: string): Promise<void> {
  //   // Backwards-compat: behave like requestAndOpen; web-serial has no system path
  //   await this.requestAndOpen();
  // }

  async write(data: Uint8Array): Promise<void> {
    if (!this.writer) throw new Error("serial not open");
    try {
      this.onTxCb?.(data);
    } catch {
      // ignore
    }
    await this.writer.write(data);
  }

  async setSignals(signals: SerialSignals): Promise<void> {
    const p = this.port;
    if (!p || !p.setSignals) return; // not supported on some platforms
    await p.setSignals(signals);
  }

  onData(cb: (data: Uint8Array) => void) {
    this.onDataCbs.push(cb);
  }

  onTx(cb: (data: Uint8Array) => void) {
    this.onTxCb = cb;
  }

  async close() {
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
    this.onDataCbs = [];
    this.onTxCb = null;
  }
}
