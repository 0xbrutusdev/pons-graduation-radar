import type { SafetyBreakdown } from "./score.js";

export type Venue = "pons" | "flap";

export type HolderView = {
  account: string;
  balance: string;
  share: number;
};

export type CheckpointView = {
  window: "24h" | "7d";
  checkedAt: number;
  liquidityUsd: number | null;
  creatorBalance: string | null;
  liquidityStayed: boolean;
  creatorSold: boolean;
  survived: boolean;
};

export type CreatorStats = {
  address: string;
  launches: number;
  graduations: number;
  graduationRate: number | null;
  survival24h: number | null;
  survival7d: number | null;
  resolved24h: number;
  resolved7d: number;
};

export type RadarRow = {
  token: string;
  venue: Venue;
  creator: string;
  name: string | null;
  symbol: string | null;
  progress: number;
  uniqueBuyers: number;
  top10Share: number | null;
  safety: number;
  graduated: boolean;
  swept: boolean;
  taxRate: number;
  curve: string | null;
  pool: string | null;
};

export type TokenDetail = RadarRow & {
  launchBlock: number;
  launchTx: string;
  launchedAt: number;
  graduationBlock: number | null;
  graduatedAt: number | null;
  graduationThreshold: string | null;
  realQuoteReserve: string | null;
  quoteReserve: string | null;
  buyTaxRate: number;
  sellTaxRate: number;
  safetyBreakdown: SafetyBreakdown | null;
  holders: HolderView[];
  liquidityUsd: number | null;
  priceUsd: string | null;
  volume24h: number | null;
  gradLiquidityUsd: number | null;
  gradCreatorBalance: string | null;
  creatorSold: boolean;
  creatorHoldsLp: boolean;
  checkpoints: { "24h": CheckpointView | null; "7d": CheckpointView | null };
  creatorStats: CreatorStats;
};
