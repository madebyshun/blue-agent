// /app/skills — the Skills catalog as a first-class page (rebuilt 2026-10-01
// around the trading loop: discover → check → trade → wallet → stock tokens,
// builder commands last).
//
// A SERVER component on purpose: each skill's tool fee comes from the catalog
// price (lib/credit-pricing.ts toolCreditCost, the same function the x402
// credit path debits with), and computing it here keeps the ~2,000-line
// AGENT_TOOLS catalog out of the client bundle. Only the numbers cross over.
import { AGENT_SKILLS } from "@/app/chat/agent-skills";
import { toolCreditCostFor } from "@/lib/credit-pricing";
import SkillsPageClient from "./SkillsPageClient";

export default function SkillsPage() {
  const costs: Record<string, number> = {};
  for (const sk of AGENT_SKILLS) {
    for (const id of sk.meterIds ?? []) {
      if (!(id in costs)) costs[id] = toolCreditCostFor(id, 0);
    }
  }
  return <SkillsPageClient costs={costs} />;
}
