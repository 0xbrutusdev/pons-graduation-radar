export const DAY_SECONDS = 86_400;
export const WEEK_SECONDS = 7 * DAY_SECONDS;

/**
 * The pair is still there and liquidity is at least half of the first
 * post-graduation DexScreener reading.
 */
export function liquidityStayed(currentUsd: number | null, baselineUsd: number | null): boolean {
  if (currentUsd == null || baselineUsd == null) return false;
  if (!Number.isFinite(currentUsd) || !Number.isFinite(baselineUsd)) return false;
  return currentUsd + 1e-9 >= baselineUsd * 0.5;
}

/** True when the creator balance fell by 10% or more from the graduation snapshot. */
export function creatorDumped(current: bigint, snapshot: bigint): boolean {
  if (snapshot <= 0n) return false;
  return current * 10n <= snapshot * 9n;
}

/** A window counts only when liquidity held and the creator did not sell. */
export function windowSurvived(stayed: boolean, sold: boolean): boolean {
  return stayed && !sold;
}
