import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { lower } from "./addresses.js";
import { safetyScore, type SafetyWeights } from "./score.js";
import type {
  CheckpointView,
  CreatorStats,
  HolderView,
  RadarRow,
  TokenDetail,
  Venue,
} from "./types.js";

export type NewToken = {
  token: string;
  venue: Venue;
  creator: string;
  name: string | null;
  symbol: string | null;
  curve: string | null;
  pool: string | null;
  pairToken: string | null;
  launchBlock: number;
  launchTx: string;
  launchedAt: number;
  graduationThreshold: string | null;
};

export type ProgressPatch = {
  realQuoteReserve?: string | null;
  graduationThreshold?: string | null;
  quoteReserve?: string | null;
  status?: number | null;
  pool?: string | null;
  taxRate?: number | null;
  buyTaxRate?: number | null;
  sellTaxRate?: number | null;
  graduated?: boolean;
  graduationBlock?: number | null;
  graduatedAt?: number | null;
};

export type Observation = {
  token: string;
  top10Share?: number | null;
  holders?: HolderView[];
  creatorHoldsLp?: boolean;
  liquidityUsd?: number | null;
  priceUsd?: string | null;
  volume24h?: number | null;
  pool?: string | null;
};

export type RadarQuery = {
  venue: Venue | "";
  minProgress: number;
  sort: "progress" | "clean" | "buyers" | "safety";
  limit: number;
};

type TokenRow = {
  token: string;
  venue: string;
  creator: string;
  name: string | null;
  symbol: string | null;
  curve: string | null;
  pool: string | null;
  pair_token: string | null;
  launch_block: number;
  launch_tx: string;
  launched_at: number;
  graduation_threshold: string | null;
  real_quote_reserve: string | null;
  quote_reserve: string | null;
  progress: number;
  graduated: number;
  swept: number;
  graduation_block: number | null;
  graduated_at: number | null;
  swept_block: number | null;
  status: number | null;
  tax_rate: number;
  buy_tax_rate: number;
  sell_tax_rate: number;
  unique_buyers: number;
  buy_scanned: number;
  top10_share: number | null;
  safety: number;
  safety_json: string | null;
  creator_holds_lp: number;
  holders_json: string | null;
  liquidity_usd: number | null;
  price_usd: string | null;
  volume_24h: number | null;
  grad_liquidity_usd: number | null;
  grad_creator_balance: string | null;
  grad_snapshot_at: number | null;
  creator_sold: number;
  creator_sold_block: number | null;
  updated_at: number;
};

export type TokenRecord = {
  token: string;
  venue: Venue;
  creator: string;
  name: string | null;
  symbol: string | null;
  curve: string | null;
  pool: string | null;
  pairToken: string | null;
  launchBlock: number;
  launchTx: string;
  launchedAt: number;
  graduationThreshold: string | null;
  realQuoteReserve: string | null;
  quoteReserve: string | null;
  progress: number;
  graduated: boolean;
  swept: boolean;
  graduationBlock: number | null;
  graduatedAt: number | null;
  status: number | null;
  taxRate: number;
  buyTaxRate: number;
  sellTaxRate: number;
  uniqueBuyers: number;
  buyScanned: number;
  top10Share: number | null;
  safety: number;
  creatorHoldsLp: boolean;
  holders: HolderView[];
  liquidityUsd: number | null;
  priceUsd: string | null;
  volume24h: number | null;
  gradLiquidityUsd: number | null;
  gradCreatorBalance: string | null;
  gradSnapshotAt: number | null;
  creatorSold: boolean;
  creatorSoldBlock: number | null;
  updatedAt: number;
};

type CheckpointRow = {
  token: string;
  window: string;
  checked_at: number;
  liquidity_usd: number | null;
  creator_balance: string | null;
  liquidity_stayed: number;
  creator_sold: number;
  survived: number;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS blocks (
  block INTEGER PRIMARY KEY,
  hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tokens (
  token TEXT PRIMARY KEY,
  venue TEXT NOT NULL,
  creator TEXT NOT NULL,
  name TEXT,
  symbol TEXT,
  curve TEXT,
  pool TEXT,
  pair_token TEXT,
  launch_block INTEGER NOT NULL,
  launch_tx TEXT NOT NULL,
  launched_at INTEGER NOT NULL DEFAULT 0,
  graduation_threshold TEXT,
  real_quote_reserve TEXT,
  quote_reserve TEXT,
  progress REAL NOT NULL DEFAULT 0,
  graduated INTEGER NOT NULL DEFAULT 0,
  swept INTEGER NOT NULL DEFAULT 0,
  graduation_block INTEGER,
  graduated_at INTEGER,
  swept_block INTEGER,
  status INTEGER,
  tax_rate INTEGER NOT NULL DEFAULT 0,
  buy_tax_rate INTEGER NOT NULL DEFAULT 0,
  sell_tax_rate INTEGER NOT NULL DEFAULT 0,
  unique_buyers INTEGER NOT NULL DEFAULT 0,
  buy_scanned INTEGER NOT NULL DEFAULT -1,
  top10_share REAL,
  safety REAL NOT NULL DEFAULT 100,
  safety_json TEXT,
  creator_holds_lp INTEGER NOT NULL DEFAULT 0,
  holders_json TEXT,
  liquidity_usd REAL,
  price_usd TEXT,
  volume_24h REAL,
  grad_liquidity_usd REAL,
  grad_creator_balance TEXT,
  grad_snapshot_at INTEGER,
  creator_sold INTEGER NOT NULL DEFAULT 0,
  creator_sold_block INTEGER,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS buyers (
  token TEXT NOT NULL,
  buyer TEXT NOT NULL,
  block INTEGER NOT NULL,
  PRIMARY KEY (token, buyer)
);

CREATE TABLE IF NOT EXISTS checkpoints (
  token TEXT NOT NULL,
  window TEXT NOT NULL,
  checked_at INTEGER NOT NULL,
  liquidity_usd REAL,
  creator_balance TEXT,
  liquidity_stayed INTEGER NOT NULL,
  creator_sold INTEGER NOT NULL,
  survived INTEGER NOT NULL,
  PRIMARY KEY (token, window)
);

CREATE TABLE IF NOT EXISTS alerts (
  token TEXT NOT NULL,
  milestone INTEGER NOT NULL,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY (token, milestone)
);

CREATE INDEX IF NOT EXISTS idx_tokens_progress ON tokens(progress DESC, unique_buyers DESC, safety DESC);
CREATE INDEX IF NOT EXISTS idx_tokens_creator ON tokens(creator, launch_block);
CREATE INDEX IF NOT EXISTS idx_tokens_curve ON tokens(curve);
CREATE INDEX IF NOT EXISTS idx_tokens_block ON tokens(launch_block);
CREATE INDEX IF NOT EXISTS idx_buyers_block ON buyers(block);
`;

function readJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function venueOf(value: string): Venue {
  return value === "flap" ? "flap" : "pons";
}

export class Store {
  private readonly db: DatabaseSync;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(filename: string) {
    if (filename !== ":memory:") {
      mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
    }
    this.db = new DatabaseSync(filename);
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec("PRAGMA busy_timeout = 5000;");
    if (filename !== ":memory:") this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec(SCHEMA);
    this.ensureColumn("tokens", "grad_snapshot_at", "INTEGER");
    this.db.exec(
      `UPDATE tokens SET grad_snapshot_at = graduated_at
       WHERE grad_liquidity_usd IS NOT NULL AND grad_snapshot_at IS NULL AND graduated_at > 0`,
    );
  }

  private ensureColumn(table: string, column: string, definition: string) {
    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (columns.some((item) => item.name === column)) return;
    this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }

  close(): Promise<void> {
    return this.enqueue(() => {
      this.db.close();
    });
  }

  insertToken(input: NewToken, now = Date.now()): Promise<boolean> {
    return this.enqueue(() => {
      const token = lower(input.token);
      const info = this.db
        .prepare(
          `INSERT INTO tokens (
            token, venue, creator, name, symbol, curve, pool, pair_token,
            launch_block, launch_tx, launched_at, graduation_threshold, buy_scanned, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(token) DO NOTHING`,
        )
        .run(
          token,
          input.venue,
          lower(input.creator),
          input.name,
          input.symbol,
          input.curve ? lower(input.curve) : null,
          input.pool ? lower(input.pool) : null,
          input.pairToken ? lower(input.pairToken) : null,
          input.launchBlock,
          input.launchTx.toLowerCase(),
          input.launchedAt,
          input.graduationThreshold,
          input.launchBlock - 1,
          now,
        );
      return Number(info.changes) === 1;
    });
  }

  updateIdentity(token: string, patch: { name?: string | null; symbol?: string | null; launchedAt?: number }): Promise<void> {
    return this.enqueue(() => {
      const row = this.row(token);
      if (!row) return;
      this.db
        .prepare(
          `UPDATE tokens SET name = ?, symbol = ?, launched_at = CASE WHEN ? > 0 THEN ? ELSE launched_at END, updated_at = ? WHERE token = ?`,
        )
        .run(
          patch.name === undefined ? row.name : patch.name,
          patch.symbol === undefined ? row.symbol : patch.symbol,
          patch.launchedAt ?? 0,
          patch.launchedAt ?? 0,
          Date.now(),
          lower(token),
        );
    });
  }

  get(token: string): Promise<TokenRecord | null> {
    return this.enqueue(() => {
      const row = this.row(token);
      return row ? toRecord(row) : null;
    });
  }

  findByCurve(curve: string): Promise<TokenRecord | null> {
    return this.enqueue(() => {
      const row = this.db.prepare("SELECT * FROM tokens WHERE curve = ?").get(lower(curve)) as TokenRow | undefined;
      return row ? toRecord(row) : null;
    });
  }

  noteBuyer(token: string, buyer: string, block: number): Promise<boolean> {
    return this.enqueue(() => {
      const key = lower(token);
      if (!this.row(key)) return false;
      const info = this.db
        .prepare("INSERT INTO buyers (token, buyer, block) VALUES (?, ?, ?) ON CONFLICT(token, buyer) DO NOTHING")
        .run(key, lower(buyer), block);
      if (Number(info.changes) !== 1) return false;
      this.db
        .prepare("UPDATE tokens SET unique_buyers = unique_buyers + 1, updated_at = ? WHERE token = ?")
        .run(Date.now(), key);
      return true;
    });
  }

  noteCreatorSell(token: string, block: number): Promise<void> {
    return this.enqueue(() => {
      this.db
        .prepare(
          `UPDATE tokens
           SET creator_sold = 1, creator_sold_block = COALESCE(creator_sold_block, ?), updated_at = ?
           WHERE token = ?`,
        )
        .run(block, Date.now(), lower(token));
    });
  }

  noteSwept(token: string, block: number): Promise<void> {
    return this.enqueue(() => {
      this.db
        .prepare(
          `UPDATE tokens SET swept = 1, swept_block = COALESCE(swept_block, ?), updated_at = ? WHERE token = ?`,
        )
        .run(block, Date.now(), lower(token));
    });
  }

  noteGraduated(
    token: string,
    input: { pool: string | null; block: number; at: number },
  ): Promise<boolean> {
    return this.enqueue(() => {
      const row = this.row(token);
      if (!row) return false;
      const was = row.graduated === 1;
      this.db
        .prepare(
          `UPDATE tokens SET
            graduated = 1,
            progress = 1,
            pool = COALESCE(?, pool),
            graduation_block = COALESCE(graduation_block, ?),
            graduated_at = COALESCE(NULLIF(graduated_at, 0), ?),
            updated_at = ?
          WHERE token = ?`,
        )
        .run(input.pool ? lower(input.pool) : null, input.block, input.at > 0 ? input.at : null, Date.now(), lower(token));
      return !was;
    });
  }

  noteProgress(token: string, progress: number, patch: ProgressPatch): Promise<void> {
    return this.enqueue(() => {
      const row = this.row(token);
      if (!row) return;
      const next = row.graduated === 1 || patch.graduated ? 1 : Math.max(0, Math.min(1, progress));
      this.db
        .prepare(
          `UPDATE tokens SET
            progress = ?,
            real_quote_reserve = COALESCE(?, real_quote_reserve),
            graduation_threshold = COALESCE(?, graduation_threshold),
            quote_reserve = COALESCE(?, quote_reserve),
            status = COALESCE(?, status),
            pool = COALESCE(?, pool),
            tax_rate = CASE WHEN COALESCE(?, 0) > 0 THEN ? ELSE tax_rate END,
            buy_tax_rate = CASE WHEN COALESCE(?, 0) > 0 THEN ? ELSE buy_tax_rate END,
            sell_tax_rate = CASE WHEN COALESCE(?, 0) > 0 THEN ? ELSE sell_tax_rate END,
            graduated = CASE WHEN ? = 1 THEN 1 ELSE graduated END,
            graduation_block = COALESCE(graduation_block, ?),
            graduated_at = COALESCE(NULLIF(graduated_at, 0), ?),
            updated_at = ?
          WHERE token = ?`,
        )
        .run(
          next,
          patch.realQuoteReserve ?? null,
          patch.graduationThreshold ?? null,
          patch.quoteReserve ?? null,
          patch.status ?? null,
          patch.pool ? lower(patch.pool) : null,
          patch.taxRate ?? null,
          patch.taxRate ?? null,
          patch.buyTaxRate ?? null,
          patch.buyTaxRate ?? null,
          patch.sellTaxRate ?? null,
          patch.sellTaxRate ?? null,
          patch.graduated ? 1 : 0,
          patch.graduated ? (patch.graduationBlock ?? null) : null,
          patch.graduated && patch.graduatedAt ? patch.graduatedAt : null,
          Date.now(),
          lower(token),
        );
    });
  }

  noteTax(token: string, tax: { taxRate?: number; buyTaxRate?: number; sellTaxRate?: number }): Promise<void> {
    return this.enqueue(() => {
      const row = this.row(token);
      if (!row) return;
      this.db
        .prepare(
          `UPDATE tokens SET tax_rate = ?, buy_tax_rate = ?, sell_tax_rate = ?, updated_at = ? WHERE token = ?`,
        )
        .run(
          tax.taxRate ?? row.tax_rate,
          tax.buyTaxRate ?? row.buy_tax_rate,
          tax.sellTaxRate ?? row.sell_tax_rate,
          Date.now(),
          lower(token),
        );
    });
  }

  markBuysScanned(tokens: readonly string[], block: number): Promise<void> {
    return this.enqueue(() => {
      const statement = this.db.prepare(
        "UPDATE tokens SET buy_scanned = ? WHERE token = ? AND buy_scanned < ?",
      );
      for (const token of tokens) statement.run(block, lower(token), block);
    });
  }

  listPonsCurves(): Promise<TokenRecord[]> {
    return this.enqueue(() => {
      const rows = this.db
        .prepare("SELECT * FROM tokens WHERE venue = 'pons' AND curve IS NOT NULL")
        .all() as TokenRow[];
      return rows.map(toRecord);
    });
  }

  listOpen(limit: number): Promise<TokenRecord[]> {
    return this.enqueue(() => {
      const rows = this.db
        .prepare("SELECT * FROM tokens WHERE graduated = 0 ORDER BY updated_at ASC LIMIT ?")
        .all(limit) as TokenRow[];
      return rows.map(toRecord);
    });
  }

  listSafetyTargets(graduatedSince: number, limit: number): Promise<TokenRecord[]> {
    return this.enqueue(() => {
      const rows = this.db
        .prepare(
          `SELECT * FROM tokens
           WHERE progress >= 0.5 OR (graduated = 1 AND (graduated_at IS NULL OR graduated_at = 0 OR graduated_at >= ?))
           ORDER BY progress DESC
           LIMIT ?`,
        )
        .all(graduatedSince, limit) as TokenRow[];
      return rows.map(toRecord);
    });
  }

  listSurvivalDue(now: number, day: number, week: number): Promise<TokenRecord[]> {
    return this.enqueue(() => {
      const rows = this.db
        .prepare(
          `SELECT * FROM tokens
           WHERE graduated = 1 AND graduated_at IS NOT NULL AND graduated_at > 0
             AND (
               (graduated_at + ? <= ?
                 AND NOT EXISTS (SELECT 1 FROM checkpoints c WHERE c.token = tokens.token AND c.window = '24h')
                 AND (grad_snapshot_at IS NULL OR grad_snapshot_at < graduated_at + ?)
                 AND (grad_snapshot_at IS NOT NULL OR graduated_at + ? > ?))
               OR
               (graduated_at + ? <= ?
                 AND NOT EXISTS (SELECT 1 FROM checkpoints c WHERE c.token = tokens.token AND c.window = '7d')
                 AND (grad_snapshot_at IS NULL OR grad_snapshot_at < graduated_at + ?)
                 AND (grad_snapshot_at IS NOT NULL OR graduated_at + ? > ?))
             )
           ORDER BY graduated_at ASC
           LIMIT 50`,
        )
        .all(day, now, day, day + week, now, week, now, week, day + week, now) as TokenRow[];
      return rows.map(toRecord);
    });
  }

  saveObservation(input: Observation): Promise<void> {
    return this.enqueue(() => {
      const row = this.row(input.token);
      if (!row) return;
      this.db
        .prepare(
          `UPDATE tokens SET
            top10_share = ?,
            holders_json = ?,
            creator_holds_lp = ?,
            liquidity_usd = ?,
            price_usd = ?,
            volume_24h = ?,
            pool = COALESCE(?, pool),
            updated_at = ?
          WHERE token = ?`,
        )
        .run(
          input.top10Share === undefined ? row.top10_share : input.top10Share,
          input.holders === undefined ? row.holders_json : JSON.stringify(input.holders),
          input.creatorHoldsLp === undefined ? row.creator_holds_lp : input.creatorHoldsLp ? 1 : 0,
          input.liquidityUsd === undefined ? row.liquidity_usd : input.liquidityUsd,
          input.priceUsd === undefined ? row.price_usd : input.priceUsd,
          input.volume24h === undefined ? row.volume_24h : input.volume24h,
          input.pool ? lower(input.pool) : null,
          Date.now(),
          lower(input.token),
        );
    });
  }

  saveSnapshot(
    token: string,
    input: { liquidityUsd: number | null; creatorBalance: string | null; pool?: string | null; at: number },
  ): Promise<void> {
    return this.enqueue(() => {
      this.db
        .prepare(
          `UPDATE tokens SET
            grad_liquidity_usd = COALESCE(grad_liquidity_usd, ?),
            grad_creator_balance = COALESCE(grad_creator_balance, ?),
            grad_snapshot_at = CASE
              WHEN grad_snapshot_at IS NOT NULL AND grad_snapshot_at > 0 THEN grad_snapshot_at
              WHEN ? IS NOT NULL AND ? > 0 THEN ?
              ELSE grad_snapshot_at
            END,
            pool = COALESCE(?, pool),
            liquidity_usd = COALESCE(?, liquidity_usd),
            updated_at = ?
          WHERE token = ?`,
        )
        .run(
          input.liquidityUsd,
          input.creatorBalance,
          input.liquidityUsd,
          input.at,
          input.at,
          input.pool ? lower(input.pool) : null,
          input.liquidityUsd,
          Date.now(),
          lower(token),
        );
    });
  }

  saveCheckpoint(input: CheckpointView & { token: string }): Promise<void> {
    return this.enqueue(() => {
      this.db
        .prepare(
          `INSERT INTO checkpoints (
            token, window, checked_at, liquidity_usd, creator_balance, liquidity_stayed, creator_sold, survived
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(token, window) DO UPDATE SET
            checked_at = excluded.checked_at,
            liquidity_usd = excluded.liquidity_usd,
            creator_balance = excluded.creator_balance,
            liquidity_stayed = excluded.liquidity_stayed,
            creator_sold = excluded.creator_sold,
            survived = excluded.survived`,
        )
        .run(
          lower(input.token),
          input.window,
          input.checkedAt,
          input.liquidityUsd,
          input.creatorBalance,
          input.liquidityStayed ? 1 : 0,
          input.creatorSold ? 1 : 0,
          input.survived ? 1 : 0,
        );
    });
  }

  rescore(token: string, weights: SafetyWeights): Promise<number | null> {
    return this.enqueue(() => {
      const row = this.row(token);
      if (!row) return null;
      const creator = this.creatorStatsSync(row.creator, row.token);
      const taxed = row.tax_rate > 0 || row.buy_tax_rate > 0 || row.sell_tax_rate > 0;
      const breakdown = safetyScore(
        {
          top10Share: row.top10_share,
          uniqueBuyers: row.unique_buyers,
          priorLaunches: creator.launches,
          survival24h: creator.survival24h,
          venue: venueOf(row.venue),
          taxed,
          creatorHoldsLp: row.creator_holds_lp === 1,
        },
        weights,
      );
      this.db
        .prepare("UPDATE tokens SET safety = ?, safety_json = ?, updated_at = ? WHERE token = ?")
        .run(breakdown.total, JSON.stringify(breakdown), Date.now(), row.token);
      return breakdown.total;
    });
  }

  claimAlert(token: string, milestone: number, now = Date.now()): Promise<boolean> {
    return this.enqueue(() => {
      const info = this.db
        .prepare("INSERT INTO alerts (token, milestone, sent_at) VALUES (?, ?, ?) ON CONFLICT(token, milestone) DO NOTHING")
        .run(lower(token), milestone, now);
      return Number(info.changes) === 1;
    });
  }

  listAlertCandidates(limit: number): Promise<TokenRecord[]> {
    return this.enqueue(() => {
      const rows = this.db
        .prepare(
          `SELECT * FROM tokens
           WHERE (progress >= 0.7 OR graduated = 1)
             AND (
               ((progress >= 0.7 OR graduated = 1) AND NOT EXISTS (
                 SELECT 1 FROM alerts a WHERE a.token = tokens.token AND a.milestone = 70
               ))
               OR ((progress >= 0.9 OR graduated = 1) AND NOT EXISTS (
                 SELECT 1 FROM alerts a WHERE a.token = tokens.token AND a.milestone = 90
               ))
               OR ((progress >= 1 OR graduated = 1) AND NOT EXISTS (
                 SELECT 1 FROM alerts a WHERE a.token = tokens.token AND a.milestone = 100
               ))
             )
           ORDER BY progress DESC
           LIMIT ?`,
        )
        .all(limit) as TokenRow[];
      return rows.map(toRecord);
    });
  }

  listRadar(query: RadarQuery): Promise<RadarRow[]> {
    return this.enqueue(() => {
      const floor = query.sort === "clean" ? Math.max(query.minProgress, 0.7) : query.minProgress;
      const rows = this.db
        .prepare(
          `SELECT * FROM tokens
           WHERE (? = '' OR venue = ?) AND progress >= ?
           ORDER BY
             CASE ?
               WHEN 'clean' THEN safety
               WHEN 'safety' THEN safety
               WHEN 'buyers' THEN unique_buyers
               ELSE progress
             END DESC,
             CASE WHEN ? = 'clean' THEN unique_buyers ELSE unique_buyers END DESC,
             CASE WHEN ? = 'clean' THEN progress ELSE safety END DESC,
             launch_block DESC
           LIMIT ?`,
        )
        .all(query.venue, query.venue, floor, query.sort, query.sort, query.sort, query.limit) as TokenRow[];
      return rows.map(toRadar);
    });
  }

  getDetail(token: string): Promise<TokenDetail | null> {
    return this.enqueue(() => {
      const row = this.row(token);
      if (!row) return null;
      return this.toDetail(row);
    });
  }

  creatorStats(address: string, excludeToken = ""): Promise<CreatorStats> {
    return this.enqueue(() => this.creatorStatsSync(address, excludeToken));
  }

  listByCreator(address: string): Promise<RadarRow[]> {
    return this.enqueue(() => {
      const rows = this.db
        .prepare("SELECT * FROM tokens WHERE creator = ? ORDER BY launch_block DESC")
        .all(lower(address)) as TokenRow[];
      return rows.map(toRadar);
    });
  }

  deleteFromBlock(block: number): Promise<void> {
    return this.enqueue(() => {
      this.transaction(() => {
        const doomed = this.db.prepare("SELECT token FROM tokens WHERE launch_block >= ?").all(block) as { token: string }[];
        for (const row of doomed) {
          this.db.prepare("DELETE FROM buyers WHERE token = ?").run(row.token);
          this.db.prepare("DELETE FROM checkpoints WHERE token = ?").run(row.token);
          this.db.prepare("DELETE FROM alerts WHERE token = ?").run(row.token);
        }
        this.db.prepare("DELETE FROM tokens WHERE launch_block >= ?").run(block);
        this.db.prepare("DELETE FROM buyers WHERE block >= ?").run(block);
        this.db.prepare("UPDATE tokens SET buy_scanned = ? WHERE buy_scanned >= ?").run(block - 1, block);
        this.db
          .prepare("UPDATE tokens SET creator_sold = 0, creator_sold_block = NULL WHERE creator_sold_block >= ?")
          .run(block);
        this.db.prepare("UPDATE tokens SET swept = 0, swept_block = NULL WHERE swept_block >= ?").run(block);
        this.db
          .prepare(
            `UPDATE tokens SET
              graduated = 0,
              graduation_block = NULL,
              graduated_at = NULL,
              grad_liquidity_usd = NULL,
              grad_creator_balance = NULL,
              grad_snapshot_at = NULL,
              pool = NULL,
              progress = CASE
                WHEN venue = 'pons' AND CAST(IFNULL(graduation_threshold, '0') AS REAL) > 0
                  THEN MIN(1.0, CAST(IFNULL(real_quote_reserve, '0') AS REAL) / CAST(graduation_threshold AS REAL))
                ELSE 0
              END
            WHERE graduation_block >= ?`,
          )
          .run(block);
        this.db
          .prepare("DELETE FROM checkpoints WHERE token IN (SELECT token FROM tokens WHERE graduated = 0)")
          .run();
        this.db
          .prepare(
            `UPDATE tokens SET unique_buyers = (
              SELECT COUNT(*) FROM buyers WHERE buyers.token = tokens.token
            )`,
          )
          .run();
      });
    });
  }

  getCursor(): Promise<{ block: number; hash: string } | null> {
    return this.enqueue(() => this.cursorSync());
  }

  setCursor(block: number, hash: string | null): Promise<void> {
    return this.enqueue(() => {
      if (hash) {
        this.db
          .prepare(
            `INSERT INTO meta (key, value) VALUES ('cursor', ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          )
          .run(JSON.stringify({ block, hash: hash.toLowerCase() }));
      }
    });
  }

  rewindCursor(block: number, hash: string | null): Promise<void> {
    return this.enqueue(() => {
      if (block < 0 || !hash) {
        this.db.prepare("DELETE FROM meta WHERE key = 'cursor'").run();
        return;
      }
      this.db
        .prepare(
          `INSERT INTO meta (key, value) VALUES ('cursor', ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        )
        .run(JSON.stringify({ block, hash: hash.toLowerCase() }));
    });
  }

  rememberBlock(block: number, hash: string): Promise<void> {
    return this.enqueue(() => {
      this.db
        .prepare(
          `INSERT INTO blocks (block, hash) VALUES (?, ?)
           ON CONFLICT(block) DO UPDATE SET hash = excluded.hash`,
        )
        .run(block, hash.toLowerCase());
    });
  }

  getBlockHash(block: number): Promise<string | null> {
    return this.enqueue(() => {
      const row = this.db.prepare("SELECT hash FROM blocks WHERE block = ?").get(block) as { hash: string } | undefined;
      return row?.hash ?? null;
    });
  }

  forgetBlocksFrom(block: number): Promise<void> {
    return this.enqueue(() => {
      this.db.prepare("DELETE FROM blocks WHERE block >= ?").run(block);
    });
  }

  private row(token: string): TokenRow | undefined {
    return this.db.prepare("SELECT * FROM tokens WHERE token = ?").get(lower(token)) as TokenRow | undefined;
  }

  private cursorSync(): { block: number; hash: string } | null {
    const row = this.db.prepare("SELECT value FROM meta WHERE key = 'cursor'").get() as { value: string } | undefined;
    if (!row) return null;
    const parsed = readJson<{ block: number; hash: string }>(row.value);
    if (!parsed || !Number.isFinite(parsed.block) || !parsed.hash) return null;
    return parsed;
  }

  private creatorStatsSync(address: string, excludeToken = ""): CreatorStats {
    const creator = lower(address);
    const skip = excludeToken ? lower(excludeToken) : "";
    const totals = this.db
      .prepare(
        `SELECT COUNT(*) AS launches, COALESCE(SUM(graduated), 0) AS graduations
         FROM tokens WHERE creator = ? AND (? = '' OR token != ?)`,
      )
      .get(creator, skip, skip) as { launches: number; graduations: number };
    const windows = this.db
      .prepare(
        `SELECT c.window AS window, COALESCE(SUM(c.survived), 0) AS survived, COUNT(*) AS resolved
         FROM checkpoints c
         JOIN tokens t ON t.token = c.token
         WHERE t.creator = ? AND (? = '' OR t.token != ?)
         GROUP BY c.window`,
      )
      .all(creator, skip, skip) as { window: string; survived: number; resolved: number }[];
    const day = windows.find((row) => row.window === "24h");
    const week = windows.find((row) => row.window === "7d");
    const launches = Number(totals.launches) || 0;
    const graduations = Number(totals.graduations) || 0;
    return {
      address: creator,
      launches,
      graduations,
      graduationRate: launches === 0 ? null : graduations / launches,
      survival24h: day && day.resolved > 0 ? Number(day.survived) / Number(day.resolved) : null,
      survival7d: week && week.resolved > 0 ? Number(week.survived) / Number(week.resolved) : null,
      resolved24h: day ? Number(day.resolved) : 0,
      resolved7d: week ? Number(week.resolved) : 0,
    };
  }

  private toDetail(row: TokenRow): TokenDetail {
    const checkpoints = this.db
      .prepare("SELECT * FROM checkpoints WHERE token = ?")
      .all(row.token) as CheckpointRow[];
    const asView = (window: "24h" | "7d"): CheckpointView | null => {
      const found = checkpoints.find((item) => item.window === window);
      if (!found) return null;
      return {
        window,
        checkedAt: found.checked_at,
        liquidityUsd: found.liquidity_usd,
        creatorBalance: found.creator_balance,
        liquidityStayed: found.liquidity_stayed === 1,
        creatorSold: found.creator_sold === 1,
        survived: found.survived === 1,
      };
    };
    return {
      ...toRadar(row),
      launchBlock: row.launch_block,
      launchTx: row.launch_tx,
      launchedAt: row.launched_at,
      graduationBlock: row.graduation_block,
      graduatedAt: row.graduated_at,
      graduationThreshold: row.graduation_threshold,
      realQuoteReserve: row.real_quote_reserve,
      quoteReserve: row.quote_reserve,
      buyTaxRate: row.buy_tax_rate,
      sellTaxRate: row.sell_tax_rate,
      safetyBreakdown: readJson(row.safety_json),
      holders: readJson<HolderView[]>(row.holders_json) ?? [],
      buyers: (this.db.prepare("SELECT buyer FROM buyers WHERE token = ? ORDER BY block, buyer").all(row.token) as { buyer: string }[]).map(
        (item) => item.buyer,
      ),
      liquidityUsd: row.liquidity_usd,
      priceUsd: row.price_usd,
      volume24h: row.volume_24h,
      gradLiquidityUsd: row.grad_liquidity_usd,
      gradCreatorBalance: row.grad_creator_balance,
      creatorSold: row.creator_sold === 1,
      creatorHoldsLp: row.creator_holds_lp === 1,
      checkpoints: { "24h": asView("24h"), "7d": asView("7d") },
      creatorStats: this.creatorStatsSync(row.creator),
    };
  }

  private enqueue<T>(fn: () => T): Promise<T> {
    const run = this.tail.then(() => fn());
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN");
    try {
      const value = fn();
      this.db.exec("COMMIT");
      return value;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}

function toRadar(row: TokenRow): RadarRow {
  return {
    token: row.token,
    venue: venueOf(row.venue),
    creator: row.creator,
    name: row.name,
    symbol: row.symbol,
    progress: row.progress,
    uniqueBuyers: row.unique_buyers,
    top10Share: row.top10_share,
    safety: row.safety,
    graduated: row.graduated === 1,
    swept: row.swept === 1,
    taxRate: row.tax_rate,
    curve: row.curve,
    pool: row.pool,
  };
}

function toRecord(row: TokenRow): TokenRecord {
  return {
    ...toRadar(row),
    pairToken: row.pair_token,
    launchBlock: row.launch_block,
    launchTx: row.launch_tx,
    launchedAt: row.launched_at,
    graduationThreshold: row.graduation_threshold,
    realQuoteReserve: row.real_quote_reserve,
    quoteReserve: row.quote_reserve,
    graduationBlock: row.graduation_block,
    graduatedAt: row.graduated_at,
    status: row.status,
    buyTaxRate: row.buy_tax_rate,
    sellTaxRate: row.sell_tax_rate,
    buyScanned: row.buy_scanned,
    creatorHoldsLp: row.creator_holds_lp === 1,
    holders: readJson<HolderView[]>(row.holders_json) ?? [],
    liquidityUsd: row.liquidity_usd,
    priceUsd: row.price_usd,
    volume24h: row.volume_24h,
    gradLiquidityUsd: row.grad_liquidity_usd,
    gradCreatorBalance: row.grad_creator_balance,
    gradSnapshotAt: row.grad_snapshot_at,
    creatorSold: row.creator_sold === 1,
    creatorSoldBlock: row.creator_sold_block,
    updatedAt: row.updated_at,
  };
}
