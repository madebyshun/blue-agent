import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { callBankrLLM, extractJsonObject, runAeonSkill } from "@/app/api/_lib/llm";

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/token-pick-signal";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const chain   = (body.chain as string)   ?? "base";
  const minMcap = (body.min_mcap as number) ?? 1_000_000;
  const context = (body.context as string) ?? "";

  const varInput = `chain=${chain}, min_mcap=$${minMcap.toLocaleString()}, focus on Base ecosystem tokens${context ? `. Additional context: ${context}` : ""}`;

  // Step 1 + 2: Run Aeon token-movers and token-pick in parallel
  const [moversRaw, pickRaw] = await Promise.all([
    runAeonSkill("token-movers", varInput),
    runAeonSkill("token-pick", `${varInput}. Today's date: ${new Date().toISOString().split("T")[0]}`),
  ]);

  // Step 3: MiroShark retail persona on the pick
  const pickContext = pickRaw ?? "No specific pick available today — market conditions unclear";
  const msRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are MiroShark retail persona — FOMO-driven, focuses on price action, entry points, ease of use.
Evaluate this token pick from a retail trader perspective.
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {"stance":"bull|bear|neutral","bull":<0-100>,"bear":<0-100>,"neutral":<0-100>,"rationale":"<1-2 sentences>","entry_advice":"<1 sentence>","risk_warning":"<1 sentence>"}`,
    messages: [{ role: "user", content: `Retail sentiment on this token pick:\n\n${pickContext}\n\nMarket movers context:\n${moversRaw ?? "No movers data"}` }],
    temperature: 0.5,
    maxTokens: 400,
  });

  const retailConsensus = extractJsonObject(msRaw) ?? { stance: "neutral", bull: 40, bear: 30, neutral: 30, rationale: "Mixed signals", entry_advice: "Wait for confirmation", risk_warning: "High volatility" };

  // Step 4: Blue Agent final synthesis
  const isNoPick = !pickRaw || pickRaw.includes("NO_PICK");
  const synthesis = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are Blue Agent — AI-native intelligence for Base builders and agents.
Synthesize Aeon token signal + MiroShark retail consensus into a final actionable verdict.
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "no_pick": <boolean>,
  "pick": {
    "token": "<symbol or null>",
    "thesis": "<1 sentence or null>",
    "entry": "<price + venue or null>",
    "kill_criterion": "<1 sentence or null>",
    "sizing": "small|medium|large|null",
    "horizon": "<hours/days/weeks or null>"
  },
  "near_misses": ["<token: reason>" or empty array],
  "retail_consensus": {"bull":<0-100>,"bear":<0-100>,"neutral":<0-100>,"stance":"bull|bear|neutral"},
  "risk_flags": ["<flag>" or empty array],
  "blue_verdict": "BUY|WATCH|SKIP|NO_PICK",
  "confidence": <0-100>,
  "note": "<1 sentence context>"
}`,
    messages: [{ role: "user", content: `Aeon token-movers:\n${moversRaw ?? "unavailable"}\n\nAeon token-pick:\n${pickRaw ?? "NO_PICK"}\n\nMiroShark retail:\n${JSON.stringify(retailConsensus)}` }],
    temperature: 0.3,
    maxTokens: 800,
  });

  const result = extractJsonObject(synthesis);
  if (!result) throw new Error("Failed to parse synthesis");

  if (result.retail_consensus && typeof result.retail_consensus === "object") {
    const rc = result.retail_consensus as Record<string, unknown>;
    rc.bull = (retailConsensus as Record<string, unknown>).bull ?? rc.bull;
    rc.bear = (retailConsensus as Record<string, unknown>).bear ?? rc.bear;
    rc.neutral = (retailConsensus as Record<string, unknown>).neutral ?? rc.neutral;
  }

  return NextResponse.json({
    tool: "token-pick-signal",
    timestamp: new Date().toISOString(),
    chain,
    no_pick: isNoPick,
    ...result,
  });
}

export async function POST(req: NextRequest) {
  return proxyTool(req, ENDPOINT);
}
