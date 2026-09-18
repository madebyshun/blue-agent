import { z } from "zod";
import { callTool, BlueAgentClientOptions } from "./client";

export interface BlueAgentProviderOptions extends BlueAgentClientOptions {
  // inherits baseUrl, apiKey, signPayment
}

/**
 * Creates a Blue Agent action provider compatible with Coinbase AgentKit's ActionProvider pattern.
 *
 * Exposes the 12 x402 tools on Base that actually resolve to a live handler.
 * This was 32 until v1.3.0; the other 20 ids existed in neither AGENT_TOOLS nor
 * HANDLERS and returned 501 from production, so they were never callable. Do not
 * add an action here without checking the id against
 * https://blueagent.dev/api/catalog — apps/web/scripts/docs-truth-check.ts pins it.
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

      {
        name: "key_exposure",
        description:
          "Check if a wallet address has been flagged for private key exposure or compromise on Base. Price: $0.50 USDC.",
        schema: z.object({
          address: z.string().describe("Wallet address to check (0x…)"),
        }),
        invoke: async (args: { address: string }) =>
          callTool("key-exposure", args as Record<string, unknown>, options),
      },

      {
        name: "deep_analysis",
        description:
          "Comprehensive deep-dive analysis of a token — fundamentals, tokenomics, on-chain activity, and risk score on Base. Price: $0.50 USDC.",
        schema: z.object({
          token: z.string().describe("Token address (0x…) or symbol (e.g. USDC)"),
        }),
        invoke: async (args: { token: string }) =>
          callTool("deep-analysis", args as Record<string, unknown>, options),
      },

      {
        name: "grant_evaluator",
        description:
          "Evaluate a project's eligibility and fit for Base ecosystem grants — scores criteria and suggests improvements. Price: $5.00 USDC.",
        schema: z.object({
          projectUrl: z.string().describe("Project URL or detailed description"),
        }),
        invoke: async (args: { projectUrl: string }) =>
          callTool("grant-evaluator", args as Record<string, unknown>, options),
      },

      {
        name: "whale_tracker",
        description:
          "Track large wallet movements and whale activity for a token on Base. Price: $0.10 USDC.",
        schema: z.object({
          token: z.string().describe("Token contract address to track (0x…)"),
        }),
        invoke: async (args: { token: string }) =>
          callTool("whale-tracker", args as Record<string, unknown>, options),
      },

      {
        name: "aml_screen",
        description:
          "AML (Anti-Money Laundering) screening for a wallet address — checks against sanctions and flagged addresses. Price: $0.25 USDC.",
        schema: z.object({
          address: z.string().describe("Wallet address to screen (0x…)"),
        }),
        invoke: async (args: { address: string }) =>
          callTool("aml-screen", args as Record<string, unknown>, options),
      },

      {
        name: "airdrop_check",
        description:
          "Check a wallet's eligibility for active and upcoming airdrops on Base. Price: $0.10 USDC.",
        schema: z.object({
          address: z.string().describe("Wallet address to check (0x…)"),
        }),
        invoke: async (args: { address: string }) =>
          callTool("airdrop-check", args as Record<string, unknown>, options),
      },

      {
        name: "narrative_pulse",
        description:
          "Get the current narrative trends and sentiment pulse in crypto — optionally filtered by topic. Price: $0.10 USDC.",
        schema: z.object({
          topic: z
            .string()
            .describe("Optional topic to focus on (e.g. DeFi, AI agents, Base)")
            .optional(),
        }),
        invoke: async (args: { topic?: string }) =>
          callTool("narrative-pulse", args as Record<string, unknown>, options),
      },

      {
        name: "dex_flow",
        description:
          "Analyze DEX trading flow and order book depth for a token on Base. Price: $0.15 USDC.",
        schema: z.object({
          token: z.string().describe("Token address (0x…) or trading pair (e.g. ETH/USDC)"),
        }),
        invoke: async (args: { token: string }) =>
          callTool("dex-flow", args as Record<string, unknown>, options),
      },

      {
        name: "lp_analyzer",
        description:
          "Analyze liquidity pool positions for a wallet — impermanent loss, fees earned, and rebalancing suggestions on Base. Price: $0.25 USDC.",
        schema: z.object({
          address: z.string().describe("Wallet address with LP positions (0x…)"),
        }),
        invoke: async (args: { address: string }) =>
          callTool("lp-analyzer", args as Record<string, unknown>, options),
      },
    ],
  };
}
