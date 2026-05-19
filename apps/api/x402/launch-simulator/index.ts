// x402/launch-simulator/index.ts
// Launch Simulator — 3-agent pre-launch intelligence
// Tier 1: $0.10 · Tier 2: $0.35 · Tier 3: $0.50
// Fully self-contained — no external workspace imports

// ── Bankr LLM client (inlined) ────────────────────────────────────────────────

type BankrMessage = { role: string; content: string };

async function callBankrLLM(opts: {
  model?: string;
  system: string;
  messages: BankrMessage[];
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const res = await fetch("https://llm.bankr.bot/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.LLM_API_KEY ?? process.env.BANKR_API_KEY ?? "",
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: opts.model ?? "claude-haiku-4-5",
      system: opts.system,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 800,
    }),
  });
  if (!res.ok) throw new Error(`Bankr LLM ${res.status}: ${await res.text()}`);
  const d = await res.json() as { content?: { text: string }[]; text?: string };
  if (d.content?.length) return d.content[0].text;
  if (d.text) return d.text;
  throw new Error("Invalid Bankr LLM response");
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  let raw = text.trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "");
  const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
  if (s >= 0 && e > s) raw = raw.slice(s, e + 1);
  try { return JSON.parse(raw); } catch {}
  let cleaned = "", inStr = false, esc = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (esc) { cleaned += ch; esc = false; continue; }
    if (ch === "\\") { cleaned += ch; esc = true; continue; }
    if (ch === '"') {
      if (!inStr) { inStr = true; cleaned += ch; continue; }
      let j = i + 1;
      while (j < raw.length && (raw[j] === " " || raw[j] === "\t")) j++;
      const nx = raw[j] ?? "";
      if (nx === "," || nx === "}" || nx === "]" || nx === "\n" || nx === "\r" || nx === "") {
        inStr = false; cleaned += ch;
      } else { cleaned += '\\"'; }
      continue;
    }
    if (inStr) {
      if (ch === "\n") { cleaned += "\\n"; continue; }
      if (ch === "\r") { cleaned += "\\r"; continue; }
      if (ch === "\t") { cleaned += "\\t"; continue; }
    }
    cleaned += ch;
  }
  try { return JSON.parse(cleaned); } catch {}
  return JSON.parse(raw.replace(/[\x00-\x1F\x7F]/g, " "));
}

// ── Aeon (inlined) ────────────────────────────────────────────────────────────

async function fetchSkillPrompt(skill: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://raw.githubusercontent.com/aaronjmars/aeon/main/skills/${skill}/SKILL.md`,
      { signal: AbortSignal.timeout(6000) }
    );
    return res.ok ? await res.text() : null;
  } catch { return null; }
}

async function runAeonSkill(skill: string, varInput = ""): Promise<string | null> {
  const skillPrompt = await fetchSkillPrompt(skill);
  if (!skillPrompt) return null;
  const today = new Date().toISOString().split("T")[0];
  const varLine = varInput ? `\nUse this variable: var=${varInput}` : "";
  try {
    return await callBankrLLM({
      model: "claude-haiku-4-5",
      system: `You are Aeon — an autonomous intelligence agent running in offline/knowledge mode. Synthesize ecosystem intelligence from training knowledge. Be specific, data-driven, actionable. Today is ${today}.`,
      messages: [{ role: "user", content: `Use the skill template as a guide. Generate output from training knowledge — do NOT say APIs are unavailable. Produce concrete, realistic signals.\n\nSkill template:\n${skillPrompt}${varLine}\n\nReturn only the skill output, no meta-commentary.` }],
      temperature: 0.2,
      maxTokens: 1200,
    });
  } catch { return null; }
}

async function fetchAeonEcosystemData(ticker = ""): Promise<{ available: boolean; summary: string }> {
  const [tokenMovers, digest] = await Promise.all([
    runAeonSkill("token-movers", ticker || "Base ecosystem"),
    runAeonSkill("digest", "Base ecosystem builders launch"),
  ]);
  const parts = [tokenMovers && `### Aeon / token-movers\n${tokenMovers}`, digest && `### Aeon / digest\n${digest}`].filter(Boolean);
  return { available: parts.length > 0, summary: parts.join("\n\n") };
}

// ── MiroShark (inlined) ───────────────────────────────────────────────────────

type MiroSharkResult = {
  status: string; bull: number; bear: number; neutral: number;
  recommendation: string; sentiment_summary: string;
  personas?: unknown;
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
      model: "claude-haiku-4-5",
      system: `You are MiroShark — 4-persona crypto consensus engine.
Personas: Analyst(1.8x weight), Influencer(2.8x), Retail(1.0x), Observer(0.5x).
Each gives stance: bull/bear/neutral. Weighted consensus → bull%/bear%/neutral%.
Rule: bull>=55→execute, bear>=55→skip, else→alert_human.
CRITICAL: Return ONLY raw JSON, no markdown.
Schema: {"personas":{"analyst":{"stance":"bull|bear|neutral","weight":1.8,"rationale":"<1 sentence>"},"influencer":{"stance":"...","weight":2.8,"rationale":"..."},"retail":{"stance":"...","weight":1.0,"rationale":"..."},"observer":{"stance":"...","weight":0.5,"rationale":"..."}},"bull":<0-100>,"bear":<0-100>,"neutral":<0-100>,"recommendation":"execute|alert_human|skip","sentiment_summary":"<1 sentence>"}`,
      messages: [{ role: "user", content: `Simulate for: ${project} (${ticker||"TBD"})\n${description}${marketSection}` }],
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

// ── DexScreener ───────────────────────────────────────────────────────────────

async function fetchDexScreener(contract: string): Promise<Record<string, unknown>> {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${contract}`, { signal: AbortSignal.timeout(6000) });
    const data = await res.json() as { pairs?: Array<Record<string, unknown>> };
    const pairs = (data.pairs ?? []).filter((p) => (p as { chainId?: string }).chainId === "base");
    if (!pairs.length) return { available: false };
    const pair = pairs.sort((a, b) =>
      (((b as { liquidity?: { usd?: number } }).liquidity?.usd) ?? 0) -
      (((a as { liquidity?: { usd?: number } }).liquidity?.usd) ?? 0)
    )[0] as Record<string, unknown> & { baseToken?: { name?: string; symbol?: string }; priceUsd?: string; volume?: { h24?: number }; liquidity?: { usd?: number }; priceChange?: { h24?: number }; txns?: { h24?: { buys?: number; sells?: number } }; fdv?: number; marketCap?: number; pairCreatedAt?: number };
    return {
      available: true, name: pair.baseToken?.name, symbol: pair.baseToken?.symbol,
      priceUsd: pair.priceUsd, volume24h: pair.volume?.h24, liquidityUsd: pair.liquidity?.usd,
      priceChange24h: pair.priceChange?.h24, buys24h: pair.txns?.h24?.buys, sells24h: pair.txns?.h24?.sells,
      fdv: pair.fdv, marketCap: pair.marketCap,
      pairAgeDays: pair.pairCreatedAt ? Math.round((Date.now() - pair.pairCreatedAt) / 86400000) : null,
    };
  } catch { return { available: false }; }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { project?: string; description?: string; ticker?: string; contract?: string; tier?: number } = {};
    try { const t = await req.text(); if (t?.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    if (!body.project) {
      body.project     = url.searchParams.get("project")     ?? undefined;
      body.description = url.searchParams.get("description") ?? undefined;
      body.ticker      = url.searchParams.get("ticker")      ?? undefined;
      body.contract    = url.searchParams.get("contract")    ?? undefined;
      body.tier        = Number(url.searchParams.get("tier") ?? "1") || 1;
    }

    const { project, description = "", ticker = "", contract = "" } = body;
    const tier = Math.min(Math.max(Number(body.tier ?? 1), 1), 3);
    if (!project) return Response.json({ error: "project is required" }, { status: 400 });

    let marketData: Record<string, unknown> = { available: false };
    if (tier >= 2 && contract) marketData = await fetchDexScreener(contract);

    const [aeon, miroShark] = await Promise.all([
      fetchAeonEcosystemData(ticker),
      runMiroSharkSimulation({ project, description, ticker, marketData }),
    ]);

    const tierCtx = tier === 1 ? "Quick Signal — baseline ecosystem read."
      : tier === 2 ? "Deep Signal — include live market data."
      : "Full Simulation — complete multi-agent report with risk matrix and timeline.";

    const marketSection = marketData.available
      ? `\n=== Live Market Data ===\n${JSON.stringify(marketData, null, 2)}`
      : tier >= 2 ? "\n=== Market Data === Not yet trading (pre-launch)" : "";

    const aeonSection = aeon.available ? `\n=== Aeon Ecosystem Signals (LIVE) ===\n${aeon.summary}` : "";
    const msSection = miroShark
      ? `\n=== MiroShark Consensus (SIMULATED) ===\nbull=${miroShark.bull}% bear=${miroShark.bear}% neutral=${miroShark.neutral}%\nrecommendation=${miroShark.recommendation}\nsentiment=${miroShark.sentiment_summary}`
      : "";

    const system = `You are Blue Agent — AI-native founder console for Base builders.
Run Launch Simulator. MiroShark and Aeon results are in the message. Provide Blue Agent analysis + final_verdict as weighted consensus.
Tier: ${tierCtx}
CRITICAL: Return ONLY raw JSON. No markdown. Start with { end with }.
Schema: {"blue_agent":{"verdict":"LAUNCH|WAIT|ABORT","score":<0-100>,"summary":"<2-3 sentences>","strengths":["..."],"risks":["..."]},"aeon":{"status":"live or simulated","ecosystem_health":"strong|neutral|weak","timing_score":<0-10>,"narrative_fit":"<1 sentence>","signals":["..."]},"miroshark":{"status":"simulated","bull":<copy>,"bear":<copy>,"neutral":<copy>,"recommendation":"<copy>","sentiment_summary":"<copy>"},"final_verdict":"LAUNCH|WAIT|ABORT","confidence":<0-100>,"action_items":["...","...","..."]${tier >= 3 ? `,"risk_matrix":{"market_timing":<0-10>,"community_readiness":<0-10>,"ecosystem_fit":<0-10>,"technical_readiness":<0-10>,"narrative_strength":<0-10>},"timeline_recommendation":"<text>"` : ""}}
Rules: copy miroshark values EXACTLY. final_verdict = weighted consensus of all 3 agents. Be direct, builder-first.`;

    const userMsg = `Project: ${project}\nTicker: ${ticker||"TBD"}\nDescription: ${description}${marketSection}${aeonSection}${msSection}`;

    let result: Record<string, unknown> | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const raw = await callBankrLLM({
          model: "claude-haiku-4-5", system,
          messages: [{ role: "user", content: userMsg }],
          temperature: attempt > 0 ? 0.1 : 0.4,
          maxTokens: tier >= 3 ? 2500 : tier === 2 ? 1800 : 1400,
        });
        result = extractJsonObject(raw);
        if (result?.final_verdict) break;
      } catch (e) { if (attempt === 2) throw e; }
    }
    if (!result) throw new Error("Failed to parse simulation result after 3 attempts");

    if (miroShark && result.miroshark && typeof result.miroshark === "object") {
      const ms = result.miroshark as Record<string, unknown>;
      ms.bull = miroShark.bull; ms.bear = miroShark.bear; ms.neutral = miroShark.neutral;
      ms.recommendation = miroShark.recommendation; ms.sentiment_summary = miroShark.sentiment_summary;
      ms.status = "simulated";
      if (miroShark.personas) ms.personas = miroShark.personas;
    }
    if (result.aeon && typeof result.aeon === "object") {
      (result.aeon as Record<string, unknown>).status = aeon.available ? "live" : "simulated";
    }

    return Response.json({
      tier, project, ticker: ticker || null, contract: contract || null,
      timestamp: new Date().toISOString(),
      ...(tier >= 2 && { market_data: marketData }),
      ...result,
    });
  } catch (error) {
    console.error("[LaunchSimulator]", error);
    return Response.json({ error: "Launch simulation failed", message: (error as Error).message }, { status: 500 });
  }
}
