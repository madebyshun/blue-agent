/**
 * Detail-page enrichment for marketplace APIs.
 *
 * Keeps long descriptions, tags, and pricing tier definitions out of the
 * already-dense `_data.ts`. The marketplace grid only needs the 1-line
 * `desc`; the detail page is where this richer copy gets rendered.
 *
 * Lookup by id — anything not in here just renders the basic detail page.
 */

import type { MarketplaceAPI } from "./_data";

export interface APIDetailExtras {
  longDesc?:    string;
  tags?:        string[];
  website?:     string;
  docsUrl?:     string;
  pricingTiers?: NonNullable<MarketplaceAPI["pricingTiers"]>;
}

const BLUE_DOCS    = "https://api.blueagent.dev/docs";
const BLUE_SITE    = "https://blueagent.dev";

// ─── Shared pricing tiers ─────────────────────────────────────────────────────

function paidOnly(price: string, desc: string) {
  return [{ name: "Paid", price, desc, flavor: "paid" as const }];
}

function freePlusPaid(paidPrice: string, paidDesc: string, freeDesc: string) {
  return [
    { name: "Paid",  price: paidPrice, desc: paidDesc,                       flavor: "paid" as const },
    { name: "Free",  price: "$0",      desc: freeDesc,                       flavor: "free" as const },
  ];
}

// ─── Per-API enrichment ───────────────────────────────────────────────────────

const EXTRAS: Record<string, APIDetailExtras> = {

  "blue-idea": {
    longDesc:
      "Blue Idea turns a rough concept into a fundable brief in under 60 seconds. Feed it a 1-line idea ('USDC streaming payroll for Base DAOs') and it returns problem, why-now, why-Base, MVP scope, risks, and a concrete 24-hour plan — structured JSON ready to drop into Notion, a pitch deck, or a co-founder DM.\n\nDesigned for solo Base builders who need to compress 'is this worth my next 90 days?' into one API call. No more vibe-coding away from market reality."
,
    tags:    ["Builder", "Idea Validation", "Pitch Briefs", "Base Native", "Solo Founder"],
    website: BLUE_SITE,
    docsUrl: `${BLUE_DOCS}/blue-idea`,
    pricingTiers: paidOnly("$0.05", "One call returns full structured brief. ~3s response time, settled in USDC on Base."),
  },

  "blue-research": {
    longDesc:
      "Blue Research is the 6th core Blue Command — a structured deep-dive of any Base-ecosystem topic. Powered by Blue Search over a curated 25-doc corpus (docs.base.org, Aerodrome, Morpho, Uniswap v4, x402, MCP), it returns ranked sources with citations, sectioned analysis ('What it is', 'How it works', 'Open questions'), and concrete next steps.\n\nThink of it as 'Perplexity for Base builders' — narrower domain, deeper truth, and citations you can verify in one click."
,
    tags:    ["Research", "Citations", "Base Ecosystem", "DD", "Structured Output"],
    website: BLUE_SITE,
    docsUrl: `${BLUE_DOCS}/blue-research`,
    pricingTiers: paidOnly("$0.10", "Includes 8 sources, sectioned report, and curated next-step recommendations."),
  },

  "blue-build": {
    longDesc:
      "Blue Build returns a production-ready architecture for any project idea — stack choice, folder structure, file list, integrations, and a test plan. Optimised for Base-native stacks (Foundry, viem, Wagmi, Coinbase CDP, Aerodrome, Morpho).\n\nUse it before you write a line of code. Skip 2 days of decision fatigue."
,
    tags:    ["Architecture", "Stack Picks", "Foundry", "viem", "CDP"],
    website: BLUE_SITE,
    docsUrl: `${BLUE_DOCS}/blue-build`,
    pricingTiers: paidOnly("$0.50", "Detailed architecture report — ~5-8s response. Most-requested follow-up call after blue-idea."),
  },

  "blue-audit": {
    longDesc:
      "Blue Audit runs 500+ security checks across 13 categories against any Solidity contract or repo. Returns critical / high / medium / low findings, suggested fixes, and a final go/no-go verdict. Base-native — checks against known good patterns from Aerodrome, Morpho, Uniswap v4.\n\nNot a replacement for human auditors at $300K. A replacement for shipping unaudited at 2am."
,
    tags:    ["Security", "Audit", "500+ Checks", "Foundry", "Base"],
    website: BLUE_SITE,
    docsUrl: `${BLUE_DOCS}/blue-audit`,
    pricingTiers: paidOnly("$1.00", "Full audit report. ~30s response time for complex contracts. Cheapest pre-deploy gate on the market."),
  },

  "blue-ship": {
    longDesc:
      "Blue Ship returns everything you need to deploy with confidence: pre-deploy checklist, monitoring plan, release notes draft, and post-deploy verification steps. Tailored to your stack (Foundry vs Hardhat) and deployment target (testnet vs mainnet on Base).\n\nMakes 'how do I actually ship this thing' a 60-second API call instead of a 4-hour StackOverflow spiral."
,
    tags:    ["Deployment", "DevOps", "Monitoring", "Base Mainnet"],
    website: BLUE_SITE,
    docsUrl: `${BLUE_DOCS}/blue-ship`,
    pricingTiers: paidOnly("$0.10", "Structured deployment plan. ~3s response. Includes monitoring + post-deploy verify steps."),
  },

  "blue-raise": {
    longDesc:
      "Blue Raise builds your fundraising narrative — market framing, why-this-wins, traction summary, ask sizing, and a target investor list mapped to your sector. Pulls from a curated map of Base-aligned funds + angels.\n\nFor builders who can ship but freeze when it's time to write the pitch."
,
    tags:    ["Fundraising", "Pitch", "Smart-Money Map", "Base Funds"],
    website: BLUE_SITE,
    docsUrl: `${BLUE_DOCS}/blue-raise`,
    pricingTiers: paidOnly("$0.20", "Pitch narrative + investor map. ~5s response."),
  },

  "blue-search": {
    longDesc:
      "Vertical lexical search engine for the Base ecosystem. BM25 ranking over a 25-doc curated corpus (Base docs, x402 protocol, MCP spec, Aerodrome, Morpho, Uniswap v4, Foundry). Returns ranked snippets with source URLs.\n\nFaster than Perplexity for Base-specific questions because the corpus is hand-picked, not crawled."
,
    tags:    ["Search", "BM25", "Base Docs", "Citations"],
    website: BLUE_SITE,
    docsUrl: `${BLUE_DOCS}/blue-search`,
    pricingTiers: freePlusPaid(
      "$0.05",
      "Full search with snippets, scores, and source citations. Up to 8 results.",
      "First 10 queries / day are free — no wallet needed.",
    ),
  },

  "honeypot-check": {
    longDesc:
      "Detects honeypot and rug-pull patterns before you trade. Simulates buy + sell against the token contract, measures actual transfer tax, flags ownership concentration and known scam fingerprints. Returns a confidence-weighted verdict.\n\nThe cheapest pre-trade safety check on Base — $0.05 to avoid a 100% loss."
,
    tags:    ["Security", "Anti-Rug", "Honeypot", "Pre-Trade"],
    website: BLUE_SITE,
    docsUrl: `${BLUE_DOCS}/honeypot-check`,
    pricingTiers: paidOnly("$0.05", "Buy/sell simulation + tax measurement + scam-pattern match. ~2s response."),
  },

  "launch-simulator": {
    longDesc:
      "Multi-agent pre-launch intelligence. Blue Agent scores the launch concept, Aeon adds ecosystem-timing context, MiroShark contributes sentiment-consensus. Returns a unified verdict (LAUNCH / WAIT / RECONSIDER), confidence score, and concrete action items.\n\nThe collaborative product of three top-tier Base agents — only available as one combined call."
,
    tags:    ["Multi-Agent", "Launch", "Timing", "Aeon + MiroShark"],
    website: BLUE_SITE,
    docsUrl: `${BLUE_DOCS}/launch-simulator`,
    pricingTiers: paidOnly("$0.50", "Triple-agent consensus call. ~8-12s response. Best signal on Base for token launch timing."),
  },

  "deep-analysis": {
    longDesc:
      "End-to-end token DD: fundamentals (utility, holder distribution, governance), sentiment (X / Telegram / community growth), on-chain (volume, liquidity, gini), strengths and risks — all in one structured report.\n\nReplaces 2 hours of manual research with $1 and 30 seconds."
,
    tags:    ["DD", "Token Analysis", "Sentiment", "On-chain"],
    website: BLUE_SITE,
    docsUrl: `${BLUE_DOCS}/deep-analysis`,
    pricingTiers: paidOnly("$1.00", "Full DD report with on-chain + off-chain signals. ~25s response."),
  },

  "wallet-pnl": {
    longDesc:
      "Cost-basis-tracked PnL for any Base wallet. Realised + unrealised, win-rate, best/worst trade, tax-lot count, period filtering. Returns clean JSON ready for tax software or a portfolio dashboard.\n\nNo Coinbase login, no Etherscan scraping, no CSV gymnastics."
,
    tags:    ["PnL", "Tax Lots", "On-chain", "Cost Basis"],
    website: BLUE_SITE,
    docsUrl: `${BLUE_DOCS}/wallet-pnl`,
    pricingTiers: paidOnly("$0.25", "Full PnL with tax-lot breakdown. ~4s response."),
  },
};

// ─── Public lookup ────────────────────────────────────────────────────────────

/** Return enrichment for an API id, or `null` if no extras defined. */
export function detailFor(id: string): APIDetailExtras | null {
  return EXTRAS[id] ?? null;
}
