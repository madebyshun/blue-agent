/**
 * Blue Feed — hourly intelligence cron
 *
 * Runs every hour (vercel.json → crons, GET) or on-demand (POST from the
 * /app/feed "Run Now" dev button). Calls 5 Hub tools via the internal x402
 * bypass (no charge), transforms each response into a FeedItem, and stores the
 * newest 50 in KV under "feed:items".
 *
 * Auth: Authorization: Bearer ${CRON_SECRET}  (or ?secret= for manual testing).
 * When CRON_SECRET is unset (local dev) the route is open so "Run Now" works.
 */
import { NextRequest, NextResponse } from "next/server";
import { kvGet, kvSet } from "@/lib/kv";

export const runtime = "nodejs";
export const maxDuration = 60;

const CRON_SECRET          = process.env.CRON_SECRET ?? "";
const INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY ?? "";
const BASE_URL             = "https://blueagent.dev/api/x402";

export type FeedAgent = "aeon" | "blue" | "miroshark" | "consensus";

export interface FeedItem {
  id: string;
  tool: string;
  timestamp: number;
  title: string;
  summary: string;
  data: Record<string, unknown>;
  shareText: string;
  agent: FeedAgent;
}

type Job = { tool: string; agent: FeedAgent; body: Record<string, unknown> };

const JOBS: Job[] = [
  { tool: "base-pulse",      agent: "aeon",      body: {} },
  { tool: "narrative-pulse", agent: "aeon",      body: {} },
  { tool: "token-alpha",     agent: "miroshark", body: { token: "AERO" } },
  { tool: "whale-tracker",   agent: "aeon",      body: { address: "0x940181a94a35a4569e4529a3cdfb74e38fd98631" } },
  { tool: "base-alpha",      agent: "consensus", body: {} },
];

// ── helpers ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = Record<string, any>;

function num(v: unknown): number | null {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

function fmtUsd(v: unknown): string | null {
  const n = num(v);
  if (n === null) return null;
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtPct(v: unknown): string | null {
  const n = num(v);
  if (n === null) return null;
  return `${n >= 0 ? "↑ +" : "↓ "}${n.toFixed(1)}%`;
}

type Metric = { label: string; value: string };
function metric(label: string, value: string | null | undefined): Metric | null {
  return value ? { label, value } : null;
}
function clean(ms: (Metric | null)[]): Metric[] {
  return ms.filter((m): m is Metric => !!m).slice(0, 3);
}

/** Transform a tool response into a FeedItem. Defensive: never throws. */
function toFeedItem(job: Job, resp: Any, idx: number): FeedItem {
  const ts = Date.now();
  const base = { id: `${job.tool}-${ts}-${idx}`, tool: job.tool, timestamp: ts, agent: job.agent };
  let title = job.tool.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  let summary = "";
  let metrics: Metric[] = [];

  try {
    switch (job.tool) {
      case "token-alpha": {
        const sym = resp.symbol ?? resp.token ?? "Token";
        const sig = resp.signal ?? "—";
        title = `${sym} · ${sig}`;
        summary = resp.thesis ?? resp.narrative_fit ?? "Trade signal updated.";
        metrics = clean([
          metric("Signal", typeof sig === "string" ? sig : null),
          metric("Confidence", resp.confidence != null ? `${resp.confidence}` : null),
          metric("Entry", fmtUsd(resp.entry_price)),
        ]);
        break;
      }
      case "base-alpha": {
        title = "Base Alpha";
        const top = Array.isArray(resp.momentum_picks) ? resp.momentum_picks[0] : null;
        summary = top?.symbol
          ? `Top momentum: ${top.symbol}${top.signal_type ? ` (${top.signal_type})` : ""}. Market ${resp.market_phase ?? "—"}.`
          : `Base market phase: ${resp.market_phase ?? "—"}.`;
        metrics = clean([
          metric("Base TVL", fmtUsd(resp.base_tvl_usd)),
          metric("TVL 7d", fmtPct(resp.tvl_change_7d)),
          metric("Top pick", top?.symbol ?? null),
        ]);
        break;
      }
      case "narrative-pulse": {
        title = "Narrative Pulse";
        const arr = Array.isArray(resp.trending_narratives) ? resp.trending_narratives : [];
        const names = arr.map((n: Any) => n?.name).filter(Boolean).slice(0, 3);
        summary = names.length ? `Trending: ${names.join(" · ")}` : "Live Base narrative phases updated.";
        metrics = clean([
          metric("Narratives", arr.length ? `${arr.length}` : null),
          metric("Top", arr[0]?.name ?? null),
          metric("Phase", arr[0]?.phase ?? null),
        ]);
        break;
      }
      case "base-pulse": {
        title = "Base Pulse";
        const score = resp.pulse_score ?? resp.score;
        const sentiment = resp.sentiment ?? resp.market_sentiment;
        summary = `Base ecosystem snapshot${sentiment ? ` — sentiment ${sentiment}` : ""}.`;
        metrics = clean([
          metric("TVL", fmtUsd(resp.tvl_usd ?? resp.base_tvl_usd ?? resp.tvl)),
          metric("Sentiment", typeof sentiment === "string" ? sentiment : null),
          metric("Pulse", score != null ? `${score}` : null),
        ]);
        break;
      }
      case "whale-tracker": {
        title = "Whale Tracker";
        const flow = resp.net_flow ?? resp.signal ?? resp.direction;
        summary = resp.summary ?? resp.thesis ?? "Smart-money flow on Base updated.";
        metrics = clean([
          metric("Flow", typeof flow === "string" ? flow : null),
          metric("Transfers", resp.transfer_count != null ? `${resp.transfer_count}` : (Array.isArray(resp.transfers) ? `${resp.transfers.length}` : null)),
          metric("Token", resp.symbol ?? null),
        ]);
        break;
      }
    }
  } catch {
    /* fall through to defaults */
  }

  // Generic fallback: pull a few scalar fields as metrics if we got none.
  if (metrics.length === 0) {
    metrics = clean(
      Object.entries(resp ?? {})
        .filter(([k, v]) => typeof v !== "object" && v != null && !["tool", "timestamp", "disclaimer", "dataSource"].includes(k))
        .map(([k, v]) => metric(k.replace(/_/g, " "), String(v))),
    );
  }
  if (!summary) summary = "Updated.";

  const shareText = `${title} — ${summary} via @blueagent_ blueagent.dev/app/feed`;
  return { ...base, title, summary, data: { metrics, raw: resp }, shareText };
}

async function callTool(job: Job): Promise<FeedItem | null> {
  try {
    const res = await fetch(`${BASE_URL}/${job.tool}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Blue-Internal": INTERNAL_SERVICE_KEY,
        "X-Blue-Service": "internal",
      },
      body: JSON.stringify(job.body),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      console.warn(`[feed] ${job.tool} → HTTP ${res.status}`);
      return null;
    }
    const data = await res.json().catch(() => null);
    if (!data || data.error) {
      console.warn(`[feed] ${job.tool} → no data / error`);
      return null;
    }
    return toFeedItem(job, data, 0);
  } catch (e) {
    console.warn(`[feed] ${job.tool} failed:`, (e as Error).message);
    return null;
  }
}

async function runFeed() {
  const results = await Promise.all(JOBS.map(callTool));
  const fresh = results.filter((x): x is FeedItem => x !== null);
  const existing = (await kvGet<FeedItem[]>("feed:items")) ?? [];
  const merged = [...fresh, ...existing].slice(0, 50);
  await kvSet("feed:items", merged);
  return { ok: true, added: fresh.length, total: merged.length, updatedAt: Date.now() };
}

async function handle(req: NextRequest) {
  const authHeader  = req.headers.get("authorization");
  const secretParam = new URL(req.url).searchParams.get("secret");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}` && secretParam !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!INTERNAL_SERVICE_KEY) {
    return NextResponse.json({ error: "INTERNAL_SERVICE_KEY not configured" }, { status: 500 });
  }
  const result = await runFeed();
  return NextResponse.json(result);
}

export async function GET(req: NextRequest)  { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
