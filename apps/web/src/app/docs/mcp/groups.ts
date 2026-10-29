import { MCP_TOOLS } from "@/lib/mcp-tools";
import { MCP_PRICES } from "@/lib/mcp-paid";

/*
 * How /docs/mcp groups the manifest — by PRICE, not by name.
 *
 * 🔴 This page grouped by name prefix (`blue_` / `hub_` / `b20_`) until
 * 2026-10-29. MCP v2 (2026-10-22) renamed ten of the thirteen tools to
 * unprefixed names (`swap_prepare`, `token_verdict`, …), and every one of them
 * vanished from the page while the header still read "Available tools · 13" —
 * a `.filter()` cannot report a tool it never matched. The old comment warned
 * about exactly this and nothing enforced it.
 *
 * Paid-vs-free is a partition by construction: a tool is either in MCP_PRICES
 * (the table the paid transport actually bills from) or it is not, so no tool
 * can land in zero groups or in two. `scripts/docs-mcp-groups-check.ts` asserts
 * that anyway, against the real manifest.
 */
export interface McpDocTool {
  name: string;
  description: string;
  /** USDC micro-units; absent for free tools. */
  priceMicros?: number;
}

export interface McpDocGroup {
  key: "paid" | "free";
  label: string;
  color: string;
  tools: McpDocTool[];
}

export function formatUsdcMicros(micros: number): string {
  return `$${(micros / 1_000_000).toFixed(2)}`;
}

export function groupMcpTools(
  tools: readonly { name: string; description: string }[] = MCP_TOOLS,
  prices: Readonly<Record<string, number>> = MCP_PRICES,
): McpDocGroup[] {
  const paid: McpDocTool[] = [];
  const free: McpDocTool[] = [];
  for (const t of tools) {
    const price = Object.prototype.hasOwnProperty.call(prices, t.name) ? prices[t.name] : undefined;
    if (price !== undefined) paid.push({ name: t.name, description: t.description, priceMicros: price });
    else free.push({ name: t.name, description: t.description });
  }
  return [
    { key: "paid", label: "Paid per call — x402, USDC on Base", color: "#4FC3F7", tools: paid },
    { key: "free", label: "Free — reads, transaction builders, discovery", color: "#A78BFA", tools: free },
  ];
}
