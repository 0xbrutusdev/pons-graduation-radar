import assert from "node:assert/strict";
import test from "node:test";
import { nextTradeBlock } from "../src/chain/logs.js";

test("each curve resumes at its own cursor instead of another curve's history", () => {
  assert.equal(nextTradeBlock(100, 99), 100);
  assert.equal(nextTradeBlock(100, 5_000), 5_001);
  assert.equal(nextTradeBlock(8_000, 100), 8_000);
});
