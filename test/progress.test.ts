import assert from "node:assert/strict";
import test from "node:test";
import { flapProgress, ponsProgress, WAD } from "../src/progress.js";

test("Pons progress is real quote reserve over the graduation threshold", () => {
  assert.equal(ponsProgress(42n, 100n), 0.42);
  assert.equal(ponsProgress(42n * 10n ** 17n, 42n * 10n ** 17n), 1);
  assert.equal(ponsProgress(200n, 100n), 1);
  assert.equal(ponsProgress(10n, 0n), 0);
});

test("Flap progress is the wad progress field over 1e18", () => {
  assert.equal(flapProgress(WAD / 2n), 0.5);
  assert.equal(flapProgress(WAD), 1);
  assert.equal(flapProgress(WAD * 2n), 1);
  assert.equal(flapProgress(0n), 0);
});
