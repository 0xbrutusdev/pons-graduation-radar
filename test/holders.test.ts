import assert from "node:assert/strict";
import test from "node:test";
import { concentration, excludedHolders } from "../src/chain/holders.js";
import { DEAD_ADDRESS, FLAP_PORTAL, LOCKER_ADDRESS, ZERO_ADDRESS } from "../src/addresses.js";

test("Pons holder math drops the curve, locker, and burn addresses", () => {
  const curve = "0x2222222222222222222222222222222222222222";
  const excluded = excludedHolders({ venue: "pons", curve, pool: null, graduated: false });
  assert.ok(excluded.includes(curve));
  assert.ok(excluded.includes(LOCKER_ADDRESS));
  assert.ok(excluded.includes(ZERO_ADDRESS));
  assert.ok(excluded.includes(DEAD_ADDRESS));
  assert.equal(excluded.includes(FLAP_PORTAL), false);
});

test("Flap holder math drops the portal, then the v2 pair after graduation", () => {
  const pool = "0x9999999999999999999999999999999999999999";
  const live = excludedHolders({ venue: "flap", curve: null, pool, graduated: false });
  assert.ok(live.includes(FLAP_PORTAL));
  assert.equal(live.includes(pool), false);
  const graduated = excludedHolders({ venue: "flap", curve: null, pool, graduated: true });
  assert.ok(graduated.includes(pool));
  assert.ok(graduated.includes(DEAD_ADDRESS));
});

test("top 10 share uses circulating supply after exclusions", () => {
  const curve = "0x2222222222222222222222222222222222222222";
  const whale = "0x4444444444444444444444444444444444444444";
  const retail = "0x5555555555555555555555555555555555555555";
  const result = concentration(
    [
      { account: curve, balance: 700n },
      { account: whale, balance: 150n },
      { account: retail, balance: 150n },
    ],
    [curve],
    300n,
  );
  assert.equal(result.top10Share, 1);
  assert.equal(result.top[0]?.account, whale);
  assert.equal(result.top[0]?.share, 0.5);
});

test("unknown circulating supply does not invent a top-10 share", () => {
  const whale = "0x4444444444444444444444444444444444444444";
  const result = concentration([{ account: whale, balance: 100n }], [], 0n);
  assert.equal(result.top10Share, null);
  assert.equal(result.top[0]?.account, whale);
});
