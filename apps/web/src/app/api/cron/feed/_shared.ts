/**
 * Blue Feed — shared cron logic (used by the hourly + daily routes).
 *
 * Snapshot-once architecture:
 *  - each run = one cycle (cycleId = timestamp rounded to the hour)
 *  - a shared context { tvl, sentiment, pulse } is derived once per cycle and
 *    attached to every item in that cycle, so cards stay numerically consistent
 *  - items are stored in the "feed:items" array, deduped per (cycleId, tool)
 *  - the cycle context is also stored at feed:cycle:{cycleId}:context
 *
 * Tools run via the internal x402 bypass (X-Blue-Internal + X-Blue-Service).
 */
import { kvGet, kvSet } from "@/lib/kv";

const INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY ?? "";
const CRON_SECRET          = process.env.CRON_SECRET ?? "";
const BASE_URL             = "https://blueagent.dev/api/x402";
const HOUR_MS              = 3_600_000;

export type FeedAgent = "aeon" | "blue" | "miroshark" | "consensus";

export interface FeedItem {
  id: string;
  tool: string;
  timestamp: number;
  cycleId: number;
  title: string;
  summary: string;
  data: Record<string, unknown>;
  shareText: string;
  agent: FeedAgent;
}

export interface CycleContext { tvl: string | null; sentiment: string | null; pulse: string | null }

export type Job = { tool: string; agent: FeedAgent; body: Record<string, unknown>; title?: string };

// ── helpers ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = Record<string, any>;

function num(v: unknown): number | null {
  const n = typeof v === "string" ? parseFloat(v.replace(/[$,]/g, "")) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}
function fmtUsd(v: unknown): string | null {
  const n = num(v); if (n === null) return null;
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}
function fmtPct(v: unknown): string | null {
  const n = num(v); if (n === null) return null;
  return `${n >= 0 ? "↑ +" : "↓ "}${n.toFixed(1)}%`;
}
type Metric = { label: string; value: string };
function metric(label: string, value: string | null | undefined): Metric | null { return value ? { label, value } : null; }
function clean(ms: (Metric | null)[]): Metric[] { return ms.filter((m): m is Metric => !!m).slice(0, 3); }
const titleCase = (s: string) => s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** Transform a tool response into a FeedItem. Defensive: never throws. */
function toFeedItem(job: Job, resp: Any, cycleId: number, idx: number): FeedItem {
  const ts = Date.now();
  let title = job.title ?? titleCase(job.tool);
  let summary = "";
  let metrics: Metric[] = [];

  try {
    switch (job.tool) {
      case "token-alpha": {
        const sym = resp.symbol ?? resp.token ?? "Token";
        const sig = resp.signal ?? "—";
        title = `${sym} · ${sig}`;
        summary = resp.thesis ?? resp.narrative_fit ?? "Trade signal updated.";
        metrics = clean([metric("Signal", typeof sig === "string" ? sig : null), metric("Confidence", resp.confidence != null ? `${resp.confidence}` : null), metric("Entry", fmtUsd(resp.entry_price))]);
        break;
      }
      case "base-alpha": {
        title = "Base Alpha";
        const top = Array.isArray(resp.momentum_picks) ? resp.momentum_picks[0] : null;
        summary = top?.symbol ? `Top momentum: ${top.symbol}${top.signal_type ? ` (${top.signal_type})` : ""}. Market ${resp.market_phase ?? "—"}.` : `Base market phase: ${resp.market_phase ?? "—"}.`;
        metrics = clean([metric("Base TVL", fmtUsd(resp.base_tvl_usd)), metric("TVL 7d", fmtPct(resp.tvl_change_7d)), metric("Top pick", top?.symbol ?? null)]);
        break;
      }
      case "narrative-pulse": {
        title = "Narrative Pulse";
        const arr = Array.isArray(resp.trending_narratives) ? resp.trending_narratives : [];
        const names = arr.map((n: Any) => n?.name).filter(Boolean).slice(0, 3);
        summary = names.length ? `Trending: ${names.join(" · ")}` : "Live Base narrative phases updated.";
        metrics = clean([metric("Narratives", arr.length ? `${arr.length}` : null), metric("Top", arr[0]?.name ?? null), metric("Phase", arr[0]?.phase ?? null)]);
        break;
      }
      case "base-pulse": {
        title = "Base Pulse";
        const score = resp.pulse_score ?? resp.score;
        const sentiment = resp.sentiment ?? resp.market_sentiment;
        summary = `Base ecosystem snapshot${sentiment ? ` — sentiment ${sentiment}` : ""}.`;
        metrics = clean([metric("TVL", fmtUsd(resp.tvl_usd ?? resp.base_tvl_usd ?? resp.tvl)), metric("Sentiment", typeof sentiment === "string" ? sentiment : null), metric("Pulse", score != null ? `${score}` : null)]);
        break;
      }
      case "whale-tracker": {
        title = "Whale Tracker";
        const act = resp.whaleActivity ?? resp.signal ?? "NEUTRAL";
        summary = resp.recommendation ?? resp.trend ?? "Smart-money flow on Base updated.";
        metrics = clean([metric("Activity", typeof act === "string" ? act : null), metric("Signal", typeof resp.signal === "string" ? resp.signal : null), metric("Strength", resp.signalStrength != null ? `${resp.signalStrength}` : null)]);
        break;
      }
      case "ecosystem-digest": {
        title = "Base Ecosystem Digest";
        summary = resp.headline ?? "Daily Base ecosystem digest.";
        const movers = Array.isArray(resp.movers) ? resp.movers : [];
        const narrs = Array.isArray(resp.narratives) ? resp.narratives : [];
        metrics = clean([metric("Movers", movers.length ? `${movers.length}` : null), metric("Top mover", movers[0]?.token ?? movers[0]?.symbol ?? null), metric("Narratives", narrs.length ? `${narrs.length}` : null)]);
        break;
      }
      case "new-pools": {
        title = "New Pools on Base";
        const pools = Array.isArray(resp.pools) ? resp.pools : Array.isArray(resp.new_pools) ? resp.new_pools : [];
        const flagged = pools.filter((p: Any) => p?.honeypot || p?.flagged || p?.honeypotFlag).length;
        summary = pools.length ? `${pools.length} new pool${pools.length !== 1 ? "s" : ""} on Base${flagged ? ` · ${flagged} flagged 🚨` : ""}.` : "Scanning Base for new pools.";
        metrics = clean([metric("New pools", pools.length ? `${pools.length}` : null), metric("Top", pools[0]?.symbol ?? pools[0]?.baseSymbol ?? null), metric("Flagged", flagged ? `${flagged} 🚨` : null)]);
        break;
      }
      case "blue-stream": {
        title = "Base Onchain Activity";
        const trending = Array.isArray(resp.trending) ? resp.trending : [];
        const fresh = Array.isArray(resp.new_pools) ? resp.new_pools : [];
        summary = `Live Base activity — ${trending.length} trending · ${fresh.length} new pools.`;
        metrics = clean([metric("Trending", trending.length ? `${trending.length}` : null), metric("New pools", fresh.length ? `${fresh.length}` : null), metric("Top", trending[0]?.token ?? trending[0]?.symbol ?? null)]);
        break;
      }
      case "token-momentum-scanner": {
        title = "Base Momentum Scan";
        const plays = Array.isArray(resp.momentum_plays) ? resp.momentum_plays : [];
        summary = resp.summary ?? (plays[0]?.token ? `Top setup: ${plays[0].token}. Market ${resp.market_phase ?? "—"}.` : `Momentum scan — market ${resp.market_phase ?? "—"}.`);
        metrics = clean([metric("Market", typeof resp.market_phase === "string" ? resp.market_phase : null), metric("Plays", plays.length ? `${plays.length}` : null), metric("Top", plays[0]?.token ?? null)]);
        break;
      }
      case "narrative-position": {
        title = "Narrative Positions";
        const arr = Array.isArray(resp.narratives) ? resp.narratives : [];
        summary = resp.top_opportunity ? `Top: ${typeof resp.top_opportunity === "string" ? resp.top_opportunity : (resp.top_opportunity?.name ?? "")}` : (arr[0]?.name ? `Watching ${arr.length} narratives.` : "Narrative position map updated.");
        metrics = clean([metric("Narratives", arr.length ? `${arr.length}` : null), metric("Top", arr[0]?.name ?? null), metric("Call", arr[0]?.position_call ?? null)]);
        break;
      }
      case "defi-opportunity": {
        title = "DeFi Opportunities on Base";
        const opps = Array.isArray(resp.opportunities) ? resp.opportunities : [];
        summary = resp.summary ?? (opps[0]?.protocol ? `Best: ${opps[0].protocol}${opps[0].apy ? ` · ${opps[0].apy} APY` : ""}.` : "Base DeFi opportunity scan.");
        metrics = clean([metric("Opps", opps.length ? `${opps.length}` : null), metric("Top APY", opps[0]?.apy ? `${opps[0].apy}` : null), metric("Risk", opps[0]?.risk ?? null)]);
        break;
      }
    }
  } catch { /* defaults */ }

  if (metrics.length === 0) {
    metrics = clean(Object.entries(resp ?? {})
      .filter(([k, v]) => typeof v !== "object" && v != null && !["tool", "timestamp", "disclaimer", "dataSource"].includes(k))
      .map(([k, v]) => metric(k.replace(/_/g, " "), String(v))));
  }
  if (!summary) summary = "Updated.";

  const shareText = `${title} — ${summary} via @blueagent_ blueagent.dev/app/feed`;
  return { id: `${job.tool}-${cycleId}`, tool: job.tool, timestamp: ts, cycleId, agent: job.agent, title, summary, data: { metrics, raw: resp }, shareText };
}

async function callTool(job: Job, cycleId: number): Promise<FeedItem | null> {
  try {
    const res = await fetch(`${BASE_URL}/${job.tool}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Blue-Internal": INTERNAL_SERVICE_KEY, "X-Blue-Service": "internal" },
      body: JSON.stringify(job.body),
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) { console.warn(`[feed] ${job.tool} → HTTP ${res.status}`); return null; }
    const data = await res.json().catch(() => null);
    if (!data || data.error) { console.warn(`[feed] ${job.tool} → no data / error`); return null; }
    return toFeedItem(job, data, cycleId, 0);
  } catch (e) {
    console.warn(`[feed] ${job.tool} failed:`, (e as Error).message);
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rawOf(item: FeedItem | undefined): Any { return (item?.data as { raw?: Any })?.raw ?? {}; }
function metricOf(item: FeedItem | undefined, re: RegExp): string | null {
  const ms = (item?.data as { metrics?: Metric[] })?.metrics ?? [];
  return ms.find((m) => re.test(m.label))?.value ?? null;
}

function deriveContext(items: FeedItem[]): CycleContext {
  const bp = items.find((i) => i.tool === "base-pulse");
  const ba = items.find((i) => i.tool === "base-alpha");
  return {
    tvl: metricOf(ba, /tvl/i) ?? metricOf(bp, /tvl/i),
    sentiment: metricOf(bp, /sentiment/i),
    pulse: metricOf(bp, /pulse|score/i),
  };
}

const STABLES = new Set(["WETH", "ETH", "USDC", "USDBC", "USDT", "DAI", "USD+", "USDS", "GHO", "WBTC", "CBETH", "CBBTC", "WSTETH"]);
function validTicker(x: unknown): string | null {
  if (typeof x !== "string") return null;
  const t = x.trim().replace(/^\$/, "").toUpperCase();
  return /^[A-Z0-9]{2,12}$/.test(t) ? t : null;
}

/** Derive a rotating token for token-alpha — the cycle's top mover by volume.
 *  Prefer base-pulse top_tokens (volume-sorted), skip WETH/stablecoins; then
 *  base-alpha momentum picks; finally AERO. */
function topTokenFrom(items: FeedItem[]): string {
  const bp = rawOf(items.find((i) => i.tool === "base-pulse"));
  for (const t of Array.isArray(bp?.top_tokens) ? bp.top_tokens : []) {
    const tk = validTicker(t?.symbol); if (tk && !STABLES.has(tk)) return tk;
  }
  const ba = rawOf(items.find((i) => i.tool === "base-alpha"));
  for (const p of Array.isArray(ba?.momentum_picks) ? ba.momentum_picks : []) {
    const tk = validTicker(p?.symbol); if (tk && !STABLES.has(tk)) return tk;
  }
  return "AERO";
}

/** Run one feed cycle: snapshot once, share context, dedup, store. */
export async function runCycle(jobs: Job[]): Promise<{ ok: boolean; added: number; total: number; cycleId: number; token?: string }> {
  const cycleId = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;

  // token-alpha runs AFTER context tools so it can use the cycle's top mover.
  const tokenJobs = jobs.filter((j) => j.tool === "token-alpha");
  const otherJobs = jobs.filter((j) => j.tool !== "token-alpha");

  const otherResults = (await Promise.all(otherJobs.map((j) => callTool(j, cycleId)))).filter((x): x is FeedItem => x !== null);

  let token: string | undefined;
  let tokenResults: FeedItem[] = [];
  if (tokenJobs.length) {
    token = topTokenFrom(otherResults);
    tokenResults = (await Promise.all(tokenJobs.map((j) => callTool({ ...j, body: { token } }, cycleId)))).filter((x): x is FeedItem => x !== null);
  }

  const fresh = [...otherResults, ...tokenResults];
  const context = deriveContext(fresh);
  fresh.forEach((it) => { (it.data as Record<string, unknown>).context = context; });

  await kvSet(`feed:cycle:${cycleId}:context`, context);

  // dedup: drop any existing item for (cycleId, tool) we just refreshed
  const existing = (await kvGet<FeedItem[]>("feed:items")) ?? [];
  const freshKeys = new Set(fresh.map((f) => `${f.cycleId}:${f.tool}`));
  const kept = existing.filter((e) => !freshKeys.has(`${e.cycleId ?? 0}:${e.tool}`));
  const merged = [...fresh, ...kept].slice(0, 80);
  await kvSet("feed:items", merged);

  return { ok: true, added: fresh.length, total: merged.length, cycleId, token };
}

/** Returns an error Response if auth fails, else null. Caller passes the Request. */
export function authError(req: Request): { status: number; body: Record<string, unknown> } | null {
  const authHeader  = req.headers.get("authorization");
  const secretParam = new URL(req.url).searchParams.get("secret");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}` && secretParam !== CRON_SECRET) {
    return { status: 401, body: { error: "Unauthorized" } };
  }
  if (!INTERNAL_SERVICE_KEY) {
    return { status: 500, body: { error: "INTERNAL_SERVICE_KEY not configured" } };
  }
  return null;
}
