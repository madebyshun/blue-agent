/**
 * Public aggregates of action records (G4, 2026-09-30 — plan §0b, §5) — what
 * /stats publishes about REAL trades, in place of arrow figures nobody traded
 * on.
 *
 * WRITTEN at exactly one moment: when the chain settles an action
 * (lib/actions.ts — a receipt proved the wallet sent it). A per-id marker
 * (`actions:stats:counted:<id>`, SET NX) makes a retried attach, a second
 * reader settling the same record, or a race between the two count ONCE.
 *
 * WHAT IS KEPT is counts, a list of realized-slippage samples, and a set of
 * wallets used only for its SIZE. No address is ever emitted by the reader.
 *
 * SLIPPAGE SAMPLES come only from swaps signed against a FIRM quote — the Base
 * 0x quote (`isFirmQuote` in lib/actions.ts). A Robinhood Chain swap is floored
 * from a display-only GeckoTerminal estimate, so "received vs estimate" there
 * measures the price source's error, not slippage; those records carry
 * `slippage_bps: null` and add no sample (they still count as swaps).
 *
 * FORWARD-ONLY: the meter starts with the first settled action
 * (`actions:stats:since`) and is never backfilled — the reader says so, with
 * the date, rather than presenting a young meter as an all-time total.
 *
 * REFUSALS are counted only where they are EVIDENCE the server measured:
 * distinct tokens refused as an impostor or a measured honeypot — a set, so
 * re-checking one token cannot inflate it, and growing it takes a real bad
 * contract per entry. A ticker-instead-of-address BLOCK is an input error, not
 * a catch — never counted.
 *
 * Bridge refusals were counted too until 2026-10-01 and are not any more
 * (review): the only door that measured the cost itself is the unauthenticated
 * MCP builder, where the caller picks the amount and the wallet — a dust
 * bridge repeated in a loop raised a public number by thousands an hour with
 * no real user behind any of it. A count nobody can keep honest is not
 * published.
 */
import { kv, kvGetProbe, kvMutate, kvSAdd, kvSetNX } from "@/lib/kv";
import type { ActionRecord } from "@/lib/actions";
import type { PreTradeCheck } from "@/lib/pre-trade-check";

const K_HASH = "actions:stats";
const K_SINCE = "actions:stats:since";
const K_WALLETS = "actions:stats:wallets";
const K_SLIP = "actions:stats:slippage_bps";
const K_BLOCKED_TOKENS = "pretrade:blocked:tokens";
const counted = (id: string) => `actions:stats:counted:${id}`;

const TEN_YEARS_S = 10 * 365 * 24 * 3600;
/** Samples kept for the median — the newest, capped. */
export const SLIP_SAMPLE_CAP = 1000;
/** Below this many samples the median is withheld ("insufficient data"). */
export const SLIP_MIN_N = 5;

/** Count one settled action. Idempotent per record id; never throws. */
export async function recordSettled(rec: ActionRecord): Promise<void> {
  if (rec.status !== "confirmed" && rec.status !== "reverted") return;
  try {
    if (!(await kvSetNX(counted(rec.id), 1, TEN_YEARS_S))) return;
    await kvSetNX(K_SINCE, new Date().toISOString(), TEN_YEARS_S);
    if (rec.status === "reverted") {
      await kv.hincrby(K_HASH, "reverted", 1);
      return;
    }
    await Promise.all([
      kv.hincrby(K_HASH, "confirmed", 1),
      kv.hincrby(K_HASH, `kind:${rec.kind}`, 1),
      kv.hincrby(K_HASH, `chain:${rec.chain}`, 1),
      rec.source === "mcp" ? kv.hincrby(K_HASH, "agent", 1) : Promise.resolve(0),
      kvSAdd(K_WALLETS, rec.wallet.toLowerCase()),
    ]);
    const bps = rec.realized?.slippage_bps;
    if (typeof bps === "number" && Number.isFinite(bps)) {
      await kvMutate<number[]>(K_SLIP, [], (xs) => [bps, ...xs].slice(0, SLIP_SAMPLE_CAP));
    }
  } catch { /* the public meter is bookkeeping; the trade already happened */ }
}

/** Count a refusal the server itself measured (see the header). Never throws. */
export async function recordPreTradeBlock(
  check: PreTradeCheck,
  input: { chain: string; token: string },
): Promise<void> {
  if (check.verdict !== "BLOCK") return;
  try {
    const blocks = check.reasons.filter((r) => r.level === "BLOCK");
    if (blocks.some((r) => r.code === "IMPOSTOR" || r.code === "HONEYPOT")) {
      await kvSAdd(K_BLOCKED_TOKENS, `${input.chain}:${input.token.trim().toLowerCase()}`);
    }
  } catch { /* bookkeeping */ }
}

export interface ActionStats {
  /** false ⟹ a counter could not be READ; every number below is a placeholder
   *  the page renders as "—" (the #150 convention: a zero is a claim). */
  ok: boolean;
  /** When the meter began (first settled action). null ⟹ nothing settled yet. */
  since: string | null;
  confirmed: number;
  reverted: number;
  by_kind: { swap: number; send: number; bridge: number };
  by_chain: { base: number; robinhood: number };
  /** Confirmed actions an agent built over MCP. */
  via_agent: number;
  /** Distinct wallets with ≥ 1 confirmed action — a count, never a list. */
  wallets: number;
  /** Realized vs quoted output on confirmed swaps signed against a FIRM quote
   *  (Base 0x only — see the header), in basis points; positive = received
   *  less than quoted. `median_bps` is null under SLIP_MIN_N samples. */
  slippage: { median_bps: number | null; n: number; min_n: number };
  /** Refusals the server measured: distinct tokens (impostor / honeypot). */
  blocked: { tokens: number };
}

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export async function readActionStats(): Promise<ActionStats> {
  let ok = true;
  let h: Record<string, unknown> = {};
  let wallets = 0;
  let blockedTokens = 0;
  let samples: number[] = [];
  let since: string | null = null;
  try { h = (await kv.hgetall(K_HASH)) ?? {}; } catch { ok = false; }
  try { wallets = (await kv.smembers(K_WALLETS)).length; } catch { ok = false; }
  try { blockedTokens = (await kv.smembers(K_BLOCKED_TOKENS)).length; } catch { ok = false; }
  const slip = await kvGetProbe<number[]>(K_SLIP);
  if (slip.status === "error") ok = false;
  else if (slip.status === "hit" && Array.isArray(slip.value)) samples = slip.value.filter((x) => typeof x === "number" && Number.isFinite(x));
  const s = await kvGetProbe<string>(K_SINCE);
  if (s.status === "error") ok = false;
  else if (s.status === "hit") since = String(s.value);

  return {
    ok,
    since,
    confirmed: num(h.confirmed),
    reverted: num(h.reverted),
    by_kind: { swap: num(h["kind:swap"]), send: num(h["kind:send"]), bridge: num(h["kind:bridge"]) },
    by_chain: { base: num(h["chain:base"]), robinhood: num(h["chain:robinhood"]) },
    via_agent: num(h.agent),
    wallets,
    slippage: { median_bps: samples.length >= SLIP_MIN_N ? median(samples) : null, n: samples.length, min_n: SLIP_MIN_N },
    blocked: { tokens: blockedTokens },
  };
}
