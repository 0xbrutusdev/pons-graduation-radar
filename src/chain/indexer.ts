import { createPublicClient, getAddress, http, webSocket, type PublicClient } from "viem";
import {
  curveAbi,
  curveBuyEvent,
  curveSellEvent,
  erc20Abi,
  factoryAbi,
  flapAsymmetricTaxEvent,
  flapProgressEvent,
  flapTaxEvent,
  launchSweptEvent,
  launchedToDexEvent,
  poolGraduatedEvent,
  portalAbi,
  tokenBoughtEvent,
  tokenCreatedEvent,
  tokenLaunchedEvent,
  tokenSoldEvent,
  transferEvent,
} from "../abi.js";
import {
  CHAIN_ID,
  FLAP_DEX_STATUS,
  FLAP_PORTAL,
  PONS_FACTORY,
  isZeroAddress,
  lower,
  sameAddress,
} from "../addresses.js";
import { dispatchAlert, dueMilestones, formatAlert } from "../alerts.js";
import type { Config } from "../config.js";
import { blockscoutHolders, concentration, excludedHolders } from "./holders.js";
import { mapRange, nextTradeBlock } from "./logs.js";
import { poolQuote } from "./market.js";
import { robinhoodChain } from "./network.js";
import { flapProgress, ponsProgress } from "../progress.js";
import type { Store, TokenRecord } from "../store.js";
import { baselineCovers, creatorDumped, DAY_SECONDS, liquidityStayed, WEEK_SECONDS, windowSurvived } from "../survival.js";

const factory = getAddress(PONS_FACTORY);
const portal = getAddress(FLAP_PORTAL);

type WatchedLog = {
  address?: string;
  eventName?: string;
  args?: unknown;
  blockNumber?: bigint | null;
  transactionHash?: `0x${string}` | null;
  logIndex?: number | bigint | null;
  removed?: boolean;
};

type Batch = { dirty: Set<string> };

function namedArgs(args: unknown): Record<string, unknown> {
  if (!args || typeof args !== "object" || Array.isArray(args)) return {};
  return args as Record<string, unknown>;
}

function textArg(args: Record<string, unknown>, key: string): string | null {
  const value = args[key];
  return typeof value === "string" ? value : null;
}

function bigintArg(args: Record<string, unknown>, key: string): bigint | null {
  const value = args[key];
  return typeof value === "bigint" ? value : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  return null;
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

function sortLogs(logs: readonly WatchedLog[]): WatchedLog[] {
  return [...logs].sort((left, right) => {
    const blockDelta = Number((left.blockNumber ?? 0n) - (right.blockNumber ?? 0n));
    if (blockDelta !== 0) return blockDelta;
    return Number(left.logIndex ?? 0) - Number(right.logIndex ?? 0);
  });
}

function createLimiter(limit: number) {
  let active = 0;
  const waiting: Array<() => void> = [];
  return function run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        active += 1;
        task().then(resolve, reject).finally(() => {
          active -= 1;
          waiting.shift()?.();
        });
      };
      if (active < limit) start();
      else waiting.push(start);
    });
  };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function defaultStart(client: PublicClient, head: bigint): Promise<bigint> {
  const sample = head > 200n ? 200n : head;
  if (sample === 0n) return 0n;
  const [latest, earlier] = await Promise.all([
    client.getBlock({ blockNumber: head }),
    client.getBlock({ blockNumber: head - sample }),
  ]);
  const elapsed = Number(latest.timestamp - earlier.timestamp);
  const perBlock = elapsed > 0 ? elapsed / Number(sample) : 0.25;
  const blocks = BigInt(Math.ceil(86_400 / perBlock));
  return head > blocks ? head - blocks : 0n;
}

async function chainNow(client: PublicClient): Promise<number> {
  const block = await client.getBlock();
  return Number(block.timestamp);
}

async function readBalance(client: PublicClient, token: string, account: string): Promise<bigint | null> {
  try {
    return await client.readContract({
      address: getAddress(token),
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [getAddress(account)],
    });
  } catch {
    return null;
  }
}

type FlapState = {
  status: number;
  reserve: bigint;
  pool: string;
  progress: bigint;
  taxRate: number;
  buyTaxRate: number;
  sellTaxRate: number;
};

function flapState(value: unknown, kind: "v7" | "v8"): FlapState | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const status = asNumber(row.status);
  const reserve = row.reserve;
  const pool = row.pool;
  const progress = row.progress;
  if (status == null || typeof reserve !== "bigint" || typeof pool !== "string" || typeof progress !== "bigint") return null;
  if (kind === "v7") {
    const tax = asNumber(row.taxRate) ?? 0;
    return { status, reserve, pool, progress, taxRate: tax, buyTaxRate: tax, sellTaxRate: tax };
  }
  const buy = asNumber(row.buyTaxRate) ?? 0;
  const sell = asNumber(row.sellTaxRate) ?? 0;
  return { status, reserve, pool, progress, taxRate: Math.max(buy, sell), buyTaxRate: buy, sellTaxRate: sell };
}

function flapGraduated(state: FlapState): boolean {
  return state.status === FLAP_DEX_STATUS || !isZeroAddress(state.pool);
}

export async function publishAlerts(store: Store, config: Config): Promise<void> {
  const rows = await store.listAlertCandidates(40);
  for (const row of rows) {
    const milestones = dueMilestones(row.progress, row.graduated);
    for (const milestone of milestones) {
      if (milestone === 70 && row.progress < 0.7 && !row.graduated) continue;
      if (milestone === 90 && row.progress < 0.9 && !row.graduated) continue;
      if (!(await store.claimAlert(row.token, milestone))) continue;
      const creator = await store.creatorStats(row.creator);
      const text = formatAlert({
        venue: row.venue,
        token: row.token,
        symbol: row.symbol,
        progress: row.graduated ? Math.max(row.progress, 1) : row.progress,
        uniqueBuyers: row.uniqueBuyers,
        top10Share: row.top10Share,
        safety: row.safety,
        creator,
      });
      await dispatchAlert(text, config);
    }
  }
}

async function applyLog(client: PublicClient, store: Store, log: WatchedLog, batch: Batch, enrich: (token: string, curve: string, block: number) => void): Promise<void> {
  const name = log.eventName;
  if (!name) return;
  const args = namedArgs(log.args);
  const block = log.blockNumber == null ? null : Number(log.blockNumber);
  const tx = log.transactionHash ?? "0x";
  const emitter = lower(log.address ?? "");
  const flapLog =
    name === "TokenCreated" ||
    name === "LaunchedToDEX" ||
    name === "FlapTokenProgressChanged" ||
    name === "TokenBought" ||
    name === "TokenSold" ||
    name === "FlapTokenTaxSet" ||
    name === "FlapTokenAsymmetricTaxSet";
  if (flapLog && emitter !== lower(portal)) return;

  if (name === "TokenLaunched") {
    const token = textArg(args, "token");
    const curve = textArg(args, "curve");
    const deployer = textArg(args, "deployer");
    const pairToken = textArg(args, "pairToken");
    const threshold = bigintArg(args, "graduationThreshold");
    if (!token || !curve || !deployer || threshold == null || block == null) return;
    const inserted = await store.insertToken({
      token,
      venue: "pons",
      creator: deployer,
      name: null,
      symbol: null,
      curve,
      pool: null,
      pairToken,
      launchBlock: block,
      launchTx: tx,
      launchedAt: 0,
      graduationThreshold: threshold.toString(),
    });
    if (inserted) enrich(token, curve, block);
    batch.dirty.add(lower(token));
    return;
  }

  if (name === "TokenCreated") {
    const token = textArg(args, "token");
    const creator = textArg(args, "creator");
    const ts = bigintArg(args, "ts");
    if (!token || !creator || block == null) return;
    await store.insertToken({
      token,
      venue: "flap",
      creator,
      name: textArg(args, "name"),
      symbol: textArg(args, "symbol"),
      curve: null,
      pool: null,
      pairToken: null,
      launchBlock: block,
      launchTx: tx,
      launchedAt: ts == null ? 0 : Number(ts),
      graduationThreshold: null,
    });
    batch.dirty.add(lower(token));
    return;
  }

  if (name === "LaunchSwept") {
    const token = textArg(args, "token");
    if (token && block != null) await store.noteSwept(token, block);
    return;
  }

  if (name === "PoolGraduated") {
    const token = textArg(args, "token");
    if (!token || block == null) return;
    let at = 0;
    try {
      at = Number((await client.getBlock({ blockNumber: BigInt(block) })).timestamp);
    } catch (error) {
      console.error("[indexer] graduation time", message(error));
    }
    await store.noteGraduated(token, { pool: null, block, at });
    batch.dirty.add(lower(token));
    return;
  }

  if (name === "LaunchedToDEX") {
    const token = textArg(args, "token");
    const pool = textArg(args, "pool");
    if (!token || block == null) return;
    const row = await store.get(token);
    if (!row || row.venue !== "flap") return;
    let at = row.launchedAt;
    try {
      at = Number((await client.getBlock({ blockNumber: BigInt(block) })).timestamp);
    } catch (error) {
      console.error("[indexer] graduation time", message(error));
    }
    await store.noteGraduated(token, { pool: pool && !isZeroAddress(pool) ? pool : null, block, at });
    batch.dirty.add(lower(token));
    return;
  }

  if (name === "FlapTokenProgressChanged") {
    const token = textArg(args, "token");
    const next = bigintArg(args, "newProgress");
    if (!token || next == null) return;
    const row = await store.get(token);
    if (!row || row.venue !== "flap") return;
    await store.noteProgress(token, flapProgress(next), {});
    batch.dirty.add(lower(token));
    return;
  }

  if (name === "FlapTokenTaxSet" || name === "FlapTokenAsymmetricTaxSet") {
    const token = textArg(args, "token");
    if (!token) return;
    const row = await store.get(token);
    if (!row || row.venue !== "flap") return;
    if (name === "FlapTokenTaxSet") {
      const tax = Number(bigintArg(args, "tax") ?? 0n);
      await store.noteTax(token, { taxRate: tax, buyTaxRate: tax, sellTaxRate: tax });
    } else {
      const buy = Number(bigintArg(args, "buyTax") ?? 0n);
      const sell = Number(bigintArg(args, "sellTax") ?? 0n);
      await store.noteTax(token, { taxRate: Math.max(buy, sell), buyTaxRate: buy, sellTaxRate: sell });
    }
    batch.dirty.add(lower(token));
    return;
  }

  if (name === "TokenBought" || name === "TokenSold") {
    const token = textArg(args, "token");
    const wallet = textArg(args, name === "TokenBought" ? "buyer" : "seller");
    if (!token || !wallet || block == null) return;
    const row = await store.get(token);
    if (!row || row.venue !== "flap") return;
    if (name === "TokenBought") await store.noteBuyer(token, wallet, block);
    else if (sameAddress(wallet, row.creator)) await store.noteCreatorSell(token, block);
    batch.dirty.add(lower(token));
    return;
  }

  if (name === "CurveBuy" || name === "CurveSell") {
    if (!emitter) return;
    const row = await store.findByCurve(emitter);
    if (!row || block == null) return;
    const wallet = textArg(args, name === "CurveBuy" ? "buyer" : "seller");
    if (!wallet) return;
    if (name === "CurveBuy") await store.noteBuyer(row.token, wallet, block);
    else if (sameAddress(wallet, row.creator)) await store.noteCreatorSell(row.token, block);
    batch.dirty.add(row.token);
  }
}

async function applyAll(client: PublicClient, store: Store, logs: readonly WatchedLog[], batch: Batch, enrich: (token: string, curve: string, block: number) => void) {
  const ordered = sortLogs(logs);
  const creates = ordered.filter((log) => log.eventName === "TokenLaunched" || log.eventName === "TokenCreated");
  const rest = ordered.filter((log) => log.eventName !== "TokenLaunched" && log.eventName !== "TokenCreated");
  for (const log of creates) await applyLog(client, store, log, batch, enrich);
  for (const log of rest) await applyLog(client, store, log, batch, enrich);
}

async function rescoreDirty(store: Store, config: Config, batch: Batch) {
  for (const token of batch.dirty) await store.rescore(token, config.weights);
}

export async function startIndexer(store: Store, config: Config): Promise<void> {
  if (!config.alchemyHttp) {
    console.warn("[indexer] ALCHEMY_HTTP_URL is not set; the radar will stay empty");
    return;
  }

  const chain = robinhoodChain(config.alchemyHttp, config.alchemyWs);
  const client = createPublicClient({ chain, transport: http(config.alchemyHttp) });
  const wsClient = config.alchemyWs
    ? createPublicClient({ chain, transport: webSocket(config.alchemyWs, { reconnect: true }) })
    : null;
  const limit = createLimiter(4);
  const watched = new Set<string>();
  let orphanedAt: number | null = null;
  let watchLive = false;

  const enrich = (token: string, curve: string, block: number) => {
    void limit(async () => {
      const [name, symbol, header] = await Promise.all([
        client.readContract({ address: getAddress(token), abi: erc20Abi, functionName: "name" }),
        client.readContract({ address: getAddress(token), abi: erc20Abi, functionName: "symbol" }),
        client.getBlock({ blockNumber: BigInt(block) }),
      ]);
      await store.updateIdentity(token, {
        name: typeof name === "string" ? name : null,
        symbol: typeof symbol === "string" ? symbol : null,
        launchedAt: Number(header.timestamp),
      });
    }).catch((error: unknown) => console.error("[indexer] token meta", lower(token), message(error)));
    if (watchLive) watchCurve(curve);
  };

  const width = BigInt(config.logChunkBlocks);

  const scanPonsTrades = async (to: bigint) => {
    const curves = (await store.listPonsCurves()).filter(
      (row) => row.curve && row.launchBlock <= Number(to) && row.buyScanned < Number(to),
    );
    const groups = new Map<number, TokenRecord[]>();
    for (const row of curves) {
      const start = nextTradeBlock(row.launchBlock, row.buyScanned);
      const group = groups.get(start) ?? [];
      group.push(row);
      groups.set(start, group);
    }
    for (const [start, group] of groups) {
      if (start > Number(to)) continue;
      for (const batch of chunks(group, 20)) {
        const addresses = batch.flatMap((row) => (row.curve ? [getAddress(row.curve)] : []));
        const logs = await mapRange(BigInt(start), to, width, (rangeFrom, rangeTo) =>
          client.getLogs({
            address: addresses,
            events: [curveBuyEvent, curveSellEvent],
            fromBlock: rangeFrom,
            toBlock: rangeTo,
          }),
        );
        const dirty: Batch = { dirty: new Set() };
        await applyAll(client, store, logs, dirty, enrich);
        await rescoreDirty(store, config, dirty);
      }
      await store.markBuysScanned(
        group.map((row) => row.token),
        Number(to),
      );
    }
  };

  const indexRange = async (from: bigint, to: bigint) => {
    const [factoryLogs, portalLogs] = await Promise.all([
      mapRange(from, to, width, (start, end) =>
        client.getLogs({
          address: factory,
          events: [tokenLaunchedEvent, launchSweptEvent, poolGraduatedEvent],
          fromBlock: start,
          toBlock: end,
        }),
      ),
      mapRange(from, to, width, (start, end) =>
        client.getLogs({
          address: portal,
          events: [
            tokenCreatedEvent,
            launchedToDexEvent,
            flapProgressEvent,
            tokenBoughtEvent,
            tokenSoldEvent,
            flapTaxEvent,
            flapAsymmetricTaxEvent,
          ],
          fromBlock: start,
          toBlock: end,
        }),
      ),
    ]);
    const dirty: Batch = { dirty: new Set() };
    await applyAll(client, store, [...factoryLogs, ...portalLogs], dirty, enrich);
    await scanPonsTrades(to);
    await rescoreDirty(store, config, dirty);
    await publishAlerts(store, config);
  };

  const rewind = async (fromBlock: number) => {
    const floor = Math.max(0, fromBlock - 2000);
    let rewindTo = floor;
    for (let block = fromBlock; block >= floor; block -= 1) {
      const stored = await store.getBlockHash(block);
      if (!stored) continue;
      const canonical = await client.getBlock({ blockNumber: BigInt(block) });
      if (canonical.hash.toLowerCase() === stored) {
        rewindTo = block;
        break;
      }
    }
    console.warn(`[indexer] reorg, rewinding to ${rewindTo}`);
    await store.deleteFromBlock(rewindTo + 1);
    await store.forgetBlocksFrom(rewindTo + 1);
    await store.rewindCursor(rewindTo, await store.getBlockHash(rewindTo));
  };

  const advance = async (to: bigint) => {
    const block = await client.getBlock({ blockNumber: to });
    await store.rememberBlock(Number(to), block.hash);
    await store.setCursor(Number(to), block.hash);
  };

  const head = await client.getBlockNumber();
  const cursor = await store.getCursor();
  let from = cursor ? BigInt(cursor.block) + 1n : (config.fromBlock ?? (await defaultStart(client, head)));
  if (from < 0n) from = 0n;
  console.log(`[indexer] backfill ${from} -> ${head}`);
  while (from <= head) {
    const to = from + width - 1n > head ? head : from + width - 1n;
    try {
      await indexRange(from, to);
      await advance(to);
      from = to + 1n;
    } catch (error) {
      console.error("[indexer] backfill", message(error));
      break;
    }
  }

  let polling: Promise<void> | null = null;
  const poll = () => {
    if (polling) return polling;
    polling = (async () => {
      if (orphanedAt != null) {
        const block = orphanedAt;
        await rewind(block);
        if (orphanedAt === block) orphanedAt = null;
      }
      const current = await store.getCursor();
      if (current) {
        const canonical = await client.getBlock({ blockNumber: BigInt(current.block) });
        if (canonical.hash.toLowerCase() !== current.hash) await rewind(current.block);
      }
      const tip = await client.getBlockNumber();
      const next = await store.getCursor();
      const start = next ? BigInt(next.block) + 1n : tip;
      if (start > tip) return;
      await indexRange(start, tip);
      await advance(tip);
    })()
      .catch((error: unknown) => console.error("[indexer] poll", message(error)))
      .finally(() => {
        polling = null;
      });
    return polling;
  };

  const onLive = (logs: readonly WatchedLog[]) => {
    const removed = logs.filter((log) => log.removed && log.blockNumber != null).map((log) => Number(log.blockNumber));
    if (removed.length > 0) {
      const block = Math.min(...removed);
      orphanedAt = orphanedAt == null ? block : Math.min(orphanedAt, block);
      void poll();
      return;
    }
    const dirty: Batch = { dirty: new Set() };
    void applyAll(client, store, logs, dirty, enrich)
      .then(() => rescoreDirty(store, config, dirty))
      .then(() => publishAlerts(store, config))
      .catch((error: unknown) => console.error("[indexer] event", message(error)))
      .finally(() => void poll());
  };

  function watchCurve(curve: string) {
    if (!wsClient) return;
    const key = lower(curve);
    if (watched.has(key)) return;
    watched.add(key);
    for (const eventName of ["CurveBuy", "CurveSell"] as const) {
      try {
        wsClient.watchContractEvent({
          address: getAddress(curve),
          abi: curveAbi,
          eventName,
          onLogs: onLive,
          onError(error) {
            console.error(`[indexer] websocket ${eventName} dropped`, error);
            void poll();
          },
        });
      } catch (error) {
        console.error("[indexer] curve watch", message(error));
      }
    }
  }

  watchLive = true;
  for (const row of await store.listOpen(300)) {
    if (row.curve) watchCurve(row.curve);
  }

  const pollCurves = async () => {
    const open = await store.listOpen(200);
    for (const batch of chunks(open, 50)) {
      await pollPons(client, store, batch.filter((row) => row.venue === "pons" && row.curve));
      await pollFlap(client, store, batch.filter((row) => row.venue === "flap"));
    }
    for (const row of open) await store.rescore(row.token, config.weights);
    await publishAlerts(store, config);
  };

  const refreshSafety = async () => {
    const now = await chainNow(client);
    const targets = await store.listSafetyTargets(now - WEEK_SECONDS, 40);
    for (const row of targets) await refreshOne(client, store, config, row, now);
    await reviewSurvival(client, store, config, now);
    await publishAlerts(store, config);
  };

  setInterval(() => void poll(), 4_000);
  setInterval(() => void pollCurves().catch((error: unknown) => console.error("[curve]", message(error))), config.curvePollMs);
  setInterval(() => void refreshSafety().catch((error: unknown) => console.error("[safety]", message(error))), config.safetyPollMs);

  if (wsClient) {
    try {
      for (const eventName of ["TokenLaunched", "LaunchSwept", "PoolGraduated"] as const) {
        wsClient.watchContractEvent({
          address: factory,
          abi: factoryAbi,
          eventName,
          onLogs: onLive,
          onError(error) {
            console.error(`[indexer] websocket ${eventName} dropped`, error);
            void poll();
          },
        });
      }
      for (const eventName of ["TokenCreated", "LaunchedToDEX", "FlapTokenProgressChanged", "TokenBought", "TokenSold", "FlapTokenTaxSet", "FlapTokenAsymmetricTaxSet"] as const) {
        wsClient.watchContractEvent({
          address: portal,
          abi: portalAbi,
          eventName,
          onLogs: onLive,
          onError(error) {
            console.error(`[indexer] websocket ${eventName} dropped`, error);
            void poll();
          },
        });
      }
      console.log("[indexer] watching factory and portal");
    } catch (error) {
      console.error("[indexer] websocket unavailable", message(error));
    }
  }
  console.log(`[indexer] live on chain ${CHAIN_ID}`);
}

async function pollPons(client: PublicClient, store: Store, rows: TokenRecord[]) {
  if (rows.length === 0) return;
  const contracts = rows.flatMap((row) => {
    const address = getAddress(row.curve as string);
    return [
      { address, abi: curveAbi, functionName: "realQuoteReserve" as const },
      { address, abi: curveAbi, functionName: "graduationThreshold" as const },
      { address, abi: curveAbi, functionName: "graduated" as const },
    ];
  });
  const results = await client.multicall({ contracts, allowFailure: true });
  const head = await client.getBlock();
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row) continue;
    const reserve = results[index * 3];
    const threshold = results[index * 3 + 1];
    const graduated = results[index * 3 + 2];
    if (!reserve || reserve.status !== "success" || typeof reserve.result !== "bigint") continue;
    const thresholdValue =
      threshold?.status === "success" && typeof threshold.result === "bigint"
        ? threshold.result
        : BigInt(row.graduationThreshold ?? "0");
    const isGraduated = graduated?.status === "success" && graduated.result === true;
    const progress = isGraduated ? 1 : ponsProgress(reserve.result, thresholdValue);
    await store.noteProgress(row.token, progress, {
      realQuoteReserve: reserve.result.toString(),
      graduationThreshold: thresholdValue.toString(),
      graduated: isGraduated,
      graduationBlock: isGraduated ? Number(head.number) : null,
      graduatedAt: isGraduated ? Number(head.timestamp) : null,
    });
  }
}

async function pollFlap(client: PublicClient, store: Store, rows: TokenRecord[]) {
  if (rows.length === 0) return;
  const first = await client.multicall({
    contracts: rows.map((row) => ({
      address: portal,
      abi: portalAbi,
      functionName: "getTokenV7" as const,
      args: [getAddress(row.token)] as const,
    })),
    allowFailure: true,
  });
  const head = await client.getBlock();
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const call = first[index];
    if (!row) continue;
    let state = call?.status === "success" ? flapState(call.result, "v7") : null;
    if (!state) {
      try {
        const fallback = await client.readContract({
          address: portal,
          abi: portalAbi,
          functionName: "getTokenV8Safe",
          args: [getAddress(row.token)],
        });
        state = flapState(fallback, "v8");
      } catch (error) {
        console.error("[curve] flap", row.token, message(error));
        continue;
      }
    }
    if (!state) continue;
    const graduated = flapGraduated(state);
    const pool = isZeroAddress(state.pool) ? null : state.pool;
    await store.noteProgress(row.token, graduated ? 1 : flapProgress(state.progress), {
      quoteReserve: state.reserve.toString(),
      status: state.status,
      pool,
      taxRate: state.taxRate,
      buyTaxRate: state.buyTaxRate,
      sellTaxRate: state.sellTaxRate,
      graduated,
      graduationBlock: graduated ? Number(head.number) : null,
      graduatedAt: graduated ? Number(head.timestamp) : null,
    });
  }
}

async function refreshOne(client: PublicClient, store: Store, config: Config, row: TokenRecord, now: number) {
  let fetched: { account: string; balance: bigint }[] | null = null;
  try {
    fetched = await blockscoutHolders(row.token);
  } catch (error) {
    console.error("[holders]", row.token, message(error));
  }

  const observation: Parameters<Store["saveObservation"]>[0] = { token: row.token };
  if (fetched) {
    const excluded = excludedHolders(row);
    let supply = 0n;
    try {
      supply = await client.readContract({
        address: getAddress(row.token),
        abi: erc20Abi,
        functionName: "totalSupply",
      });
    } catch (error) {
      console.error("[holders] supply", row.token, message(error));
    }
    const lockedCalls = excluded.filter((account) => !isZeroAddress(account));
    let locked = 0n;
    if (lockedCalls.length > 0 && supply > 0n) {
      const balances = await client.multicall({
        contracts: lockedCalls.map((account) => ({
          address: getAddress(row.token),
          abi: erc20Abi,
          functionName: "balanceOf" as const,
          args: [getAddress(account)] as const,
        })),
        allowFailure: true,
      });
      for (const result of balances) {
        if (result.status === "success" && typeof result.result === "bigint") locked += result.result;
      }
    }
    const circulating = supply > locked ? supply - locked : 0n;
    const conc = concentration(fetched, excluded, circulating);
    if (circulating > 0n) observation.top10Share = conc.top10Share;
    observation.holders = conc.top;
  }

  if (row.venue === "flap" && row.pool && !isZeroAddress(row.pool)) {
    const lp = await readBalance(client, row.pool, row.creator);
    if (lp != null) observation.creatorHoldsLp = lp > 0n;
  } else if (row.venue !== "flap") {
    observation.creatorHoldsLp = false;
  }

  const quote = row.graduated ? await poolQuote(row.token) : null;
  const pool = row.pool ?? quote?.pairAddress ?? null;
  if (quote) {
    observation.liquidityUsd = quote.liquidityUsd;
    observation.priceUsd = quote.priceUsd;
    observation.volume24h = quote.volume24h;
  }
  if (pool) observation.pool = pool;
  await store.saveObservation(observation);

  const born = row.graduatedAt && row.graduatedAt > 0 ? row.graduatedAt : now;
  if (row.graduated && row.gradLiquidityUsd == null && quote?.liquidityUsd != null) {
    const balance = await readBalance(client, row.token, row.creator);
    await store.saveSnapshot(row.token, {
      liquidityUsd: quote.liquidityUsd,
      creatorBalance: balance == null ? null : balance.toString(),
      pool,
      at: now,
    });
  } else if (row.graduated && row.gradCreatorBalance == null && now < born + DAY_SECONDS) {
    const balance = await readBalance(client, row.token, row.creator);
    if (balance != null) {
      await store.saveSnapshot(row.token, {
        liquidityUsd: null,
        creatorBalance: balance.toString(),
        pool,
        at: now,
      });
    }
  }
  await store.rescore(row.token, config.weights);
}

async function reviewSurvival(client: PublicClient, store: Store, config: Config, now: number) {
  const due = await store.listSurvivalDue(now, DAY_SECONDS, WEEK_SECONDS);
  for (const listed of due) {
    const row = await store.get(listed.token);
    if (!row?.graduatedAt) continue;
    const quote = await poolQuote(row.token);
    if (row.gradLiquidityUsd == null && quote?.liquidityUsd != null) {
      const balance = await readBalance(client, row.token, row.creator);
      await store.saveSnapshot(row.token, {
        liquidityUsd: quote.liquidityUsd,
        creatorBalance: balance == null ? null : balance.toString(),
        pool: row.pool ?? quote.pairAddress,
        at: now,
      });
      continue;
    }
    if (quote?.liquidityUsd == null && now < row.graduatedAt + WEEK_SECONDS + DAY_SECONDS) continue;
    const balance = await readBalance(client, row.token, row.creator);
    const pool = row.pool ?? quote?.pairAddress ?? null;
    let transferSold = false;
    if (pool && !isZeroAddress(pool) && row.graduationBlock != null) {
      try {
        const logs = await client.getLogs({
          address: getAddress(row.token),
          event: transferEvent,
          args: { from: getAddress(row.creator), to: getAddress(pool) },
          fromBlock: BigInt(row.graduationBlock),
          toBlock: "latest",
        });
        transferSold = logs.length > 0;
      } catch (error) {
        console.error("[survival] transfer", row.token, message(error));
      }
    }
    const dumped =
      row.creatorSold ||
      transferSold ||
      (balance != null && row.gradCreatorBalance != null && creatorDumped(balance, BigInt(row.gradCreatorBalance)));
    if (dumped) await store.noteCreatorSell(row.token, row.graduationBlock ?? row.launchBlock);
    const stayed = liquidityStayed(quote?.liquidityUsd ?? null, row.gradLiquidityUsd);
    const survived = windowSurvived(stayed, dumped);
    const detail = await store.getDetail(row.token);
    const windows = (["24h", "7d"] as const).filter((window) => {
      const wait = window === "24h" ? DAY_SECONDS : WEEK_SECONDS;
      return (
        row.graduatedAt != null &&
        row.graduatedAt + wait <= now &&
        !detail?.checkpoints[window] &&
        baselineCovers(row.gradSnapshotAt, row.graduatedAt, wait)
      );
    });
    for (const window of windows) {
      await store.saveCheckpoint({
        token: row.token,
        window,
        checkedAt: now,
        liquidityUsd: quote?.liquidityUsd ?? null,
        creatorBalance: balance == null ? null : balance.toString(),
        liquidityStayed: stayed,
        creatorSold: dumped,
        survived,
      });
    }
    const siblings = await store.listByCreator(row.creator);
    for (const sibling of siblings) await store.rescore(sibling.token, config.weights);
  }
}
