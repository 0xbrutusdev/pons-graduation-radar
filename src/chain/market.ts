export type PoolQuote = {
  pairAddress: string | null;
  priceUsd: string | null;
  liquidityUsd: number | null;
  volume24h: number | null;
};

type DexPair = {
  chainId?: string;
  pairAddress?: string;
  priceUsd?: string | null;
  liquidity?: { usd?: number | null };
  volume?: { h24?: number | null };
};

function isRobinhoodPair(chainId: string | undefined): boolean {
  if (!chainId) return false;
  const id = chainId.toLowerCase();
  return id.includes("robin") || id === "4663";
}

async function dexscreener(token: string): Promise<PoolQuote | null> {
  const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${token}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`dexscreener ${response.status}`);
  const payload = (await response.json()) as { pairs?: DexPair[] | null };
  const pairs = (payload.pairs ?? []).filter((pair) => isRobinhoodPair(pair.chainId));
  if (pairs.length === 0) return null;
  pairs.sort((left, right) => (right.liquidity?.usd ?? 0) - (left.liquidity?.usd ?? 0));
  const best = pairs[0];
  if (!best) return null;
  return {
    pairAddress: best.pairAddress ?? null,
    priceUsd: best.priceUsd ?? null,
    liquidityUsd: best.liquidity?.usd ?? null,
    volume24h: best.volume?.h24 ?? null,
  };
}

async function geckoterminal(token: string): Promise<PoolQuote | null> {
  const response = await fetch(`https://api.geckoterminal.com/api/v2/search/pools?query=${token}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`geckoterminal ${response.status}`);
  const payload = (await response.json()) as {
    data?: {
      attributes?: {
        address?: string;
        base_token_price_usd?: string | null;
        reserve_in_usd?: string | null;
        volume_usd?: { h24?: string | null };
      };
      relationships?: { network?: { data?: { id?: string } } };
    }[];
  };
  const pools = (payload.data ?? []).filter((pool) => {
    const network = pool.relationships?.network?.data?.id?.toLowerCase() ?? "";
    return network.includes("robin") || network === "4663";
  });
  const best = pools[0];
  if (!best?.attributes) return null;
  const liquidity = best.attributes.reserve_in_usd == null ? null : Number(best.attributes.reserve_in_usd);
  const volume = best.attributes.volume_usd?.h24 == null ? null : Number(best.attributes.volume_usd.h24);
  return {
    pairAddress: best.attributes.address ?? null,
    priceUsd: best.attributes.base_token_price_usd ?? null,
    liquidityUsd: liquidity != null && Number.isFinite(liquidity) ? liquidity : null,
    volume24h: volume != null && Number.isFinite(volume) ? volume : null,
  };
}

export async function poolQuote(token: string): Promise<PoolQuote | null> {
  try {
    const dex = await dexscreener(token);
    if (dex) return dex;
  } catch (error) {
    console.error("[market] dexscreener", error instanceof Error ? error.message : error);
  }
  try {
    return await geckoterminal(token);
  } catch (error) {
    console.error("[market] geckoterminal", error instanceof Error ? error.message : error);
    return null;
  }
}
