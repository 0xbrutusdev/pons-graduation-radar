import {
  DEAD_ADDRESS,
  FLAP_PORTAL,
  LOCKER_ADDRESS,
  ZERO_ADDRESS,
  lower,
  BLOCKSCOUT_API,
} from "../addresses.js";
import { unitRatio } from "../progress.js";
import type { HolderView, Venue } from "../types.js";

export type Balance = { account: string; balance: bigint };

export function excludedHolders(input: {
  venue: Venue;
  curve: string | null;
  pool: string | null;
  graduated: boolean;
}): string[] {
  const rows = [ZERO_ADDRESS, DEAD_ADDRESS];
  if (input.venue === "pons") {
    rows.push(LOCKER_ADDRESS);
    if (input.curve) rows.push(input.curve);
    if (input.pool) rows.push(input.pool);
  } else {
    rows.push(FLAP_PORTAL);
    if (input.graduated && input.pool) rows.push(input.pool);
  }
  return [...new Set(rows.map(lower))];
}

export function concentration(
  holders: readonly Balance[],
  excluded: readonly string[],
  circulating: bigint,
): { top10Share: number | null; top: HolderView[] } {
  const skip = new Set(excluded.map(lower));
  const included = holders.filter((holder) => holder.balance > 0n && !skip.has(lower(holder.account)));
  included.sort((left, right) => (left.balance > right.balance ? -1 : left.balance < right.balance ? 1 : 0));
  const supply = circulating > 0n ? circulating : included.reduce((sum, holder) => sum + holder.balance, 0n);
  if (supply <= 0n) return { top10Share: null, top: [] };
  const top = included.slice(0, 10).map((holder) => ({
    account: lower(holder.account),
    balance: holder.balance.toString(),
    share: unitRatio(holder.balance, supply),
  }));
  const summed = top.reduce((sum, holder) => sum + BigInt(holder.balance), 0n);
  return { top10Share: unitRatio(summed, supply), top };
}

export async function blockscoutHolders(token: string): Promise<Balance[]> {
  const response = await fetch(`${BLOCKSCOUT_API}/tokens/${token}/holders`, {
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`blockscout holders ${response.status}`);
  const payload = (await response.json()) as {
    items?: { address?: { hash?: string }; value?: string }[];
  };
  const rows: Balance[] = [];
  for (const item of payload.items ?? []) {
    const account = item.address?.hash;
    if (!account || !item.value) continue;
    try {
      rows.push({ account: lower(account), balance: BigInt(item.value) });
    } catch {
      continue;
    }
  }
  return rows;
}
