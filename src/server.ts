import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { isAddress } from "viem";
import type { Config } from "./config.js";
import type { Store } from "./store.js";
import type { Venue } from "./types.js";

const pagePath = join(dirname(fileURLToPath(import.meta.url)), "../web/index.html");

function numberQuery(value: string | undefined, fallback: number): number {
  if (value == null || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function progressQuery(value: string | undefined): number {
  const parsed = numberQuery(value, 0);
  if (parsed <= 0) return 0;
  const fraction = parsed > 1 ? parsed / 100 : parsed;
  return Math.min(1, fraction);
}

function venueQuery(value: string | undefined): Venue | "" {
  if (value === "pons" || value === "flap") return value;
  return "";
}

function sortQuery(value: string | undefined): "progress" | "clean" | "buyers" | "safety" {
  if (value === "clean" || value === "buyers" || value === "safety") return value;
  return "progress";
}

export function createApp(store: Store, html = readFileSync(pagePath, "utf8")) {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));

  app.get("/api/radar", async (c) => {
    const tokens = await store.listRadar({
      venue: venueQuery(c.req.query("venue")),
      minProgress: progressQuery(c.req.query("minProgress")),
      sort: sortQuery(c.req.query("sort")),
      limit: Math.min(200, Math.max(1, Math.floor(numberQuery(c.req.query("limit"), 100)))),
    });
    return c.json({ tokens });
  });

  app.get("/api/tokens/:token", async (c) => {
    const token = c.req.param("token");
    if (!isAddress(token)) return c.json({ error: "invalid token" }, 400);
    const detail = await store.getDetail(token);
    if (!detail) return c.json({ error: "not found" }, 404);
    return c.json({ token: detail });
  });

  app.get("/api/creators/:address", async (c) => {
    const address = c.req.param("address");
    if (!isAddress(address)) return c.json({ error: "invalid address" }, 400);
    const [creator, tokens] = await Promise.all([store.creatorStats(address), store.listByCreator(address)]);
    return c.json({ creator, tokens });
  });

  app.get("/", (c) => c.html(html));
  return app;
}

export function startServer(store: Store, config: Config) {
  const app = createApp(store);
  serve({ fetch: app.fetch, port: config.port }, (info) => {
    console.log(`[server] http://localhost:${info.port}`);
  });
}
