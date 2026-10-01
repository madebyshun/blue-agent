/**
 * The chat replies for `check_token` and `new_tokens`, written in CODE from
 * the reads (same rule as lib/chat/card-replies.ts): every number is copied
 * from a source and named with it, nothing is ranked as a pick, and anything
 * unread is said to be unread.
 */
import type { TokenOverview } from "@/lib/token-overview";
import type { LaunchFeed } from "./feed";
import { fmtPct, fmtUsd } from "@/lib/chat/card-replies";

const CHAIN_NAME = { base: "Base", robinhood: "Robinhood Chain" } as const;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const STAGE: Record<string, string> = {
  bonding_curve: "still on its bonding curve",
  graduated: "graduated to its DEX pool",
  pool_from_launch: "a DEX pool from launch (no curve)",
  unknown: "stage unknown",
};

export function formatOverview(o: TokenOverview): string {
  const chain = CHAIN_NAME[o.chain];
  if (o.onchain.isContract === false) return `${o.token} has no contract code on ${chain} — it is not a token there (wrong chain, or a wallet address).`;
  const label = o.onchain.symbol ? `**${o.onchain.symbol}**${o.onchain.name && o.onchain.name !== o.onchain.symbol ? ` (${o.onchain.name})` : ""}` : `**${short(o.token)}**`;
  const lines: string[] = [`${label} on ${chain} — \`${o.token}\``];

  if (o.stockToken) {
    lines.push(`- ${o.stockToken.venue} tracking ${o.stockToken.ticker} (${o.stockToken.name}) — verified by contract in BlueAgent's registry.`);
  }
  if (o.onchain.totalSupply) lines.push(`- Supply ${o.onchain.totalSupply}${o.onchain.symbol ? ` ${o.onchain.symbol}` : ""} (read on-chain)`);

  const lp = o.launchpad;
  if (lp) {
    if (lp.launchpad) {
      const facts = lp.facts.filter((f) => !/^curve 0x/.test(f));
      lines.push(`- Launchpad: **${lp.name}** — ${facts.length ? facts.join("; ") : STAGE[lp.stage] ?? lp.stage}.`);
    } else {
      lines.push(`- Launchpad: ${lp.facts[0]}.`);
    }
  }

  const m = o.market;
  if (m.status === "ok" && m.pools.length > 0) {
    const price = fmtUsd(m.priceUsd);
    lines.push(`- Price ${price ?? "unknown"} from its deepest pool (GeckoTerminal). Pools:`);
    for (const p of m.pools) {
      lines.push(`  - ${p.name} · ${p.dex} · liquidity ${fmtUsd(p.reserveUsd) ?? "?"} · 24h volume ${fmtUsd(p.volume24hUsd) ?? "?"}${fmtPct(p.change24hPct) ? ` · 24h ${fmtPct(p.change24hPct)}` : ""}`);
    }
  } else if (m.status === "none_listed") {
    lines.push("- No pool listed on GeckoTerminal yet — that is not proof there is none (fresh launches and curve-only tokens often are not indexed).");
  } else {
    lines.push("- Market data could not be read right now (GeckoTerminal).");
  }

  lines.push(o.chain === "robinhood"
    ? "- Not measured here: buy/sell tax and honeypot behaviour — there is no tax check for Robinhood Chain yet. Treat an unknown token as unverified."
    : "- For a sell-tax / honeypot measurement ask for a honeypot check on this address.");
  return lines.join("\n");
}

export function formatFeed(f: LaunchFeed): string {
  const chain = CHAIN_NAME[f.chain];
  const lines: string[] = [];
  const counted = f.counts.filter((c) => c.launches != null);
  if (counted.length > 0) {
    lines.push(`**Launches on ${chain}, last ${f.windowMinutes} min** (counted from each launchpad's own launch events): ${counted.map((c) => `${c.name} ${c.launches}`).join(" · ")}.`);
  }
  const unreadCounts = f.counts.filter((c) => c.launches == null).map((c) => c.name);
  if (unreadCounts.length) lines.push(`Could not count: ${unreadCounts.join(", ")}.`);
  if (f.chain === "robinhood" || f.counts.some((c) => c.id === "doppler")) {
    lines.push("Most launches never trade meaningfully — a launch count is activity, not a list of picks.");
  }

  if (f.graduations.items.length > 0) {
    // The window is the one MEASURED from the scan's start block; when that
    // read failed it is only an estimate from the block rate, and says so.
    const w = f.graduations.windowHours;
    const window = w == null
      ? "about 24h (estimated from block time — the start block could not be read)"
      : `${w}h`;
    lines.push(`**Graduated in the last ${window}** (filled their curve; newest first):`);
    for (const g of f.graduations.items) lines.push(`- ${g.symbol ?? "?"} · ${g.launchpad} · \`${g.token}\``);
  }
  if (f.graduations.unread.length) lines.push(`Graduations could not be read for: ${f.graduations.unread.join(", ")}.`);

  if (f.trending.available) {
    if (f.trending.items == null) lines.push("Trending pools could not be read right now (GeckoTerminal).");
    else if (f.trending.items.length === 0) lines.push(`Nothing is trending on this launchpad on ${chain} right now — no pool has both ${fmtUsd(f.newPools.minReserveUsd)} of liquidity and $1,000 of 24h volume.`);
    else {
      lines.push(`**Trending on this launchpad — top pools by 24h volume, over ${fmtUsd(f.newPools.minReserveUsd)} liquidity** (GeckoTerminal):`);
      for (const p of f.trending.items) {
        lines.push(`- ${p.name} · 24h volume ${fmtUsd(p.volume24hUsd) ?? "?"} · liquidity ${fmtUsd(p.reserveUsd)}${fmtPct(p.change24hPct) ? ` · 24h ${fmtPct(p.change24hPct)}` : ""}${p.token ? ` · \`${p.token}\`` : ""}${p.unconfirmed ? " · (launchpad not confirmed on-chain)" : ""}`);
      }
    }
  }
  // Asked about ONE launchpad (trending shown): the chain-wide new-pools list
  // is noise there, so it is only shown for the chain-wide question.
  if (!f.trending.available) {
    if (f.newPools.unattributableTo) {
      // GeckoTerminal files this launchpad's pools under a generic DEX, so its
      // new-pools list cannot be filtered to it. Say that — "no pool" would be
      // a false negative.
      lines.push(`New pools cannot be attributed to ${f.newPools.unattributableTo} on ${chain}: GeckoTerminal files its pools under a generic DEX, so none are listed here — that is not a sign there are none. Ask for an overview of a token's address to check which launchpad it came from.`);
    } else if (f.newPools.items == null) {
      lines.push("New pools could not be read right now (GeckoTerminal).");
    } else if (f.newPools.items.length === 0) {
      lines.push(`No pool created in GeckoTerminal's latest batch has more than ${fmtUsd(f.newPools.minReserveUsd)} of liquidity.`);
    } else {
      lines.push(`**New pools with over ${fmtUsd(f.newPools.minReserveUsd)} liquidity** (GeckoTerminal's newest batch):`);
      for (const p of f.newPools.items) {
        lines.push(`- ${p.name}${p.launchpad ? ` · ${p.launchpad}` : ""}${p.unconfirmed ? " (GeckoTerminal's label — not confirmed on-chain)" : ""} · liquidity ${fmtUsd(p.reserveUsd)}${p.volume24hUsd != null ? ` · 24h volume ${fmtUsd(p.volume24hUsd)}` : ""}${p.ageMinutes != null ? ` · ${p.ageMinutes} min old` : ""}${p.token ? ` · \`${p.token}\`` : ""}`);
      }
    }
  }
  lines.push("Facts, not picks — ask for an overview of any address before trading it.");
  return lines.join("\n");
}
