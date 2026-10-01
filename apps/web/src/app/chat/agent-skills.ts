// Agent Skills — the raw capabilities Blue Agent has access to.
// Skills = prompt-grounded abilities backed by the Virtuals LLM + Blue's own
// x402 hub tools. These are NOT hub tools themselves (those are productized
// Tools with pricing) — a skill is a curated trigger plus whatever backend runs it.

export type SkillProvider = "Blue Agent" | "Base MCP" | "Bundled";
export type SkillStatus   = "active" | "available" | "soon";
/** Where a skill sits in the loop the rebuilt product is organised around
 *  (ShunTr, 2026-10-01): find something → check it → trade it → see your
 *  wallet; stock tokens beside it; the founder commands last. */
export type SkillGroup    = "discover" | "check" | "trade" | "wallet" | "stocks" | "build";
export type SkillChain    = "base" | "robinhood";

/** Who actually operates the backend a skill runs on.
 *
 *  Only set this where the attribution is TRUE — i.e. we really do call that
 *  party's service. Putting "by X" on a skill whose backend is never contacted
 *  is the same class of error as printing a number we never measured, and it
 *  puts someone else's name on our guess. Skills with no wired backend leave
 *  this unset and the UI shows no author line. */
export interface SkillAuthor {
  name:   string;   // display, e.g. "Blue Agent"
  brand?: string;   // key into BRANDS (components/BrandMark.tsx)
  href?:  string;   // where that backend actually lives
}

export const BLUE_AUTHOR: SkillAuthor = {
  name:  "Blue Agent",
  brand: "blue-agent",
  href:  "https://blueagent.dev/hub",
};

export interface AgentSkill {
  id:          string;
  name:        string;
  description: string;
  provider:    SkillProvider;
  status:      SkillStatus;
  trigger?:    string;    // example prompt to invoke
  badge?:      string;    // e.g. "free", "x402", "Base MCP"
  tools?:      string[];  // Hub tool IDs bundled by this skill
  author?:     SkillAuthor;
  /** Ids whose `usage:<id>` KV counters sum to this skill's run count.
   *  Unset = no instrumented backend, so the run count is UNKNOWN and the UI
   *  renders nothing — not a zero, which would read as "nobody uses this" when
   *  the truth is "we don't measure this".
   *
   *  ⚠️ THESE ARE CATALOG IDS (`honeypot-check`), NEVER MCP TOOL NAMES
   *  (`hub_honeypot`). Every writer of `usage:<id>` keys by catalog id —
   *  `api/x402/[tool]` writes `recordCall(tool)`, `api/hub/tools/[id]/call`
   *  writes `recordCall(id)`, and `api/mcp` resolves through HUB_MAP to the
   *  catalog id first, precisely so one tool does not split into two rows.
   *  The only non-catalog ids that are correct here are the five `blue_<cmd>`
   *  counters `/api/console` writes.
   *
   *  Fixed 2026-09-26: all 14 `hub_*` entries below were MCP names, so every
   *  bundle summed keys nothing has ever written and read a permanent 0. The
   *  hook only renders a count when > 0, so this failed SILENTLY — three
   *  bundles looked un-instrumented when they were merely mis-keyed, which is
   *  the same shape as a tool with real demand whose counter reads zero and
   *  gets retired for it. One of them, `hub_builder_score`, resolved to no tool
   *  on any surface at all. */
  meterIds?:   string[];
  /** Section on the Skills page. Unset ⟹ not part of the loop (Base MCP "soon"). */
  group?:      SkillGroup;
  /** The chains it acts on — named, never assumed (CLAUDE.md rule 1). */
  chains?:     SkillChain[];
  /** Builds a transaction the USER signs in their own wallet (a card). Blue
   *  Agent never signs; these are the only skills that move funds, and only
   *  after that signature. */
  signs?:      boolean;
}

// ── The trading loop (2026-10-01) ─────────────────────────────────────────────
// Every entry names the CHAT tools it runs (`tools`) and the catalog ids they
// meter under (`meterIds`) — scripts/skills-catalog-check.ts fails if a tool
// here is not offered in Chat, or a meter id is not a catalog id. A skill is a
// promise that typing its trigger reaches a real tool.
const LOOP_SKILLS: AgentSkill[] = [
  // DISCOVER
  { id: "discover-base-trending", group: "discover", chains: ["base"], provider: "Blue Agent", status: "active", author: BLUE_AUTHOR,
    name: "Trending on Base", description: "What is moving on Base right now — each token's buy/sell tax read on-chain before it is listed",
    trigger: "What's trending on Base?", tools: ["hub_safe_trending"], meterIds: ["safe-trending"] },
  { id: "discover-rh-movers", group: "discover", chains: ["robinhood"], provider: "Blue Agent", status: "active", author: BLUE_AUTHOR,
    name: "Robinhood movers", description: "Biggest 24h movers among Robinhood Chain stock tokens, from their pools",
    trigger: "Top movers on Robinhood Chain today", tools: ["hub_rh_movers"], meterIds: ["rh-stock-movers"] },
  { id: "discover-rh-new", group: "discover", chains: ["robinhood"], provider: "Blue Agent", status: "active", author: BLUE_AUTHOR,
    name: "New on Robinhood", description: "Stock tokens newly listed on Robinhood Chain",
    trigger: "What's newly listed on Robinhood Chain?", tools: ["hub_rh_new_listings"], meterIds: ["rh-stock-new-listings"] },
  { id: "discover-price", group: "discover", chains: ["base", "robinhood"], provider: "Blue Agent", status: "active", author: BLUE_AUTHOR,
    name: "Token price", description: "Live price, 24h change, market cap and volume for a token",
    // No meterIds: chat calls /api/token-price directly (FREE_DIRECT in
    // api/chat/route.ts), so there is no tool fee and no usage:<id> counter.
    trigger: "ETH price", tools: ["hub_token_price"] },
  // CHECK
  { id: "check-honeypot", group: "check", chains: ["base"], provider: "Blue Agent", status: "active", author: BLUE_AUTHOR,
    name: "Can I sell it?", description: "Honeypot check — buy/sell tax and blacklist read on-chain; unread stays UNKNOWN, never SAFE",
    trigger: "Is this token a honeypot? ", tools: ["hub_honeypot"], meterIds: ["honeypot-check"] },
  { id: "check-tx-risk", group: "check", chains: ["base"], provider: "Blue Agent", status: "active", author: BLUE_AUTHOR,
    name: "Before you sign", description: "Risk check on a transaction — the target, the approval it grants, the value it moves",
    trigger: "Is this transaction safe to sign? to: 0x… data: 0x…", tools: ["hub_risk_gate"], meterIds: ["risk-gate"] },
  // TRADE — cards the user signs
  { id: "trade-swap-base", group: "trade", chains: ["base"], provider: "Blue Agent", status: "active", author: BLUE_AUTHOR, signs: true,
    name: "Swap on Base", description: "Live 0x quote, your slippage, a pre-trade check — then you sign in your wallet",
    trigger: "Swap 10 USDC to ETH on Base", tools: ["prepare_swap"] },
  { id: "trade-swap-rh", group: "trade", chains: ["robinhood"], provider: "Blue Agent", status: "active", author: BLUE_AUTHOR, signs: true,
    name: "Swap on Robinhood", description: "Buy or sell a stock token on Robinhood Chain, floored by a slippage minimum",
    trigger: "Buy $20 of TSLA on Robinhood Chain", tools: ["robinhood_swap"] },
  { id: "trade-send", group: "trade", chains: ["base", "robinhood"], provider: "Blue Agent", status: "active", author: BLUE_AUTHOR, signs: true,
    name: "Send", description: "Send ETH or a token to an address or a Basename — the card shows exactly what leaves",
    trigger: "Send 5 USDC to ", tools: ["prepare_send", "robinhood_send"] },
  { id: "trade-bridge", group: "trade", chains: ["base", "robinhood"], provider: "Blue Agent", status: "active", author: BLUE_AUTHOR, signs: true,
    name: "Bridge Base ↔ Robinhood", description: "Relay quote with its full cost; refused when the cost is over 20% of the amount",
    trigger: "Bridge 10 USDC from Base to Robinhood", tools: ["robinhood_bridge"] },
  // WALLET
  { id: "wallet-holdings", group: "wallet", chains: ["base", "robinhood"], provider: "Blue Agent", status: "active", author: BLUE_AUTHOR,
    name: "My wallet", description: "Everything your connected wallet holds on Base and Robinhood Chain",
    trigger: "Check my wallet", tools: ["check_wallet"] },
  // STOCK TOKENS
  { id: "stocks-rh-quote", group: "stocks", chains: ["robinhood"], provider: "Blue Agent", status: "active", author: BLUE_AUTHOR,
    name: "Oracle quote", description: "Chainlink price for a Robinhood Chain stock token, with the round's age and staleness",
    trigger: "Oracle price of NVDA on Robinhood Chain", tools: ["hub_rh_quote"], meterIds: ["rh-stock-quote"] },
  { id: "stocks-rh-search", group: "stocks", chains: ["robinhood"], provider: "Blue Agent", status: "active", author: BLUE_AUTHOR,
    name: "Find a stock token", description: "Look a company up in the Robinhood Chain token registry — by contract, never by a guessed address",
    trigger: "Find Tesla on Robinhood Chain", tools: ["hub_rh_search"], meterIds: ["rh-stock-search"] },
  { id: "stocks-b20", group: "stocks", chains: ["base"], provider: "Blue Agent", status: "active", author: BLUE_AUTHOR,
    name: "B20 stock on Base", description: "Inspect a Coinbase B20 tokenized stock — read on-chain from its own contract",
    trigger: "Inspect the NVDA B20 token on Base", tools: ["hub_b20_inspect"], meterIds: ["b20-inspect"] },
];

/** Chat tools that carry NO tool fee: the native cards and readers, and the
 *  utilities chat calls directly rather than through /api/x402 (FREE_DIRECT
 *  in api/chat/route.ts). A skill built only from these has no `meterIds`. */
export const NO_FEE_CHAT_TOOLS: ReadonlySet<string> = new Set([
  "prepare_swap", "prepare_send", "robinhood_swap", "robinhood_send", "robinhood_bridge",
  "check_wallet", "hub_token_price", "hub_crypto_rpc",
]);

export const AGENT_SKILLS: AgentSkill[] = [
  ...LOOP_SKILLS,
  // ── Blue Agent Core — the founder commands (Builder section) ───────────────
  {
    id:          "blue-idea",
    group:       "build",
    name:        "Idea → Brief",
    description: "Turn a rough concept into a fundable brief — problem, why Base, MVP, risks, 24h plan",
    provider:    "Blue Agent",
    status:      "active",
    trigger:     "blue idea ",
    badge:       "free",
    author:      BLUE_AUTHOR,
    meterIds:    ["blue_idea"],
  },
  {
    id:          "blue-build",
    group:       "build",
    name:        "Build → Architecture",
    description: "Architecture, stack, folder structure, integrations, and test plan for Base projects",
    provider:    "Blue Agent",
    status:      "active",
    trigger:     "blue build ",
    badge:       "free",
    author:      BLUE_AUTHOR,
    meterIds:    ["blue_build"],
  },
  {
    id:          "blue-audit",
    group:       "build",
    name:        "Audit → Security",
    description: "500+ security checks · reentrancy, oracle, MEV, x402, Coinbase Smart Wallet",
    provider:    "Blue Agent",
    status:      "active",
    trigger:     "blue audit ",
    badge:       "free",
    author:      BLUE_AUTHOR,
    meterIds:    ["blue_audit"],
  },
  {
    id:          "blue-ship",
    group:       "build",
    name:        "Ship → Deploy",
    description: "Deployment checklist, verification steps, release notes, monitoring plan",
    provider:    "Blue Agent",
    status:      "active",
    trigger:     "blue ship ",
    badge:       "free",
    author:      BLUE_AUTHOR,
    meterIds:    ["blue_ship"],
  },
  {
    id:          "blue-raise",
    group:       "build",
    name:        "Raise → Pitch",
    description: "Fundraising narrative, investor deck, smart money map, competitive landscape",
    provider:    "Blue Agent",
    status:      "active",
    trigger:     "blue raise ",
    badge:       "free",
    author:      BLUE_AUTHOR,
    meterIds:    ["blue_raise"],
  },

  // ── Base MCP ─────────────────────────────────────────────────────────────────
  // NOT WIRED. These are held at "soon" on purpose. Enabling the Base MCP
  // integration only appends a prompt section (api/chat/route.ts) describing
  // get_wallets/send/swap/sign/... — no tool schema is ever registered, so the
  // model is told it has tools it does not have and will invent results rather
  // than call anything. Listing them as "active" sold a capability that does not
  // exist; they flip back to active only once mcp.base.org is attached for real
  // (the connector plumbing in /api/mcp-client + /api/chat already supports it).
  // For the same reason none of them carry an `author` — we do not contact Base,
  // so we do not put Base's name on them.
  {
    id:          "base-gas-oracle",
    name:        "Gas Oracle",
    description: "Current Base L2 gas prices and fee estimation for transactions",
    provider:    "Base MCP",
    status:      "soon",
    trigger:     "What are current Base gas prices?",
    badge:       "Base MCP",
  },
  {
    id:          "base-block-info",
    name:        "Block Info",
    description: "Latest Base block height, timestamp, and network health",
    provider:    "Base MCP",
    status:      "soon",
    trigger:     "Show latest Base block information",
    badge:       "Base MCP",
  },
  {
    id:          "base-read-contract",
    name:        "Read Contract",
    description: "Read public state from any verified contract on Base",
    provider:    "Base MCP",
    status:      "soon",
    trigger:     "Read the state of Base contract ",
    badge:       "Base MCP",
  },
  {
    id:          "base-basename",
    name:        "Basename Lookup",
    description: "Resolve a .base.eth or Basename to an address",
    provider:    "Base MCP",
    status:      "soon",
    trigger:     "Resolve this basename: ",
    badge:       "Base MCP",
  },
  {
    id:          "base-bridge",
    name:        "Base Bridge",
    description: "L1→L2 bridge status, estimate time and cost",
    provider:    "Base MCP",
    status:      "soon",
    trigger:     "What's the current Base bridge status?",
    badge:       "Base MCP",
  },
  {
    id:          "base-smart-wallet",
    name:        "Smart Wallet",
    description: "Set up or analyze a Coinbase Smart Wallet on Base",
    provider:    "Base MCP",
    status:      "soon",
    trigger:     "Help me set up a Coinbase Smart Wallet",
    badge:       "Base MCP",
  },
  {
    id:          "base-paymaster",
    name:        "Paymaster Check",
    description: "Check if a contract qualifies for Base gas sponsorship",
    provider:    "Base MCP",
    status:      "soon",
    trigger:     "Is this contract eligible for Base Paymaster? ",
    badge:       "Base MCP",
  },
  {
    id:          "base-deploy",
    name:        "Deploy to Base",
    description: "Step-by-step deployment guide with Hardhat or Foundry",
    provider:    "Base MCP",
    status:      "soon",
    trigger:     "Help me deploy a contract to Base",
    badge:       "Base MCP",
  },
  // ── Bundled Skills — curated tool groups that run together ──────────────────
  {
    id:          "bundle-token-safety",
    group:       "check",
    chains:      ["base"],
    name:        "Token Safety",
    description: "Safety sweep — risk score, honeypot, contract trust",
    provider:    "Bundled",
    status:      "active",
    trigger:     "Check if this token/contract is safe: ",
    // Was 4 tools with hub_key_exposure, which left chat 2026-09-30 (Etherscan
    // account endpoints are not on the free tier for Base).
    badge:       "Bundle · 3 tools",
    tools:       ["hub_risk_gate", "hub_honeypot", "hub_contract_trust"],
    author:      BLUE_AUTHOR,
    meterIds:    ["risk-gate", "honeypot-check", "contract-trust"],
  },
  // `bundle-base-builder` retired 2026-09-30 with every tool it named
  // (hub_repo_health, hub_base_grant, hub_builder_dd left chat —
  // docs/rebuild-5-tang-2026-09-30.md). The same pack is retired in
  // chat/integrations.ts.
  {
    id:          "bundle-trader-intel",
    group:       "discover",
    chains:      ["base"],
    name:        "Trader Intel",
    description: "Market facts — token pick, narrative pulse, momentum, DEX flow",
    provider:    "Bundled",
    status:      "active",
    trigger:     "Give me full trader intel on: ",
    // Was 5 tools with hub_whale_signal, which left chat 2026-09-30 (Moralis
    // upstream paused; the id is halted in lib/tool-halts.ts).
    badge:       "Bundle · 4 tools",
    tools:       ["hub_token_pick", "hub_narrative_pulse", "hub_token_momentum", "hub_dex_flow"],
    author:      BLUE_AUTHOR,
    meterIds:    ["token-pick-signal", "narrative-pulse", "token-momentum-scanner", "dex-flow"],
  },

  {
    id:          "base-erc4337",
    name:        "Account Abstraction",
    description: "ERC-4337 smart accounts on Base with Coinbase Bundler",
    provider:    "Base MCP",
    status:      "soon",
    trigger:     "/build ERC-4337 account abstraction on Base",
    badge:       "Base MCP",
  },
  {
    id:          "base-token-launch",
    name:        "Token Launch Pipeline",
    description: "Full token launch — contract, Uniswap pool, launch, list",
    provider:    "Base MCP",
    status:      "soon",
    trigger:     "Help me launch a token on Base",
    badge:       "Base MCP",
  },
];

export const SKILL_PROVIDERS: SkillProvider[] = ["Blue Agent", "Base MCP", "Bundled"];

/** The one accent. Reserved for things the user can ACT on — the install
 *  button, focus rings, the "use →" affordance, an enabled toggle.
 *
 *  There is deliberately no provider→colour map any more. Each provider used to
 *  own a hue (blue / green / amber), which meant a screen of ~20 skills carried
 *  three decorative hues plus three more for status — and the hue was pure
 *  redundancy, because every badge prints the provider's NAME right beside it.
 *  Colour that repeats the adjacent label is noise; colour that says something
 *  the label doesn't (danger, a destructive action) stays. */
export const SKILL_ACCENT = "#4FC3F7";

export const PROVIDER_ICONS: Record<SkillProvider, string> = {
  "Blue Agent": "⚡",
  "Base MCP":   "🔵",
  "Bundled":    "📦",
};

/** BrandMark keys for providers that are an actual third-party brand. "Bundled"
 *  has no owner (it's our own grouping), so it keeps the semantic emoji — only
 *  real brands get a real logo. Consumed by the provider cards, which are large
 *  enough for a mark to read; the 8px inline badges keep the emoji. */
export const PROVIDER_BRANDS: Partial<Record<SkillProvider, string>> = {
  "Blue Agent": "blue-agent",
  "Base MCP":   "base",
};
