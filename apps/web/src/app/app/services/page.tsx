// /app/services — Blue Agent services: the MCP v2 tools as a product page
// (ShunTr, 2026-10-22; layout after agent.tollylabs.com, in this app's chrome).
//
// A SERVER component: the manifest (lib/mcp-tools) and the price table
// (lib/mcp-paid) are read here so neither ships to the client, and the stats
// and receipts come from the MCP receipt book (lib/mcp-receipts) — outside
// buyers and team tests counted apart. A KV read that fails renders "—", never
// a confident 0.
import { MCP_TOOLS } from "@/lib/mcp-tools";
import { MCP_PRICES } from "@/lib/mcp-paid";
import { readMcpStats, readMcpReceipts } from "@/lib/mcp-receipts";
import ServicesDashboard, { type ServiceRow } from "./ServicesDashboard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Services — Blue Agent" };

type Group = "stocks" | "safety" | "transactions" | "market" | "catalog";
const META: Record<string, { short: string; chains: string[]; group: Group; tryPrompt?: string }> = {
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

export default async function ServicesPage() {
  const [stats, receipts] = await Promise.all([readMcpStats(30), readMcpReceipts(12)]);
  const rows: ServiceRow[] = MCP_TOOLS.map((t) => {
    const m = META[t.name] ?? { short: "", chains: [], group: "catalog" as Group };
    const units = MCP_PRICES[t.name] ?? 0;
    const s = stats.byTool[t.name];
    const runs = s ? s.settled + s.notCharged : 0;
    return {
      name: t.name,
      short: m.short,
      chains: m.chains,
      group: m.group,
      priceUsd: units ? units / 1_000_000 : 0,
      calls: stats.readable ? (s?.settled ?? 0) : null,
      successPct: stats.readable && runs > 0 ? Math.round(((s?.settled ?? 0) / runs) * 1000) / 10 : null,
      schema: t.inputSchema as Record<string, unknown>,
      description: t.description,
      tryPrompt: m.tryPrompt ?? null,
    };
  });
  return <ServicesDashboard rows={rows} stats={stats} receipts={receipts} />;
}
