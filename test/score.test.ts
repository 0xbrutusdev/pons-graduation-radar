import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_WEIGHTS, safetyScore } from "../src/score.js";

const clean = {
  top10Share: 0.2,
  uniqueBuyers: 30,
  priorLaunches: 1,
  survival24h: 1,
  venue: "pons" as const,
  taxed: false,
  creatorHoldsLp: false,
};

test("a clean curve keeps the full safety score", () => {
  const score = safetyScore(clean, DEFAULT_WEIGHTS);
  assert.equal(score.total, 100);
  assert.equal(score.top10, 0);
  assert.equal(score.buyers, 0);
});

test("top 10 concentration cuts nothing at 35% and 40 points at 80%", () => {
  assert.equal(safetyScore({ ...clean, top10Share: 0.35 }).top10, 0);
  assert.equal(safetyScore({ ...clean, top10Share: 0.8 }).top10, 40);
  assert.equal(safetyScore({ ...clean, top10Share: 0.575 }).top10, 20);
  assert.equal(safetyScore({ ...clean, top10Share: null }).top10, 0);
});

test("buyer breadth cuts nothing at 20 wallets and 20 points at zero", () => {
  assert.equal(safetyScore({ ...clean, uniqueBuyers: 20 }).buyers, 0);
  assert.equal(safetyScore({ ...clean, uniqueBuyers: 0 }).buyers, 20);
  assert.equal(safetyScore({ ...clean, uniqueBuyers: 10 }).buyers, 10);
});

test("creator history cuts only after 3 prior launches with weak 24h survival", () => {
  assert.equal(safetyScore({ ...clean, priorLaunches: 2, survival24h: 0 }).creator, 0);
  assert.equal(safetyScore({ ...clean, priorLaunches: 3, survival24h: null }).creator, 0);
  assert.equal(safetyScore({ ...clean, priorLaunches: 3, survival24h: 0.3 }).creator, 0);
  assert.equal(safetyScore({ ...clean, priorLaunches: 3, survival24h: 0 }).creator, 25);
  assert.equal(safetyScore({ ...clean, priorLaunches: 3, survival24h: 0.15 }).creator, 12.5);
});

test("Flap tax and unlocked LP cut the score, and Pons ignores the LP flag", () => {
  const flap = safetyScore({ ...clean, venue: "flap", taxed: true, creatorHoldsLp: true });
  assert.equal(flap.tax, 10);
  assert.equal(flap.lp, 15);
  assert.equal(flap.total, 75);
  const pons = safetyScore({ ...clean, venue: "pons", taxed: true, creatorHoldsLp: true });
  assert.equal(pons.tax, 0);
  assert.equal(pons.lp, 0);
  assert.equal(pons.total, 100);
});
