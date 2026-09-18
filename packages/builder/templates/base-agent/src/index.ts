// x402-fetch wraps fetch to handle HTTP 402 payment flows automatically
import { wrapFetchWithPayment } from "x402-fetch";

// ── Config ───────────────────────────────────────────────────────────────────

const VIRTUALS_API_KEY = process.env.VIRTUALS_API_KEY;
const WALLET_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY;

// Blue Agent's paid tools are served from blueagent.dev under /api/x402/<tool-id>.
const BLUEAGENT_API_URL = process.env.BLUEAGENT_API_URL ?? "https://blueagent.dev";

// Inference goes through Virtuals — an OpenAI-compatible chat-completions
// endpoint. Send only these four body keys: Virtuals rejects unrecognised keys
// with a 400 rather than ignoring them.
const VIRTUALS_URL = "https://compute.virtuals.io/v1/chat/completions";
const MODEL = process.env.VIRTUALS_MODEL ?? "deepseek-deepseek-v4-flash";

if (!VIRTUALS_API_KEY) throw new Error("VIRTUALS_API_KEY env var required");
if (!WALLET_PRIVATE_KEY) throw new Error("WALLET_PRIVATE_KEY env var required");

// x402-fetch: automatically handles HTTP 402 payment challenges.
// Payment is made in native USDC on Base (chain 8453).
const paidFetch = wrapFetchWithPayment(fetch, {
  privateKey: WALLET_PRIVATE_KEY as `0x${string}`,
  // USDC on Base: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
});

// ── Paid tool call ───────────────────────────────────────────────────────────

async function checkRisk(action: string, contractAddress?: string): Promise<string> {
  // Prices change. Resolve the id and its price from the live catalog at
  // https://blueagent.dev/.well-known/pricing rather than hardcoding either —
  // an id that is not in the catalog is a 404, and a remembered price is a guess.
  const res = await paidFetch(`${BLUEAGENT_API_URL}/api/x402/risk-gate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, contractAddress }),
  });
  const data = await res.json();
  return JSON.stringify(data, null, 2);
}

// ── Inference ────────────────────────────────────────────────────────────────

async function think(userMessage: string): Promise<string> {
  const res = await fetch(VIRTUALS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${VIRTUALS_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `You are {{PROJECT_NAME}}, an AI agent running on Base (chain 8453).
You can reason about onchain actions and use Blue Agent tools to check safety before executing.
Always check risk before any token transfer or contract interaction.
Never invent a contract address. If you do not have a verified one, say so.`,
        },
        { role: "user", content: userMessage },
      ],
      // The default model reasons before answering, and Virtuals bills that hidden
      // reasoning from this same budget without returning it. Below ~1500 the
      // reasoning can eat the whole allowance and you get an empty — but fully
      // billed — response. Do not lower this to "save money"; it does the opposite.
      max_tokens: 2000,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    // Print the upstream body verbatim. A generic "LLM error" is how a bad model
    // id survives several rounds of debugging — the message is the diagnosis.
    throw new Error(`Virtuals ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content?.trim()) {
    throw new Error(
      `Virtuals returned no content (finish_reason=${data.choices?.[0]?.finish_reason ?? "none"}). ` +
        `If this says "length", raise max_tokens.`,
    );
  }
  // Reasoning may arrive wrapped in a leading <think> block. Strip it.
  return content.replace(/^\s*<think>[\s\S]*?<\/think>/i, "").trim() || content.trim();
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("{{PROJECT_NAME}} agent starting on Base...\n");

  // Example: reason about an action
  const userIntent = "I want to swap 100 USDC for ETH on Uniswap on Base";
  console.log(`User: ${userIntent}\n`);

  // Step 1: think about it
  const plan = await think(`The user wants to: ${userIntent}. What should I check before doing this?`);
  console.log(`Agent plan:\n${plan}\n`);

  // Step 2: risk check via Blue Agent x402 tool (paid in USDC on Base)
  console.log("Running risk check — this pays a real x402 invoice in USDC...");
  const riskReport = await checkRisk("swap", "0x2626664c2603336E57B271c5C0b26F421741e481");
  console.log(`Risk report:\n${riskReport}\n`);

  // Step 3: final decision
  const decision = await think(`Risk report: ${riskReport}\n\nShould I proceed with: ${userIntent}? Give a final yes/no decision with reasoning.`);
  console.log(`Decision:\n${decision}`);
}

main().catch(console.error);
