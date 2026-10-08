export const WAD = 10n ** 18n;

/** Clamped 0..1 ratio. Six decimals of integer math keep the bar stable. */
export function unitRatio(numerator: bigint, denominator: bigint): number {
  if (denominator <= 0n || numerator <= 0n) return 0;
  const scaled = (numerator * 1_000_000n) / denominator;
  const value = Number(scaled) / 1_000_000;
  return value >= 1 ? 1 : value;
}

/** Pons curve fill. Uses real quote raised, never the phantom getReserves quote. */
export function ponsProgress(realQuoteReserve: bigint, graduationThreshold: bigint): number {
  return unitRatio(realQuoteReserve, graduationThreshold);
}

/** Flap curve fill. The contract stores 1e18 as 100%. */
export function flapProgress(progressWad: bigint): number {
  return unitRatio(progressWad, WAD);
}
