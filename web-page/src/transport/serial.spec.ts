import assert from "node:assert/strict";
import test from "node:test";
import { SerialPort } from "./serial";

class MockPort {
  readable: ReadableStream<Uint8Array> | null = null;
  writable: WritableStream<Uint8Array> | null = null;
  opens: number[] = [];
  constructor(private failures: (baud: number, attempt: number) => boolean) {}
  async open({ baudRate }: { baudRate: number }) {
    this.opens.push(baudRate);
    if (this.failures(baudRate, this.opens.filter((b) => b === baudRate).length)) {
      throw new Error("Failed to open serial port.");
    }
    this.readable = new ReadableStream<Uint8Array>();
    this.writable = new WritableStream<Uint8Array>();
  }
  async close() {
    this.readable = null;
    this.writable = null;
  }
}

function wrap(port: MockPort): SerialPort {
  const serial = new SerialPort(115200);
  serial.useExistingPortAndStart(port as unknown as globalThis.SerialPort);
  return serial;
}

test("baud switch retries a transiently busy port", async () => {
  const port = new MockPort((baud, attempt) => baud === 460800 && attempt === 1);
  await port.open({ baudRate: 115200 });
  const serial = wrap(port);
  await serial.reopenWithBaudrate(460800);
  assert.deepEqual(port.opens, [115200, 460800, 460800]);
  await serial.write(Uint8Array.of(1));
});

test("failed baud switch reopens at the previous rate instead of leaving the port closed", async () => {
  const port = new MockPort((baud) => baud === 460800);
  await port.open({ baudRate: 115200 });
  const serial = wrap(port);
  await assert.rejects(serial.reopenWithBaudrate(460800), /Failed to open/);
  assert.equal(port.opens.at(-1), 115200);
  await serial.write(Uint8Array.of(1));
});
