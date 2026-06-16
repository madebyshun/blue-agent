/**
 * Shared helper for the 5 paid Console commands (idea / build / audit / ship / raise).
 * Each command is a thin handler that calls runConsoleCommand with its system
 * prompt; payment is handled upstream by /api/x402/[tool] (verify → run → settle).
 */
import { CONSOLE_SYSTEMS, CONSOLE_MAX_TOKENS, CONSOLE_MODELS, groundConsolePrompt, type ConsoleCommand } from "@/lib/console-systems";
import { callVeniceLLM, NO_FABRICATION_RULE } from "@/app/api/_lib/llm";

const BANKR_LLM = "https://llm.bankr.bot/v1/messages";

export async function runConsoleCommand(
  command: ConsoleCommand,
  prompt: string,
  // idea/raise pass { webSearch: true } → Venice (live web search). build/ship/
  // audit stay on Bankr but get the no-fabrication rule.
  opts: { webSearch?: boolean } = {}
): Promise<Response> {
  if (!prompt?.trim()) {
    return Response.json({ error: "prompt is required" }, { status: 400 });
  }
  if (!opts.webSearch && !process.env.BANKR_API_KEY) {
    return Response.json({ error: "BANKR_API_KEY not configured" }, { status: 500 });
  }
  try {
    const grounded = await groundConsolePrompt(command, prompt);

    let result = "";
    if (opts.webSearch) {
      // Venice — real web search so any numbers are grounded, not invented.
      result = await callVeniceLLM({
        system: CONSOLE_SYSTEMS[command],
        user: grounded,
        maxTokens: CONSOLE_MAX_TOKENS[command],
      });
    } else {
      const res = await fetch(BANKR_LLM, {
        method: "POST",
        headers: {
          "x-api-key": process.env.BANKR_API_KEY!,
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: CONSOLE_MODELS[command],
          system: `${NO_FABRICATION_RULE}\n\n${CONSOLE_SYSTEMS[command]}`,
          messages: [{ role: "user", content: grounded }],
          max_tokens: CONSOLE_MAX_TOKENS[command],
        }),
        // Parent x402 [tool] route has maxDuration 120s; give the upstream call
        // room for audit (Sonnet + larger budget) without tripping a silent kill.
        signal: AbortSignal.timeout(100_000),
      });
      if (!res.ok) {
        const errText = await res.text();
        return Response.json(
          { error: `Bankr LLM ${res.status}`, detail: errText.slice(0, 200) },
          { status: 502 }
        );
      }
      const data = (await res.json()) as { content?: { text: string }[] };
      result = data.content?.[0]?.text ?? "";
    }

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
