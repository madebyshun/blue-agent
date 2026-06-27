// English dictionary — the SOURCE OF TRUTH for the i18n key shape.
// `zh.ts` must mirror this exact structure (typed against `Dict`).
// Keys are grouped by surface: marketing (home / nav_marketing) and app
// (nav / chat / scanner / registry / activity / manage / launch / bank /
//  launches / feed / balance_card / common).

export const en = {
  // ─── Marketing (blueagent.dev) ──────────────────────────────────────────────
  home: {
    badge: "Built on Base · x402 native",
    hero_title: "The Builder OS for Base",
    hero_subtitle:
      "Chat with AI agents. Run 74 tools. Launch tokens. Build and scale onchain — all in one platform.",
    cta_open_chat: "Open Blue Chat →",
    cta_browse_hub: "Browse Hub",
    cta_token: "$BLUEAGENT ↗",

    s_chat_kicker: "Chat",
    s_chat_title: "Talk to AI. Build onchain.",
    s_chat_sub:
      "Blue Chat routes your intent to the right tool. Live Hub tools, multi-model, skill-based. Built for Base.",

    s_hub_kicker: "Hub",
    s_hub_title: "74 tools. Pay what you use.",
    s_hub_sub:
      "The intelligence layer for Base agents. Raw data, security checks, alpha signals — all x402 native. No API key. No subscription.",
    hub_browse_all: "Browse all 74 →",
    hub_browse_sub: "9 categories · live data",
    hub_pricing_line: "From $0.01/call · Pay in USDC or $BLUEAGENT",

    s_feed_kicker: "Feed",
    s_feed_title: "Live Base intelligence. 24/7.",
    feed_cta: "View Blue Feed →",

    s_agents_kicker: "Agents",
    s_agents_title: "Three agents. One platform.",
    s_agents_sub:
      "Every output is a 3-agent consensus. Not one model guessing — three roles reasoning.",

    s_integrations_kicker: "Integrations",
    s_integrations_title: "Built for the agent economy",
    s_integrations_sub:
      "BlueAgent is x402 native from day one. Agents pay agents. No human in the loop.",

    s_pricing_kicker: "Pricing",
    s_pricing_title: "Hold $BLUEAGENT. Build for free.",
    s_pricing_sub:
      "Credits refresh every day. No subscription. Just hold $BLUEAGENT and build.",
    pricing_x402_line: "x402: $0.01–$0.20/call · USDC or $BLUEAGENT · no signup",
    pricing_hold_line: "The more $BLUEAGENT you hold, the more you build for free.",
    buy_token: "Buy $BLUEAGENT →",
    stake_now: "Stake now →",

    final_title: "Start building on Base today",
    final_open_chat: "Open Blue Chat →",
    final_browse_hub: "Browse 74 Hub Tools →",
    final_install_mcp: "Install MCP →",
    final_read_docs: "Read Docs →",

    footer_tagline: "The Builder OS for Base",
    footer_powered: "Powered by Bankr · Venice AI · x402 native · Base",
  },
  nav_marketing: {
    about: "About",
    skills: "Skills",
    docs: "Docs",
    github: "GitHub",
    launch_app: "Launch App →",
  },

  // ─── App (app.blueagent.dev) ────────────────────────────────────────────────
  nav: {
    chat: "Chat",
    hub: "Hub",
    feed: "Feed",
    bank: "Bank",
    launches: "Launches",
    b20: "B20",
    dashboard: "Dashboard",
    profile: "Profile",
    docs: "Docs",
    home: "Home",
  },
  chat: {
    placeholder: "Message BlueAgent...",
    thinking: "Thinking...",
    connect_wallet: "Connect your wallet",
    empty_state: "What would you like to do?",
    suggested_1: "Check my balance",
    suggested_2: "Inspect a B20 token",
    suggested_3: "Launch a token",
    suggested_4: "Mint with memo",
  },
  scanner: {
    title: "B20 Scanner",
    placeholder: "Token address 0x...",
    inspect_btn: "Inspect",
    trust_verdict: "Trust Verdict",
    always_allow: "Always Allow",
    always_block: "Always Block ⛔",
    custom_policy: "Custom Policy",
    variant_asset: "Asset",
    variant_stablecoin: "Stablecoin",
    supply_cap: "Supply Cap",
    uncapped: "Uncapped",
    paused: "Paused",
    active: "Active",
    no_rebase: "No rebase",
    rebase_active: "Rebase active",
    manage_cta: "Manage this token →",
    you_hold_admin: "You hold admin",
    not_admin: "Not admin",
    unknown_admin: "Unknown — connect wallet",
  },
  registry: {
    title: "Registry",
    total_tokens: "tokens deployed",
    asset: "Asset",
    stablecoin: "Stablecoin",
    search_placeholder: "Search by name or symbol...",
    empty: "No tokens found",
    loading: "Loading registry...",
  },
  activity: {
    title: "Recent Activity",
    control_events: "control events",
    refresh: "Refresh",
    empty: "No activity yet",
    unavailable: "Activity unavailable",
    paused: "paused",
    policy_applied: "applied a transfer policy",
    policy_removed: "removed the transfer policy",
    cap_updated: "updated supply cap",
    cap_set: "set a supply cap",
    role_revoked: "revoked a role",
    role_granted: "granted a role",
    freeze_seize: "froze and seized tokens",
  },
  manage: {
    title: "Manage",
    common_actions: "Common actions",
    mint: "Mint",
    burn: "Burn",
    transfer: "Transfer",
    check_memo: "Check Memo",
    pause: "Pause",
    unpause: "Unpause",
    policy: "Policy",
    roles: "Roles",
    supply_cap: "Supply Cap",
    metadata: "Metadata",
    recipient: "Recipient",
    amount: "Amount",
    memo_placeholder: "INV-2026-001 (optional)",
    memo_helper: "Attached onchain — order IDs, payment refs, audit trail",
    mint_btn: "Mint →",
    burn_btn: "Burn →",
    transfer_btn: "Transfer →",
    claim_memo_btn: "Check Memo →",
    success: "Success!",
    view_tx: "View tx ↗",
    copy_hash: "Copy hash",
    check_memo_result: "Memo",
    no_memo: "No memo found",
  },
  launch: {
    title: "Launch",
    deploy_b20: "Deploy B20",
    asset_variant: "Asset",
    stablecoin_variant: "Stablecoin",
    token_name: "Token Name",
    token_symbol: "Symbol",
    decimals: "Decimals",
    deploy_btn: "Deploy →",
    not_active: "B20 isn't active on Mainnet yet",
    use_sepolia: "Use Base Sepolia",
    your_tokens: "Your Deployed Tokens",
    copy_address: "Copy address",
  },
  bank: {
    title: "Blue Bank",
    send: "Send",
    receive: "Receive",
    yield: "Yield",
    supply: "Supply",
    withdraw: "Withdraw",
    balance: "Balance",
    apy: "APY",
    memo_field: "Memo",
  },
  launches: {
    title: "Launches",
    all: "All",
    live: "Live",
    new: "New",
    hot: "Hot 🔥",
    my_tokens: "My Tokens 👤",
    trade: "Trade",
    claim_fees: "Claim Fees",
    no_tokens: "No tokens launched yet",
    unclaimed: "Unclaimed",
    search: "Search tokens...",
  },
  feed: {
    title: "Blue Feed",
    loading: "Loading feed...",
    empty: "No feed items yet",
  },
  balance_card: {
    title: "Wallet Balance",
    connect_first: "Connect your wallet first",
    view_explorer: "View on explorer ↗",
  },
  common: {
    connect_wallet: "Connect Wallet",
    disconnect: "Disconnect",
    loading: "Loading...",
    error: "Something went wrong",
    retry: "Retry",
    copy: "Copy",
    copied: "Copied! ✓",
    close: "Close",
    cancel: "Cancel",
    confirm: "Confirm",
    sign_wallet: "Sign in wallet",
    network_mainnet: "Base Mainnet",
    network_sepolia: "Base Sepolia",
    view_basescan: "View on Basescan ↗",
    coming_soon: "Coming soon",
    or: "or",
  },
} as const;

// Recursively widen the `as const` literal value types (e.g. "Live") back to
// `string`, while keeping the exact key structure intact. This lets `zh.ts`
// supply different (Chinese) strings yet still fail the build if any key is
// missing or extra.
type Widen<T> = {
  [K in keyof T]: T[K] extends string ? string : Widen<T[K]>;
};

// The dictionary shape every locale must satisfy.
export type Dict = Widen<typeof en>;
