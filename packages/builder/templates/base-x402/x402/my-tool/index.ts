import { callBankrLLM, extractJsonObject } from "@blue-agent/bankr";

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

  const raw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are a helpful AI tool. Answer the query and return JSON with { "result": string, "confidence": number (0-1) }.`,
    messages: [{ role: "user", content: query }],
    temperature: 0.3,
    maxTokens: 500,
  });

  try {
    const parsed = extractJsonObject(raw);
    return Response.json(parsed);
  } catch {
    return Response.json({ result: raw, confidence: 0.8 });
  }
}
