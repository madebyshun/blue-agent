/**
 * chat-finish-reason-test — a reply that ENDS for a reason other than "stop"
 * says so, and a long-form turn gets a long-form budget (api/chat/route.ts).
 *
 * Measured 2026-10-01 on the rebuild preview: `blue audit <repo>` came back as
 * a BLANK bubble three times. Fast's 768-token cap ended the stream with
 * `finish_reason: "length"` (179 visible characters, or none when a reasoning
 * model spent the budget thinking), and Sonnet 5 intermittently ended with
 * `finish_reason: "content_filter"` and no content. The relay ignored
 * finish_reason, so both read as an empty answer.
 *
 * Hermetic: KV cleared, every fetch stubbed.
 */
for (const k of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) delete process.env[k];
process.env.INTERNAL_SERVICE_KEY = "test-internal-key-not-a-secret";
process.env.NEXT_PUBLIC_APP_URL = "https://app.invalid";
process.env.VIRTUALS_API_KEY = "test-virtuals-key";

import { NextRequest } from "next/server";

let failures = 0;
function check(label: string, pass: boolean, detail = "") {
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures++;
}

let script: { content: string; finish: string } = { content: "", finish: "stop" };
let streamMaxTokens: number | null = null;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = input instanceof Request ? input.url : String(input);
  if (url.startsWith("https://compute.virtuals.io/")) {
    const body = JSON.parse(String(init?.body ?? "{}")) as { stream?: boolean; max_tokens?: number };
    if (!body.stream) {
      return Response.json({ choices: [{ finish_reason: "stop", message: { content: "" } }] });
    }
    streamMaxTokens = body.max_tokens ?? null;
    const chunks = [
      ...(script.content ? [{ choices: [{ delta: { content: script.content }, finish_reason: null }] }] : []),
      { choices: [{ delta: { content: "" }, finish_reason: script.finish }] },
    ];
    const sse = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n";
    return new Response(sse, { status: 200, headers: { "Content-Type": "text/event-stream" } });
  }
  if (url.startsWith("https://app.invalid/api/credits/")) return Response.json({ ok: true });
  if (url.includes("api.github.com")) return new Response("{}", { status: 404 });
  throw new Error(`network blocked in test: ${url}`);
}) as typeof fetch;

async function run(text: string, tier = "fast") {
  const { POST } = await import("../src/app/api/chat/route");
  const res = await POST(new NextRequest("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-blue-internal": "test-internal-key-not-a-secret", "x-blue-user": "0x3333333333333333333333333333333333333333" },
    body: JSON.stringify({ messages: [{ role: "user", content: text }], tier }),
  }));
  const ev = (await res.text()).split("\n").filter((l) => l.startsWith("data: ") && !l.includes("[DONE]"))
    .map((l) => { try { return JSON.parse(l.slice(6)) as { type?: string; delta?: { text?: string } }; } catch { return {}; } });
  return { ev, text: ev.map((e) => e.delta?.text ?? "").join(""), upstreamError: ev.some((e) => e.type === "upstream_error") };
}

(async () => {
  console.log("1. finish_reason length, partial content");
  script = { content: "Partial answer", finish: "length" };
  let r = await run("hello there");
  check("1.1 the partial content is kept", r.text.startsWith("Partial answer"));
  check("1.2 a cut-off note follows it", /length limit/.test(r.text), r.text);
  check("1.3 not reported as an upstream failure (content was delivered)", !r.upstreamError);

  console.log("2. finish_reason length, NO content (budget spent on reasoning)");
  script = { content: "", finish: "length" };
  r = await run("hello there");
  check("2.1 the bubble is not blank", /length budget/.test(r.text), r.text);
  check("2.2 flagged as no-output (refund path)", r.upstreamError);

  console.log("3. finish_reason content_filter, NO content");
  script = { content: "", finish: "content_filter" };
  r = await run("hello there");
  check("3.1 the user is told the provider's filter declined it", /filter declined/.test(r.text), r.text);
  check("3.2 flagged as no-output (refund path)", r.upstreamError);

  console.log("4. a normal stop adds nothing");
  script = { content: "All good.", finish: "stop" };
  r = await run("hello there");
  check("4.1 text is exactly the content", r.text === "All good.", r.text);

  console.log("5. long-form budget");
  script = { content: "x", finish: "stop" };
  await run("hello there");
  const short = streamMaxTokens;
  await run("blue audit a vault contract");
  const long = streamMaxTokens;
  check("5.1 a short question keeps the preset's cap", short === 768, String(short));
  check("5.2 a founder command gets the long-form budget", (long ?? 0) >= 4096, String(long));

  console.log(failures === 0 ? "\nchat-finish-reason-test: PASS" : `\nchat-finish-reason-test: FAIL — ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
})();
