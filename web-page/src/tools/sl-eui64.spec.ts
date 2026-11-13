import assert from "node:assert/strict";
import test from "node:test";
import { planEui64Repair } from "./sl-eui64";

const node = Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8);
const stale = Uint8Array.of(8, 7, 6, 5, 4, 3, 2, 1);
const token = (eui: Uint8Array) => Uint8Array.from([0xaa, 0xbb, ...eui, ...new Array(16).fill(0x11)]);

test("matching EUI64 needs no repair", () => {
  assert.deepEqual(planEui64Repair(node, node, token(node)), { mismatch: false });
});

test("mismatch rewrites only the EUI64 inside the trust center token", () => {
  const original = token(stale);
  const plan = planEui64Repair(node, stale, original);
  assert.ok(plan.mismatch);
  if (!plan.mismatch) return;
  assert.deepEqual(plan.tokenData, token(node));
  assert.deepEqual(original, token(stale), "input token is not modified");
});

test("token that disagrees with the security state is refused", () => {
  assert.throws(() => planEui64Repair(node, stale, token(Uint8Array.of(9, 9, 9, 9, 9, 9, 9, 9))), /doesn't match/);
});

test("malformed inputs are rejected", () => {
  assert.throws(() => planEui64Repair(node.slice(0, 7), stale, token(stale)), /8 bytes/);
  assert.throws(() => planEui64Repair(node, stale, Uint8Array.of(1, 2, 3)), /too short/);
});
