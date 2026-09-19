import { CONFIG_FILE, VIRTUALS_BASE_URL, VIRTUALS_DEFAULT_MODEL, loadApiKey } from "@blueagent/core";
import { printError } from "../print";

/**
 * ⚠️ Until this rewrite `blue chat` POSTed to `https://llm.bankr.bot/v1/messages`
 * with a `BANKR_API_KEY` and three `claude-*` model ids. Bankr 403-banned this
 * project at the ACCOUNT level (2026-07-20, re-measured 2026-09-18), so the
 * command could not answer at all. It now speaks to Virtuals, which is
 * OpenAI-compatible: `/chat/completions`, `Authorization: Bearer`, `system` as
 * the first message, `choices[0].message.content`, `usage.prompt_tokens`.
 *
 * The old build also printed `Cost: ~$0.0042 USDC`, computed from a hard-coded
 * table of Anthropic list prices. That number is gone rather than re-derived:
 * we do not have a per-token price for the Virtuals gateway, and printing a
 * plausible-looking dollar figure we did not measure is exactly the failure this
 * repo forbids. Token counts below come from the API response and are real.
 */

const SYSTEM_PROMPT = `You are Blue Agent — the AI-native founder console for Base builders.
You help founders think through ideas, strategy, architecture, and execution on Base.
Be direct, specific, and builder-first. No filler. Focus on actionable insight.
Base chain only (chain ID 8453). Never suggest Ethereum mainnet.
If you do not have the data for a number or an address, say "insufficient data" —
never fill the gap with something that merely looks right.`;

interface ChatMessage { role: "user" | "assistant"; content: string }

async function callVirtualsChat(
  model: string,
  messages: ChatMessage[],
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  loadApiKey();
  const apiKey = process.env.VIRTUALS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "VIRTUALS_API_KEY is not set.\n" +
      `  Add it to ${CONFIG_FILE}:  virtuals_api_key = "your_key_here"\n` +
      "  Or export it:  export VIRTUALS_API_KEY=<your-key>\n" +
      "  Check setup:   blue doctor"
    );
  }

  const res = await fetch(`${VIRTUALS_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      // OpenAI shape has no top-level `system` — it is the first message.
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      max_tokens: 2000,
      temperature: 0.6,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Virtuals LLM error ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const text = data.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) {
    throw new Error("Invalid response from Virtuals — no choices[0].message.content");
  }

  return {
    text,
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  };
}

/** Token counts as reported by the gateway. Empty when it reported none — a
 *  missing count prints nothing rather than a zero that reads as "free". */
function formatUsage(inputTokens: number, outputTokens: number): string {
  if (!inputTokens && !outputTokens) return "";
  return `${inputTokens} in · ${outputTokens} out tokens`;
}

// Stream text to stdout word-by-word (the gateway returns a full response, not SSE)
async function streamToStdout(text: string): Promise<void> {
  const words = text.split(/(\s+)/);
  for (const chunk of words) {
    process.stdout.write(chunk);
    if (chunk.trim()) {
      await new Promise((r) => setTimeout(r, 6));
    }
  }
}

export async function runChat(
  prompt: string | undefined,
  opts: { model?: string } = {}
) {
  // One resolution order, same as every other Virtuals caller in the repo:
  // explicit flag → VIRTUALS_MODEL → the package default.
  const model = opts.model?.trim() || process.env.VIRTUALS_MODEL?.trim() || VIRTUALS_DEFAULT_MODEL;

  const line = "─".repeat(52);

  // Single-prompt mode: blue chat "your question"
  if (prompt?.trim()) {
    process.stdout.write(`\n${line}\n  💬 blue chat  (${model})\n${line}\n\n`);

    try {
      const { text, inputTokens, outputTokens } = await callVirtualsChat(model, [
        { role: "user", content: prompt.trim() },
      ]);

      await streamToStdout(text);
      process.stdout.write("\n");

      const usage = formatUsage(inputTokens, outputTokens);
      process.stdout.write(`\n${line}\n`);
      process.stdout.write(`  Model: ${model}${usage ? `  ·  ${usage}` : ""}\n\n`);
    } catch (err) {
      printError(err instanceof Error ? err.message : String(err));
    }
    return;
  }

  // Interactive REPL mode
  if (!process.stdin.isTTY) {
    // piped input: read all, send as single message
    const chunks: string[] = [];
    process.stdin.setEncoding("utf8");
    for await (const chunk of process.stdin) chunks.push(chunk as string);
    const piped = chunks.join("").trim();
    if (piped) {
      await runChat(piped, opts);
      return;
    }
  }

  // Full interactive REPL
  const { createInterface } = await import("readline");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const history: ChatMessage[] = [];

  process.stdout.write(`\n${line}\n  💬 blue chat  (${model})\n${line}\n`);
  process.stdout.write(`  Type your message. Ctrl+C or empty line to exit.\n${line}\n\n`);

  const ask = (): Promise<string> =>
    new Promise((resolve) => rl.question("  >> ", (ans) => resolve(ans)));

  try {
    while (true) {
      const input = await ask();
      if (!input.trim()) break;

      history.push({ role: "user", content: input.trim() });

      process.stdout.write("\n");

      try {
        const { text, inputTokens, outputTokens } = await callVirtualsChat(model, history);

        await streamToStdout(text);
        process.stdout.write("\n\n");

        const usage = formatUsage(inputTokens, outputTokens);
        if (usage) {
          process.stdout.write(`  ${line.slice(0, 40)}\n`);
          process.stdout.write(`  ${usage}\n\n`);
        }

        history.push({ role: "assistant", content: text });
      } catch (err) {
        process.stderr.write(`\n  [blue] Error: ${err instanceof Error ? err.message : String(err)}\n\n`);
        history.pop(); // remove the failed user message so context stays clean
      }
    }
  } finally {
    rl.close();
    process.stdout.write(`\n${line}\n  Session ended.\n${line}\n\n`);
  }
}
