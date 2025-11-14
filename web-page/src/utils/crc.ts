/**
 * CRC16-CCITT implementation for XMODEM protocol
 * Polynomial: 0x1021
 * Initial value: 0x0000
 * Final XOR: 0x0000
 * No input/output reversal
 */
export function crc16_ccitt(data: Uint8Array): number {
  let crc = 0x0000;

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
 * CRC16-CCITT implementation for EZSP protocol
 * Polynomial: 0x1021
 * Initial value: 0xFFFF
 * Final XOR: 0x0000
 * No input/output reversal
 */
export function crc16_ccitt_ezsp(data: Uint8Array): number {
  let crc = 0xffff;

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
