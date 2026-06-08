/**
 * Curated crawl sources for Blue Search.
 *
 * The cron job at /api/cron/crawl reads this list, fetches each URL,
 * extracts text content, and (when DB is configured) embeds + upserts
 * into the docs table.
 *
 * Add new sources here — the cron picks them up next run.
 */

export interface Source {
  url:         string;
  category:    "docs" | "project" | "blog" | "github" | "social";
  topics:      string[];                 // boost tags
  selector?:   string;                    // CSS selector to extract body (optional)
  crawlDepth?: number;                    // 1 = just this page, 2 = also linked pages on same domain
  refresh?:    "daily" | "weekly" | "monthly";
}

export const SOURCES: Source[] = [

  // ── Official Base docs + ecosystem ──────────────────────────────────────
  { url: "https://docs.base.org/chain/network-information", category: "docs", topics: ["base", "rpc", "chain"], refresh: "weekly" },
  { url: "https://docs.base.org/chain/contracts",            category: "docs", topics: ["base", "contracts"],   refresh: "weekly" },
  { url: "https://docs.base.org/cookbook",                   category: "docs", topics: ["base", "tutorial"],    refresh: "weekly" },
  { url: "https://www.base.org/ecosystem",                   category: "docs", topics: ["base", "ecosystem"],   refresh: "weekly" },
  { url: "https://www.base.org/ecosystem/grants",            category: "docs", topics: ["grants", "funding"],   refresh: "weekly" },

  // ── x402 + Coinbase developer ───────────────────────────────────────────
  { url: "https://x402.org",                                  category: "docs", topics: ["x402", "spec"],           refresh: "monthly" },
  { url: "https://docs.cdp.coinbase.com/x402/welcome",        category: "docs", topics: ["cdp", "x402"],            refresh: "weekly"  },
  { url: "https://docs.cdp.coinbase.com/wallets/v2/welcome", category: "docs", topics: ["cdp", "wallet"],          refresh: "weekly"  },
  { url: "https://onchainkit.xyz/getting-started",            category: "docs", topics: ["onchainkit", "react"],    refresh: "weekly"  },

  // ── MCP ─────────────────────────────────────────────────────────────────
  { url: "https://modelcontextprotocol.io/specification",     category: "docs", topics: ["mcp", "spec"],            refresh: "monthly" },
  { url: "https://modelcontextprotocol.io/quickstart",        category: "docs", topics: ["mcp", "tutorial"],        refresh: "monthly" },

  // ── Major Base protocols ────────────────────────────────────────────────
  { url: "https://aerodrome.finance",                         category: "project", topics: ["aerodrome", "dex"],     refresh: "weekly" },
  { url: "https://aerodrome.finance/docs",                    category: "docs",    topics: ["aerodrome", "dex"],     refresh: "weekly" },
  { url: "https://docs.morpho.org",                           category: "docs",    topics: ["morpho", "lending"],    refresh: "weekly" },
  { url: "https://docs.uniswap.org/contracts/v4/overview",    category: "docs",    topics: ["uniswap", "v4"],        refresh: "monthly"},
  { url: "https://www.extrafi.io",                            category: "project", topics: ["extra", "leveraged"],   refresh: "monthly"},

  // ── Token launchers ─────────────────────────────────────────────────────
  { url: "https://clanker.world",                              category: "project", topics: ["clanker", "memecoin"],  refresh: "weekly" },
  { url: "https://www.virtuals.io",                            category: "project", topics: ["virtuals", "ai-agents"],refresh: "weekly" },

  // ── Dev tooling ─────────────────────────────────────────────────────────
  { url: "https://www.alchemy.com/base",                       category: "docs",    topics: ["alchemy", "rpc"],       refresh: "monthly"},
  { url: "https://book.getfoundry.sh/forge/deploying",        category: "docs",    topics: ["foundry", "deploy"],     refresh: "monthly"},

  // ── Blue Agent + Hub ────────────────────────────────────────────────────
  { url: "https://blueagent.dev",                              category: "project", topics: ["blueagent", "blue-hub"], refresh: "weekly" },
  { url: "https://blueagent.dev/api/mcp",                      category: "docs",    topics: ["mcp", "blue-hub"],       refresh: "weekly" },
  { url: "https://api.blueagent.dev/llms.txt",                category: "docs",    topics: ["blue-hub", "api"],       refresh: "weekly" },

  // ── Tracking / analytics ────────────────────────────────────────────────
  { url: "https://www.builderscore.xyz",                       category: "project", topics: ["builder-rewards"],      refresh: "weekly" },
  { url: "https://basescan.org",                               category: "docs",    topics: ["basescan", "explorer"], refresh: "monthly"},
];

/** Source domains we treat as authoritative — boosts ranking. */
export const AUTHORITATIVE_DOMAINS = new Set([
  "docs.base.org",
  "base.org",
  "x402.org",
  "docs.cdp.coinbase.com",
  "modelcontextprotocol.io",
  "onchainkit.xyz",
  "blueagent.dev",
  "api.blueagent.dev",
  "basescan.org",
]);
