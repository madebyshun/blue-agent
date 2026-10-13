/**
 * Address-poisoning radar for the brief (plan 2026-10-13, B).
 *
 * The attack: mint an address whose first and last characters match one the
 * victim pays, then put it into the victim's history so it gets copied next
 * time. Two shapes show up on-chain, and both are caught here:
 *
 *   lookalike_in        a transfer INTO the wallet from a look-alike of an
 *                       address the wallet has paid (often a worthless or fake
 *                       token, sometimes a dust amount of the real one);
 *   lookalike_out_zero  a ZERO-value transfer that appears to go FROM the
 *                       wallet TO a look-alike — the `transferFrom(victim,
 *                       lookalike, 0)` trick, which needs no approval and puts
 *                       the fake address in the wallet's own "sent" list.
 *
 * Look-alike is recipient-check's rule (same first 4 and last 4 hex, different
 * address). Payees are addresses the wallet sent a non-zero amount to, from
 * the same explorer pages. A transfer from an address that is itself a payee
 * is never flagged. A chain whose pages could not be read is reported unread,
 * never "no attempt".
 *
 * Source: Blockscout v2 REST (`/addresses/{a}/token-transfers`, `/transactions`)
 * for Base 8453 and Robinhood Chain 4663 — two pages each way (~100 transfers),
 * so a very busy wallet may have attempts older than the window read.
 */
import { isLookalike } from "@/lib/recipient-check";
import type { BriefChain } from "./types";

const UA = "Mozilla/5.0 (compatible; BlueAgent/1.0; +https://blueagent.dev)";
const EXPLORER: Record<BriefChain, string> = { base: "https://base.blockscout.com", robinhood: "https://robinhoodchain.blockscout.com" };

export interface Xfer { from: string; to: string; value: string; at: number; tx: string; symbol: string | null }
export interface PoisonEvent {
  chain: BriefChain;
  kind: "lookalike_in" | "lookalike_out_zero";
  /** The look-alike address. */
  attacker: string;
  /** The real address it imitates (one the wallet paid). */
  twin: string;
  at: number;
  tx: string;
  symbol: string | null;
}

const lc = (a: string) => a.toLowerCase();

/** Pure. `since` bounds the window; events are deduplicated by tx + attacker. */
export function findPoison(chain: BriefChain, wallet: string, incoming: Xfer[], outgoing: Xfer[], nativePayees: string[], since: number): PoisonEvent[] {
  const w = lc(wallet);
  const payees = new Set<string>();
  for (const t of outgoing) if (lc(t.from) === w && t.value !== "0" && t.value !== "" && lc(t.to) !== w) payees.add(lc(t.to));
  for (const p of nativePayees) if (lc(p) !== w) payees.add(lc(p));
  const twinOf = (a: string) => {
    if (payees.has(lc(a))) return null;
    for (const p of payees) if (isLookalike(a, p)) return p;
    return null;
  };
  const out = new Map<string, PoisonEvent>();
  for (const t of incoming) {
    if (t.at < since || lc(t.to) !== w) continue;
    const twin = twinOf(t.from);
    if (twin) out.set(`${t.tx}|${lc(t.from)}`, { chain, kind: "lookalike_in", attacker: lc(t.from), twin, at: t.at, tx: t.tx, symbol: t.symbol });
  }
  for (const t of outgoing) {
    if (t.at < since || lc(t.from) !== w || (t.value !== "0" && t.value !== "")) continue;
    const twin = twinOf(t.to);
    if (twin) out.set(`${t.tx}|${lc(t.to)}`, { chain, kind: "lookalike_out_zero", attacker: lc(t.to), twin, at: t.at, tx: t.tx, symbol: t.symbol });
  }
  return [...out.values()].sort((a, b) => b.at - a.at);
}

let fetchImpl: typeof fetch = (...a) => fetch(...a);
/** Tests inject a stub. */
export function __setPoisonFetch(f: typeof fetch | null) { fetchImpl = f ?? ((...a) => fetch(...a)); }

async function getJson(url: string): Promise<unknown | null> {
  try {
    const r = await fetchImpl(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(8_000) });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

type Item = { from?: { hash?: string }; to?: { hash?: string }; total?: { value?: string }; timestamp?: string; transaction_hash?: string; token?: { symbol?: string | null } };

async function xfers(chain: BriefChain, wallet: string, filter: "from" | "to", pages = 2): Promise<Xfer[] | null> {
  const out: Xfer[] = [];
  let next = "";
  for (let p = 0; p < pages; p++) {
    const j = await getJson(`${EXPLORER[chain]}/api/v2/addresses/${wallet}/token-transfers?filter=${filter}${next}`) as { items?: Item[]; next_page_params?: Record<string, unknown> | null } | null;
    if (!j || !Array.isArray(j.items)) return p === 0 ? null : out;
    for (const it of j.items) {
      if (!it.from?.hash || !it.to?.hash || !it.transaction_hash) continue;
      out.push({ from: it.from.hash, to: it.to.hash, value: String(it.total?.value ?? ""), at: Date.parse(it.timestamp ?? "") || 0, tx: it.transaction_hash, symbol: it.token?.symbol ?? null });
    }
    if (!j.next_page_params) break;
    next = "&" + new URLSearchParams(Object.entries(j.next_page_params).map(([k, v]) => [k, String(v)])).toString();
  }
  return out;
}

async function nativePayees(chain: BriefChain, wallet: string): Promise<string[] | null> {
  const j = await getJson(`${EXPLORER[chain]}/api/v2/addresses/${wallet}/transactions?filter=from`) as { items?: { to?: { hash?: string } | null; value?: string }[] } | null;
  if (!j || !Array.isArray(j.items)) return null;
  return j.items.filter((t) => t.to?.hash && t.value && t.value !== "0").map((t) => t.to!.hash!);
}

/** One chain. read=false when either direction's transfers could not be read. */
export async function readPoison(chain: BriefChain, wallet: string, since: number): Promise<{ read: boolean; events: PoisonEvent[] }> {
  const [inc, outg, nat] = await Promise.all([xfers(chain, wallet, "to"), xfers(chain, wallet, "from"), nativePayees(chain, wallet)]);
  if (!inc || !outg) return { read: false, events: [] };
  return { read: true, events: findPoison(chain, wallet, inc, outg, nat ?? [], since) };
}
