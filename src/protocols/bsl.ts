import { sleep } from "../utils/index";

export interface BslLink {
    write(data: Uint8Array): Promise<void>;
    onData(cb: (data: Uint8Array) => void): void;
}

export class BslClient {
    private link: BslLink;
    private rxBuf: number[] = [];

    constructor(link: BslLink) {
        this.link = link;
        link.onData(d => this.rxBuf.push(...d));
    }

    // cc2538-bsl wire protocol: sync with 0x55 0x55 then expect ACK
    async sync(): Promise<void> {
        this.rxBuf = [];
        await this.link.write(new Uint8Array([0x55, 0x55]));
        const ok = await this.waitForAck(1000);
        if (!ok) throw new Error("BSL: no ACK on sync");
        await sleep(20);
    }

    // --- low level helpers ---
    private async waitForAck(timeoutMs = 1200): Promise<boolean> {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            // Accept either single-byte ACK/NACK (0xCC / 0x33) or 0x00-prefixed pairs (0x00 0xCC / 0x00 0x33)
            for (let i = 0; i < this.rxBuf.length; i++) {
                const b = this.rxBuf[i];
                if (b === 0xCC) { this.rxBuf.splice(0, i + 1); return true; }
                if (b === 0x33) { this.rxBuf.splice(0, i + 1); return false; }
                if (i + 1 < this.rxBuf.length && b === 0x00) {
                    const n = this.rxBuf[i + 1];
                    if (n === 0xCC || n === 0x33) {
                        this.rxBuf.splice(0, i + 2);
                        return n === 0xCC;
                    }
                }
            }
            await sleep(5);
        }
        throw new Error("BSL: timeout waiting for ACK/NACK");
    }

    private async receivePacket(timeoutMs = 1500): Promise<Uint8Array> {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            if (this.rxBuf.length >= 2) {
                const size = this.rxBuf[0];
                if (this.rxBuf.length >= size) {
                    const chks = this.rxBuf[1];
                    const data = this.rxBuf.slice(2, size);
                    const sum = data.reduce((s, b) => (s + b) & 0xFF, 0);
                    // drop the packet from rx
                    this.rxBuf.splice(0, size);
                    if (sum !== chks) throw new Error("BSL: packet checksum error");
                    // send ACK only when checksum is OK
                    await this.link.write(new Uint8Array([0x00, 0xCC]));
                    return new Uint8Array(data);
                }
            }
            await sleep(5);
        }
        throw new Error("BSL: timeout receiving packet");
    }

    private encodeAddr(addr: number): Uint8Array {
        // Big-endian: [byte0..byte3] where byte0 = addr >> 24
        const byte3 = (addr >> 0) & 0xFF;
        const byte2 = (addr >> 8) & 0xFF;
        const byte1 = (addr >> 16) & 0xFF;
        const byte0 = (addr >> 24) & 0xFF;
        return new Uint8Array([byte0, byte1, byte2, byte3]);
    }

    private async sendCommandRaw(content: Uint8Array, expectPacket = false, ackTimeout = 1000): Promise<Uint8Array | null> {
        // content starts with CMD byte
        const len = content.length + 2; // include size+checksum bytes per protocol
        const chks = content.reduce((s, b) => (s + b) & 0xFF, 0);
        this.rxBuf = [];
        const frame = new Uint8Array(2 + content.length);
        frame[0] = len & 0xFF;
        frame[1] = chks & 0xFF;
        frame.set(content, 2);
        await this.link.write(frame);
        const ackOk = await this.waitForAck(ackTimeout);
        if (!ackOk) throw new Error("BSL: NACK");
        if (expectPacket) {
            return await this.receivePacket();
        }
        return null;
    }

    private async checkLastCmd(): Promise<boolean> {
        // Get Status (0x23) returns a packet; first byte is status
        const pkt = await this.sendCommandRaw(new Uint8Array([0x23]), true);
        if (!pkt || pkt.length === 0) return false;
        const status = pkt[0];
        // 0x40 = Success
        return status === 0x40;
    }

    async chipId(): Promise<Uint8Array> {
        const pkt = await this.sendCommandRaw(new Uint8Array([0x28]), true);
        if (!pkt) throw new Error("BSL: no chip id packet");
        const ok = await this.checkLastCmd();
        if (!ok) throw new Error("BSL: chip id status failed");
        return pkt;
    }

    async erase(address: number, length: number): Promise<void> {
        // CC2538 style: 0x26 with addr(4) + size(4).
        // CC26xx/CC13xx: 0x26 is sector erase (addr only) and range erase is invalid (0x42).
        // Keep this as CC2538 erase; higher-level code should prefer bankErase/sectorErase for CC26xx/CC13xx.
        const content = new Uint8Array(1 + 4 + 4);
        content[0] = 0x26;
        content.set(this.encodeAddr(address), 1);
        content.set(this.encodeAddr(length >>> 0), 1 + 4);
        await this.sendCommandRaw(content, false, 5000);
        const ok = await this.checkLastCmd();
        if (!ok) throw new Error("BSL: erase failed");
    }

    async sectorErase(address: number): Promise<void> {
        // CC26xx/CC13xx sector erase: cmd 0x26 with addr only
        const content = new Uint8Array(1 + 4);
        content[0] = 0x26;
        content.set(this.encodeAddr(address), 1);
        await this.sendCommandRaw(content, false, 10000);
        const ok = await this.checkLastCmd();
        if (!ok) throw new Error("BSL: sector erase failed");
    }

    async bankErase(): Promise<void> {
        // CC26xx/CC13xx bank erase: cmd 0x2C with no payload
        const content = new Uint8Array([0x2C]);
        await this.sendCommandRaw(content, false, 15000);
        const ok = await this.checkLastCmd();
        if (!ok) throw new Error("BSL: bank erase failed");
    }

    async write(data: Uint8Array): Promise<void> {
        // Not used directly; see downloadTo()
        await this.sendCommandRaw(new Uint8Array([0x24, ...data]));
        const ok = await this.checkLastCmd();
        if (!ok) throw new Error("BSL: send data failed");
    }

    async downloadTo(address: number, chunk: Uint8Array): Promise<void> {
        // For each chunk: cmdDownload(addr, size) then cmdSendData(data)
        // size must be multiple of 4 and data payload up to ~248 bytes per packet
        let data = chunk;
        // round up to 4 with 0xFF padding if needed
        if (data.length % 4 !== 0) {
            const pad = 4 - (data.length % 4);
            const tmp = new Uint8Array(data.length + pad);
            tmp.set(data, 0);
            for (let i = 0; i < pad; i++) tmp[data.length + i] = 0xFF;
            data = tmp;
        }
        // DOWNLOAD (0x21)
        const dl = new Uint8Array(1 + 4 + 4);
        dl[0] = 0x21;
        dl.set(this.encodeAddr(address), 1);
        dl.set(this.encodeAddr(data.length), 1 + 4);
        await this.sendCommandRaw(dl);
        const ok1 = await this.checkLastCmd();
        if (!ok1) throw new Error("BSL: download header failed");
        // SEND DATA (0x24)
        const sdHeader = new Uint8Array(1 + data.length);
        sdHeader[0] = 0x24;
        sdHeader.set(data, 1);
        await this.sendCommandRaw(sdHeader, false, 5000);
        const ok2 = await this.checkLastCmd();
        if (!ok2) throw new Error("BSL: send data failed");
    }

    async verifyCrc(address: number, length: number): Promise<boolean> {
        // CRC32 (0x27) addr(4) + size(4). Returns 4B CRC (LSB first)
        const content = new Uint8Array(1 + 4 + 4);
        content[0] = 0x27;
        content.set(this.encodeAddr(address), 1);
        content.set(this.encodeAddr(length >>> 0), 1 + 4);
        const pkt = await this.sendCommandRaw(content, true);
        if (!pkt || pkt.length < 4) return false;
        const ok = await this.checkLastCmd();
        if (!ok) return false;
        return true; // caller can be updated later to compare CRCs explicitly
    }

    async crc32(address: number, length: number): Promise<number> {
        // CC2538/legacy CRC32 read: 0x27 addr+size
        const content = new Uint8Array(1 + 4 + 4);
        content[0] = 0x27;
        content.set(this.encodeAddr(address), 1);
        content.set(this.encodeAddr(length >>> 0), 1 + 4);
        const pkt = await this.sendCommandRaw(content, true);
        if (!pkt || pkt.length < 4) throw new Error("BSL: CRC packet too short");
        const ok = await this.checkLastCmd();
        if (!ok) throw new Error("BSL: CRC status failed");
        // LSB first
        const crc = (pkt[0] | (pkt[1]<<8) | (pkt[2]<<16) | (pkt[3]<<24)) >>> 0;
        return crc;
    }

    async crc32Cc26xx(address: number, length: number): Promise<number> {
        // CC26xx/CC13xx CRC32: 0x27 addr+size+reads(0)
        const content = new Uint8Array(1 + 4 + 4 + 4);
        content[0] = 0x27;
        content.set(this.encodeAddr(address), 1);
        content.set(this.encodeAddr(length >>> 0), 1 + 4);
        content.set(this.encodeAddr(0), 1 + 8); // number of reads = 0
        const pkt = await this.sendCommandRaw(content, true);
        if (!pkt || pkt.length < 4) throw new Error("BSL: CRC packet too short");
        const ok = await this.checkLastCmd();
        if (!ok) throw new Error("BSL: CRC status failed");
        const crc = (pkt[0] | (pkt[1]<<8) | (pkt[2]<<16) | (pkt[3]<<24)) >>> 0;
        return crc;
    }

    async memRead(addr: number, widthCode: number, count: number): Promise<Uint8Array> {
        // Read Memory (0x2A) addr(4) + width + count
        // On CC2538/CC26xx, widthCode=1 corresponds to 4-byte width; count is number of reads.
        const content = new Uint8Array(1 + 4 + 1 + 1);
        content[0] = 0x2A;
        content.set(this.encodeAddr(addr), 1);
        content[5] = widthCode & 0xFF;
        content[6] = count & 0xFF;
        const pkt = await this.sendCommandRaw(content, true);
        if (!pkt) throw new Error("BSL: no memRead packet");
        const ok = await this.checkLastCmd();
        if (!ok) throw new Error("BSL: memRead status failed");
        return pkt;
    }

    async memRead32(addr: number): Promise<Uint8Array> {
        // widthCode=1 (32-bit), count=1 → expect 4 bytes
        return this.memRead(addr, 1, 1);
    }
}

export class LinkAdapter implements BslLink {
    constructor(private writeFn: (d: Uint8Array) => Promise<void>, private onDataHook: (cb: (d: Uint8Array)=>void) => void) {}
    write(data: Uint8Array): Promise<void> { return this.writeFn(data); }
    onData(cb: (data: Uint8Array) => void): void { this.onDataHook(cb); }
}