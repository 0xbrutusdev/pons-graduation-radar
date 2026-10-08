import assert from "node:assert/strict";
import test from "node:test";
import { countUniqueBuyers } from "../src/buyers.js";

test("unique buyers ignore a second buy from the same wallet", () => {
  const buyers = [
    "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  ];
  assert.equal(countUniqueBuyers(buyers), 2);
  assert.equal(countUniqueBuyers([]), 0);
});
