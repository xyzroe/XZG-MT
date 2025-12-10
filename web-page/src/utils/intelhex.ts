export function parseIntelHex(fullText: string, fillByte: number = 0x00): { startAddress: number; data: Uint8Array } {
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
  //out.fill(0x00);
  out.fill(fillByte);

  // write records
  for (const r of recs) {
    const abs = r.absBase + r.addr;
    const offset = abs - minAddr;
    out.set(Uint8Array.from(r.bytes), offset);
  }

  return { startAddress: minAddr >>> 0, data: out };
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

  // Helper to check if a line contains only 0xFF (empty flash)
  function isEmptyLine(data: Uint8Array, offset: number, count: number): boolean {
    for (let i = 0; i < count; i++) {
      if (data[offset + i] !== 0xff) {
        return false;
      }
    }
    return true;
  }

  let currentExtendedAddress = -1;

  for (let offset = 0; offset < data.length; offset += BYTES_PER_LINE) {
    const count = Math.min(BYTES_PER_LINE, data.length - offset);

    // Skip lines that contain only 0xFF (unprogrammed flash)
    if (isEmptyLine(data, offset, count)) {
      continue;
    }

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
