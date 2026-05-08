import { callBankrLLM } from "@blue-agent/bankr";
// x402-fetch wraps fetch to handle HTTP 402 payment flows automatically
import { wrapFetchWithPayment } from "x402-fetch";

// Load env
const BANKR_API_KEY = process.env.BANKR_API_KEY;
const BLUEAGENT_API_URL = process.env.BLUEAGENT_API_URL ?? "https://api.blueagent.xyz";
const WALLET_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY;

if (!BANKR_API_KEY) throw new Error("BANKR_API_KEY env var required");
if (!WALLET_PRIVATE_KEY) throw new Error("WALLET_PRIVATE_KEY env var required");

// x402-fetch: automatically handles HTTP 402 payment challenges
// Payment is made in USDC on Base (chain 8453)
const paidFetch = wrapFetchWithPayment(fetch, {
  privateKey: WALLET_PRIVATE_KEY as `0x${string}`,
  // USDC on Base: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
});

async function checkRisk(action: string, contractAddress?: string): Promise<string> {
  const res = await paidFetch(`${BLUEAGENT_API_URL}/api/tools/risk-gate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, contractAddress }),
  });
  const data = await res.json();
  return JSON.stringify(data, null, 2);
}

async function think(userMessage: string): Promise<string> {
  return callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are {{PROJECT_NAME}}, an AI agent running on Base (chain 8453).
You can reason about onchain actions and use Blue Agent tools to check safety before executing.
Always check risk before any token transfer or contract interaction.`,
    messages: [{ role: "user", content: userMessage }],
    temperature: 0.7,
    maxTokens: 1000,
  });
}

async function main() {
  console.log("{{PROJECT_NAME}} agent starting on Base...\n");

  // Example: reason about an action
  const userIntent = "I want to swap 100 USDC for ETH on Uniswap on Base";
  console.log(`User: ${userIntent}\n`);

  // Step 1: think about it
  const plan = await think(`The user wants to: ${userIntent}. What should I check before doing this?`);
  console.log(`Agent plan:\n${plan}\n`);

  // Step 2: risk check via Blue Agent x402 tool
  console.log("Running risk check (costs $0.05 USDC via x402)...");
  const riskReport = await checkRisk("swap", "0x2626664c2603336E57B271c5C0b26F421741e481");
  console.log(`Risk report:\n${riskReport}\n`);

  // Step 3: final decision
  const decision = await think(`Risk report: ${riskReport}\n\nShould I proceed with: ${userIntent}? Give a final yes/no decision with reasoning.`);
  console.log(`Decision:\n${decision}`);
}

main().catch(console.error);
