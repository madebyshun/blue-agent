/**
 * The brief as text — Telegram HTML or chat markdown, from the same diff.
 * Pure. Every number printed is a reading or a difference of two readings
 * (./diff.ts); nothing here estimates, and no verdict word is chosen by a model.
 */
import { CHAIN_LABEL, type BriefDiff, type GrantRow, type HoldRow } from "./types";

export type BriefFormat = "html" | "md";
const MAX_ROWS = 6;

const short = (a: string) => (/^0x[a-fA-F0-9]{40}$/.test(a) ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
const chainShort = (c: string) => (c === "robinhood" ? "RH" : "Base");

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

export function renderBrief(d: BriefDiff, fmt: BriefFormat, opts: { now?: number; openUrl?: string; footer?: boolean } = {}): string {
  const now = opts.now ?? d.at;
  const e = (s: string) => (fmt === "html" ? s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : s);
  const b = (s: string) => (fmt === "html" ? `<b>${s}</b>` : `**${s}**`);
  const out: string[] = [];

  out.push(`☀️ ${b("Wallet brief")} · ${short(d.wallet)} · ${d.since ? `since ${ago(now - d.since)}` : "first brief"}`);
  if (!d.since) out.push(e("This is the baseline. Tomorrow's brief lists what changed against it."));

  // Value of priced tokens per chain.
  const tl: string[] = [];
  for (const [c, t] of Object.entries(d.totals)) {
    if (!t) continue;
    const delta = t.before === null ? "" : ` (${signedUsd(t.usd - t.before)})`;
    const gap = t.unpriced ? `, ${t.unpriced} unpriced` : "";
    tl.push(`${CHAIN_LABEL[c as keyof typeof CHAIN_LABEL]}: ${usd(t.usd)}${delta} across ${t.priced} priced token${t.priced === 1 ? "" : "s"}${gap}`);
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

  if (d.unsolicited.length) {
    out.push(""); out.push(`⚠️ ${b("Tokens you did not ask for")}`);
    for (const r of d.unsolicited.slice(0, MAX_ROWS)) out.push(`• ${e(unsolicitedLine(r))}`);
    out.push(e("Do not trade, approve or open links for these: unknown tokens sent unasked are how airdrop-bait and address-poisoning scams start."));
  }

  out.push(""); out.push(b("Approvals"));
  const open = Object.entries(d.grantsOpen).map(([c, n]) => `${n} open on ${chainShort(c)}`);
  if (open.length) out.push(`• ${e(open.join(", "))}`);
  if (d.since) {
    if (d.grantsNew.length) {
      out.push(`• ${e(`${d.grantsNew.length} new since the last brief:`)}`);
      for (const g of d.grantsNew.slice(0, MAX_ROWS)) out.push(`  – ${e(grantLine(g))}`);
    } else if (open.length) out.push(e("• No new approval."));
    if (d.grantsClosed.length) out.push(`• ${e(`${d.grantsClosed.length} closed (revoked, spent or expired).`)}`);
  }
  if (d.grantsRisky.length) {
    const nb = d.grantsRisky.filter((g) => g.level === "BLOCK").length, nw = d.grantsRisky.length - nb;
    out.push(`• ${e(`Flagged and still open: ${[nb ? `${nb} BLOCK` : "", nw ? `${nw} WARN` : ""].filter(Boolean).join(", ")}. Ask Blue Chat "check my approvals" to review and revoke.`)}`);
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
