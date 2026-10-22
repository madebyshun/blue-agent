/**
 * Receipts for the paid MCP tools (lib/mcp-paid.ts) — what /app/services shows.
 *
 * Two books, written together on every paid call that got past verification:
 *   • a capped list of the latest receipts (newest first, 500 kept) — the
 *     "Receipts" panel, each settled one linked to its Base tx;
 *   • per-day atomic counters (HINCRBY) — the 30-day stats and the chart.
 *
 * Outside buyers and the team are counted APART. A page that shows our own
 * test calls as demand would be the exact claim this product tells agents
 * not to make; the team wallets are named here, in code, so the split is
 * reviewable rather than a dashboard filter someone forgets to set.
 *
 * Stores no inputs, no outputs, no IP — tool, outcome, amount, payer, tx, time.
 * Best-effort: the USDC has already moved (or deliberately not), so a KV
 * hiccup must never fail the paid response.
 */
import { kv, kvGetProbe, kvMutate } from "@/lib/kv";

/** Wallets whose calls are tests, not demand. Lowercase. */
export const TEAM_WALLETS: ReadonlySet<string> = new Set([
  "0xd5c1dfc036f9911348ea8065f73c8123f4013fab", // ShunTr (treasury / test wallet)
  "0x00fd29b7d6dbf13afb879afbb239db1d48ce746f", // ShunTr test buyer — first paid MCP call, 2026-10-23 (tx 0xedbfc03a…581c)
]);

export type McpOutcome = "settled" | "not_charged";
export interface McpReceipt {
  tool: string;
  outcome: McpOutcome;
  units: number;         // USDC micro-units actually settled (0 when not charged)
  payer: string | null;  // EIP-3009 `from`, lowercase
  tx: string | null;     // Base settlement tx
  team: boolean;
  at: string;            // ISO
}

const K_LIST = "mcp:receipts";
const LIST_MAX = 500;
const dayKey = (d: Date) => `mcp:stats:${d.toISOString().slice(0, 10).replace(/-/g, "")}`;
const DAY_TTL = 120 * 24 * 3600;

export async function recordMcpReceipt(r: Omit<McpReceipt, "team" | "at">): Promise<void> {
  const payer = r.payer ? r.payer.toLowerCase() : null;
  const team = !!payer && TEAM_WALLETS.has(payer);
  const rec: McpReceipt = { ...r, payer, team, at: new Date().toISOString() };
  const who = team ? "team" : "outside";
  const day = dayKey(new Date());
  try {
    await Promise.all([
      kvMutate<McpReceipt[]>(K_LIST, [], (cur) => [rec, ...cur].slice(0, LIST_MAX)),
      kv.hincrby(day, `${who}|${r.outcome}|${r.tool}`, 1),
      r.units > 0 ? kv.hincrby(day, `${who}|units|${r.tool}`, r.units) : Promise.resolve(0),
      payer && !team && r.outcome === "settled" ? kv.sadd(`${day}:payers`, payer) : Promise.resolve(),
    ]);
    await Promise.all([kv.expire(day, DAY_TTL), kv.expire(`${day}:payers`, DAY_TTL)]);
  } catch { /* bookkeeping is best-effort */ }
}

export interface ToolStats { settled: number; notCharged: number; units: number }
export interface McpStats {
  /** null = KV could not be read; the page then says "—", never 0. */
  readable: boolean;
  days: number;
  outside: { settled: number; notCharged: number; units: number; payers: number };
  team: { settled: number; notCharged: number };
  byTool: Record<string, ToolStats>;
  /** Outside settled calls per day, oldest first. */
  series: { day: string; outside: number; team: number }[];
}

export async function readMcpStats(days = 30): Promise<McpStats> {
  const out: McpStats = {
    readable: true, days,
    outside: { settled: 0, notCharged: 0, units: 0, payers: 0 },
    team: { settled: 0, notCharged: 0 },
    byTool: {}, series: [],
  };
  const payers = new Set<string>();
  const now = Date.now();
  try {
    const keys = Array.from({ length: days }, (_, i) => dayKey(new Date(now - (days - 1 - i) * 86_400_000)));
    const [hashes, payerSets] = await Promise.all([
      Promise.all(keys.map((k) => kv.hgetall(k))),
      Promise.all(keys.map((k) => kv.smembers(`${k}:payers`))),
    ]);
    keys.forEach((k, i) => {
      const h = (hashes[i] ?? {}) as Record<string, unknown>;
      let o = 0, t = 0;
      for (const [field, raw] of Object.entries(h)) {
        const n = Number(raw) || 0;
        const [who, kind, tool] = field.split("|");
        if (!tool) continue;
        const ts = (out.byTool[tool] ??= { settled: 0, notCharged: 0, units: 0 });
        if (who === "outside") {
          if (kind === "settled") { out.outside.settled += n; ts.settled += n; o += n; }
          else if (kind === "not_charged") { out.outside.notCharged += n; ts.notCharged += n; }
          else if (kind === "units") { out.outside.units += n; ts.units += n; }
        } else if (who === "team") {
          if (kind === "settled") { out.team.settled += n; t += n; }
          else if (kind === "not_charged") out.team.notCharged += n;
        }
      }
      for (const p of payerSets[i] ?? []) payers.add(p);
      out.series.push({ day: k.slice(-8), outside: o, team: t });
    });
    out.outside.payers = payers.size;
  } catch {
    out.readable = false;
  }
  return out;
}

/** Latest receipts, newest first; null when KV could not be read. */
export async function readMcpReceipts(limit = 12): Promise<McpReceipt[] | null> {
  const p = await kvGetProbe<McpReceipt[]>(K_LIST);
  if (p.status === "error") return null;
  return p.status === "hit" ? p.value.slice(0, limit) : [];
}
