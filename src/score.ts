import type { Venue } from "./types.js";

export type SafetyWeights = {
  top10: number;
  buyers: number;
  creator: number;
  tax: number;
  lp: number;
};

export const DEFAULT_WEIGHTS: SafetyWeights = {
  top10: 40,
  buyers: 20,
  creator: 25,
  tax: 10,
  lp: 15,
};

export type SafetyInput = {
  /** Share of circulating supply held by the top 10 wallets. Null until balances exist. */
  top10Share: number | null;
  uniqueBuyers: number;
  /** Launches by this creator other than the token being scored. */
  priorLaunches: number;
  /** 24-hour survival among those prior launches. Null when none have resolved. */
  survival24h: number | null;
  venue: Venue;
  taxed: boolean;
  creatorHoldsLp: boolean;
};

export type SafetyBreakdown = {
  top10: number;
  buyers: number;
  creator: number;
  tax: number;
  lp: number;
  total: number;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

/** No cut at or below 35%. Full weight by 80%, and the same full cut above that. */
export function top10Cut(share: number | null, weight: number): number {
  if (share == null || weight <= 0) return 0;
  const value = clamp01(share);
  if (value <= 0.35) return 0;
  if (value >= 0.8) return weight;
  return weight * ((value - 0.35) / 0.45);
}

/** No cut at 20 buyers or more. Full weight when the count reaches 0. */
export function buyerCut(uniqueBuyers: number, weight: number): number {
  if (weight <= 0) return 0;
  const count = Number.isFinite(uniqueBuyers) ? Math.max(0, uniqueBuyers) : 0;
  if (count >= 20) return 0;
  return weight * ((20 - count) / 20);
}

/**
 * Serial creators only. Needs 3 prior launches and a 24-hour survival rate
 * under 30%. The full weight lands when none of those windows survived.
 */
export function creatorCut(priorLaunches: number, survival24h: number | null, weight: number): number {
  if (priorLaunches < 3 || survival24h == null || weight <= 0) return 0;
  const rate = clamp01(survival24h);
  if (rate >= 0.3) return 0;
  return weight * ((0.3 - rate) / 0.3);
}

export function safetyScore(input: SafetyInput, weights: SafetyWeights = DEFAULT_WEIGHTS): SafetyBreakdown {
  const top10 = round2(top10Cut(input.top10Share, weights.top10));
  const buyers = round2(buyerCut(input.uniqueBuyers, weights.buyers));
  const creator = round2(creatorCut(input.priorLaunches, input.survival24h, weights.creator));
  const tax = input.venue === "flap" && input.taxed && weights.tax > 0 ? weights.tax : 0;
  const lp = input.venue === "flap" && input.creatorHoldsLp && weights.lp > 0 ? weights.lp : 0;
  const total = round2(Math.max(0, Math.min(100, 100 - top10 - buyers - creator - tax - lp)));
  return { top10, buyers, creator, tax, lp, total };
}
