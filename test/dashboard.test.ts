import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createApp } from "../src/server.js";
import { Store } from "../src/store.js";

const creator = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const token = "0x1111111111111111111111111111111111111111";
const prior = "0x4444444444444444444444444444444444444444";

async function waitFor(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("timed out waiting for the radar");
}

test("opening a token renders progress, holder concentration, and creator survival", async () => {
  const store = new Store(":memory:");
  await store.insertToken({
    token,
    venue: "pons",
    creator,
    name: "Radar",
    symbol: "RDR",
    curve: "0x2222222222222222222222222222222222222222",
    pool: null,
    pairToken: "0x0000000000000000000000000000000000000000",
    launchBlock: 50,
    launchTx: "0x" + "cd".repeat(32),
    launchedAt: 1_700_000_000,
    graduationThreshold: "1000",
  });
  await store.noteProgress(token, 0.72, { realQuoteReserve: "720", graduationThreshold: "1000" });
  await store.saveObservation({
    token,
    top10Share: 0.48,
    holders: [{ account: "0x5555555555555555555555555555555555555555", balance: "480", share: 0.48 }],
  });
  await store.insertToken({
    token: prior,
    venue: "pons",
    creator,
    name: "Old",
    symbol: "OLD",
    curve: "0x6666666666666666666666666666666666666666",
    pool: null,
    pairToken: null,
    launchBlock: 10,
    launchTx: "0x" + "ef".repeat(32),
    launchedAt: 1_600_000_000,
    graduationThreshold: "1000",
  });
  await store.noteGraduated(prior, { pool: null, block: 20, at: 1_600_000_100 });
  await store.saveCheckpoint({
    token: prior,
    window: "24h",
    checkedAt: 1_600_086_500,
    liquidityUsd: 40,
    creatorBalance: "90",
    liquidityStayed: false,
    creatorSold: true,
    survived: false,
  });

  const app = createApp(store);
  const html = await (await app.request("/")).text();
  const dom = new JSDOM(html, {
    url: "http://127.0.0.1/",
    runScripts: "dangerously",
    beforeParse(window) {
      window.fetch = (async (input: RequestInfo | URL) => {
        const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        const url = new URL(raw, "http://127.0.0.1");
        return app.request(url.pathname + url.search);
      }) as typeof fetch;
    },
  });

  try {
    const document = dom.window.document;
    await waitFor(() => document.querySelector("[data-token]") != null);
    const row = document.querySelector<HTMLButtonElement>(`[data-token="${token}"]`);
    assert.ok(row);
    row.click();
    await waitFor(() => (document.querySelector("#progress-line")?.textContent ?? "").includes("72.0%"));
    assert.match(document.querySelector("#progress-line")?.textContent ?? "", /progress 72\.0%/);
    assert.match(document.querySelector("#holder-panel")?.textContent ?? "", /top 10 48\.0%/);
    assert.match(document.querySelector("#survival-line")?.textContent ?? "", /24h survival 0%/);
    assert.match(document.querySelector("#survival-line")?.textContent ?? "", /graduation 50%/);
  } finally {
    dom.window.close();
    await store.close();
  }
});
