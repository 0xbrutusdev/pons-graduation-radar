import { tokenUrl } from "./addresses.js";
import type { Config } from "./config.js";
import type { CreatorStats, Venue } from "./types.js";

export type AlertInput = {
  venue: Venue;
  token: string;
  symbol: string | null;
  progress: number;
  uniqueBuyers: number;
  top10Share: number | null;
  safety: number;
  creator: CreatorStats;
};

export function dueMilestones(progress: number, graduated: boolean): number[] {
  const pct = (graduated ? Math.max(progress, 1) : progress) * 100;
  const due: number[] = [];
  if (pct >= 70) due.push(70);
  if (pct >= 90) due.push(90);
  if (pct >= 100) due.push(100);
  return due;
}

function percent(value: number | null, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatAlert(input: AlertInput): string {
  const venue = input.venue === "pons" ? "Pons" : "Flap";
  const label = input.symbol ?? "token";
  const progress = percent(input.progress, 1);
  const top = input.top10Share == null ? "—" : percent(input.top10Share, 1);
  const creator = input.creator;
  return [
    "Graduation radar",
    `${venue}  ${label}  ${progress}`,
    input.token,
    `progress ${progress}`,
    `unique buyers ${input.uniqueBuyers}`,
    `top 10 ${top}`,
    `safety ${input.safety.toFixed(0)}`,
    `creator graduation ${percent(creator.graduationRate)} · 24h survival ${percent(creator.survival24h)} · 7d survival ${percent(creator.survival7d)}`,
    tokenUrl(input.token),
  ].join("\n");
}

export async function dispatchAlert(
  text: string,
  config: Pick<Config, "telegramBotToken" | "telegramChatId" | "discordWebhookUrl">,
  fetchImpl: typeof fetch = fetch,
): Promise<{ configured: boolean; delivered: boolean }> {
  const telegram = Boolean(config.telegramBotToken && config.telegramChatId);
  const discord = Boolean(config.discordWebhookUrl);
  if (!telegram && !discord) {
    console.log(`[alert]\n${text}`);
    return { configured: false, delivered: false };
  }

  let delivered = false;
  if (telegram) {
    try {
      const response = await fetchImpl(`https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: config.telegramChatId, text }),
      });
      if (response.ok) delivered = true;
      else console.error("[alert] telegram", response.status);
    } catch (error) {
      console.error("[alert] telegram", error);
    }
  }
  if (discord) {
    try {
      const response = await fetchImpl(config.discordWebhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: text.slice(0, 1900) }),
      });
      if (response.ok) delivered = true;
      else console.error("[alert] discord", response.status);
    } catch (error) {
      console.error("[alert] discord", error);
    }
  }
  return { configured: true, delivered };
}
