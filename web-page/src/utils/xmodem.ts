import { crc16_ccitt } from "./crc";

export const XMODEM_BLOCK_SIZE = 128;

export enum XModemPacketType {
  SOH = 0x01, // Start of Header
  EOT = 0x04, // End of Transmission
  ACK = 0x06, // Acknowledge
  NAK = 0x15, // Not Acknowledge
  CAN = 0x18, // Cancel
}

export class XmodemCRCPacket {
  constructor(
    public number: number, // Packet number (1-255, wraps around)
    public payload: Uint8Array // Must be exactly XMODEM_BLOCK_SIZE bytes
  ) {
    if (payload.length !== XMODEM_BLOCK_SIZE) {
      throw new Error(`Payload must be ${XMODEM_BLOCK_SIZE} bytes`);
    }
  }

  serialize(): Uint8Array {
    const crc = crc16_ccitt(this.payload);
    const packet = new Uint8Array(3 + XMODEM_BLOCK_SIZE + 2);

    packet[0] = XModemPacketType.SOH;
    packet[1] = this.number & 0xff;
    packet[2] = (0xff - this.number) & 0xff;
    packet.set(this.payload, 3);
    packet[3 + XMODEM_BLOCK_SIZE] = (crc >> 8) & 0xff; // CRC high byte
    packet[3 + XMODEM_BLOCK_SIZE + 1] = crc & 0xff; // CRC low byte

    return packet;
  }
}
