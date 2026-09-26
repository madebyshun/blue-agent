/**
 * Control test for the reasoning-budget starvation fix in `api/_lib/llm.ts`.
 *
 * Run: `npx tsx scripts/llm-reasoning-budget-test.ts` from `apps/web/`.
 * Hermetic: `globalThis.fetch` is stubbed and the API key is a literal, so no
 * network, no keys, no KV (lib/kv falls back to an in-memory Map with no env).
 *
 * ── WHAT BROKE ──────────────────────────────────────────────────────────────
 *
 * `deepseek-deepseek-v4-flash` is a REASONING model: it spends tokens on a
 * hidden reasoning phase out of the SAME `max_tokens` pocket as the answer, and
 * never surfaces that spend in `message.content`. So a budget that looks ample
 * for the answer can be consumed entirely before the answer starts, and the
 * gateway returns `finish_reason: "length"` with `content: ""` — a 200 from the
 * provider that reaches the caller as a 500.
 *
 * MEASURED 2026-09-26 on `b20-analyze` (a $0.05 paid endpoint), 8 consecutive
 * calls through the real handler at the then-current budget: EVERY call hit
 * `finish_reason=length` with `completion_tokens` pinned at exactly the cap —
 * the model never once stopped on its own. Three returned 500. The 200s were
 * worse than the 500s: one served `content_len=9`, i.e. a paying caller was
 * charged and handed a nine-character "analysis". A status-code assertion
 * would have called that run a pass, which is why the live verification for
 * this fix asserted on payload contents and why the cases below assert on the
 * REQUEST BODY rather than on "it didn't throw".
 *
 * ── WHY A CONTROL TEST, NOT A UNIT TEST ─────────────────────────────────────
 *
 * "the retry recovers the text" would pass against a build that sends
 * `reasoning_effort: "none"` on EVERY call — which also fixes the symptom, and
 * silently disables reasoning on a reasoning model across ~48 paid analytical
 * call sites. That is a product decision, not a bug fix. Case A exists to fail
 * if anyone takes that shortcut: it pins that the happy path still sends the
 * minimal OpenAI-compat payload with no reasoning key at all.
 *
 * Likewise cases C and D pin the two ways an empty response is NOT worth
 * retrying. A retry that fires on those would burn a second paid round-trip to
 * produce the identical failure, and `semantic-smoke.ts` argues (correctly)
 * that a retry which hides a real degradation is worse than the red.
 *
 * ── THE NUMBERS THIS FILE PINS, AND WHERE THEY CAME FROM ────────────────────
 *
 * Reasoning measured UNCENSORED — at a budget nothing could exhaust, so the
 * figures are the model's real appetite rather than the cap it was pinned at
 * (production only ever reports `reasoning_tokens` on runs that FAILED, which
 * systematically understates the distribution):
 *
 *     b20-analyze      prompt      reasoning  584 … 2026
 *     builder-deep-dd  step 1      reasoning 1128 … 3454
 *     builder-deep-dd  step 2      reasoning 1714 … 4246   ← peak
 *     builder-deep-dd  step 3      reasoning 1281 … 3600
 *
 * Note the 3.8x spread on ONE fixed prompt (1128…4246): the same request can
 * want triple the reasoning run to run. No constant is safe forever, which is
 * exactly why the retry below exists as a backstop rather than as the fix.
 */
import { callVirtualsLLM, VIRTUALS_DEFAULT_MODEL } from "../src/app/api/_lib/llm";

/**
 * Peak reasoning observed across the four prompts above. Case F asserts the
 * headroom clears it — if a future edit trims the constant back toward the old
 * 1200, that assertion names the measurement it would be contradicting.
 */
const MEASURED_PEAK_REASONING = 4246;

/** Mirrors `MIN_MAX_TOKENS` in llm.ts — the floor applied to the caller's ask. */
const MIN_ANSWER_TOKENS = 400;

let failures = 0;
function check(label: string, pass: boolean, detail: string) {
  console.log(`${pass ? "  ✓" : "  ✗"} ${label} — ${detail}`);
  if (!pass) failures++;
}

// ── Gateway fixture ──────────────────────────────────────────────────────────

type WirePayload = {
  model: string;
  messages: { role: string; content: string }[];
  max_tokens: number;
  temperature: number;
  reasoning_effort?: string;
};

/** One `/v1/chat/completions` response in the gateway's real wire shape. */
function completion(o: {
  content?: string;
  finish?: string;
  reasoningTokens?: number;
  /** The gateway names the truncated chain-of-thought `reasoning`, not `reasoning_content`. */
  reasoningText?: string;
}) {
  return {
    choices: [
      {
        finish_reason: o.finish ?? "stop",
        message: { content: o.content ?? "", reasoning: o.reasoningText ?? "" },
      },
    ],
    usage: {
      prompt_tokens: 900,
      completion_tokens: 2000,
      total_tokens: 2900,
      completion_tokens_details: { reasoning_tokens: o.reasoningTokens ?? 0 },
    },
  };
}

/** Responses the stub will serve to successive completions calls, in order. */
let queue: { status: number; body: unknown }[] = [];
/** Request payloads the stub actually received, in order. */
let sent: WirePayload[] = [];

function serve(...responses: { status: number; body: unknown }[]) {
  queue = [...responses];
  sent = [];
}
const ok = (body: unknown) => ({ status: 200, body });

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  // Model-id pre-flight. Serving a catalog that contains the model keeps the
  // validation branch exercised rather than skipped via its fail-open path.
  if (url.includes("/v1/models")) {
    return new Response(JSON.stringify({ data: [{ id: VIRTUALS_DEFAULT_MODEL }] }), { status: 200 });
  }
  if (url.includes("/v1/chat/completions")) {
    sent.push(JSON.parse(String(init?.body)) as WirePayload);
    const next = queue.shift();
    if (!next) throw new Error(`unexpected extra completions call #${sent.length}`);
    return new Response(JSON.stringify(next.body), { status: next.status });
  }
  throw new Error(`unstubbed fetch: ${url}`);
}) as typeof fetch;

process.env.VIRTUALS_API_KEY = "test-key-not-a-secret";
delete process.env.VIRTUALS_MODEL;

const ask = (maxTokens?: number) =>
  callVirtualsLLM({ system: "sys", user: "usr", temperature: 0, maxTokens });

/**
 * Never let a call escape as an exception. Both outcomes are results here: a
 * case that expects a throw asserts on the message, and a case that expects
 * text gets an empty string it can fail on. An uncaught throw would abort the
 * whole run at the first broken case and hide every later diagnostic — which
 * is the opposite of what you want from the file you reach for when the fix
 * has regressed.
 */
async function settle(p: Promise<string>): Promise<{ text: string; error: string }> {
  try {
    return { text: await p, error: "" };
  } catch (e) {
    return { text: "", error: (e as Error).message };
  }
}

async function main() {
  console.log("\n=== llm.ts reasoning-budget + retry control test ===\n");

  // ── A. CONTROL: the happy path must stay a minimal payload ─────────────────
  // If this fails because `reasoning_effort` is present, someone has disabled
  // reasoning globally. That fixes the symptom and changes the product.
  console.log("A. CONTROL — content on the first try");
  serve(ok(completion({ content: "real answer", finish: "stop", reasoningTokens: 1400 })));
  {
    const { text, error } = await settle(ask(800));
    check("returns the content", text === "real answer", error || `got "${text}"`);
    check("exactly one round-trip", sent.length === 1, `calls=${sent.length}`);
    check(
      "no reasoning_effort on the happy path",
      !("reasoning_effort" in sent[0]),
      `keys=[${Object.keys(sent[0]).join(",")}]`,
    );
  }

  // ── B. THE FIX: starved once, recovered by switching MODE ──────────────────
  // Re-sending the identical request would be re-rolling the same dice; with
  // reasoning at 0 the whole budget reaches the answer (measured 12/12).
  console.log("\nB. starved by reasoning → one retry with reasoning_effort=none");
  serve(
    ok(completion({ content: "", finish: "length", reasoningTokens: 5200, reasoningText: "cut off mid-thou" })),
    ok(completion({ content: "recovered answer", finish: "stop", reasoningTokens: 0 })),
  );
  {
    const { text, error } = await settle(ask(800));
    check("recovers the answer", text === "recovered answer", error || `got "${text}"`);
    check("retried exactly once", sent.length === 2, `calls=${sent.length}`);
    check(
      "first attempt carried no reasoning key",
      !("reasoning_effort" in sent[0]),
      `keys=[${Object.keys(sent[0]).join(",")}]`,
    );
    check(
      "retry sets reasoning_effort=none",
      sent[1]?.reasoning_effort === "none",
      `reasoning_effort=${String(sent[1]?.reasoning_effort)}`,
    );
    // The retry must change the MODE and nothing else. A retry that also
    // reworded the prompt or moved the temperature would be answering a
    // different question than the one the caller paid for.
    const sameRequest =
      sent.length === 2 &&
      sent[1].model === sent[0].model &&
      sent[1].max_tokens === sent[0].max_tokens &&
      sent[1].temperature === sent[0].temperature &&
      JSON.stringify(sent[1].messages) === JSON.stringify(sent[0].messages);
    check("retry is the same request plus one key", sameRequest, `model/messages/temp/max_tokens identical`);
  }

  // ── C. CONTROL: ceiling hit with NO reasoning is a different bug ───────────
  // reasoning_tokens=0 means the answer alone overflowed. Sending it again with
  // reasoning already at 0 changes nothing, so retrying would spend a second
  // paid round-trip to reproduce the failure.
  console.log("\nC. CONTROL — finish=length but reasoning_tokens=0 (answer overflowed)");
  serve(ok(completion({ content: "", finish: "length", reasoningTokens: 0 })));
  {
    const { text, error: msg } = await settle(ask(800));
    check("no retry fired", sent.length === 1, `calls=${sent.length}`);
    check("throws rather than returning a partial answer", text === "", `text_len=${text.length}`);
    check(
      "blames the answer, not the headroom",
      msg.includes("cause=budget_exhausted_by_answer"),
      msg.slice(0, 120),
    );
  }

  // ── D. CONTROL: an empty 200 that did NOT hit the ceiling ──────────────────
  console.log("\nD. CONTROL — empty content with finish=stop (gateway gave nothing)");
  serve(ok(completion({ content: "", finish: "stop", reasoningTokens: 0 })));
  {
    const { text, error: msg } = await settle(ask(800));
    check("no retry fired", sent.length === 1, `calls=${sent.length}`);
    check("throws rather than returning a partial answer", text === "", `text_len=${text.length}`);
    check(
      "reported as a gateway no-content, not a budget problem",
      msg.includes("cause=gateway_returned_no_content"),
      msg.slice(0, 120),
    );
  }

  // ── E. Retry exhausted: one retry, not a loop, and both diagnostics kept ───
  console.log("\nE. starved twice — retries ONCE and surfaces both attempts");
  serve(
    ok(completion({ content: "", finish: "length", reasoningTokens: 5200 })),
    ok(completion({ content: "", finish: "length", reasoningTokens: 5300 })),
  );
  {
    const { text, error: msg } = await settle(ask(800));
    check("throws rather than returning a partial answer", text === "", `text_len=${text.length}`);
    check("stopped after one retry", sent.length === 2, `calls=${sent.length}`);
    check("names the retry", msg.includes("after reasoning-free retry"), msg.slice(0, 90));
    check("keeps the original diagnostic", msg.includes("first_attempt=["), msg.slice(0, 90));
    // scripts/semantic-smoke.ts greps for this exact substring to tell "our
    // budget is too small" apart from "the gateway is down". Renaming it turns
    // that monitor into a silent false negative.
    check(
      "preserves the substring semantic-smoke.ts greps for",
      msg.includes("cause=budget_exhausted_by_reasoning"),
      "cause=budget_exhausted_by_reasoning present",
    );
  }

  // ── F. THE REGRESSION GUARD: headroom is added on top of the caller's ask ──
  // The caller's maxTokens describes the ANSWER. The wire value must be that
  // plus headroom, or the reasoning phase eats the caller's budget again.
  console.log("\nF. wire max_tokens = caller's answer budget + reasoning headroom");
  const wireFor = async (asked?: number) => {
    serve(ok(completion({ content: "ok", finish: "stop" })));
    await settle(ask(asked));
    return sent[0]?.max_tokens ?? -1;
  };
  const w800 = await wireFor(800); // b20-analyze's real budget
  const headroom = w800 - 800;
  check(
    `headroom clears the measured peak (${MEASURED_PEAK_REASONING})`,
    headroom > MEASURED_PEAK_REASONING,
    `headroom=${headroom}`,
  );
  {
    const w1500 = await wireFor(1500); // builder-deep-dd's final synthesis
    const wDefault = await wireFor(undefined); // llm.ts defaults the answer to 1000
    const wTiny = await wireFor(50); // below the floor
    check("scales with the caller's ask", w1500 - 1500 === headroom, `1500 → ${w1500}`);
    check("default answer budget is 1000", wDefault - 1000 === headroom, `default → ${wDefault}`);
    check(
      `a tiny ask is floored at ${MIN_ANSWER_TOKENS} before headroom`,
      wTiny - MIN_ANSWER_TOKENS === headroom,
      `50 → ${wTiny}`,
    );
  }

  // ── G. CONTROL: an upstream 4xx is not a starvation, and is kept verbatim ──
  // The model-string bug survived 4 CI runs behind a generic "Virtuals 4xx".
  console.log("\nG. CONTROL — upstream 4xx propagates verbatim without a retry");
  serve({ status: 400, body: { error: { message: "Invalid model provided", type: "invalid_request_error" } } });
  {
    const { text, error: msg } = await settle(ask(800));
    check("throws rather than returning a partial answer", text === "", `text_len=${text.length}`);
    check("no retry on a transport error", sent.length === 1, `calls=${sent.length}`);
    check("upstream body preserved", msg.includes("Invalid model provided"), msg.slice(0, 120));
  }

  console.log(
    failures === 0
      ? "\n✓ all control assertions passed\n"
      : `\n✗ ${failures} assertion(s) failed\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("test harness error:", e);
  process.exit(1);
});
