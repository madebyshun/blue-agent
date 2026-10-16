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


import { discoveryRows } from "@/lib/chat/discovery-rows";

/** The token's explorer page — the contract travels inside the link, so a
 *  follow-up trade still has it while the answer stays one line per row. */
export function tokenLink(symbol: string, address: string | null, chain: "base" | "robinhood"): string {
  if (!address) return `**${symbol}**`;
  const host = chain === "robinhood" ? "https://robinhoodchain.blockscout.com/token/" : "https://basescan.org/token/";
  return `[**${symbol}**](${host}${address})`;
}

/** Rows shown before "…and N more" (2026-10-16: answers read like Bankr's —
 *  a summary line, then the few rows that matter). */
const MAX_ROWS = 5;

/**
 * A discovery result written as the ANSWER, in text. Built by code from the
 * same rows the card showed, so nothing in it can be invented. Each row is one
 * line; its contract rides in the symbol's explorer link.
 */
function discoveryText(tool: string, r: Json): string | null {
  const d = discoveryRows(tool, r);
  if (!d) return null;
  if (!d.rows.length) return d.note ? `**${d.title}** — ${d.note}` : null;
  const lines = d.rows.slice(0, MAX_ROWS).map((row) => {
    const facts = row.facts.slice(0, 3).join(" · ");
    const noTrade = !row.swappable && row.noSwapReason ? ` · not tradable: ${row.noSwapReason}` : "";
    return `- ${tokenLink(row.symbol, row.address, row.chain)}${facts ? ` ${facts}` : ""}${noTrade}`;
  });
  const more = d.more + Math.max(0, d.rows.length - MAX_ROWS);
  return [
    `**${d.title}**`,
    ...lines,
    more > 0 ? `…and ${more} more.` : "",
  ].filter(Boolean).join("\n");
}

/** Trending on Base, written short: who leads, then the top rows with the
 *  change, the liquidity and only the flags that change a decision. "Tax not
 *  measured" is left out of the list: every buy is checked before signing
 *  (GoPlus measures it then), and nine rows of the same caveat buried the one
 *  that mattered (measured on the 2026-10-16 share). */
function trendingText(ok: Json[]): string {
  const ch = (t: Json) => num(t.change_24h);
  const leader = [...ok].filter((t) => ch(t) != null).sort((a, b) => (ch(b) ?? 0) - (ch(a) ?? 0))[0];
  const head = leader ? `**Trending on Base**: ${str(leader.symbol)} leads, ${fmtPct(leader.change_24h)} in 24h.` : "**Trending on Base**";
  const lines = ok.slice(0, MAX_ROWS).map((t) => {
    const addr = typeof t.address === "string" && /^0x[a-fA-F0-9]{40}$/.test(t.address) ? t.address : null;
    const flags = (Array.isArray(t.flags) ? t.flags : []).filter((f): f is string => typeof f === "string");
    const hp = (t.honeypot as Json | null)?.verdict;
    const risk = hp === "HONEYPOT" ? "honeypot, not tradable"
      : flags.includes("IMPERSONATION_CHECK") ? "impersonator, not tradable"
      : hp === "SAFE" ? "tax clean" : "";
    const facts = [fmtPct(t.change_24h), fmtUsd(t.liquidity_usd) ? `liq ${fmtUsd(t.liquidity_usd)}` : "", risk].filter(Boolean).join(" · ");
    return `- ${tokenLink(str(t.symbol) || "?", addr, "base")} ${facts}`;
  });
  const more = ok.length - Math.min(ok.length, MAX_ROWS);
  return [head, ...lines, `${more > 0 ? `…and ${more} more. ` : ""}Say "buy $5 of <symbol>" to trade one; it's checked before you sign.`].join("\n");
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
  "hub_b20_inspect",
]);

// Since 2026-10-13 no result renders as a card: the code-written reply IS the
// answer, in text, so nothing is "already shown" and nothing is prefixed.
export const CARD_RENDERED_TOOLS = new Set<string>();

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
      return trendingText(ok);
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
      return `${discoveryText(tool, r) ?? ""}\n\nRobinhood Chain movers (24h, pool price): ${[top ? `top ${top}` : "", bottom ? `bottom ${bottom}` : ""].filter(Boolean).join(" · ")}. To trade one, say e.g. "buy $5 of <ticker> on robinhood".`;
    }
    case "hub_rh_new_listings": {
      if (!Array.isArray(r.recent_deployments)) return null;
      const n = arr(r.recent_deployments).length;
      const unlisted = num(r.new_since_registry) ?? arr(r.new_only).length;
      if (n === 0) return "The Robinhood token factory deployed no new stock or ETF token in that window.";
      return `${discoveryText(tool, r) ?? ""}\n\n${n} recent deployment${n === 1 ? "" : "s"} from the Robinhood token factory (read from the factory's own events). A deployment proves provenance, not liquidity — most have no pool yet${unlisted > 0 ? `; ${unlisted} not yet in BlueAgent's registry, so not tradable here` : ""}.`;
    }
    case "hub_rh_search": {
      if (!Array.isArray(r.matches)) return null;
      const m = arr(r.matches);
      const q = str(r.query) || str(args.query);
      if (m.length === 0) return `No Robinhood Chain stock or ETF token matches "${q}" in the registry.`;
      const first = m[0];
      return m.length === 1
        ? (discoveryText(tool, r) ?? `${str(first.ticker)} — ${str(first.name)} on Robinhood Chain.`)
        : `${discoveryText(tool, r) ?? ""}\n\n${m.length} Robinhood Chain matches for "${q}"; the closest is ${str(first.ticker)} — ${str(first.name)}.`;
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
      return `${discoveryText(tool, r) ?? ""}\n\n${s} stock and ${e} ETF tokens on Robinhood Chain in the registry; ask for one by name to get its contract.`;
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
    case "hub_b20_inspect": {
      const addr = str(r.address);
      const net = r.network === "sepolia" ? "Base Sepolia" : "Base mainnet";
      if (!addr || typeof r.isB20 !== "boolean") return null;
      // inspectB20 keeps old fallbacks (isB20 false, paused false, policy
      // open) for reads that FAILED and lists those reads in `unread`. A
      // definite claim is made only from a read that succeeded.
      const unread = new Set(Array.isArray(r.unread) ? r.unread.filter((x): x is string => typeof x === "string") : []);
      if (unread.has("isB20")) return `Could not read whether ${addr} is a B20 token on ${net} — the B20 Factory's isB20() read failed. That is not a "no"; try again in a moment.`;
      if (!r.isB20) return `${addr} is NOT a B20 token on ${net} — the B20 Factory's isB20() returned false.`;
      const sym = str(r.symbol);
      const head = `**${sym || addr}**${str(r.name) ? ` (${str(r.name)})` : ""} on ${net} — a B20 token, ${r.variant === "STABLECOIN" ? `stablecoin${str(r.currency) ? ` (${str(r.currency)})` : ""}` : r.variant === "ASSET" ? "asset variant" : "variant unknown"}${typeof r.decimals === "number" ? `, ${r.decimals} decimals` : ""}.`;
      const supplyN = Number(str(r.totalSupplyFormatted));
      const supply = str(r.totalSupplyFormatted)
        ? `${Number.isFinite(supplyN) ? supplyN.toLocaleString("en-US", { maximumFractionDigits: 2 }) : str(r.totalSupplyFormatted)}${sym ? ` ${sym}` : ""}`
        : "unknown";
      const cap = r.supplyCapUncapped === true ? "uncapped" : str(r.supplyCapFormatted) || "unknown";
      const p = r.paused as { transfer?: boolean; mint?: boolean; burn?: boolean } | undefined;
      const feats = ["transfer", "mint", "burn"] as const;
      const paused = (() => {
        if (!p) return "pause state unknown";
        const known = (k: (typeof feats)[number]) => !unread.has(`paused.${k}`) && typeof p[k] === "boolean";
        const yes = feats.filter((k) => known(k) && p[k] === true);
        const no = feats.filter((k) => known(k) && p[k] === false);
        const unk = feats.filter((k) => !known(k));
        if (unk.length === 0) return yes.length === 0 ? "nothing paused" : `paused: ${yes.join(", ")}`;
        return [
          yes.length > 0 ? `paused: ${yes.join(", ")}` : "",
          no.length > 0 ? `not paused: ${no.join(", ")}` : "",
          `pause state of ${unk.join(", ")} could not be read`,
        ].filter(Boolean).join("; ");
      })();
      const pol = r.policies as Record<string, { policyId?: string; kind?: string }> | undefined;
      const scope = (k: string, label: string) => {
        const x = pol?.[k];
        if (!x) return `${label} unknown`;
        if (unread.has(`policies.${k}`)) return `${label} could not be read`;
        return `${label} ${x.kind === "open" ? "open to all" : x.kind === "blocked" ? "blocked for all" : `gated by policy #${x.policyId ?? "?"}`}`;
      };
      const policies = pol
        ? [scope("transferSender", "send"), scope("transferReceiver", "receive"), scope("transferExecutor", "executor"), scope("mintReceiver", "mint")].join(" · ")
        : "unknown";
      const url = str(r.explorerUrl);
      return [
        head,
        `- Supply ${supply} · cap ${cap} · ${paused}`,
        `- Who may move it: ${policies}`,
        url ? `- [Contract on Basescan](${url})` : "",
      ].filter(Boolean).join("\n");
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

/**
 * The connected wallet's holdings written as the ANSWER, short (2026-10-16,
 * modelled on Bankr's reply): the total first, then per chain its total and
 * the few priced positions that make it up. Unpriced tokens — on a busy
 * wallet mostly airdropped spam, some named after phishing sites — are
 * COUNTED, never listed: listing them put "www.afomo.top" in the answer.
 * Code-written from the reads: no value is ever invented, an unpriced
 * position is never $0, and an incomplete Base read says so.
 */
type Holding = { symbol: string; amount: string; address: string; usdValue?: number; isNative?: boolean; trust?: string };
const SHOW_PER_CHAIN = 5;
export function walletText(base: Holding[], rh: Holding[], opts: { partialReason?: string; error?: string } = {}): string {
  const fmtV = (v: number) => (v >= 1000 ? `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : `$${v.toFixed(2)}`);
  const amt = (a: string) => {
    const n = Number(a);
    if (!Number.isFinite(n)) return a;
    if (n >= 1e9) return `${+(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `${+(n / 1e6).toFixed(2)}M`;
    if (n >= 1e4) return `${+(n / 1e3).toFixed(1)}K`;
    return n.toLocaleString("en-US", { maximumFractionDigits: n < 1 ? 6 : 4 });
  };
  const priced = (l: Holding[]) => l.filter((h) => typeof h.usdValue === "number" && h.usdValue >= 1).sort((a, b) => b.usdValue! - a.usdValue!);
  const total = (l: Holding[]) => l.reduce((s, h) => s + (h.usdValue ?? 0), 0);
  const unpriced = [...base, ...rh].filter((h) => typeof h.usdValue !== "number").length;
  const dust = [...base, ...rh].filter((h) => typeof h.usdValue === "number" && h.usdValue < 1).length;

  if (opts.error && !base.length && !rh.length) return "Couldn't read the wallet right now — please try again in a moment.";
  if (!base.length && !rh.length) return "No tokens found on Base or Robinhood Chain for this wallet.";

  const section = (title: string, list: Holding[], chain: "base" | "robinhood") => {
    if (!list.length) return chain === "robinhood" ? `**${title}**: none found (the explorer may not have answered).` : `**${title}**: no tokens found.`;
    const p = priced(list);
    const lines = p.slice(0, SHOW_PER_CHAIN).map((h) =>
      `- ${h.isNative ? `**${h.symbol || "ETH"}**` : tokenLink(h.symbol || "?", h.address, chain)}: ${fmtV(h.usdValue!)} (${amt(h.amount)})${h.trust === "unverified" ? " · unverified" : ""}`);
    const more = p.length - Math.min(p.length, SHOW_PER_CHAIN);
    return [
      `**${title}** (${p.length ? fmtV(total(list)) : "nothing priced"})`,
      ...lines,
      more > 0 ? `- …and ${more} more priced` : "",
    ].filter(Boolean).join("\n");
  };

  const grand = total(base) + total(rh);
  const tail = [
    unpriced ? `${unpriced} token${unpriced === 1 ? "" : "s"} with no price (airdrops and spam usually land here)` : "",
    dust ? `${dust} under $1` : "",
  ].filter(Boolean).join(" and ");
  return [
    grand > 0 ? `Portfolio is about ${fmtV(grand)} where priced, across Base and Robinhood Chain.` : "Nothing in this wallet has a price right now.",
    section("Base", base, "base"),
    section("Robinhood Chain", rh, "robinhood"),
    [tail ? `Also ${tail}.` : "", opts.partialReason ? "The Base list may be incomplete." : ""].filter(Boolean).join(" "),
  ].filter(Boolean).join("\n\n");
}
