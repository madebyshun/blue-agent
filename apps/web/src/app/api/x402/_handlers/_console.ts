/**
 * Shared helper for the 5 paid Console commands (idea / build / audit / ship / raise).
 * Each command is a thin handler that calls runConsoleCommand with its system
 * prompt; payment is handled upstream by /api/x402/[tool] (verify → run → settle).
 */
const BANKR_LLM = "https://llm.bankr.bot/v1/messages";

export const CONSOLE_SYSTEMS = {
  idea: `You are Blue Agent running the 'blue idea' command.
Turn the user's rough concept into a structured fundable brief:
1. Problem & insight
2. Why now, why Base
3. Target user & GTM
4. MVP scope (what's in / what's out)
5. Key risks and mitigations
6. 24-hour action plan
Be specific, actionable, and Base-native. No fluff.`,

  build: `You are Blue Agent running the 'blue build' command.
Generate a complete technical build plan:
1. Architecture overview
2. Tech stack with reasoning
3. Folder structure
4. Key integrations (Base, Bankr, x402, etc.)
5. Implementation steps in order
6. Test plan
Use real Base ecosystem tools. Never invent contract addresses.`,

  audit: `You are Blue Agent running the 'blue audit' command.
Perform a thorough security and product risk review:
1. Critical security issues (reentrancy, oracle, MEV, access control)
2. Product/logic risks
3. Base-specific risks (chain ID, USDC decimals, Coinbase Wallet compat)
4. Suggested fixes for each issue
5. Go / No-go recommendation
Be direct and specific. Flag anything that could cause loss of funds.`,

  ship: `You are Blue Agent running the 'blue ship' command.
Generate a complete deployment and launch checklist:
1. Pre-deploy checklist (tests, audits, env vars)
2. Deployment steps for Base mainnet
3. Verification steps (Basescan, contracts, APIs)
4. Release notes template
5. Post-launch monitoring plan
Be thorough. Cover what founders forget when they're excited to ship.`,

  raise: `You are Blue Agent running the 'blue raise' command.
Write a compelling fundraising narrative:
1. Market framing and why this wins
2. Traction and proof points
3. Why Base, why now
4. Team and unfair advantages
5. Ask, use of funds, milestones
6. Target investor profile
Be sharp and investor-ready. No generic startup speak.`,
} as const;

export type ConsoleCommand = keyof typeof CONSOLE_SYSTEMS;

export async function runConsoleCommand(
  command: ConsoleCommand,
  prompt: string
): Promise<Response> {
  if (!prompt?.trim()) {
    return Response.json({ error: "prompt is required" }, { status: 400 });
  }
  const apiKey = process.env.BANKR_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "BANKR_API_KEY not configured" }, { status: 500 });
  }
  try {
    const res = await fetch(BANKR_LLM, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        system: CONSOLE_SYSTEMS[command],
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1500,
      }),
      signal: AbortSignal.timeout(55_000),
    });
    if (!res.ok) {
      const errText = await res.text();
      return Response.json(
        { error: `Bankr LLM ${res.status}`, detail: errText.slice(0, 200) },
        { status: 502 }
      );
    }
    const data = (await res.json()) as { content?: { text: string }[] };
    const result = data.content?.[0]?.text ?? "";
    if (!result) {
      return Response.json({ error: "Empty LLM response" }, { status: 502 });
    }
    return Response.json({
      command,
      result,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return Response.json(
      { error: "Console command failed", message: (e as Error).message },
      { status: 502 }
    );
  }
}
