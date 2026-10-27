import assert from "node:assert/strict";
import test from "node:test";
import type { TestContext } from "node:test";
import { TcpClient } from "./tcp";

class MockWebSocket {
  static OPEN = 1;
  static instances: MockWebSocket[] = [];
  readyState = 0;
  binaryType = "";
  onopen = () => {};
  onerror = () => {};
  onclose = (_event: { code: number }) => {};
  onmessage = (_event: { data: ArrayBuffer }) => {};
  sent: Uint8Array[] = [];
  constructor(public url: string) { MockWebSocket.instances.push(this); }
  open() { this.readyState = 1; this.onopen(); }
  close() { this.readyState = 3; this.onclose({ code: 1000 }); }
  send(data: Uint8Array) { this.sent.push(data); }
}

function installMock(t: TestContext) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "WebSocket");
  Object.defineProperty(globalThis, "WebSocket", { configurable: true, writable: true, value: MockWebSocket });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, "WebSocket", original);
    else Reflect.deleteProperty(globalThis, "WebSocket");
  });
}

test("TCP connects before writes, rejects closure and permits reconnect", async (t) => {
  installMock(t);
  const client = new TcpClient("ws://bridge:8765");
  const pending = client.connect("device", 6638);
  const socket = MockWebSocket.instances.at(-1)!;
  await assert.rejects(client.write(Uint8Array.of(1)), /not connected/);
  socket.open();
  await pending;
  await client.write(Uint8Array.of(1, 2));
  assert.deepEqual(socket.sent, [Uint8Array.of(1, 2)]);
  socket.close();
  await assert.rejects(client.write(Uint8Array.of(3)), /not connected/);
  const reconnect = client.connect("device", 6638);
  const replacement = MockWebSocket.instances.at(-1)!;
  // An old close event must not discard the new socket.
  socket.close();
  replacement.open();
  await reconnect;
  await client.write(Uint8Array.of(4));
  assert.deepEqual(replacement.sent, [Uint8Array.of(4)]);
  client.close();
});

test("TCP cancellation and handshake errors reject instead of leaving a stale socket", async (t) => {
  installMock(t);
  const client = new TcpClient("ws://bridge:8765");
  const cancelled = client.connect("device", 6638);
  const cancelledResult = assert.rejects(cancelled, /closed|cancelled/);
  client.close();
  await cancelledResult;
  const failed = client.connect("device", 6638);
  const failedResult = assert.rejects(failed, /error|closed/);
  MockWebSocket.instances.at(-1)!.onerror();
  await failedResult;
  const retry = client.connect("device", 6638);
  MockWebSocket.instances.at(-1)!.open();
  await retry;
  client.close();
});

test("baud reconnect retains protocol receive and transmit subscriptions", async (t) => {
  installMock(t);
  const client = new TcpClient("ws://bridge:8765");
  const initial = client.connect("device", 6638);
  const previous = MockWebSocket.instances.at(-1)!;
  previous.open();
  await initial;
  const received: Uint8Array[] = [];
  const sent: Uint8Array[] = [];
  client.onData((data) => received.push(data));
  client.onTx((data) => sent.push(data));
  const reconnect = client.reconnect("device", 6638);
  const replacement = MockWebSocket.instances.at(-1)!;
  replacement.open();
  await reconnect;
  previous.onmessage({ data: Uint8Array.of(9).buffer });
  replacement.onmessage({ data: Uint8Array.of(1, 2).buffer });
  await client.write(Uint8Array.of(3));
  assert.deepEqual(received, [Uint8Array.of(1, 2)]);
  assert.deepEqual(sent, [Uint8Array.of(3)]);
  client.close();
});
