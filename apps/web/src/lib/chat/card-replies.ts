/**
 * Card-first replies for Chat's read tools (2026-10-01).
 *
 * The discovery and price tools render their result as a card (DiscoveryCard,
 * WalletCard). Until now the model then wrote a second answer UNDER the card —
 * re-tabulating the same rows, sometimes in a different order, sometimes with
 * a label the card never showed. Measured on the 2026-09-30 test share: a
 * trending answer re-listed ten rows the card had already listed, and the
 * prose and the card disagreed on which rows were flagged.
 *
 * So for these tools the reply is written HERE, in code, from the result the
 * card renders: one or two lines, every number copied from the payload, never
 * a recommendation. Returning a line sets `staticReply`, which lets the chat
 * route skip the Phase 2 model call entirely when every tool in the turn has
 * one (the pure-marker short-circuit in `veniceToolStream`).
 *
 * `null` means "this payload is not a shape I recognise" — the caller then
 * falls through to the model, which is the old behaviour. Never guess a field:
 * a reply built from a misread payload would be a fabricated number with the
 * product's name on it.
 */

type Json = Record<string, unknown>;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const arr = (v: unknown): Json[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Json[]) : []);

export function fmtUsd(v: unknown): string | null {
  const n = num(v);
  if (n == null) return null;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toPrecision(3)}`;
}

export function fmtPct(v: unknown): string | null {
  const n = num(v);
  return n == null ? null : `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
}

/** Chat tools whose reply is written by `cardReply` rather than the model. */
export const CARD_REPLY_TOOLS = new Set([
  "hub_safe_trending",
  "hub_rh_movers",
  "hub_rh_new_listings",
  "hub_rh_search",
  "hub_rh_quote",
  "hub_rh_index",
  "hub_token_price",
]);

/**
 * The line shown under the card, or null to let the model answer.
 * `args` are the tool-call arguments (used only to echo the user's query).
 */
export function cardReply(tool: string, result: unknown, args: Json = {}): string | null {
  if (!CARD_REPLY_TOOLS.has(tool) || !result || typeof result !== "object") return null;
  const r = result as Json;
  if (typeof r.error === "string" && r.error) return null;

  switch (tool) {
    case "hub_safe_trending": {
      if (!Array.isArray(r.tokens)) return null;
      const ok = arr(r.tokens).filter((t) => t.status === "ok");
      if (ok.length === 0) return "No trending Base token passed the liquidity floor right now.";
      const honeypots = ok.filter((t) => (t.honeypot as Json | null)?.verdict === "HONEYPOT").length;
      const flagged = ok.filter((t) => Array.isArray(t.flags) && t.flags.length > 0).length;
      const tail = [
        honeypots > 0 ? `${honeypots} measured as a honeypot (no Swap button)` : "",
        flagged > 0 ? `${flagged} carry flags` : "",
      ].filter(Boolean).join(", ");
      return `${ok.length} trending token${ok.length === 1 ? "" : "s"} on Base above, each with its tax read from the contract${tail ? ` — ${tail}` : ""}. A clean scan is not a buy signal; tap Swap on a row to trade it.`;
    }
    case "hub_rh_movers": {
      if (!Array.isArray(r.gainers) || !Array.isArray(r.losers)) return null;
      const g = arr(r.gainers)[0];
      const l = arr(r.losers)[0];
      const side = (x: Json | undefined) =>
        x && str(x.ticker) && fmtPct(x.change_24h_pct) ? `${str(x.ticker)} ${fmtPct(x.change_24h_pct)}` : null;
      const top = side(g);
      const bottom = side(l);
      if (!top && !bottom) return str(r.note) || "No Robinhood Chain stock token moved enough on a dollar-anchored pool to rank right now.";
      return `Robinhood Chain movers (24h, pool price): ${[top ? `top ${top}` : "", bottom ? `bottom ${bottom}` : ""].filter(Boolean).join(" · ")}. Full list above; tap Swap on a row to trade it.`;
    }
    case "hub_rh_new_listings": {
      if (!Array.isArray(r.recent_deployments)) return null;
      const n = arr(r.recent_deployments).length;
      const unlisted = num(r.new_since_registry) ?? arr(r.new_only).length;
      if (n === 0) return "The Robinhood token factory deployed no new stock or ETF token in that window.";
      return `${n} recent deployment${n === 1 ? "" : "s"} from the Robinhood token factory above (read from the factory's own events). A deployment proves provenance, not liquidity — most have no pool yet${unlisted > 0 ? `; ${unlisted} not yet in BlueAgent's registry, so no Swap button` : ""}.`;
    }
    case "hub_rh_search": {
      if (!Array.isArray(r.matches)) return null;
      const m = arr(r.matches);
      const q = str(r.query) || str(args.query);
      if (m.length === 0) return `No Robinhood Chain stock or ETF token matches "${q}" in the registry.`;
      const first = m[0];
      return m.length === 1
        ? `${str(first.ticker)} — ${str(first.name)} on Robinhood Chain (contract on the card).`
        : `${m.length} Robinhood Chain matches for "${q}" above; the closest is ${str(first.ticker)} — ${str(first.name)}.`;
    }
    case "hub_rh_quote": {
      const ticker = str(r.ticker);
      const price = fmtUsd(r.price_usd);
      if (!ticker) return null;
      if (!price) return `No live price for ${ticker} on Robinhood Chain right now${str(r.note) ? ` — ${str(r.note)}` : ""}.`;
      const src = r.source === "chainlink" ? "Chainlink oracle" : r.source === "dex-spot" ? "DEX spot" : null;
      if (!src) return null;
      const stale = r.is_stale === true || (r.chainlink as Json | null)?.is_stale === true;
      return `${ticker} on Robinhood Chain: ${price} (${src}${stale ? ", STALE — the feed has not updated within its heartbeat, e.g. market closed" : ""}).`;
    }
    case "hub_rh_index": {
      if (!Array.isArray(r.stocks) && !Array.isArray(r.etfs)) return null;
      const s = arr(r.stocks).length;
      const e = arr(r.etfs).length;
      return `${s} stock and ${e} ETF tokens on Robinhood Chain in the registry — the first rows are above; ask for one by name to get its contract.`;
    }
    case "hub_token_price": {
      const price = fmtUsd(r.usd);
      if (!price) return null;
      const who = str(r.symbol).toUpperCase() || (str(r.address) ? `${str(r.address).slice(0, 6)}…${str(r.address).slice(-4)}` : "");
      if (!who) return null;
      const ch = fmtPct(r.change24h);
      const mc = fmtUsd(r.marketCap);
      const net = str(r.network) ? ` on ${str(r.network)}` : "";
      return `${who}${net}: ${price}${ch ? ` (24h ${ch})` : ""}${mc ? `, market cap ${mc}` : ""} — CoinGecko.`;
    }
  }
  return null;
}

/**
 * Prefix for the tool text the model reads when a card tool shares a turn with
 * a tool that still needs Phase 2: the card is already on screen, so the model
 * must not re-list it.
 */
export const CARD_ALREADY_SHOWN =
  "[The user already sees this result as a card. Do NOT re-list its rows, re-tabulate it, or add labels or flags that are not in the data. Refer to it in at most one sentence.]\n";
