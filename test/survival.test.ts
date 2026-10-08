import assert from "node:assert/strict";
import test from "node:test";
import { baselineCovers, creatorDumped, DAY_SECONDS, liquidityStayed, windowSurvived } from "../src/survival.js";

test("liquidity stayed when the pair is still at least half the first reading", () => {
  assert.equal(liquidityStayed(50, 100), true);
  assert.equal(liquidityStayed(49, 100), false);
  assert.equal(liquidityStayed(null, 100), false);
  assert.equal(liquidityStayed(10, null), false);
});

test("a creator sale is a balance drop of 10% or more", () => {
  assert.equal(creatorDumped(90n, 100n), true);
  assert.equal(creatorDumped(91n, 100n), false);
  assert.equal(creatorDumped(0n, 0n), false);
});

test("a window survives only when liquidity stayed and the creator did not sell", () => {
  assert.equal(windowSurvived(true, false), true);
  assert.equal(windowSurvived(true, true), false);
  assert.equal(windowSurvived(false, false), false);
});

test("a survival window needs a snapshot taken before that window", () => {
  const graduatedAt = 1_700_000_000;
  assert.equal(baselineCovers(graduatedAt + 60, graduatedAt, DAY_SECONDS), true);
  assert.equal(baselineCovers(graduatedAt + DAY_SECONDS, graduatedAt, DAY_SECONDS), false);
  assert.equal(baselineCovers(null, graduatedAt, DAY_SECONDS), false);
});
