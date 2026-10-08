import { lower } from "./addresses.js";

/** Distinct buyer wallets. A second buy from the same address does not count. */
export function countUniqueBuyers(buyers: readonly string[]): number {
  const seen = new Set<string>();
  for (const buyer of buyers) {
    if (!buyer) continue;
    seen.add(lower(buyer));
  }
  return seen.size;
}
