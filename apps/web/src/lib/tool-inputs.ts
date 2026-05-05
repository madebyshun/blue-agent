export type Field = {
  name: string;
  label: string;
  placeholder: string;
  type: "text" | "address" | "url" | "number";
  required: boolean;
};

export type ToolSchema = { fields: Field[] };

export const TOOL_SCHEMAS: Record<string, ToolSchema> = {
  "risk-gate": {
    fields: [
      { name: "action", label: "Action", placeholder: "transfer / swap / approve", type: "text", required: true },
      { name: "contractAddress", label: "Contract Address", placeholder: "0x…", type: "address", required: false },
      { name: "amount", label: "Amount", placeholder: "e.g. 1000", type: "text", required: false },
      { name: "toAddress", label: "To Address", placeholder: "0x…", type: "address", required: false },
    ],
  },
  "honeypot-check": { fields: [{ name: "token", label: "Token Contract", placeholder: "0x…", type: "address", required: true }] },
  "allowance-audit": { fields: [{ name: "address", label: "Wallet Address", placeholder: "0x…", type: "address", required: true }] },
  "phishing-scan": { fields: [{ name: "url", label: "URL / Contract / Handle", placeholder: "https://… or 0x… or @handle", type: "text", required: true }] },
  "mev-shield": {
    fields: [
      { name: "tokenIn", label: "Token In", placeholder: "0x…", type: "address", required: true },
      { name: "tokenOut", label: "Token Out", placeholder: "0x…", type: "address", required: true },
      { name: "amountIn", label: "Amount In", placeholder: "e.g. 1000", type: "text", required: true },
    ],
  },
  "contract-trust": { fields: [{ name: "contractAddress", label: "Contract Address", placeholder: "0x…", type: "address", required: true }] },
  "circuit-breaker": {
    fields: [
      { name: "agentId", label: "Agent ID", placeholder: "agent-001", type: "text", required: true },
      { name: "action", label: "Action to Evaluate", placeholder: "transfer-all", type: "text", required: false },
    ],
  },
  "key-exposure": { fields: [{ name: "address", label: "Wallet Address", placeholder: "0x…", type: "address", required: true }] },
  "quantum-premium": { fields: [{ name: "address", label: "Wallet Address", placeholder: "0x…", type: "address", required: true }] },
  "quantum-batch": { fields: [{ name: "addresses", label: "Addresses (comma-separated, max 10)", placeholder: "0x…, 0x…", type: "text", required: true }] },
  "quantum-migrate": { fields: [{ name: "address", label: "Wallet Address", placeholder: "0x…", type: "address", required: true }] },
  "quantum-timeline": { fields: [{ name: "address", label: "Wallet Address (optional)", placeholder: "0x…", type: "address", required: false }] },
  "deep-analysis": { fields: [{ name: "token", label: "Token Address or Symbol", placeholder: "0x… or USDC", type: "text", required: true }] },
  "launch-advisor": {
    fields: [
      { name: "projectName", label: "Project Name", placeholder: "My Token", type: "text", required: true },
      { name: "description", label: "Description", placeholder: "Brief description…", type: "text", required: false },
    ],
  },
  "grant-evaluator": { fields: [{ name: "projectUrl", label: "Project URL or Description", placeholder: "https://… or describe project", type: "text", required: true }] },
  "x402-readiness": { fields: [{ name: "apiUrl", label: "API URL to Audit", placeholder: "https://…", type: "url", required: true }] },
  "base-deploy-check": { fields: [{ name: "contractAddress", label: "Contract Address", placeholder: "0x…", type: "address", required: true }] },
  "tokenomics-score": { fields: [{ name: "token", label: "Token Address or Symbol", placeholder: "0x… or TOKEN", type: "text", required: true }] },
  "whitepaper-tldr": { fields: [{ name: "url", label: "Whitepaper URL", placeholder: "https://…", type: "url", required: true }] },
  "vc-tracker": { fields: [{ name: "sector", label: "Sector or Address", placeholder: "DeFi, AI, 0x…", type: "text", required: true }] },
  "wallet-pnl": { fields: [{ name: "address", label: "Wallet Address", placeholder: "0x…", type: "address", required: true }] },
  "whale-tracker": { fields: [{ name: "token", label: "Token Address", placeholder: "0x…", type: "address", required: true }] },
  "aml-screen": { fields: [{ name: "address", label: "Wallet Address", placeholder: "0x…", type: "address", required: true }] },
  "airdrop-check": { fields: [{ name: "address", label: "Wallet Address", placeholder: "0x…", type: "address", required: true }] },
  "narrative-pulse": { fields: [{ name: "topic", label: "Topic (optional)", placeholder: "DeFi, AI agents…", type: "text", required: false }] },
  "dex-flow": { fields: [{ name: "token", label: "Token Address or Pair", placeholder: "0x… or ETH/USDC", type: "text", required: true }] },
  "yield-optimizer": { fields: [{ name: "address", label: "Wallet Address (optional)", placeholder: "0x…", type: "address", required: false }] },
  "lp-analyzer": { fields: [{ name: "address", label: "Wallet Address", placeholder: "0x…", type: "address", required: true }] },
  "tax-report": {
    fields: [
      { name: "address", label: "Wallet Address", placeholder: "0x…", type: "address", required: true },
      { name: "year", label: "Tax Year", placeholder: "2024", type: "number", required: true },
    ],
  },
  "alert-subscribe": {
    fields: [
      { name: "address", label: "Watch Address", placeholder: "0x…", type: "address", required: true },
      { name: "webhookUrl", label: "Webhook URL", placeholder: "https://…", type: "url", required: true },
    ],
  },
  "alert-check": { fields: [{ name: "address", label: "Address", placeholder: "0x…", type: "address", required: true }] },
};
