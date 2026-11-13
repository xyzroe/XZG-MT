import assert from "node:assert/strict";
import test from "node:test";
import { ZIGBEE_CHANNELS, energyColor, energyLabel, energyPercent } from "./energy";

test("Zigbee channels are 11..26", () => {
  assert.equal(ZIGBEE_CHANNELS.length, 16);
  assert.equal(ZIGBEE_CHANNELS[0], 11);
  assert.equal(ZIGBEE_CHANNELS[15], 26);
});

test("RSSI is mapped onto 0..100 percent and clamped", () => {
  assert.equal(energyPercent(-100), 0);
  assert.equal(energyPercent(-60), 50);
  assert.equal(energyPercent(-20), 100);
  assert.equal(energyPercent(-127), 0);
  assert.equal(energyPercent(10), 100);
});

test("colour runs from green (quiet) to red (busy)", () => {
  assert.equal(energyColor(0), "hsl(120, 70%, 45%)");
  assert.equal(energyColor(100), "hsl(0, 70%, 45%)");
  assert.equal(energyColor(-5), energyColor(0));
});

test("labels mention the peak only when it is higher than the latest value", () => {
  assert.equal(energyLabel(11, null, null), "Channel 11: no data");
  assert.equal(energyLabel(15, -61, -61), "Channel 15: -61 dBm");
  assert.equal(energyLabel(15, -61, -40), "Channel 15: -61 dBm (peak -40 dBm)");
});
