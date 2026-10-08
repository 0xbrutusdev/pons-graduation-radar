import { DEFAULT_WEIGHTS, type SafetyWeights } from "./score.js";

export type Config = {
  alchemyHttp: string;
  alchemyWs: string;
  fromBlock: bigint | null;
  dbPath: string;
  port: number;
  telegramBotToken: string;
  telegramChatId: string;
  discordWebhookUrl: string;
  logChunkBlocks: number;
  curvePollMs: number;
  safetyPollMs: number;
  weights: SafetyWeights;
};

function numeric(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name} must be a number`);
  return value;
}

function wsFromHttp(httpUrl: string): string {
  if (httpUrl.startsWith("https://")) return `wss://${httpUrl.slice("https://".length)}`;
  if (httpUrl.startsWith("http://")) return `ws://${httpUrl.slice("http://".length)}`;
  return httpUrl;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const alchemyHttp = (env.ALCHEMY_HTTP_URL ?? "").trim();
  const alchemyWs = (env.ALCHEMY_WS_URL ?? "").trim() || (alchemyHttp ? wsFromHttp(alchemyHttp) : "");
  const fromRaw = (env.FROM_BLOCK ?? "").trim();
  let fromBlock: bigint | null = null;
  if (fromRaw) {
    try {
      fromBlock = BigInt(fromRaw);
    } catch {
      throw new Error("FROM_BLOCK must be an integer block number");
    }
  }

  return {
    alchemyHttp,
    alchemyWs,
    fromBlock,
    dbPath: (env.DB_PATH ?? "data/radar.sqlite").trim() || "data/radar.sqlite",
    port: Math.max(1, Math.floor(numeric(env, "PORT", 8788))),
    telegramBotToken: (env.TELEGRAM_BOT_TOKEN ?? "").trim(),
    telegramChatId: (env.TELEGRAM_CHAT_ID ?? "").trim(),
    discordWebhookUrl: (env.DISCORD_WEBHOOK_URL ?? "").trim(),
    logChunkBlocks: Math.max(100, Math.floor(numeric(env, "LOG_CHUNK_BLOCKS", 5000))),
    curvePollMs: Math.max(5_000, Math.floor(numeric(env, "CURVE_POLL_MS", 15_000))),
    safetyPollMs: Math.max(15_000, Math.floor(numeric(env, "SAFETY_POLL_MS", 60_000))),
    weights: {
      top10: numeric(env, "WEIGHT_TOP10", DEFAULT_WEIGHTS.top10),
      buyers: numeric(env, "WEIGHT_BUYERS", DEFAULT_WEIGHTS.buyers),
      creator: numeric(env, "WEIGHT_CREATOR", DEFAULT_WEIGHTS.creator),
      tax: numeric(env, "WEIGHT_TAX", DEFAULT_WEIGHTS.tax),
      lp: numeric(env, "WEIGHT_LP", DEFAULT_WEIGHTS.lp),
    },
  };
}
