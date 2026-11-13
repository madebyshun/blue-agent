// /app/services — Blue Agent services: the MCP v2 tools as a product page
// (ShunTr, 2026-10-22; layout after agent.tollylabs.com, in this app's chrome).
//
// A SERVER component: the manifest (lib/mcp-tools) and the price table
// (lib/mcp-paid) are read here so neither ships to the client, and the stats
// and receipts come from the MCP receipt book (lib/mcp-receipts). Every paid
// call counts — outside buyers and team tests are aggregated on the page
// (2026-10-27). A KV read that fails renders "—", never a confident 0.
import { MCP_TOOLS } from "@/lib/mcp-tools";
import { MCP_PRICES } from "@/lib/mcp-paid";
import { readMcpStats, readMcpReceipts } from "@/lib/mcp-receipts";
import { META, type Group } from "./meta";
import { scoreService } from "@/lib/service-score";
import ServicesDashboard, { type ServiceRow, type HttpService } from "./ServicesDashboard";
import { blueHireServices } from "@/lib/hub/blue-services";
import { AGENT_TOOLS } from "@/lib/agent-tools";
import { BLUE_AGENT_ID } from "@/lib/erc8004";

export const dynamic = "force-dynamic";
export const metadata = { title: "Services — Blue Agent" };

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
      score: stats.readable ? scoreService(s).score : null,
    };
  });
  const http: HttpService[] = blueHireServices().map((h) => {
    const id = h.url.split("/").pop()!;
    return { id, name: AGENT_TOOLS.find((t) => t.id === id)?.name ?? id, priceUsd: h.priceUsd ?? 0, group: /stock|b20/.test(id) ? "stocks" : "tokens" };
  });
  return <ServicesDashboard rows={rows} stats={stats} receipts={receipts} http={http} hireHref={BLUE_AGENT_ID !== null ? `/exchange/agent/${BLUE_AGENT_ID}` : null} />;
}
