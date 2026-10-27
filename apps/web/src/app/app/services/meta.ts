// Per-tool display metadata for /app/services and /app/services/[tool].
export type Group = "stocks" | "safety" | "transactions" | "market" | "catalog";
export const META: Record<string, { short: string; chains: string[]; group: Group; tryPrompt?: string }> = {
  stock_signal:    { short: "Stock token vs the real stock, or Base vs Robinhood Chain", chains: ["Base", "RH"], group: "stocks", tryPrompt: "Is NVDA cheaper on Base or Robinhood Chain right now?" },
  swap_prepare:    { short: "Unsigned swap, token checked before it is built", chains: ["Base", "RH"], group: "transactions", tryPrompt: "Swap 1 USDC to ETH on Base" },
  token_verdict:   { short: "No issues found, caution or avoid, with every reason", chains: ["Base", "RH"], group: "safety", tryPrompt: "Is 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 safe on Base?" },
  trending_safe:   { short: "Trending Base tokens with contract tax and exit depth", chains: ["Base"], group: "market", tryPrompt: "What's trending on Base that I could get out of?" },
  wallet_risk:     { short: "Is this address flagged: theft, phishing, sanctions", chains: ["Base", "RH"], group: "safety" },
  token_price:     { short: "Live price, market cap and volume", chains: ["Base"], group: "market", tryPrompt: "Price of AERO on Base" },
  send_prepare:    { short: "Unsigned transfer, recipient checked", chains: ["Base", "RH"], group: "transactions" },
  bridge_prepare:  { short: "Unsigned bridge between Base and Robinhood Chain", chains: ["Base", "RH"], group: "transactions" },
  sign_check:      { short: "What signing this transaction or message will do", chains: ["Base", "RH"], group: "safety" },
  approvals_audit: { short: "Open approvals, and which to revoke", chains: ["Base", "RH"], group: "safety", tryPrompt: "Check my approvals" },
  blue_registry:   { short: "Search the rest of the x402 catalog", chains: ["Base", "RH"], group: "catalog" },
  blue_call:       { short: "Run any catalog tool, paid from your wallet", chains: ["Base", "RH"], group: "catalog" },
  blue_doctor:     { short: "Is a failure an outage or your input", chains: ["Base", "RH"], group: "catalog" },
};

