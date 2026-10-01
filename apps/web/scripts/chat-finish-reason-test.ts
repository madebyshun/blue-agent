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
 * Also (review 2026-10-01): the stream timeout is a FIRST-BYTE / IDLE one — a
 * long answer that keeps streaming finishes, a stall mid-answer ends with a
 * "timed out" note instead of a silent cut — and a no-output turn writes its
 * `upstream_error` BEFORE the one terminal `[DONE]` (the client stops reading
 * at the first `[DONE]`, so a forwarded upstream `[DONE]` hid the refund signal).
 *
 * Hermetic: KV cleared, every fetch stubbed.
 */
for (const k of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) delete process.env[k];
process.env.INTERNAL_SERVICE_KEY = "test-internal-key-not-a-secret";
process.env.NEXT_PUBLIC_APP_URL = "https://app.invalid";
process.env.VIRTUALS_API_KEY = "test-virtuals-key";
// Idle timeout shortened so the stall cases run in well under a second.
process.env.CHAT_STREAM_IDLE_MS = "300";

import { NextRequest } from "next/server";

let failures = 0;
function check(label: string, pass: boolean, detail = "") {
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures++;
}

// mode "normal": one SSE body. "stall": `content` (if any) then silence until
// the request's signal aborts. "slow": `content` in 4-char chunks 120ms
// apart — longer in total than the 300ms idle timeout, never idle that long.
let script: { content: string; finish: string; mode?: "normal" | "stall" | "slow" } = { content: "", finish: "stop" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
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
    if (!script.mode || script.mode === "normal") {
      return new Response(sse, { status: 200, headers: { "Content-Type": "text/event-stream" } });
    }
    const signal = init?.signal ?? undefined;
    const enc = new TextEncoder();
    const mode = script.mode;
    const content = script.content;
    const line = (c: string, fin: string | null = null) =>
      enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: c }, finish_reason: fin }] })}\n\n`);
    const stream = new ReadableStream<Uint8Array>({
      async start(c) {
        signal?.addEventListener("abort", () => { try { c.error(signal.reason ?? new Error("aborted")); } catch { /* closed */ } });
        if (mode === "stall") {
          if (content) c.enqueue(line(content));
          return; // …and never another byte
        }
        for (const part of content.match(/[\s\S]{1,4}/g) ?? []) {
          await sleep(120);
          if (signal?.aborted) return;
          c.enqueue(line(part));
        }
        c.enqueue(line("", "stop"));
        c.enqueue(enc.encode("data: [DONE]\n\n"));
        c.close();
      },
    });
    return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
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
  const dataLines = (await res.text()).split("\n").filter((l) => l.startsWith("data: "));
  const isDone = (l: string) => l.trim() === "data: [DONE]";
  const parse = (l: string) => { try { return JSON.parse(l.slice(6)) as { type?: string; delta?: { text?: string } }; } catch { return {}; } };
  const ev = dataLines.filter((l) => !isDone(l)).map(parse);
  // What the CLIENT acts on: it stops reading at the first [DONE].
  const firstDone = dataLines.findIndex(isDone);
  const seen = (firstDone === -1 ? dataLines : dataLines.slice(0, firstDone)).map(parse);
  return {
    ev, text: ev.map((e) => e.delta?.text ?? "").join(""), upstreamError: ev.some((e) => e.type === "upstream_error"),
    doneCount: dataLines.filter(isDone).length,
    doneIsLast: dataLines.length > 0 && isDone(dataLines[dataLines.length - 1]),
    clientSeesUpstreamError: seen.some((e) => e.type === "upstream_error"),
  };
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

  console.log("3b. a clean stop with NO content");
  script = { content: "", finish: "stop" };
  r = await run("ell my NVDA");
  check("3b.1 the bubble is not blank", /empty answer/.test(r.text), r.text);
  check("3b.2 flagged as no-output (refund path)", r.upstreamError);
  check("3b.3 the client sees upstream_error BEFORE it stops at [DONE]", r.clientSeesUpstreamError);
  check("3b.4 exactly one [DONE], and it is the last line", r.doneCount === 1 && r.doneIsLast, String(r.doneCount));

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
  check("5.1 a short question keeps the preset's cap", short === 1536, String(short));
  check("5.2 a founder command gets the long-form budget", (long ?? 0) >= 4096, String(long));

  console.log("6. a stall MID-answer ends with a timed-out note (idle timeout, not total)");
  script = { content: "The first half of a long audit", finish: "stop", mode: "stall" };
  r = await run("hello there");
  check("6.1 the partial content is kept", r.text.startsWith("The first half of a long audit"), r.text);
  check("6.2 a 'timed out — cut here' note follows it", /Timed out — the answer was cut here/.test(r.text), r.text);
  check("6.3 not reported as an upstream failure (content was delivered)", !r.upstreamError);
  check("6.4 one terminal [DONE]", r.doneCount === 1 && r.doneIsLast, String(r.doneCount));

  console.log("7. a stall before ANY content is a refunded no-output turn");
  script = { content: "", finish: "stop", mode: "stall" };
  r = await run("hello there");
  check("7.1 the user is told it timed out", /timed out before writing an answer/.test(r.text), r.text);
  check("7.2 flagged as no-output (refund path), seen by the client", r.upstreamError && r.clientSeesUpstreamError);

  console.log("8. a slow but steady stream longer than the idle timeout finishes");
  script = { content: "abcdefghijklmnopqrst", finish: "stop", mode: "slow" };
  r = await run("hello there");
  check("8.1 the whole answer arrives (5 chunks x 120ms > 300ms idle)", r.text === "abcdefghijklmnopqrst", r.text);
  check("8.2 with no timeout note", !/Timed out/.test(r.text));

  console.log(failures === 0 ? "\nchat-finish-reason-test: PASS" : `\nchat-finish-reason-test: FAIL — ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
})();
