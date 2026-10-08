import assert from "node:assert/strict";
import test from "node:test";
import { dispatchAlert, formatAlert } from "../src/alerts.js";

const creator = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const token = "0x1111111111111111111111111111111111111111";

const input = {
  venue: "pons" as const,
  token,
  symbol: "RDR",
  progress: 0.72,
  uniqueBuyers: 14,
  top10Share: 0.412,
  safety: 78,
  creator: {
    address: creator,
    launches: 5,
    graduations: 2,
    graduationRate: 0.4,
    survival24h: 0.25,
    survival7d: 0.1,
    resolved24h: 4,
    resolved7d: 2,
  },
};

test("alert text is a dry-run snapshot of venue, progress, and creator survival", () => {
  assert.equal(
    formatAlert(input),
    [
      "Graduation radar",
      "Pons  RDR  72.0%",
      token,
      "progress 72.0%",
      "unique buyers 14",
      "top 10 41.2%",
      "safety 78",
      "creator graduation 40% · 24h survival 25% · 7d survival 10%",
      `https://robinhoodchain.blockscout.com/token/${token}`,
    ].join("\n"),
  );
});

test("a real Telegram send happens only when the bot token is set", async () => {
  let called = false;
  const fetchImpl: typeof fetch = async () => {
    called = true;
    return new Response("ok");
  };
  const dry = await dispatchAlert("hello", { telegramBotToken: "", telegramChatId: "", discordWebhookUrl: "" }, fetchImpl);
  assert.equal(dry.configured, false);
  assert.equal(dry.delivered, false);
  assert.equal(called, false);

  const sent = await dispatchAlert(
    "hello",
    { telegramBotToken: "bot", telegramChatId: "1", discordWebhookUrl: "" },
    fetchImpl,
  );
  assert.equal(sent.configured, true);
  assert.equal(sent.delivered, true);
  assert.equal(called, true);
});
