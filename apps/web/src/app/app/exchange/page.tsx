// /exchange — Base Agent Exchange (Blue Hub v3, docs/bluehub-v3-plan-2026-10-27.md).
// Every x402 seller on the CDP Bazaar on Base 8453, with x402 inflow measured
// from the chain (lib/hub/exchange.ts). Nobody registers to be here.
import type { Metadata } from "next";
import { readExchange, readSellerIdentities, readSellerProbes } from "@/lib/hub/exchange";
import { X402_PAY_TO } from "@/lib/x402-payee";
import { BLUE_AGENT_ID } from "@/lib/erc8004";
import ExchangeView from "./ExchangeView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Agent Exchange — Blue Agent",
  description: "Every x402 seller on Base, with what agents actually paid it, measured on chain.",
};

export default async function AgentsPage() {
  const [ex, ids, probes] = await Promise.all([readExchange(30), readSellerIdentities(), readSellerProbes()]);
  const live: Record<string, string> = {};
  for (const [p, v] of Object.entries(probes)) if (v.result === "live") live[p] = v.at;
  const agents: Record<string, string> = {};
  for (const [p, v] of Object.entries(ids)) if (v.agentIds.length) agents[p] = v.agentIds[0];
  const ours = X402_PAY_TO.toLowerCase();
  return (
    <ExchangeView
      ex={{ ...ex, rows: ex.rows.slice(0, 600) }}
      totalPaid={ex.rows.length}
      ours={ex.rows.find((r) => r.payTo === ours) ?? null}
      oursPayTo={ours}
      agentId={BLUE_AGENT_ID === null ? null : Number(BLUE_AGENT_ID)}
      agents={agents}
      identitiesChecked={Object.keys(ids).length}
      live={live}
      probesChecked={Object.keys(probes).length}
    />
  );
}
