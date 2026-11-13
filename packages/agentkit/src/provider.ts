import { z } from "zod";
import { callTool, BlueAgentClientOptions } from "./client";

export interface BlueAgentProviderOptions extends BlueAgentClientOptions {
  // inherits baseUrl, apiKey, signPayment
}

/**
 * Creates a Blue Agent action provider compatible with Coinbase AgentKit's ActionProvider pattern.
 *
 * Exposes the 3 x402 tools on Base that actually resolve to a live handler.
 *
 * This was 32 until v1.3.0; the other 20 ids existed in neither AGENT_TOOLS nor
 * HANDLERS and were refused by production (501 then, 404 UNKNOWN_TOOL_ID since
 * 2026-09-28), so they were never callable.
 *
 * 2026-11-13: the tool surface was cut 72 -> 29 and four of the actions here —
 * key_exposure, deep_analysis, narrative_pulse, dex_flow — called ids that no
 * longer have a handler, so calling one would answer 404 UNKNOWN_TOOL_ID. They
 * were removed rather than left advertised. Do not add an action here without
 * checking the id against https://blueagent.dev/api/catalog —
 * apps/web/scripts/docs-truth-check.ts pins it.
 */
export function createBlueAgentProvider(options: BlueAgentProviderOptions = {}) {
  return {
    name: "blueagent",

    supportsNetwork: (_network: unknown) => true,

    getActions: (_walletProvider: unknown) => [
      {
        name: "risk_gate",
        description:
          "Screen a transaction before execution — flags high-risk actions, rug pulls, and malicious contracts on Base. Price: $0.20 USDC.",
        schema: z.object({
          action: z.string().describe("Action to evaluate (e.g. transfer / swap / approve)"),
          contractAddress: z.string().describe("Contract address (0x…)").optional(),
          amount: z.string().describe("Amount involved in the action").optional(),
          toAddress: z.string().describe("Recipient address (0x…)").optional(),
        }),
        invoke: async (args: {
          action: string;
          contractAddress?: string;
          amount?: string;
          toAddress?: string;
        }) => callTool("risk-gate", args as Record<string, unknown>, options),
      },

      {
        name: "honeypot_check",
        description:
          "Detect honeypot tokens — checks if a token can be sold after purchase on Base. Price: $0.10 USDC.",
        schema: z.object({
          token: z.string().describe("Token contract address (0x…)"),
        }),
        invoke: async (args: { token: string }) =>
          callTool("honeypot-check", args as Record<string, unknown>, options),
      },

      {
        name: "contract_trust",
        description:
          "Score a smart contract's trustworthiness — checks verification, ownership, and known vulnerabilities on Base. Price: $0.15 USDC.",
        schema: z.object({
          contractAddress: z.string().describe("Contract address to evaluate (0x…)"),
        }),
        invoke: async (args: { contractAddress: string }) =>
          callTool("contract-trust", args as Record<string, unknown>, options),
      },






    ],
  };
}
