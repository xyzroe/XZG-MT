import assert from "node:assert/strict";
import test from "node:test";
import { parseVersionInfoBuild } from "./sl-version-info";

test("EZSP v14+ reply with 4-byte status yields the build number", () => {
  // Sonoff ZBDongle-E, 8.0.2.0 build 397
  const reply = Uint8Array.of(0x00, 0x00, 0x00, 0x00, 0x07, 0x8d, 0x01, 0x08, 0x00, 0x02, 0x00, 0x00);
  assert.equal(parseVersionInfoBuild(reply, 14), 397);
});

test("EZSP < 14 reply with 1-byte status is unchanged", () => {
  const reply = Uint8Array.of(0x00, 0x07, 0x8d, 0x01, 0x07, 0x04, 0x03, 0x00, 0x00);
  assert.equal(parseVersionInfoBuild(reply, 13), 397);
  assert.equal(parseVersionInfoBuild(reply, 8), 397);
});

test("error status, short or truncated replies give null", () => {
  assert.equal(parseVersionInfoBuild(Uint8Array.of(0x01, 0x00, 0x00, 0x00, 0x07, 0x8d, 0x01, 0, 0, 0, 0), 14), null);
  assert.equal(parseVersionInfoBuild(Uint8Array.of(0x01, 0x07, 0x8d, 0x01, 0, 0, 0, 0), 13), null);
  assert.equal(parseVersionInfoBuild(Uint8Array.of(0x00, 0x00, 0x00, 0x00, 0x07, 0x8d), 14), null);
  assert.equal(parseVersionInfoBuild(Uint8Array.of(0x00), 13), null);
});
