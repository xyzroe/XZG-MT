/**
 * CRC16-CCITT implementation
 * Polynomial: 0x1021
 * Final XOR: 0x0000
 * No input/output reversal
 *
 * @param data - Input data
 * @param initialValue - Initial CRC value (0x0000 for XMODEM, 0xFFFF for EZSP)
 */
export function crc16(data: Uint8Array, initialValue: number = 0x0000): number {
  let crc = initialValue;

  for (let i = 0; i < data.length; i++) {
    crc ^= data[i] << 8;

    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc = crc << 1;
      }
    }
  }

  return crc & 0xffff;
}

/**
 * CRC32 implementation (standard IEEE 802.3 polynomial)
 * Polynomial: 0xEDB88320 (reversed 0x04C11DB7)
 * Initial value: 0xFFFFFFFF
 * Final XOR: 0xFFFFFFFF
 * Input/output bit reversal
 *
 * Compatible with Python's binascii.crc32() and standard CRC32
 */
export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;

  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ 0xedb88320;
      } else {
        crc = crc >>> 1;
      }
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Pad data to a multiple of blockSize with padding byte
 */
export function padToMultiple(data: Uint8Array, blockSize: number, padding: number): Uint8Array {
  if (data.length % blockSize === 0) {
    return data;
  }

  const numCompleteBlocks = Math.floor(data.length / blockSize);
  const paddedSize = blockSize * (numCompleteBlocks + 1);
  const result = new Uint8Array(paddedSize);

  result.set(data);
  result.fill(padding, data.length);

  return result;
}
