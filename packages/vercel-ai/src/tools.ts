import { z } from "zod";
import { tool } from "ai";
import { callTool, BlueAgentClientOptions } from "./client";

/**
 * Returns all 32 Blue Agent x402 tools as Vercel AI SDK CoreTool objects.
 * Pass the result directly to generateText() or streamText() as the `tools` option.
 */
export function blueagentTools(
  options: BlueAgentClientOptions = {}
): Record<string, any> {
  return {
    risk_gate: tool({
      description:
        "Screen a transaction before execution — flags high-risk actions, rug pulls, and malicious contracts on Base. Price: $0.05 USDC.",
      parameters: z.object({
        action: z.string().describe("Action to evaluate (e.g. transfer / swap / approve)"),
        contractAddress: z.string().describe("Contract address (0x…)").optional(),
        amount: z.string().describe("Amount involved in the action").optional(),
        toAddress: z.string().describe("Recipient address (0x…)").optional(),
      }),
      execute: async (args) => callTool("risk-gate", args as Record<string, unknown>, options),
    }),

    honeypot_check: tool({
      description:
        "Detect honeypot tokens — checks if a token can be sold after purchase on Base. Price: $0.10 USDC.",
      parameters: z.object({
        token: z.string().describe("Token contract address (0x…)"),
      }),
      execute: async (args) => callTool("honeypot-check", args as Record<string, unknown>, options),
    }),

    allowance_audit: tool({
      description:
        "Audit all active ERC-20 token allowances for a wallet — identifies dangerous unlimited approvals on Base. Price: $0.10 USDC.",
      parameters: z.object({
        address: z.string().describe("Wallet address to audit (0x…)"),
      }),
      execute: async (args) =>
        callTool("allowance-audit", args as Record<string, unknown>, options),
    }),

    phishing_scan: tool({
      description:
        "Scan a URL, contract address, or social handle for phishing indicators on Base. Price: $0.10 USDC.",
      parameters: z.object({
        url: z.string().describe("URL, contract address (0x…), or social handle to scan"),
      }),
      execute: async (args) => callTool("phishing-scan", args as Record<string, unknown>, options),
    }),

    mev_shield: tool({
      description:
        "Analyze a swap for MEV (sandwich attack) risk and suggest safe execution parameters on Base. Price: $0.10 USDC.",
      parameters: z.object({
        tokenIn: z.string().describe("Input token address (0x…)"),
        tokenOut: z.string().describe("Output token address (0x…)"),
        amountIn: z.string().describe("Input amount (e.g. 1000)"),
      }),
      execute: async (args) => callTool("mev-shield", args as Record<string, unknown>, options),
    }),

    contract_trust: tool({
      description:
        "Score a smart contract's trustworthiness — checks verification, ownership, and known vulnerabilities on Base. Price: $0.10 USDC.",
      parameters: z.object({
        contractAddress: z.string().describe("Contract address to evaluate (0x…)"),
      }),
      execute: async (args) =>
        callTool("contract-trust", args as Record<string, unknown>, options),
    }),

    circuit_breaker: tool({
      description:
        "Evaluate whether an agent action should be paused or blocked based on risk rules. Price: $0.10 USDC.",
      parameters: z.object({
        agentId: z.string().describe("Agent ID to check (e.g. agent-001)"),
        action: z.string().describe("Action the agent wants to perform").optional(),
      }),
      execute: async (args) =>
        callTool("circuit-breaker", args as Record<string, unknown>, options),
    }),

    key_exposure: tool({
      description:
        "Check if a wallet address has been flagged for private key exposure or compromise on Base. Price: $0.10 USDC.",
      parameters: z.object({
        address: z.string().describe("Wallet address to check (0x…)"),
      }),
      execute: async (args) => callTool("key-exposure", args as Record<string, unknown>, options),
    }),

    quantum_premium: tool({
      description:
        "Deep quantum-readiness analysis for a single wallet — full entropy, key strength, and migration report on Base. Price: $1.50 USDC.",
      parameters: z.object({
        address: z.string().describe("Wallet address to analyze (0x…)"),
      }),
      execute: async (args) =>
        callTool("quantum-premium", args as Record<string, unknown>, options),
    }),

    quantum_batch: tool({
      description:
        "Batch quantum-readiness check for up to 10 wallet addresses at once on Base. Price: $2.50 USDC.",
      parameters: z.object({
        addresses: z
          .string()
          .describe("Comma-separated wallet addresses to check (0x…, 0x…, up to 10)"),
      }),
      execute: async (args) => callTool("quantum-batch", args as Record<string, unknown>, options),
    }),

    quantum_migrate: tool({
      description:
        "Generate a quantum-safe migration plan for a wallet address on Base. Price: $0.10 USDC.",
      parameters: z.object({
        address: z.string().describe("Wallet address to migrate (0x…)"),
      }),
      execute: async (args) =>
        callTool("quantum-migrate", args as Record<string, unknown>, options),
    }),

    quantum_timeline: tool({
      description:
        "Get the projected timeline for quantum computing threats to Ethereum wallets on Base. Price: $0.10 USDC.",
      parameters: z.object({
        address: z
          .string()
          .describe("Optional wallet address for personalized timeline (0x…)")
          .optional(),
      }),
      execute: async (args) =>
        callTool("quantum-timeline", args as Record<string, unknown>, options),
    }),

    deep_analysis: tool({
      description:
        "Comprehensive deep-dive analysis of a token — fundamentals, tokenomics, on-chain activity, and risk score on Base. Price: $0.35 USDC.",
      parameters: z.object({
        token: z.string().describe("Token address (0x…) or symbol (e.g. USDC)"),
      }),
      execute: async (args) => callTool("deep-analysis", args as Record<string, unknown>, options),
    }),

    token_launch: tool({
      description:
        "Launch a new token on Base — deploys contract, sets metadata, and lists on DEX. Price: $1.00 USDC.",
      parameters: z.object({
        tokenName: z.string().describe("Full token name (e.g. Blue Agent)"),
        tokenSymbol: z.string().describe("Token ticker symbol (e.g. BLUE)"),
        description: z.string().describe("Description of what the token represents"),
        imageUrl: z.string().url().describe("Token image URL (https://…)").optional(),
        twitter: z.string().describe("Twitter/X handle without @").optional(),
        website: z.string().url().describe("Project website URL (https://…)").optional(),
      }),
      execute: async (args) => callTool("token-launch", args as Record<string, unknown>, options),
    }),

    launch_advisor: tool({
      description:
        "Get AI-powered launch strategy advice for your project on Base — timing, pricing, and distribution recommendations. Price: $3.00 USDC.",
      parameters: z.object({
        projectName: z.string().describe("Project or token name"),
        description: z.string().describe("Brief project description").optional(),
      }),
      execute: async (args) =>
        callTool("launch-advisor", args as Record<string, unknown>, options),
    }),

    grant_evaluator: tool({
      description:
        "Evaluate a project's eligibility and fit for Base ecosystem grants — scores criteria and suggests improvements. Price: $5.00 USDC.",
      parameters: z.object({
        projectUrl: z.string().describe("Project URL or detailed description"),
      }),
      execute: async (args) =>
        callTool("grant-evaluator", args as Record<string, unknown>, options),
    }),

    x402_readiness: tool({
      description:
        "Audit an API endpoint for x402 payment protocol readiness — checks headers, pricing, and compliance. Price: $0.10 USDC.",
      parameters: z.object({
        apiUrl: z.string().url().describe("API URL to audit for x402 readiness (https://…)"),
      }),
      execute: async (args) =>
        callTool("x402-readiness", args as Record<string, unknown>, options),
    }),

    base_deploy_check: tool({
      description:
        "Verify a deployed contract on Base — checks verification status, constructor args, and deployment integrity. Price: $0.10 USDC.",
      parameters: z.object({
        contractAddress: z.string().describe("Deployed contract address on Base (0x…)"),
      }),
      execute: async (args) =>
        callTool("base-deploy-check", args as Record<string, unknown>, options),
    }),

    tokenomics_score: tool({
      description:
        "Score a token's economic model — supply, distribution, vesting, and long-term sustainability on Base. Price: $0.10 USDC.",
      parameters: z.object({
        token: z.string().describe("Token address (0x…) or symbol"),
      }),
      execute: async (args) =>
        callTool("tokenomics-score", args as Record<string, unknown>, options),
    }),

    whitepaper_tldr: tool({
      description:
        "Fetch and summarize a whitepaper or technical document into a concise TL;DR. Price: $0.10 USDC.",
      parameters: z.object({
        url: z.string().url().describe("Whitepaper URL (https://…)"),
      }),
      execute: async (args) =>
        callTool("whitepaper-tldr", args as Record<string, unknown>, options),
    }),

    vc_tracker: tool({
      description:
        "Track recent VC investments and funding rounds in a specific sector or for a specific address. Price: $0.10 USDC.",
      parameters: z.object({
        sector: z.string().describe("Sector or address to track (e.g. DeFi, AI, 0x…)"),
      }),
      execute: async (args) => callTool("vc-tracker", args as Record<string, unknown>, options),
    }),

    wallet_pnl: tool({
      description:
        "Calculate realized and unrealized PnL for a wallet across all positions on Base. Price: $1.00 USDC.",
      parameters: z.object({
        address: z.string().describe("Wallet address to analyze (0x…)"),
      }),
      execute: async (args) => callTool("wallet-pnl", args as Record<string, unknown>, options),
    }),

    whale_tracker: tool({
      description:
        "Track large wallet movements and whale activity for a token on Base. Price: $0.10 USDC.",
      parameters: z.object({
        token: z.string().describe("Token contract address to track (0x…)"),
      }),
      execute: async (args) => callTool("whale-tracker", args as Record<string, unknown>, options),
    }),

    aml_screen: tool({
      description:
        "AML (Anti-Money Laundering) screening for a wallet address — checks against sanctions and flagged addresses. Price: $0.10 USDC.",
      parameters: z.object({
        address: z.string().describe("Wallet address to screen (0x…)"),
      }),
      execute: async (args) => callTool("aml-screen", args as Record<string, unknown>, options),
    }),

    airdrop_check: tool({
      description:
        "Check a wallet's eligibility for active and upcoming airdrops on Base. Price: $0.10 USDC.",
      parameters: z.object({
        address: z.string().describe("Wallet address to check (0x…)"),
      }),
      execute: async (args) =>
        callTool("airdrop-check", args as Record<string, unknown>, options),
    }),

    narrative_pulse: tool({
      description:
        "Get the current narrative trends and sentiment pulse in crypto — optionally filtered by topic. Price: $0.10 USDC.",
      parameters: z.object({
        topic: z
          .string()
          .describe("Optional topic to focus on (e.g. DeFi, AI agents, Base)")
          .optional(),
      }),
      execute: async (args) =>
        callTool("narrative-pulse", args as Record<string, unknown>, options),
    }),

    dex_flow: tool({
      description:
        "Analyze DEX trading flow and order book depth for a token on Base. Price: $0.10 USDC.",
      parameters: z.object({
        token: z.string().describe("Token address (0x…) or trading pair (e.g. ETH/USDC)"),
      }),
      execute: async (args) => callTool("dex-flow", args as Record<string, unknown>, options),
    }),

    yield_optimizer: tool({
      description:
        "Find the best yield opportunities across Base DeFi protocols for a wallet. Price: $0.10 USDC.",
      parameters: z.object({
        address: z
          .string()
          .describe("Optional wallet address for personalized recommendations (0x…)")
          .optional(),
      }),
      execute: async (args) =>
        callTool("yield-optimizer", args as Record<string, unknown>, options),
    }),

    lp_analyzer: tool({
      description:
        "Analyze liquidity pool positions for a wallet — impermanent loss, fees earned, and rebalancing suggestions on Base. Price: $0.10 USDC.",
      parameters: z.object({
        address: z.string().describe("Wallet address with LP positions (0x…)"),
      }),
      execute: async (args) => callTool("lp-analyzer", args as Record<string, unknown>, options),
    }),

    tax_report: tool({
      description:
        "Generate a tax report for a wallet address for a specific year — tracks taxable events on Base. Price: $0.10 USDC.",
      parameters: z.object({
        address: z.string().describe("Wallet address (0x…)"),
        year: z.coerce.number().describe("Tax year (e.g. 2024)"),
      }),
      execute: async (args) => callTool("tax-report", args as Record<string, unknown>, options),
    }),

    alert_subscribe: tool({
      description:
        "Subscribe to real-time on-chain alerts for a wallet address — sends notifications to a webhook URL. Price: $0.10 USDC.",
      parameters: z.object({
        address: z.string().describe("Wallet address to monitor (0x…)"),
        webhookUrl: z.string().url().describe("Webhook URL to receive alerts (https://…)"),
      }),
      execute: async (args) =>
        callTool("alert-subscribe", args as Record<string, unknown>, options),
    }),

    alert_check: tool({
      description:
        "Check the status of active alerts for a wallet address. Price: $0.10 USDC.",
      parameters: z.object({
        address: z.string().describe("Wallet address to check alerts for (0x…)"),
      }),
      execute: async (args) => callTool("alert-check", args as Record<string, unknown>, options),
    }),
  };
}

/**
 * Returns a single Blue Agent tool by name.
 * Accepts both kebab-case (e.g. "risk-gate") and snake_case (e.g. "risk_gate").
 */
export function blueagentTool(
  name: string,
  options: BlueAgentClientOptions = {}
): ReturnType<typeof tool> {
  const all = blueagentTools(options);
  const key = name.replace(/-/g, "_");
  const found = all[key];
  if (!found) {
    throw new Error(
      `Unknown Blue Agent tool: "${name}". Available tools: ${Object.keys(all).join(", ")}`
    );
  }
  return found;
}
