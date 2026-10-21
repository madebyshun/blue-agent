/**
 * The brief as text — Telegram HTML or chat markdown, from the same diff.
 * Pure. Every number printed is a reading or a difference of two readings
 * (./diff.ts); nothing here estimates, and no verdict word is chosen by a model.
 */
import { CHAIN_LABEL, type BriefDiff, type GrantRow, type HoldRow } from "./types";
import type { StockBriefData, StockRow } from "./stocks";

export type BriefFormat = "html" | "md";
const MAX_ROWS = 6;

const short = (a: string) => (/^0x[a-fA-F0-9]{40}$/.test(a) ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
const chainShort = (c: string) => (c === "robinhood" ? "RH" : "Base");
export const txUrl = (c: string, tx: string) => (c === "robinhood" ? `https://robinhoodchain.blockscout.com/tx/${tx}` : `https://basescan.org/tx/${tx}`);

export function usd(n: number): string {
  const s = Math.abs(n) >= 1000 ? Math.round(Math.abs(n)).toLocaleString("en-US") : Math.abs(n).toFixed(2);
  return `${n < 0 ? "-" : ""}$${s}`;
}
function signedUsd(n: number): string { return `${n >= 0 ? "+" : "-"}${usd(Math.abs(n))}`; }
function amt(s: string): string {
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  if (n === 0) return "0";
  if (Math.abs(n) >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return Number(n.toPrecision(6)).toString();
}
function ago(ms: number): string {
  const h = Math.round(ms / 3_600_000);
  return h < 1 ? "under an hour ago" : h < 48 ? `${h}h ago` : `${Math.round(h / 24)} days ago`;
}

export function renderBrief(d: BriefDiff, fmt: BriefFormat, opts: { now?: number; openUrl?: string; footer?: boolean; stocks?: StockBriefData | null } = {}): string {
  const now = opts.now ?? d.at;
  const e = (s: string) => (fmt === "html" ? s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : s);
  const b = (s: string) => (fmt === "html" ? `<b>${s}</b>` : `**${s}**`);
  const out: string[] = [];

  out.push(`☀️ ${b("Wallet brief")} · ${short(d.wallet)} · ${d.since ? `since ${ago(now - d.since)}` : "first brief"}`);
  if (!d.since) out.push(e("This is the baseline. Tomorrow's brief lists what changed against it."));

  // Poisoning first: it is the one item that asks the reader to do something
  // (stop copying from history) before anything else in the brief.
  if (d.poison.length) {
    out.push(""); out.push(`🚨 ${b("Address-poisoning attempt")}`);
    for (const p of d.poison.slice(0, 4)) {
      const how = p.kind === "lookalike_in"
        ? `a transfer${p.symbol ? ` of ${p.symbol}` : ""} into your wallet from a look-alike.`
        : p.kind === "lookalike_out_zero"
          ? "a zero-value transfer that looks as if YOU sent it, to a look-alike."
          : `a zero-value ${p.symbol ?? "token"} transfer "from" your wallet that you did not send.`;
      const tx = txUrl(p.chain, p.tx);
      const code = (a: string) => (fmt === "html" ? `<code>${a}</code>` : `\`${a}\``);
      out.push(`• ${e(`On ${chainShort(p.chain)}: ${how}`)}`);
      out.push(`  ${e(p.twin ? "Fake:" : "Address it planted:")} ${code(p.attacker)}`);
      if (p.twin) out.push(`  ${e("Real (you paid it):")} ${code(p.twin)}`);
      else out.push(`  ${e("Poisoners mint an address that looks like one you pay. Never pay this one.")}`);
      out.push(`  ${fmt === "html" ? `<a href="${tx}">transaction</a>` : `[transaction](${tx})`}`);
    }
    out.push(e("Never copy an address from your transaction history. Paste it from the person, or use a saved contact or a basename."));
  }

  // Value of priced tokens per chain.
  const tl: string[] = [];
  for (const [c, t] of Object.entries(d.totals)) {
    if (!t) continue;
    const delta = t.before === null ? "" : ` (${signedUsd(t.usd - t.before)})`;
    const gap = t.unpriced ? `, ${t.unpriced} unpriced` : "";
    tl.push(t.priced === 0
      ? `${CHAIN_LABEL[c as keyof typeof CHAIN_LABEL]}: ${t.unpriced} token${t.unpriced === 1 ? "" : "s"}, none priced`
      : `${CHAIN_LABEL[c as keyof typeof CHAIN_LABEL]}: ${usd(t.usd)}${delta} across ${t.priced} priced token${t.priced === 1 ? "" : "s"}${gap}`);
  }
  if (tl.length) { out.push(""); out.push(b("Value")); for (const l of tl) out.push(`• ${e(l)}`); }

  if (d.since) {
    out.push(""); out.push(b("Balances"));
    if (!d.balances.length) out.push(e("• No balance changed."));
    for (const c of d.balances.slice(0, MAX_ROWS)) {
      const r = c.row;
      const tag = `${r.symbol} (${chainShort(r.chain)})`;
      if (c.kind === "new") out.push(`• ${e(`New: ${amt(r.amount)} ${tag}`)}`);
      else if (c.kind === "gone") out.push(`• ${e(`Gone: ${tag}, was ${amt(r.amount)}`)}`);
      else out.push(`• ${e(`${tag}: ${amt(c.before)} → ${amt(r.amount)}${c.deltaPct === null ? "" : ` (${c.deltaPct >= 0 ? "+" : ""}${c.deltaPct.toFixed(1)}%)`}`)}`);
    }
    if (d.balances.length > MAX_ROWS) out.push(e(`• …and ${d.balances.length - MAX_ROWS} more`));
  }

  const stockLines = opts.stocks ? renderStocks(opts.stocks, fmt, { held: true }) : [];
  if (stockLines.length) { out.push(""); out.push(...stockLines); }

  if (d.unsolicited.length) {
    out.push(""); out.push(`⚠️ ${b("Tokens you did not ask for")}`);
    for (const r of d.unsolicited.slice(0, MAX_ROWS)) out.push(`• ${e(unsolicitedLine(r))}`);
    out.push(e("Do not trade, approve or open links for these: unknown tokens sent unasked are how airdrop-bait and address-poisoning scams start."));
  }

  if (d.riskStat && d.riskStat.picked) {
    const list = d.since ? d.riskNew : d.riskNow;
    out.push(""); out.push(b("Held tokens"));
    if (list.length) {
      for (const r of list.slice(0, MAX_ROWS)) out.push(`• ${e(`[${r.level}] ${r.symbol} (Base, ${short(r.token)}): ${r.flags.join(", ")}`)}`);
      if (d.since && d.riskNow.length > list.length) out.push(e(`• ${d.riskNow.length - list.length} more still flagged, unchanged since the last brief.`));
    } else {
      out.push(e(d.riskNow.length
        ? `• No new flag. ${d.riskNow.length} held token${d.riskNow.length === 1 ? " is" : "s are"} still flagged, as before.`
        : `• ${d.riskStat.read} of your Base tokens screened (GoPlus): no sell block, owner balance control or pausable transfer named.`));
    }
  }

  out.push(""); out.push(b("Approvals"));
  const open = Object.entries(d.grantsOpen).map(([c, n]) => `${n} open on ${chainShort(c)}`);
  if (open.length) out.push(`• ${e(open.join(", "))}`);
  else out.push(e("• Not read this time on either chain."));
  if (d.since) {
    if (d.grantsNew.length) {
      out.push(`• ${e(`${d.grantsNew.length} new since the last brief:`)}`);
      for (const g of d.grantsNew.slice(0, MAX_ROWS)) out.push(`  – ${e(grantLine(g))}`);
    } else if (open.length) out.push(e("• No new approval."));
    if (d.grantsClosed.length) out.push(`• ${e(`${d.grantsClosed.length} closed (revoked, spent or expired).`)}`);
  }
  if (d.grantsRisky.length) {
    const nb = d.grantsRisky.filter((g) => g.level === "BLOCK").length, nw = d.grantsRisky.length - nb;
    out.push(`• ${e(`Still open: ${[nb ? `${nb} to revoke now` : "", nw ? `${nw} to review` : ""].filter(Boolean).join(", ")}. Ask Blue Chat "check my approvals" to review and revoke.`)}`);
    // Only BLOCK gets a line: every unlimited approval is a WARN, and a brief
    // that re-lists thirty of them each morning stops being read.
    for (const g of d.grantsRisky.filter((x) => x.level === "BLOCK" && !d.grantsNew.includes(x)).slice(0, 3)) out.push(`  – ${e(grantLine(g))}`);
  }

  if (d.unread.length) { out.push(""); out.push(e(`Not read this time: ${d.unread.join(", ")}. Those parts are not compared, so nothing there is reported as changed.`)); }

  if (opts.footer !== false) {
    out.push("");
    out.push(fmt === "html"
      ? `${opts.openUrl ? `<a href="${opts.openUrl}">Open Blue Chat</a> · ` : ""}/brief off to stop · /brief now for a fresh one`
      : "_Read from the chain just now: holdings and approvals on Base 8453 and Robinhood Chain 4663._");
  }
  return out.join("\n");
}

function unsolicitedLine(r: HoldRow): string {
  const why = r.trust === "impostor" ? `uses the name ${r.symbol} but is not the real ${r.symbol}` : "unknown token with no price";
  return `${amt(r.amount)} ${r.symbol} on ${chainShort(r.chain)} (${short(r.token)}): ${why}`;
}

function grantLine(g: GrantRow): string {
  const what = g.type === "nft_operator" ? `all ${g.symbol} items` : g.unlimited ? `unlimited ${g.symbol}` : `${amt(g.allowance)} ${g.symbol}`;
  const via = g.type === "permit2" ? " via Permit2" : "";
  return `[${g.level}] ${what}${via} → ${short(g.spender)} on ${chainShort(g.chain)}${g.level !== "INFO" ? `: ${g.why}` : ""}`;
}

// ── Stocks (lib/brief/stocks.ts) ─────────────────────────────────────────────

export const SESSION_NOTE: Record<StockBriefData["session"], string> = {
  regular: "US market is open: oracles update with the exchange.",
  premarket: "US market is in pre-market: oracles hold the last close, DEX prices trade freely.",
  afterhours: "US market has closed for the day: oracles hold today's close, DEX prices trade freely.",
  weekend: "US market is closed for the weekend: oracles hold Friday's close while DEX prices keep trading, and any gap settles at Monday's open, in either direction.",
};

const px = (n: number | null) => (n == null ? "n/a" : n >= 1000 ? `$${Math.round(n).toLocaleString("en-US")}` : `$${n.toFixed(2)}`);
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

export function stockLine(r: StockRow): string {
  const head = `${r.ticker} (${chainShort(r.chain)})${r.held ? ` · ${amt(r.held)} held` : ""}`;
  const parts: string[] = [];
  if (r.withheld) parts.push("DEX price withheld (row recorded before the price-source fix)");
  else if (r.dex != null) parts.push(`DEX ${px(r.dex)}`);
  if (r.oracle != null) parts.push(`oracle ${px(r.oracle)}${r.drift != null && !r.withheld ? ` (${pct(r.drift)})` : ""}`);
  if (r.nav != null) parts.push(`NAV ${px(r.nav)}${r.premium != null && !r.withheld ? ` (${pct(r.premium)} vs NAV)` : ""}`);
  if (!r.onDesk && r.oracle == null) parts.push("not on the Hood desk, no oracle read");
  return `${head}: ${parts.join(" · ") || "no price read"}`;
}

export function renderStocks(d: StockBriefData, fmt: BriefFormat, opts: { held?: boolean; movers?: boolean; sessionNote?: boolean } = {}): string[] {
  const e = (s: string) => (fmt === "html" ? s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : s);
  const b = (s: string) => (fmt === "html" ? `<b>${s}</b>` : `**${s}**`);
  const out: string[] = [];
  if (opts.held !== false && d.held.length) {
    out.push(b("Your onchain stocks"));
    for (const r of d.held.slice(0, MAX_ROWS)) out.push(`• ${e(stockLine(r))}`);
    if (d.held.length > MAX_ROWS) out.push(e(`• …and ${d.held.length - MAX_ROWS} more`));
  }
  if (opts.movers) {
    for (const c of ["base", "robinhood"] as const) {
      const label = c === "base" ? "Base 8453 desk" : "Robinhood Chain 4663 desk";
      if (out.length) out.push("");
      out.push(b(`${label}: largest DEX-vs-oracle gaps`));
      if (d.desk[c] !== "ok") { out.push(e(`• Not shown: the desk snapshot is ${d.desk[c] === "stale" ? "older than ~11 minutes" : "unreadable"} right now.`)); continue; }
      if (!d.movers[c].length) { out.push(e("• No gap measured on this desk right now.")); continue; }
      for (const r of d.movers[c]) out.push(`• ${e(stockLine(r))}`);
    }
  }
  if (out.length) {
    out.push("");
    if (opts.sessionNote !== false) out.push(e(SESSION_NOTE[d.session]));
    if (d.held.some((r) => r.chain === "base") && !d.catalogRead) out.push(e("Coinbase NAV was not read this time."));
  }
  return out;
}
