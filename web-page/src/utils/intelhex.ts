export function parseIntelHex(fullText: string): { startAddress: number; data: Uint8Array } {
  const lines = fullText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  type Rec = { absBase: number; addr: number; bytes: number[]; type: number };
  const recs: Rec[] = [];

  let base = 0; // current base (set by type 04 <<16 or type 02 <<4)
  let minAddr = Number.POSITIVE_INFINITY;
  let maxAddr = 0;

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.startsWith(":")) throw new Error(`Invalid HEX line ${i + 1}`);
    const byteCount = parseInt(l.substr(1, 2), 16);
    const addr = parseInt(l.substr(3, 4), 16);
    const type = parseInt(l.substr(7, 2), 16);
    const dataHex = l.substr(9, byteCount * 2);
    // checksum omitted here (could validate if needed)

    if (type === 0x00) {
      const bytes: number[] = [];
      for (let j = 0; j < byteCount; j++) {
        bytes.push(parseInt(dataHex.substr(j * 2, 2), 16));
      }
      const absBase = base;
      const absAddr = absBase + addr;
      recs.push({ absBase, addr, bytes, type });
      minAddr = Math.min(minAddr, absAddr);
      maxAddr = Math.max(maxAddr, absAddr + bytes.length - 1);
    } else if (type === 0x01) {
      // EOF record
      break;
    } else if (type === 0x02) {
      // Extended Segment Address Record: bits 4..19 -> shift left 4
      const seg = parseInt(dataHex, 16) & 0xffff;
      base = (seg << 4) >>> 0;
    } else if (type === 0x04) {
      // Extended Linear Address Record: upper 16 bits
      const upper = parseInt(dataHex, 16) & 0xffff;
      base = (upper << 16) >>> 0;
    } else {
      // other record types (03,05) — ignore but keep base as is
    }
  }

  if (minAddr === Number.POSITIVE_INFINITY) {
    // no data records
    return { startAddress: 0, data: new Uint8Array(0) };
  }

  const size = maxAddr - minAddr + 1;
  if (size <= 0) return { startAddress: 0, data: new Uint8Array(0) };
  const out = new Uint8Array(size);
  // fill with 0x00 to represent erased flash
  out.fill(0x00);

  // write records
  for (const r of recs) {
    const abs = r.absBase + r.addr;
    const offset = abs - minAddr;
    out.set(Uint8Array.from(r.bytes), offset);
  }

  return { startAddress: minAddr >>> 0, data: out };
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2) throw new Error("HEX: odd length");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}
