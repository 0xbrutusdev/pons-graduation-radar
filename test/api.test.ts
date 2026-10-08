import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/server.js";
import { Store } from "../src/store.js";

const creator = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const token = "0x1111111111111111111111111111111111111111";

async function seed(): Promise<Store> {
  const store = new Store(":memory:");
  await store.insertToken({
    token,
    venue: "flap",
    creator,
    name: "Radar",
    symbol: "RDR",
    curve: null,
    pool: null,
    pairToken: null,
    launchBlock: 40,
    launchTx: "0x" + "cd".repeat(32),
    launchedAt: 1_700_000_000,
    graduationThreshold: null,
  });
  await store.noteProgress(token, 0.72, { taxRate: 0 });
  await store.saveObservation({
    token,
    top10Share: 0.48,
    holders: [{ account: creator, balance: "10", share: 0.48 }],
  });
  return store;
}

test("radar, token, and creator routes return the board", async () => {
  const store = await seed();
  const app = createApp(store, "<p>radar</p>");
  const board = await app.request("/api/radar?venue=flap&minProgress=0.7");
  assert.equal(board.status, 200);
  const listed = (await board.json()) as { tokens: { symbol: string; progress: number }[] };
  assert.equal(listed.tokens.length, 1);
  assert.equal(listed.tokens[0]?.symbol, "RDR");
  assert.equal(listed.tokens[0]?.progress, 0.72);

  const hidden = await app.request("/api/radar?venue=pons");
  assert.deepEqual(((await hidden.json()) as { tokens: unknown[] }).tokens, []);

  const detail = await app.request(`/api/tokens/${token}`);
  assert.equal(detail.status, 200);
  const body = (await detail.json()) as { token: { top10Share: number; creatorStats: { launches: number } } };
  assert.equal(body.token.top10Share, 0.48);
  assert.equal(body.token.creatorStats.launches, 1);

  assert.equal((await app.request("/api/tokens/nope")).status, 400);
  assert.equal((await app.request("/api/tokens/0x2222222222222222222222222222222222222222")).status, 404);

  const history = await app.request(`/api/creators/${creator}`);
  assert.equal(history.status, 200);
  const creatorBody = (await history.json()) as { creator: { graduationRate: number | null }; tokens: unknown[] };
  assert.equal(creatorBody.tokens.length, 1);
  assert.equal(creatorBody.creator.graduationRate, 0);
  await store.close();
});
