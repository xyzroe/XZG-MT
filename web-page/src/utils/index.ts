export const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

export function concat(...arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

export function toHex(v: number, w = 2) {
  return "0x" + v.toString(16).toUpperCase().padStart(w, "0");
}

export function bufToHex(buf: Uint8Array): string {
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
}
