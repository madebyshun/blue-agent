import { callVirtuals } from "@blueagent/core";

/** Pull JSON out of an LLM reply — models wrap it in fences and add preamble,
 *  so a raw JSON.parse on the whole string is a bug. */
function extractJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object in LLM response");
  return JSON.parse(text.slice(start, end + 1));
}

export default async function handler(req: Request): Promise<Response> {
  let body: { query?: string } = {};
  try {
    const text = await req.text();
    if (text.trim().startsWith("{")) body = JSON.parse(text);
  } catch {}

  const { query } = body;
  if (!query) {
    return Response.json({ error: "query is required" }, { status: 400 });
  }

  // `model` is left unset on purpose: it resolves from $VIRTUALS_MODEL, else the
  // package default. Hardcoding an id here is how a template goes stale.
  const raw = await callVirtuals({
    system: `You are a helpful AI tool. Answer the query and return JSON with { "result": string, "confidence": number (0-1) }.
If you do not have the data to answer, say so in "result" and return a low confidence —
never invent a number, a price, or a contract address to fill the gap.`,
    messages: [{ role: "user", content: query }],
    temperature: 0.3,
    maxTokens: 500,
  });

  try {
    const parsed = extractJsonObject(raw);
    return Response.json(parsed);
  } catch {
    // The model didn't return JSON. Hand back its text with no confidence score —
    // the old template asserted 0.8 here, a number nothing had measured.
    return Response.json({ result: raw, confidence: null, note: "model did not return JSON" });
  }
}
