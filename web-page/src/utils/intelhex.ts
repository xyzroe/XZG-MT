export function parseIntelHex(text: string): { startAddress: number; data: Uint8Array } {
  let upper = 0; // extended linear address (ELA)
  let startAddress = 0x00000000;
  const chunks: { addr: number; bytes: Uint8Array }[] = [];

  const lines = text.replace(/\r/g, "").split("\n").filter(Boolean);
  for (const line of lines) {
    if (line[0] !== ":") throw new Error("HEX: bad line start");
    const bytes = hexToBytes(line.slice(1));
    const len = bytes[0];
    const addr = (bytes[1] << 8) | bytes[2];
    const type = bytes[3];
    const data = bytes.slice(4, 4 + len);
    const _crc = bytes[4 + len]; // optional: verify

    switch (type) {
      case 0x00: {
        // data
        const abs = (upper << 16) | addr;
        chunks.push({ addr: abs, bytes: data });
        break;
      }
      case 0x01: {
        // EOF
        break;
      }
      case 0x04: {
        // extended linear address
        if (len !== 2) throw new Error("HEX: ELA len!=2");
        upper = (data[0] << 8) | data[1];
        break;
      }
      case 0x05: {
        // start linear address
        if (len !== 4) throw new Error("HEX: SLA len!=4");
        startAddress = (data[0] << 24) | (data[1] << 16) | (data[2] << 8) | data[3];
        break;
      }
      default:
        // ignore rare record types (extend as needed)
        break;
    }
  }

  // normalize into a dense buffer
  const min = Math.min(...chunks.map((c) => c.addr));
  const max = Math.max(...chunks.map((c) => c.addr + c.bytes.length));
  const out = new Uint8Array(max - min).fill(0xff);
  for (const c of chunks) out.set(c.bytes, c.addr - min);

  return { startAddress: startAddress || min, data: out };
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2) throw new Error("HEX: odd length");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}
