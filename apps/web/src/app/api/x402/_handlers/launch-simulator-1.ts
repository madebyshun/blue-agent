// x402/launch-simulator-1 — Tier 1: Quick Signal ($0.10)
// Baseline ecosystem read + weighted sentiment pass + synthesis, then one
// verdict. NO market data (that's Tier 2).
//
// 🔴 This header said "3-agent verdict" until 2026-09-27. Aeon and MiroShark
// are retired (ShunTr) and every user-facing surface now says Blue Agent only.
// What did NOT change, on purpose:
//   • the `aeon` and `miroshark` keys in the response JSON below. That is the
//     paid response SHAPE — renaming it breaks existing callers with no
//     warning, so it is ShunTr's call, not a copy edit.
//   • the `You are MiroShark` system prefix, which api/_lib/llm.ts:99 matches
//     to inject collab/miroshark-blueagent.prompt.md. Drop the prefix and the
//     4-persona weighting quietly stops loading — the call still succeeds, so
//     nothing would fail loudly. That is exactly why it is flagged, not fixed.
// The steps are real. The word "agent" was the lie, and it has been removed
// from the catalog description; the internals are a separate decision.
//
// 🔴 2026-09-28 — "leave the shape alone" was read for a day as "leave the
// CONTENTS alone", and that is the mistake this note exists to stop repeating.
// The key NAMES are a compatibility question and still ShunTr's. What was
// inside them was not a naming question at all: with no feed present the schema
// still demanded `ecosystem_health`, and a missing sentiment pass let invented
// percentages through under `status:"simulated"`. Both are now written in code
// on every path (see the block after the retry loop). Names untouched, sub-field
// names untouched, so no caller can break — only the values got honest.
// MEASURED the same day: nothing outside this directory reads `.aeon` or
// `.miroshark`, and no doc promises either, so "breaks existing callers" is a
// claim about EXTERNAL callers only and has never been tested. Recorded because
// it is the stated reason for a deferral, and an untested reason ages into a
// fact if nobody writes down which half was measured.
import { getAeonOutput, formatAeonForLLM, AEON_NONE_PROMPT, aeonStatus } from "@/app/api/_lib/aeon-kv";
import { callLLM } from "@/app/api/_lib/llm";

type BankrMessage = { role: string; content: string };

// Bankr LLM (llm.bankr.bot) was 403-banned 2026-07-20 → route this local
// helper through callLLM (Virtuals). The original 0.7 temperature default is
// preserved.
//
// The `model?: string` param is gone: it was never forwarded to callLLM, so the
// `"claude-haiku-4-5"` both call sites passed was decoration — and it read like
// a live model choice. Tier 2 and Tier 3 have the same-looking shim but DO
// forward, so there the identical string threw on every call. Same code, two
// behaviours: keep the param absent here so the two files cannot be "made
// consistent" by reintroducing it.
async function callBankrLLM(opts: {
  system: string; messages: BankrMessage[];
  temperature?: number; maxTokens?: number;
}): Promise<string> {
  return (await callLLM({
    system: opts.system,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.7,
    maxTokens: opts.maxTokens ?? 800,
  })).text;
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  let raw = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
  if (s >= 0 && e > s) raw = raw.slice(s, e + 1);
  try { return JSON.parse(raw); } catch {}
  try { return JSON.parse(raw.replace(/[\x00-\x1F\x7F]/g, " ")); } catch {}
  return null;
}

async function runAeonSkill(skill: string, _varInput = ""): Promise<string | null> {
  // Read REAL Aeon data from KV (research-loop cron + Aeon webhook).
  // KV miss → null; caller marks data unavailable. NEVER fetch GitHub SKILL.md
  // and ask the LLM to synthesize from training knowledge — that fabricates.
  try {
    const kv = await getAeonOutput(skill);
    return kv ? formatAeonForLLM(kv) : null;
  } catch {
    return null;
  }
}

type MiroSharkResult = {
  status: string; bull: number; bear: number; neutral: number;
  recommendation: string; sentiment_summary: string; personas?: unknown;
};

async function runMiroSharkSimulation(opts: {
  project: string; description: string; ticker: string;
  marketData?: Record<string, unknown>;
}): Promise<MiroSharkResult | null> {
  const { project, description, ticker, marketData } = opts;
  const marketSection = marketData?.available
    ? `\nMarket: price=$${marketData.priceUsd}, vol=$${marketData.volume24h}, liq=$${marketData.liquidityUsd}, 24h=${marketData.priceChange24h}%`
    : "";
  try {
    const raw = await callBankrLLM({
      system: `You are MiroShark — 4-persona crypto consensus engine.
Personas: Analyst(1.8x weight), Influencer(2.8x), Retail(1.0x), Observer(0.5x).
Each gives stance: bull/bear/neutral. Weighted consensus → bull%/bear%/neutral%.
Rule: bull>=55→go, bear>=55→skip, else→review_needed.
CRITICAL: Return ONLY raw JSON, no markdown.
Schema: {"personas":{"analyst":{"stance":"bull|bear|neutral","weight":1.8,"rationale":"<1 sentence>"},"influencer":{"stance":"...","weight":2.8,"rationale":"..."},"retail":{"stance":"...","weight":1.0,"rationale":"..."},"observer":{"stance":"...","weight":0.5,"rationale":"..."}},"bull":<0-100>,"bear":<0-100>,"neutral":<0-100>,"recommendation":"execute|review_needed|skip","sentiment_summary":"<1 sentence>"}`,
      messages: [{ role: "user", content: `Simulate for: ${project} (${ticker || "TBD"})\n${description}${marketSection}` }],
      temperature: 0.5,
      maxTokens: 800,
    });
    const r = extractJsonObject(raw) as MiroSharkResult | null;
    if (!r) return null;
    const bull = Math.round(r.bull ?? 0);
    const bear = Math.round(r.bear ?? 0);
    return { ...r, bull, bear, neutral: Math.max(0, 100 - bull - bear), status: "simulated" };
  } catch { return null; }
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { project?: string; description?: string; ticker?: string } = {};
    try { const t = await req.text(); if (t?.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    if (!body.project) {
      body.project = url.searchParams.get("project") ?? undefined;
      body.description = url.searchParams.get("description") ?? undefined;
      body.ticker = url.searchParams.get("ticker") ?? undefined;
    }

    const { project, description = "", ticker = "" } = body;
    const tier = 1;
    if (!project) return Response.json({ error: "project is required" }, { status: 400 });

    // Tier 1: one lightweight Aeon read (ecosystem digest). No market data, no contract.
    const digest = await runAeonSkill("digest", "Base ecosystem");
    const aeonParts = [
      digest && `### Aeon / digest\n${digest}`,
    ].filter(Boolean);
    const aeon = { available: aeonParts.length > 0, summary: aeonParts.join("\n\n") };

    const miroShark = await runMiroSharkSimulation({ project, description, ticker });

    const aeonSection = aeon.available ? `\n=== Aeon Ecosystem Signals ===\n${aeon.summary}` : "";
    const msSection = miroShark
      ? `\n=== MiroShark Consensus ===\nbull=${miroShark.bull}% bear=${miroShark.bear}% neutral=${miroShark.neutral}%\nrecommendation=${miroShark.recommendation}\nsentiment=${miroShark.sentiment_summary}`
      : "";

    // What the model is TOLD is present must match what is actually in the
    // message, and it must never be asked for a field it has no source for.
    // Until 2026-09-28 the next line asserted "MiroShark and Aeon results are in
    // the message" unconditionally while the schema DEMANDED an `aeon` object
    // containing `ecosystem_health` — so on any run where the feed was missing
    // the model had to invent one, and an invented "strong" is indistinguishable
    // from a measured one in the paid response.
    //   For THIS tier "missing" is not an edge case, it is the only state:
    //   `aeon:digest` has no writer anywhere in the repo. cron/research-loop
    //   writes only `deep-research`, and /api/aeon-feed needs a POST from Aeon
    //   (retired 2026-09-27) — "digest" is not even in its SKILL_PATTERNS.
    const sources = [
      aeon.available ? "Aeon ecosystem signals" : null,
      miroShark ? "the MiroShark sentiment consensus" : null,
    ].filter(Boolean) as string[];
    const sourceLine = sources.length
      ? `${sources.join(" and ")} ${sources.length > 1 ? "are" : "is"} in the message below; nothing else is available to you.`
      : `NEITHER the Aeon ecosystem feed NOR the MiroShark sentiment pass returned anything for this run. Judge from the project description alone and say so in your summary.`;
    const verdictRule = sources.length
      ? `final_verdict = your own judgement, weighted by ${sources.join(" and ")}.`
      : `final_verdict = your own judgement from the description alone — there is no second opinion to weigh.`;
    // Ask for the aeon block only when it can be grounded. When it cannot, the
    // block is still returned to the caller (shape is unchanged) but it is
    // written in code below, not by the model.
    const aeonSchema = aeon.available
      ? `"aeon":{"ecosystem_health":"strong|neutral|weak","narrative_fit":"<1 sentence>"},`
      : "";
    const msSchema = miroShark
      ? `"miroshark":{"bull":<copy>,"bear":<copy>,"neutral":<copy>,"recommendation":"<copy>","sentiment_summary":"<copy>"},`
      : "";

    const system = `You are Blue Agent — AI-native founder console for Base builders.
Run Launch Simulator Tier 1 (Quick Signal) — a fast, baseline pre-launch gut-check. NO market data (that is Tier 2). ${sourceLine}
CRITICAL: Return ONLY raw JSON. No markdown. Start with { end with }.
Schema: {"blue_agent":{"verdict":"LAUNCH|WAIT|ABORT","score":<0-100>,"summary":"<2 sentences>","strengths":["..","..."],"risks":["..","..."]},${aeonSchema}${msSchema}"final_verdict":"LAUNCH|WAIT|ABORT","confidence":<0-100>,"action_items":["..",".."]}
Rules: ${miroShark ? "copy miroshark values EXACTLY. " : ""}${verdictRule} Exactly 2 short action_items. Never invent a data source you were not given. Be direct, builder-first.`;

    const userMsg = `Project: ${project}\nTicker: ${ticker || "TBD"}\nDescription: ${description}${aeonSection}${msSection}`;

    let result: Record<string, unknown> | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const raw = await callBankrLLM({
          system,
          messages: [{ role: "user", content: userMsg }],
          temperature: attempt > 0 ? 0.1 : 0.4,
          maxTokens: 1200,
        });
        result = extractJsonObject(raw);
        if (result?.final_verdict) break;
      } catch (e) { if (attempt === 2) throw e; }
    }
    if (!result) result = { degraded: true, note: "Synthesis briefly unavailable - please retry." };

    // Both blocks are written HERE, never accepted from the model, and both are
    // written on every path — including the degraded one. `status` is provenance:
    // a fact about our infrastructure, not an opinion the model is entitled to
    // hold. Two bugs this replaces, both live until 2026-09-28:
    //   • `if (miroShark && result.miroshark …)` — when the sentiment sub-call
    //     returned null the guard fell through, so the bull/bear/neutral the
    //     SYNTHESIS model had made up (it was handed no MiroShark section at all)
    //     shipped to the buyer stamped `status:"simulated"`. Invented percentages
    //     wearing a provenance label is the worst shape this can fail in.
    //   • aeon fell back to `status:"simulated"` when the feed was missing.
    //     Nothing was simulated — the KV read returned null and no call ran.
    //     "unavailable" is the true word; per CLAUDE.md missing data is
    //     "unknown", never a value inferred from absence.
    if (miroShark) {
      const ms = (typeof result.miroshark === "object" && result.miroshark)
        ? result.miroshark as Record<string, unknown> : {};
      ms.bull = miroShark.bull; ms.bear = miroShark.bear; ms.neutral = miroShark.neutral;
      ms.recommendation = miroShark.recommendation; ms.sentiment_summary = miroShark.sentiment_summary;
      ms.status = "simulated";
      if (miroShark.personas) ms.personas = miroShark.personas;
      result.miroshark = ms;
    } else {
      result.miroshark = {
        status: "unavailable", bull: null, bear: null, neutral: null,
        recommendation: "unknown",
        sentiment_summary: "The sentiment pass returned no usable result on this run; no consensus was produced.",
      };
    }
    if (aeon.available) {
      const a = (typeof result.aeon === "object" && result.aeon)
        ? result.aeon as Record<string, unknown> : {};
      a.status = "live";
      result.aeon = a;
    } else {
      result.aeon = {
        status: "unavailable", ecosystem_health: "unknown",
        narrative_fit: "No ecosystem feed was available for this run, so nothing here is derived from ecosystem data.",
      };
    }

    return Response.json({
      tier, project, ticker: ticker || null,
      aeon_data: aeonStatus({ "digest": digest }),
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (error) {
    console.error("[LaunchSimulator1]", error);
    return Response.json({ error: "Launch simulation failed", message: (error as Error).message }, { status: 500 });
  }
}
