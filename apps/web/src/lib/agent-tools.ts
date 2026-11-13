// ─── Agent Tool types & seeded data ──────────────────────────────────────────

export type AgentToolInput = {
  key: string;
  label: string;
  placeholder: string;
  required?: boolean;
};

// 🔴 `agentType` was `"aeon" | "blue" | "miroshark"` until 2026-09-27. Aeon and
// MiroShark are retired (ShunTr) — do not widen this back. `skillId` survives
// only because a handful of entries still carry one; nothing dispatches on it.
// Note what `label` is for: it names the ANALYSIS a step performs ("Community
// rug signal", "On-chain fundamentals"), not the persona that performed it.
// That is why the labels stayed when the types collapsed.
export type CompositeSkill = {
  agentType: "blue";
  skillId?: string;
  skillFiles?: string[];
  label: string;
};

import { X402_PAY_TO } from "@/lib/x402-payee";

const X402_BASE = "https://blueagent.dev/api/x402";

// Blue Agent treasury — default builder address for first-party tools, and the
// single x402 payee. Re-exported from lib/x402-payee so it cannot drift.
// Builder-submitted tools (Hub v2 Phase 3) will set this to the builder's own wallet.
export const BLUE_TREASURY = X402_PAY_TO;

export type AgentTool = {
  id: string;
  name: string;
  description: string;
  agentHandle: string;
  // Always "Blue Agent" on first-party tools — see the 🔴 note on CompositeSkill.
  // ⚠️ Do NOT confuse this with the `agentName` on HOSTED/community tools
  // (lib/hub-hosted.ts, lib/hub-registry.ts, SubmitTool.tsx): same field name,
  // different type, and there it is a builder-supplied brand that is SUPPOSED
  // to vary. A sweep that unifies "every agentName" would erase creator names.
  agentName: string;
  agentType: "blue" | "composite";
  category: string;
  skillId?: string;
  skillFiles?: string[];
  inputs: AgentToolInput[];
  isComposite: boolean;
  compositeSkills?: CompositeSkill[];
  featured?: boolean;
  // x402 payment
  price?: string;          // e.g. "$0.20"
  priceUSDC?: number;      // in USDC units (6 decimals), e.g. 200000 = $0.20
  x402Url?: string;        // full x402 endpoint URL — if set, payment is required
  x402Body?: (values: Record<string, string>) => Record<string, unknown>; // maps hub inputs → x402 body
  // v2 marketplace metadata — defaults applied via withV2Defaults() at bottom of file
  verified?:       boolean;          // Blue Agent reviewed; default true for first-party
  aiReady?:        boolean;          // Returns structured JSON; default true
  builderAddress?: `0x${string}`;    // Revenue recipient; default BLUE_TREASURY
  releasedAt?:    number;            // Unix ms — drives "Newest" sort; default 2024-06-01
};

// ─── The Hub tool catalog (live size = TOOL_COUNT, exported below) ────────────

const AGENT_TOOLS_RAW: AgentTool[] = [

  // ── New tools batch (20) ──
  {
    id: "token-price",
    name: "Token Price",
    description: "Live price, market cap, volume and liquidity for any Base token. Use when an agent asks what a Base token costs right now, or needs a spot price before sizing a swap.",
    agentHandle: "composite", agentName: "Blue Agent", agentType: "composite",
    category: "on-chain",
    inputs: [
      { key: "token", label: "Token address or ticker", placeholder: "0x… or AERO", required: true },
    ],
    isComposite: true,
    price: "$0.01", priceUSDC: 10000,
    x402Url: `${X402_BASE}/token-price`,
    x402Body: (v) => ({ token: v.token ?? "" }),
  },
  {
    id: "pool-scan",
    name: "Pool Scan",
    description: "Trending and newly-active Base liquidity pools with the chain TVL snapshot. Use when an agent asks where Base liquidity is moving, or needs a pool list before choosing where to trade.",
    agentHandle: "composite", agentName: "Blue Agent", agentType: "composite",
    category: "on-chain",
    inputs: [
      { key: "limit", label: "Limit (optional)", placeholder: "10" },
    ],
    isComposite: true,
    price: "$0.02", priceUSDC: 20000,
    x402Url: `${X402_BASE}/pool-scan`,
    x402Body: (v) => ({ limit: v.limit ? Number(v.limit) : 10 }),
  },
  {
    id: "blue-doctor",
    name: "Blue Doctor",
    // Free on purpose. This is what a caller reaches for when a paid tool has
    // just failed, and charging for "is it you or me" would be charging for an
    // outage.
    description:
      "Upstream health for every data source these tools read: Base 8453 and Robinhood Chain 4663 RPC, DexScreener, GeckoTerminal, DefiLlama. Use when another call failed and an agent must know whether the source is down or the request was wrong. Free.",
    agentHandle: "composite", agentName: "Blue Agent", agentType: "composite",
    category: "on-chain",
    inputs: [],
    isComposite: true,
    price: "$0.00", priceUSDC: 0,
    x402Url: `${X402_BASE}/blue-doctor`,
    x402Body: () => ({}),
  },
  {
    id: "hood-live",
    name: "Blue Hood Live Board",
    // Free: it reads a cron's stored output — one KV command, zero upstream
    // calls — and the same rows are already public at /hood.
    description:
      "Every tokenized stock Blue Hood watches right now on both venues: Chainlink oracle price, deepest-pool price and the drift between them. Use when an agent asks about tokenized stock prices, or wants the oracle-vs-pool gap before trading one. Free.",
    agentHandle: "blueagent", agentName: "Blue Agent", agentType: "blue",
    category: "signal",
    inputs: [
      { key: "chain", label: "Chain (optional)", placeholder: "base | robinhood — omit for both" },
    ],
    isComposite: false,
    price: "$0.00", priceUSDC: 0,
    x402Url: `${X402_BASE}/hood-live`,
    // Omitted, never defaulted. An absent filter means BOTH desks; defaulting it
    // to robinhood here would silently answer a Base question with RH rows.
    x402Body: (v) => (v.chain ? { chain: v.chain } : {}),
  },
  {
    id: "weekend-scorecard",
    name: "Base Weekend Scorecard",
    // Free for the same reason as the track record above: a scorecard behind a
    // paywall is one nobody can check.
    description:
      "Does the price Base trades a stock at over the weekend call Monday's open? Every Base stock on the desk, scored. Use when an agent asks whether tokenized stocks track the real thing, or needs weekend-vs-open accuracy before trusting an off-hours price. Free.",
    agentHandle: "blueagent", agentName: "Blue Agent", agentType: "blue",
    category: "signal",
    inputs: [
      { key: "ticker", label: "Ticker (optional)", placeholder: "NVDA — omit for all" },
      { key: "weekends", label: "Weekends (optional)", placeholder: "1–52 (default 12)" },
    ],
    isComposite: false,
    price: "$0.00", priceUSDC: 0,
    x402Url: `${X402_BASE}/weekend-scorecard`,
    x402Body: (v) => ({ ...(v.ticker ? { ticker: v.ticker } : {}), ...(v.weekends ? { weekends: Number(v.weekends) } : {}) }),
  },
  {
    id: "wallet-holdings",
    name: "Wallet Holdings",
    description: "Live ERC-20 and ETH holdings with USD value for a Base wallet. Use when an agent asks what a Base address holds, or must size a trade against the actual balance instead of assuming one.",
    agentHandle: "composite", agentName: "Blue Agent", agentType: "composite",
    category: "on-chain",
    inputs: [
      { key: "address", label: "Wallet address", placeholder: "0x…", required: true },
    ],
    isComposite: true,
    price: "$0.02", priceUSDC: 20000,
    x402Url: `${X402_BASE}/wallet-holdings`,
    x402Body: (v) => ({ address: v.address ?? "" }),
  },
  {
    id: "gas-tracker",
    name: "Gas Tracker",
    description: "Live Base gas price and USD cost estimates for common actions. Use when an agent asks what a Base transaction costs, or needs a fee figure before telling a user to sign.",
    agentHandle: "composite", agentName: "Blue Agent", agentType: "composite",
    category: "on-chain",
    inputs: [],
    isComposite: true,
    price: "$0.01", priceUSDC: 10000,
    x402Url: `${X402_BASE}/gas-tracker`,
    x402Body: (v) => ({}),
  },
  {
    id: "wallet-risk",
    name: "Wallet Risk",
    description: "Is this address known to be dangerous? GoPlus flags (theft, phishing, sanctions, laundering, mixer) with their sources. Use when an agent asks whether a Base wallet is safe to pay or copy, or before routing funds to an unfamiliar address.",
    agentHandle: "composite", agentName: "Blue Agent", agentType: "composite",
    category: "security",
    inputs: [
      { key: "address", label: "Wallet address", placeholder: "0x…", required: true },
    ],
    isComposite: true,
    price: "$0.05", priceUSDC: 50000,
    x402Url: `${X402_BASE}/wallet-risk`,
    x402Body: (v) => ({ address: v.address ?? "" }),
  },
  // `b20-tracker` ($0.05) RETIRED 2026-09-24. Half of what it sold — "B20-related
  // launches" — came from api.bankr.bot/token-launches, the last live Bankr call
  // left in this repo. That URL is public and still answers 200, so this was not
  // forced by the ban; it is the deliberate end of the Bankr dependency. The
  // handler, the HANDLERS entry, this catalog entry with its price, and the
  // hub_b20_tracker MCP name all went in ONE commit, because a payment path must
  // never outlive the product it sells. Beryl activation status survives in
  // `b20-inspect` and `b20-analyze`, which read Base RPC and need no upstream.
  {
    id: "liquidity-depth",
    name: "Liquidity Depth",
    description: "Liquidity depth, slippage estimate and exit risk for a Base token. Use when an agent asks how much of a Base token it can sell without moving the price, or needs a slippage figure before a trade.",
    agentHandle: "composite", agentName: "Blue Agent", agentType: "composite",
    category: "security",
    inputs: [
      { key: "token", label: "Token address or ticker", placeholder: "0x… or AERO", required: true },
    ],
    isComposite: true,
    price: "$0.03", priceUSDC: 30000,
    x402Url: `${X402_BASE}/liquidity-depth`,
    x402Body: (v) => ({ token: v.token ?? "", trade_size_usd: v.trade_size_usd ? Number(v.trade_size_usd) : undefined }),
  },

  // ── Intelligence ────────────────────────────────────────────────────────────


  // ── Builder ─────────────────────────────────────────────────────────────────


  // ── Trading & Alpha ──────────────────────────────────────────────────────────


  // ── Content ─────────────────────────────────────────────────────────────────


  // ── Agent Economy ────────────────────────────────────────────────────────────


  // ── Base Ecosystem ───────────────────────────────────────────────────────────


  // ── On-chain Strategy ────────────────────────────────────────────────────────


  // ── Console commands (paid x402) ────────────────────────────────────────────
  {
    id: "pre-trade-check",
    name: "Pre-Trade Check (PASS / WARN / BLOCK)",
    description: "Call before signing. Is this address a real token or a pool, an impostor of a canonical stock token, or a contract that can take the funds? Use when an agent is about to swap or approve and must check the target first. Free.",
    agentHandle: "blueagent", agentName: "Blue Agent", agentType: "blue",
    category: "security",
    inputs: [
      { key: "token", label: "Token address (or ETH)", placeholder: "0x…", required: true },
      { key: "chain", label: "Chain: base or robinhood", placeholder: "base" },
      { key: "kind", label: "Action: swap, send or bridge", placeholder: "swap" },
      { key: "recipient", label: "Send only: recipient 0x…", placeholder: "0x…" },
      { key: "sender", label: "Send only: your wallet 0x…", placeholder: "0x…" },
    ],
    isComposite: false,
    price: "$0.00", priceUSDC: 0,
    x402Url: `${X402_BASE}/pre-trade-check`,
    x402Body: (v) => ({ token: v.token ?? "", chain: v.chain || "base", kind: v.kind || "swap", ...(v.recipient ? { recipient: v.recipient } : {}), ...(v.sender ? { sender: v.sender } : {}) }),
  },
  {
    id: "sign-check",
    name: "Sign Check (what will signing this do?)",
    description: "Call before a wallet signs anything. A transaction is decoded (approve, permit, Permit2, setApprovalForAll, transfer) and checked against what it actually grants. Use when an agent must tell a user what a signature does before they sign. Free.",
    agentHandle: "blueagent", agentName: "Blue Agent", agentType: "blue",
    category: "security",
    inputs: [
      { key: "from", label: "Signing wallet 0x… (needed to simulate a tx)", placeholder: "0x…" },
      { key: "tx", label: "Transaction JSON {to, data, value}", placeholder: "{\"to\":\"0x…\",\"data\":\"0x…\"}" },
      { key: "typed_data", label: "EIP-712 typed data JSON", placeholder: "{\"domain\":…,\"primaryType\":…,\"message\":…}" },
      { key: "chain", label: "Chain: base or robinhood", placeholder: "base" },
    ],
    isComposite: false,
    price: "$0.00", priceUSDC: 0,
    x402Url: `${X402_BASE}/sign-check`,
    x402Body: (v) => {
      const parse = (x?: string) => { if (!x) return undefined; try { return JSON.parse(x); } catch { return x; } };
      return { chain: v.chain || "base", ...(v.from ? { from: v.from } : {}), ...(v.tx ? { tx: parse(v.tx) } : {}), ...(v.typed_data ? { typed_data: v.typed_data } : {}) };
    },
  },
  {
    id: "approval-audit",
    name: "Approval Audit + Revoke",
    description: "Everything a wallet has granted that is still live: ERC-20 allowances, NFT operator-for-all and Permit2 grants, each re-checked. Use when an agent asks what a wallet has approved, or whether an old approval can still drain it. Free.",
    agentHandle: "blueagent", agentName: "Blue Agent", agentType: "blue",
    category: "security",
    inputs: [
      { key: "wallet", label: "Wallet 0x…", placeholder: "0x…", required: true },
      { key: "chain", label: "Chain: base or robinhood", placeholder: "base" },
    ],
    isComposite: false,
    price: "$0.00", priceUSDC: 0,
    x402Url: `${X402_BASE}/approval-audit`,
    x402Body: (v) => ({ wallet: v.wallet ?? "", chain: v.chain || "base" }),
  },
  {
    id: "honeypot-check",
    name: "Honeypot Check",
    description: "Detect honeypot tokens that can be bought but not sold, with transfer tax and rug pattern analysis on Base. Use when an agent asks whether a Base token is a honeypot, a scam, or safe to buy.",
    agentHandle: "composite",
    agentName: "Blue Agent",
    agentType: "composite",
    category: "security",
    inputs: [
      { key: "token", label: "Token contract address", placeholder: "0x...", required: true },
    ],
    isComposite: true,
    compositeSkills: [
      { agentType: "blue", label: "Honeypot detection" },
      { agentType: "blue", label: "Community rug signal" },
    ],
    featured: false,
    price: "$0.10", priceUSDC: 100000,
    x402Url: `https://blueagent.dev/api/x402/honeypot-check`,
    x402Body: (v) => ({ token: v.token ?? "" }),
  },
  {
    id: "risk-gate",
    name: "Risk Gate",
    description: "Pre-transaction risk screen for any address or swap: drainer patterns, AML signals, malicious contracts. Use when an agent must clear a Base address or swap before money moves, and wants one verdict instead of five signals.",
    agentHandle: "composite",
    agentName: "Blue Agent",
    agentType: "composite",
    category: "security",
    inputs: [
      { key: "to", label: "Target address", placeholder: "0x...", required: true },
      { key: "action", label: "Action type", placeholder: "transfer | swap | approve | call", required: false },
      { key: "value", label: "Amount in Wei (optional)", placeholder: "1000000000000000000", required: false },
    ],
    isComposite: true,
    compositeSkills: [
      { agentType: "blue", label: "Risk assessment" },
      { agentType: "blue", label: "AML + community signal" },
    ],
    featured: false,
    price: "$0.20", priceUSDC: 200000,
    x402Url: `https://blueagent.dev/api/x402/risk-gate`,
    x402Body: (v) => ({ to: v.to ?? "", action: v.action ?? "transfer", value: v.value ?? "" }),
  },
  {
    id: "contract-trust",
    name: "Contract Trust",
    description: "Audit any Base contract before swapping or interacting: Basescan verification plus a security scan and community signal. Use when an agent asks whether a Base contract can be trusted, or why a verified contract still looks wrong.",
    agentHandle: "composite",
    agentName: "Blue Agent",
    agentType: "composite",
    category: "security",
    inputs: [
      { key: "address", label: "Contract address", placeholder: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", required: true },
      { key: "context", label: "What is this contract? (optional)", placeholder: "USDC token on Base", required: false },
    ],
    isComposite: true,
    compositeSkills: [
      { agentType: "blue", label: "Security analysis" },
      { agentType: "blue", label: "Community trust signal" },
    ],
    featured: false,
    price: "$0.15", priceUSDC: 150000,
    x402Url: `https://blueagent.dev/api/x402/contract-trust`,
    x402Body: (v) => ({ address: v.address ?? "", context: v.context ?? "" }),
  },
  {
    id: "blue-registry",
    name: "Blue Registry",
    description: "Discover this catalog: every callable x402 tool with its price, filterable by query, category or free/paid. Use when an agent asks what tools exist here, or needs the endpoint and price of one before paying for it.",
    agentHandle: "blue", agentName: "Blue Agent", agentType: "blue",
    category: "builder",
    inputs: [
      { key: "query", label: "Search (optional)", placeholder: "e.g. honeypot, token, audit" },
      { key: "category", label: "Category (optional)", placeholder: "e.g. security, intelligence, builder" },
    ],
    isComposite: false,
    price: "$0.05", priceUSDC: 50000,
    x402Url: `${X402_BASE}/blue-registry`,
    x402Body: (v) => ({ query: v.query ?? "", category: v.category ?? "" }),
  },


  // ── Earn ─────────────────────────────────────────────────────────────────────


  // ── Alerts ───────────────────────────────────────────────────────────────────


  // ── Builder (launch & grants) ─────────────────────────────────────────────────


  // ── Feed scan tools (internal — power Blue Feed v2) ──────────────────────────

  // `picks-check` stood here as a self-declaring TOMBSTONE — listed at $0.00
  // with a description that opened "RETIRED" — because a tool vanishing in
  // silence is worse than one admitting it is dead. Deleted outright 2026-09-28.
  //
  // What changed is WHO reads this list. A tombstone works for a human reading a
  // page; this array is also the manifest an agent selects from, and there it
  // only spends context and invites a call whose answer is a permanent empty
  // record. The honesty the tombstone bought is preserved here in source, where
  // the next developer looks, instead of in the catalog, where a buyer looks.
  //
  // Losslessly removable because nothing was left to lose: its writer
  // (`base-token-scan` inside the hourly feed cron) went with Blue Feed on
  // 2026-09-02, and both KV keys aged out in July (pending 7d, history 30d), so
  // the handler's only reachable branch answered `code: "feed_retired"`. Do NOT
  // re-add the id — a fresh entry would advertise a queue that has no writer.

  // ─── RH RWA Phase 1 — Robinhood Chain tokenized-stock primitives ────────
  // Canonical registry + Chainlink oracle + fuzzy search + anti-scam verify.
  // Data: docs.robinhood.com/chain/contracts + Chainlink RH mainnet feeds.
  // Public-good primitive layer for every builder embedding RH stock tokens.
  {
    id: "rh-rwa-verify",
    name: "RH RWA Verify (Anti-Scam)",
    description: "Given a contract address on Robinhood Chain, is it a canonical RHJ-issued stock token or an impersonator? Use when an agent is handed a Robinhood Chain token address and must know whether it is the real stock token before trading. Free.",
    agentHandle: "blueagent", agentName: "Blue Agent", agentType: "blue",
    category: "security",
    inputs: [
      { key: "contract", label: "Contract address", placeholder: "0x…", required: true },
      { key: "expected_ticker", label: "Expected ticker (optional)", placeholder: "MSTR" },
    ],
    isComposite: false,
    price: "$0.00", priceUSDC: 0,
    x402Url: `${X402_BASE}/rh-rwa-verify`,
    x402Body: (v) => ({ contract: v.contract ?? "", expected_ticker: v.expected_ticker ?? "" }),
  },
  {
    id: "rh-stock-quote",
    name: "RH Stock Quote (Chainlink)",
    description: "Live quote for Robinhood Chain tokenized stocks, read from Chainlink latestRoundData and the deepest pool. Use when an agent asks the price of a tokenized stock on Robinhood Chain, or needs oracle and pool price side by side.",
    agentHandle: "blueagent", agentName: "Blue Agent", agentType: "blue",
    category: "on-chain",
    inputs: [
      { key: "ticker", label: "Ticker", placeholder: "MSTR, AAPL, TSLA", required: true },
    ],
    isComposite: false,
    price: "$0.03", priceUSDC: 30000,
    x402Url: `${X402_BASE}/rh-stock-quote`,
    x402Body: (v) => ({ ticker: v.ticker ?? "" }),
  },

  // ─── Base stocks — every Coinbase Tokenized Stock on Base 8453 (2026-11-03) ──
  {
    id: "base-stock-quote",
    name: "Base Stock Quote",
    description: "Live quote for one Coinbase Tokenized Stock on Base: deepest-pool price, 24h change, liquidity, volume, oracle share price and the drift between pool and oracle. Use when an agent asks a stock token's price, or wants the premium and buy impact before buying.",
    agentHandle: "blueagent", agentName: "Blue Agent", agentType: "blue",
    category: "on-chain",
    inputs: [
      { key: "ticker", label: "Ticker", placeholder: "NVDA, TSLA, SNDK", required: true },
    ],
    isComposite: false,
    price: "$0.02", priceUSDC: 20000,
    x402Url: `${X402_BASE}/base-stock-quote`,
    x402Body: (v) => ({ ticker: v.ticker ?? "" }),
  },
  {
    id: "base-stock-movers",
    name: "Base Stock Movers",
    description: "24h gainers and losers among all Coinbase Tokenized Stocks on Base, by deepest-pool change, above a liquidity floor. Use when an agent asks for a daily stock screen, the day's stock picks, or which tokenized stocks moved.",
    agentHandle: "blueagent", agentName: "Blue Agent", agentType: "blue",
    category: "on-chain",
    inputs: [
      { key: "limit", label: "How many", placeholder: "5" },
      { key: "min_liquidity_usd", label: "Min liquidity (USD)", placeholder: "10000" },
    ],
    isComposite: false,
    price: "$0.03", priceUSDC: 30000,
    x402Url: `${X402_BASE}/base-stock-movers`,
    x402Body: (v) => ({ ...(v.limit ? { limit: Number(v.limit) } : {}), ...(v.min_liquidity_usd ? { min_liquidity_usd: Number(v.min_liquidity_usd) } : {}) }),
  },

  // ─── RH RWA Phase 2 — Market Analytics ─────────────────────────────────
  {
    id: "rh-stock-liquidity",
    name: "RH Stock Liquidity",
    description: "Live DEX pool, TVL and slippage estimate for a Robinhood Chain tokenized stock. Use when an agent asks how deep a Robinhood Chain stock trades, or how much it can sell before the price moves.",
    agentHandle: "blueagent", agentName: "Blue Agent", agentType: "blue",
    category: "on-chain",
    inputs: [
      { key: "ticker", label: "Ticker", placeholder: "MSTR, AAPL, TSLA", required: true },
    ],
    isComposite: false,
    price: "$0.05", priceUSDC: 50000,
    x402Url: `${X402_BASE}/rh-stock-liquidity`,
    x402Body: (v) => ({ ticker: v.ticker ?? "" }),
  },
  {
    id: "rh-stock-movers",
    name: "RH Stock Movers (dust-filtered)",
    description: "Top gainers and losers over 24h among Robinhood Chain tokenized stocks and ETFs, with a dust-pool filter. Use when an agent asks which Robinhood Chain stocks moved, or needs a screen of that venue.",
    agentHandle: "blueagent", agentName: "Blue Agent", agentType: "blue",
    category: "signal",
    inputs: [
      { key: "limit",              label: "Limit per side (optional)", placeholder: "5" },
      { key: "min_tvl_usd",        label: "Min TVL USD (dust floor)",  placeholder: "5000" },
      { key: "min_volume_24h_usd", label: "Min 24h vol USD",           placeholder: "500" },
    ],
    isComposite: false,
    price: "$0.05", priceUSDC: 50000,
    x402Url: `${X402_BASE}/rh-stock-movers`,
    x402Body: (v) => ({
      limit: v.limit ? Number(v.limit) : 5,
      min_tvl_usd: v.min_tvl_usd ? Number(v.min_tvl_usd) : 5000,
      min_volume_24h_usd: v.min_volume_24h_usd ? Number(v.min_volume_24h_usd) : 500,
    }),
  },

  // ─── RH RWA Phase 3 — Trading Execution ────────────────────────────────

  // ─── RH RWA Phase 4 — Portfolio ────────────────────────────────────────

  // ─── RH RWA Phase 5 — Discovery & Analytics ────────────────────────────
  {
    id: "rh-stock-holders",
    name: "RH Stock Holders",
    description: "Top holders and concentration score for a Robinhood Chain RWA token, from Blockscout. Use when an agent asks who holds a tokenized stock, or whether supply is concentrated enough to be a risk.",
    agentHandle: "blueagent", agentName: "Blue Agent", agentType: "blue",
    category: "on-chain",
    inputs: [
      { key: "ticker",   label: "Ticker",          placeholder: "MSTR (or use contract)" },
      { key: "contract", label: "Contract (opt.)", placeholder: "0x…" },
      { key: "limit",    label: "Limit",           placeholder: "10" },
    ],
    isComposite: false,
    price: "$0.05", priceUSDC: 50000,
    x402Url: `${X402_BASE}/rh-stock-holders`,
    x402Body: (v) => ({ ticker: v.ticker ?? "", contract: v.contract ?? "", limit: v.limit ? Number(v.limit) : 10 }),
  },

  // ─── RH RWA Phase 6 — Agent Skills ─────────────────────────────────────

  // ─── RH RWA Phase 7 — Bridge & Builder Kit (FINAL — 30/30) ──────────────,

  {
    id: "safe-trending",
    name: "Safe Trending",
    // SAFE means one specific thing and the description has to say which, or
    // the name promises an audit the tool does not perform.
    description:
      "Trending Base tokens, each with its buy/sell tax read from the contract and its exit depth. SAFE here = tradeable with verified tax. A clean scan is not a buy signal. Use when an agent asks what is trending on Base, or wants a tax-checked list of moving tokens.",
    agentHandle: "composite", agentName: "Blue Agent", agentType: "composite",
    category: "on-chain",
    inputs: [
      { key: "min_liquidity_usd", label: "Min liquidity USD (optional)", placeholder: "500000" },
      { key: "limit", label: "Limit (optional)", placeholder: "10" },
    ],
    isComposite: true,
    price: "$0.15", priceUSDC: 150000,
    x402Url: `${X402_BASE}/safe-trending`,
    x402Body: (v) => ({
      min_liquidity_usd: v.min_liquidity_usd ? Number(v.min_liquidity_usd) : 500000,
      limit: v.limit ? Number(v.limit) : 10,
    }),
  },

  {
    id: "rh-stock-agent-brief",
    name: "RH Stock Agent Brief",
    description: "One JSON brief for a Robinhood Chain stock token: drift, oracle age, holdings, liquidity. Use when an agent wants a stock token's whole picture in a single call.",
    agentHandle: "blueagent", agentName: "Blue Agent", agentType: "blue",
    category: "signal",
    inputs: [
      { key: "ticker", label: "Ticker", placeholder: "AAPL", required: true },
    ],
    isComposite: false,
    price: "$0.20", priceUSDC: 200000,
    x402Url: `${X402_BASE}/rh-stock-agent-brief`,
    x402Body: (v) => ({ ticker: v.ticker ?? "" }),
  },

  {
    id: "rh-stock-arb",
    name: "RH Stock Arb (Chainlink vs DEX · market-hours aware)",
    description: "Chainlink oracle versus the deepest DEX pool for a Robinhood Chain stock token: the gap in percent, which side is rich. Use when an agent asks for the oracle-premium or arbitrage gap on a stock token.",
    agentHandle: "blueagent", agentName: "Blue Agent", agentType: "blue",
    category: "signal",
    inputs: [
      { key: "ticker", label: "Ticker", placeholder: "MSTR, AAPL, TSLA", required: true },
    ],
    isComposite: false,
    price: "$0.05", priceUSDC: 50000,
    x402Url: `${X402_BASE}/rh-stock-arb`,
    x402Body: (v) => ({ ticker: v.ticker ?? "" }),
  },

  {
    id: "rh-stock-ohlc",
    name: "RH Stock OHLC",
    description: "OHLC candle history for a Robinhood Chain stock token. Use when an agent needs price history or a chart series, not just the current quote.",
    agentHandle: "blueagent", agentName: "Blue Agent", agentType: "blue",
    category: "on-chain",
    inputs: [
      { key: "ticker",    label: "Ticker",    placeholder: "MSTR, AAPL, TSLA", required: true },
      { key: "timeframe", label: "Timeframe", placeholder: "minute / hour / day (default hour)" },
      { key: "limit",     label: "Limit",     placeholder: "100 (max 500)" },
    ],
    isComposite: false,
    price: "$0.05", priceUSDC: 50000,
    x402Url: `${X402_BASE}/rh-stock-ohlc`,
    x402Body: (v) => ({
      ticker: v.ticker ?? "",
      timeframe: v.timeframe ?? "hour",
      limit: v.limit ? Number(v.limit) : 100,
    }),
  },

  {
    id: "rh-stock-swap-prepare",
    name: "RH Stock Swap Prepare",
    description: "Non-custodial: returns the unsigned swap transactions for a Robinhood Chain stock token, for the user to sign. Use when an agent must hand a user a transaction to approve.",
    agentHandle: "blueagent", agentName: "Blue Agent", agentType: "blue",
    category: "trading",
    inputs: [
      { key: "ticker",       label: "Ticker",         placeholder: "MSTR, AAPL, TSLA", required: true },
      { key: "side",         label: "Side",           placeholder: "buy or sell", required: true },
      { key: "amount",       label: "Amount",         placeholder: "100 (USDG) or 0.05 (WETH)", required: true },
      { key: "recipient",    label: "Recipient",      placeholder: "0x…", required: true },
      { key: "denom",        label: "Denom",          placeholder: "USDG (default) or WETH" },
      { key: "slippage_bps", label: "Slippage bps",   placeholder: "100 = 1%" },
    ],
    isComposite: false,
    price: "$0.05", priceUSDC: 50000,
    x402Url: `${X402_BASE}/rh-stock-swap-prepare`,
    x402Body: (v) => ({
      ticker: v.ticker ?? "",
      side: v.side ?? "buy",
      amount: v.amount ?? "0",
      recipient: v.recipient ?? "",
      denom: v.denom ?? "USDG",
      slippage_bps: v.slippage_bps ? Number(v.slippage_bps) : 100,
    }),
  },

  {
    id: "rh-stock-swap-quote",
    name: "RH Stock Swap Quote",
    description: "Quote a buy or sell of a Robinhood Chain stock token: expected fill, price impact, slippage. Use when an agent needs the fill before swapping, not the oracle price.",
    agentHandle: "blueagent", agentName: "Blue Agent", agentType: "blue",
    category: "trading",
    inputs: [
      { key: "ticker",       label: "Ticker",        placeholder: "MSTR, AAPL, TSLA", required: true },
      { key: "side",         label: "Side",          placeholder: "buy or sell", required: true },
      { key: "amount",       label: "Amount",        placeholder: "100 (USDG) or 0.05 (WETH)", required: true },
      { key: "denom",        label: "Denom",         placeholder: "USDG (default) or WETH" },
      { key: "slippage_bps", label: "Slippage bps",  placeholder: "100 = 1%" },
    ],
    isComposite: false,
    price: "$0.05", priceUSDC: 50000,
    x402Url: `${X402_BASE}/rh-stock-swap-quote`,
    x402Body: (v) => ({
      ticker: v.ticker ?? "",
      side: v.side ?? "buy",
      amount: v.amount ?? "0",
      denom: v.denom ?? "USDG",
      slippage_bps: v.slippage_bps ? Number(v.slippage_bps) : 100,
    }),
  },
];

// ─── v2 defaults ──────────────────────────────────────────────────────────────
// Centralize verified/aiReady/builder defaults so we don't have to set them on
// every tool. Builder-submitted tools (Phase 3) override these explicitly.

const DEFAULT_RELEASED_AT = new Date("2024-06-01T00:00:00Z").getTime();

function withV2Defaults(t: AgentTool): AgentTool {
  return {
    ...t,
    verified:       t.verified       ?? true,            // first-party = pre-verified
    aiReady:        t.aiReady        ?? true,            // all current tools return JSON
    builderAddress: t.builderAddress ?? BLUE_TREASURY,
    releasedAt:     t.releasedAt     ?? DEFAULT_RELEASED_AT,
  };
}

export const AGENT_TOOLS: AgentTool[] = AGENT_TOOLS_RAW.map(withV2Defaults);

/** Live Hub-catalog size — the SINGLE dynamic source for every "N tools" count
 *  across the site (i18n `{{TOOLS}}` sentinel, docs, OG cards, about, metadata).
 *  Never hardcode the number anywhere; import this so a catalog change can't
 *  leave a stale count behind. NOTE: this is the full Hub catalog only — the MCP
 *  surface and the chat tool-calling set (HUB_TOOLS) are different counts, and
 *  this total is NOT the paid count: see FREE_TOOL_COUNT below.
 *  (This comment read "the MCP surface (57)" until 2026-09-27, by which point
 *  that surface was 19. A parenthetical number inside the doc-comment of the
 *  constant whose entire purpose is "never hardcode the number anywhere" is the
 *  one spot nothing will ever check. MCP_TOOLS.length is the answer.) */
export const TOOL_COUNT = AGENT_TOOLS.length;

/** How many catalog tools are priced $0.00, and how many actually charge.
 *
 *  Split out because TOOL_COUNT kept being used AS the paid count. On
 *  2026-09-27 the README, plugin.md, agent.json, openapi.json and
 *  ai-plugin.json all described all TOOL_COUNT tools as pay-per-call while six
 *  were free. Any sentence carrying "paid", "pay-per-call" or "micropayment"
 *  wants one of these two numbers, never the total.
 *
 *  `priceUSDC` is USDC MICRO-units, so a free tool holds `0` — which is FALSY.
 *  Hence `=== 0` against a nullish-coalesced -1, and never `!t.priceUSDC`:
 *  three manifests shipped that truthy test and silently dropped the free six. */
export const FREE_TOOL_COUNT = AGENT_TOOLS.filter((t) => (t.priceUSDC ?? -1) === 0).length;
export const PAID_TOOL_COUNT = TOOL_COUNT - FREE_TOOL_COUNT;
