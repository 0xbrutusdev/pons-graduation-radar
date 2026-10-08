import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_WEIGHTS } from "../src/score.js";
import { Store, type NewToken } from "../src/store.js";

const creator = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const other = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function token(address: string): NewToken {
  return {
    token: address,
    venue: "pons",
    creator,
    name: "Radar",
    symbol: "RDR",
    curve: "0x2222222222222222222222222222222222222222",
    pool: null,
    pairToken: "0x0000000000000000000000000000000000000000",
    launchBlock: 10,
    launchTx: "0x" + "ab".repeat(32),
    launchedAt: 1_700_000_000,
    graduationThreshold: "1000",
  };
}

test("duplicate buys from one wallet do not raise the unique buyer count", async () => {
  const store = new Store(":memory:");
  const address = "0x1111111111111111111111111111111111111111";
  await store.insertToken(token(address));
  assert.equal(await store.noteBuyer(address, other, 11), true);
  assert.equal(await store.noteBuyer(address, other.toUpperCase(), 12), false);
  assert.equal(await store.noteBuyer(address, creator, 13), true);
  const row = await store.get(address);
  assert.equal(row?.uniqueBuyers, 2);
  await store.close();
});

test("the board sorts by progress, and clean first keeps curves at 70% or more", async () => {
  const store = new Store(":memory:");
  const low = "0x1111111111111111111111111111111111111111";
  const mid = "0x2222222222222222222222222222222222222222";
  const high = "0x3333333333333333333333333333333333333333";
  await store.insertToken({ ...token(low), symbol: "LOW", curve: "0x0101010101010101010101010101010101010101", launchBlock: 1 });
  await store.insertToken({ ...token(mid), symbol: "MID", curve: "0x0202020202020202020202020202020202020202", launchBlock: 2 });
  await store.insertToken({ ...token(high), symbol: "HIGH", curve: "0x0303030303030303030303030303030303030303", launchBlock: 3 });
  await store.noteProgress(low, 0.5, {});
  await store.noteProgress(mid, 0.8, {});
  await store.noteProgress(high, 0.9, {});
  await store.saveObservation({ token: mid, top10Share: 0.9, holders: [] });
  await store.saveObservation({ token: high, top10Share: 0.1, holders: [] });
  await store.noteBuyer(high, other, 4);
  await store.rescore(mid, DEFAULT_WEIGHTS);
  await store.rescore(high, DEFAULT_WEIGHTS);

  const board = await store.listRadar({ venue: "", minProgress: 0, sort: "progress", limit: 10 });
  assert.deepEqual(board.map((row) => row.symbol), ["HIGH", "MID", "LOW"]);

  const clean = await store.listRadar({ venue: "", minProgress: 0, sort: "clean", limit: 10 });
  assert.deepEqual(clean.map((row) => row.symbol), ["HIGH", "MID"]);
  assert.ok((clean[0]?.safety ?? 0) >= (clean[1]?.safety ?? 0));
  await store.close();
});

test("a zero tax read does not erase a tax already seen, and a missed timestamp can be filled later", async () => {
  const store = new Store(":memory:");
  const address = "0x1111111111111111111111111111111111111111";
  await store.insertToken({ ...token(address), venue: "flap", curve: null });
  await store.noteTax(address, { taxRate: 100, buyTaxRate: 80, sellTaxRate: 40 });
  await store.noteProgress(address, 0.2, { taxRate: 0, buyTaxRate: 0, sellTaxRate: 0 });
  await store.noteGraduated(address, { pool: "0x9999999999999999999999999999999999999999", block: 12, at: 0 });
  await store.noteGraduated(address, { pool: null, block: 12, at: 1_700_000_100 });
  const row = await store.get(address);
  assert.equal(row?.taxRate, 100);
  assert.equal(row?.buyTaxRate, 80);
  assert.equal(row?.sellTaxRate, 40);
  assert.equal(row?.graduatedAt, 1_700_000_100);
  await store.close();
});

test("a reorg restores curve progress from the real quote reserve", async () => {
  const store = new Store(":memory:");
  const address = "0x1111111111111111111111111111111111111111";
  await store.insertToken({ ...token(address), launchBlock: 10 });
  await store.noteProgress(address, 0.4, { realQuoteReserve: "400", graduationThreshold: "1000" });
  await store.noteGraduated(address, { pool: null, block: 30, at: 1_700_000_100 });
  await store.deleteFromBlock(30);
  const row = await store.get(address);
  assert.equal(row?.graduated, false);
  assert.ok(Math.abs((row?.progress ?? 0) - 0.4) < 1e-9);
  await store.close();
});

test("a reorg drops rows from the orphaned block and forgets buyers after it", async () => {
  const store = new Store(":memory:");
  const early = "0x1111111111111111111111111111111111111111";
  const late = "0x4444444444444444444444444444444444444444";
  await store.insertToken({ ...token(early), launchBlock: 10, curve: "0x0101010101010101010101010101010101010101" });
  await store.insertToken({ ...token(late), launchBlock: 30, curve: "0x0404040404040404040404040404040404040404" });
  await store.noteBuyer(early, other, 12);
  await store.noteBuyer(early, creator, 25);
  await store.deleteFromBlock(20);
  assert.equal(await store.get(late), null);
  const kept = await store.get(early);
  assert.ok(kept);
  assert.equal(kept?.uniqueBuyers, 1);
  await store.close();
});
