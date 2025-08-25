export class SerialPort {
    private port: SerialPort | null = null as any;
    private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
    private onDataCbs: Array<(data: Uint8Array) => void> = [];
    private onTxCb: ((data: Uint8Array) => void) | null = null;
    private readonly bitrate: number;

    constructor(bitrate: number) {
        this.bitrate = bitrate;
    }

    static isSupported(): boolean {
        return typeof navigator !== "undefined" && !!(navigator as any).serial;
    }

    private startIO(): void {
        // Start read loop
        const readable = (this.port as any).readable as ReadableStream<Uint8Array>;
        if (readable) {
            this.reader = readable.getReader();
            (async () => {
                try {
                    while (true) {
                        const r = this.reader; if (!r) break;
                        const { value, done } = await r.read();
                        if (done) break;
                        if (value) {
                            for (const cb of this.onDataCbs) {
                                try { cb(value); } catch {}
                            }
                        }
                    }
                } catch (_e) {
                    // reader canceled/closed
                }
            })();
        }
        const writable = (this.port as any).writable as WritableStream<Uint8Array>;
        if (writable) this.writer = writable.getWriter();
    }

    async requestAndOpen(): Promise<void> {
        // Must be called from a user gesture (click) to show chooser
        const port = await navigator.serial.requestPort();
        await port.open({ baudRate: this.bitrate });
        this.port = port as any;
        this.startIO();
    }

    async openGranted(): Promise<void> {
        const ports = await navigator.serial.getPorts?.();
        if (!ports || ports.length === 0) throw new Error("No previously granted serial ports");
        const port = ports[0];
        await port.open({ baudRate: this.bitrate });
        this.port = port as any;
        this.startIO();
    }

    useExistingPortAndStart(port: SerialPort): void {
        this.port = port as any;
        this.startIO();
    }

    async reopenWithBaudrate(baud: number): Promise<void> {
        const p: any = this.port as any;
        if (!p) throw new Error("serial not open");
        // Tear down current IO and re-open at new baudrate
        try { await this.reader?.cancel(); } catch {}
        try { await this.writer?.close(); } catch {}
        try { await p.close?.(); } catch {}
        await p.open?.({ baudRate: baud });
        this.startIO();
    }

    async openByPath(_path?: string): Promise<void> {
        // Backwards-compat: behave like requestAndOpen; web-serial has no system path
        await this.requestAndOpen();
    }

    async write(data: Uint8Array): Promise<void> {
        if (!this.writer) throw new Error("serial not open");
        try { this.onTxCb?.(data); } catch {}
        await this.writer.write(data);
    }

    async setSignals(signals: { dataTerminalReady?: boolean; requestToSend?: boolean; break?: boolean }): Promise<void> {
        const p: any = this.port as any;
        if (!p || !p.setSignals) return; // not supported on some platforms
        await p.setSignals(signals);
    }

    onData(cb: (data: Uint8Array) => void) {
        this.onDataCbs.push(cb);
    }

    onTx(cb: (data: Uint8Array) => void) { this.onTxCb = cb; }

    async close() {
        try { await this.reader?.cancel(); } catch {}
        try { await this.writer?.close(); } catch {}
        try { await (this.port as any)?.close?.(); } catch {}
        this.reader = null; this.writer = null; this.port = null as any;
        this.onDataCbs = [];
        this.onTxCb = null;
    }
}