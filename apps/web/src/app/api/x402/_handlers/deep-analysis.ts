// x402/deep-analysis
// Deep project/token analysis — comprehensive security + market + fundamentals on Base
// Price: $0.50 — full due diligence in one call

import { getTokenIdentity, tokenIdentityToPrompt } from "@/lib/onchain";

type Msg = { role: string; content: string };

async function llm(system: string, user: string, temp = 0.3, tokens = 1000): Promise<string> {
  const r = await fetch("https://llm.bankr.bot/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.LLM_API_KEY ?? process.env.BANKR_API_KEY ?? "",
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      system,
      messages: [{ role: "user", content: user }] as Msg[],
      temperature: temp,
      max_tokens: tokens,
    }),
  });
  if (!r.ok) throw new Error(`LLM ${r.status}: ${await r.text()}`);
  const d = await r.json() as { content?: { text: string }[] };
  return d.content?.[0]?.text ?? "";
}

function parseJson(t: string): Record<string, unknown> | null {
  let s = t.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  const i = s.indexOf("{"), j = s.lastIndexOf("}");
  if (i >= 0 && j > i) s = s.slice(i, j + 1);
  try { return JSON.parse(s); } catch {
    try { return JSON.parse(s.replace(/[\x00-\x1F\x7F]/g, " ")); } catch { return null; }
  }
}

// Combined Basescan lookup: contract info + token info
async function deepBasescanLookup(address: string): Promise<{
  isToken: boolean;
  tokenName: string | null;
  tokenSymbol: string | null;
  tokenDecimals: number | null;
  verified: boolean;
  contractName: string | null;
  compilerVersion: string | null;
  isProxy: boolean;
  implementationAddress: string | null;
  licenseType: string | null;
  raw: string;
}> {
  const apiKey = process.env.BASESCAN_API_KEY ?? "";
  const base = "https://api.etherscan.io/v2/api?chainid=8453";
  const def = {
    isToken: false, tokenName: null, tokenSymbol: null, tokenDecimals: null,
    verified: false, contractName: null, compilerVersion: null, isProxy: false,
    implementationAddress: null, licenseType: null, raw: "Basescan unavailable",
  };

  try {
    const [srcRes, tokenRes] = await Promise.all([
      fetch(`${base}&module=contract&action=getsourcecode&address=${address}&apikey=${apiKey}`, { signal: AbortSignal.timeout(8000) }),
      fetch(`${base}&module=token&action=tokeninfo&contractaddress=${address}&apikey=${apiKey}`,  { signal: AbortSignal.timeout(8000) }),
    ]);

    let verified = false, contractName: string | null = null,
        compilerVersion: string | null = null, isProxy = false,
        implementationAddress: string | null = null, licenseType: string | null = null;

    if (srcRes.ok) {
      const sd = await srcRes.json() as {
        status: string;
        result?: {
          ContractName?: string; CompilerVersion?: string; Proxy?: string;
          Implementation?: string; LicenseType?: string; SourceCode?: string;
        }[];
      };
      if (sd.status === "1" && sd.result?.length) {
        const info = sd.result[0];
        verified = !!info.SourceCode && info.SourceCode.length > 0;
        contractName    = info.ContractName ?? null;
        compilerVersion = info.CompilerVersion ?? null;
        isProxy         = info.Proxy === "1";
        implementationAddress = info.Implementation && info.Implementation !== "0x0000000000000000000000000000000000000000"
          ? info.Implementation : null;
        licenseType = info.LicenseType ?? null;
      }
    }

    let isToken = false, tokenName: string | null = null,
        tokenSymbol: string | null = null, tokenDecimals: number | null = null;
    if (tokenRes.ok) {
      const td = await tokenRes.json() as { status: string; result?: { tokenName?: string; symbol?: string; divisor?: string }[] };
      if (td.status === "1" && td.result?.length) {
        isToken     = true;
        tokenName   = td.result[0].tokenName ?? null;
        tokenSymbol = td.result[0].symbol ?? null;
        tokenDecimals = td.result[0].divisor ? parseInt(td.result[0].divisor) : null;
      }
    }

    const raw = [
      isToken ? `Token: ${tokenName} (${tokenSymbol})` : "Not a token / contract",
      `Verified: ${verified}`,
      verified ? `Contract: ${contractName}, Compiler: ${compilerVersion}, License: ${licenseType ?? "none"}` : "Source not verified",
      isProxy ? `Proxy → ${implementationAddress}` : "Not a proxy",
    ].join(" | ");

    return { isToken, tokenName, tokenSymbol, tokenDecimals, verified, contractName, compilerVersion, isProxy, implementationAddress, licenseType, raw };
  } catch {
    return def;
  }
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { token?: string; address?: string; context?: string } = {};
    try {
      const t = await req.text();
      if (t?.trim().startsWith("{")) body = JSON.parse(t);
    } catch {}

    const url = new URL(req.url);
    const address = (body.token ?? body.address ?? url.searchParams.get("token") ?? url.searchParams.get("address") ?? "").trim();
    const context = body.context ?? url.searchParams.get("context") ?? "";

    if (!address) {
      return Response.json({ error: "token/address is required (Base mainnet contract address)" }, { status: 400 });
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return Response.json({ error: "Invalid address format. Must be 0x + 40 hex chars." }, { status: 400 });
    }

    // Authoritative on-chain identity (eth_getCode + ERC-20 metadata + market)
    // runs alongside the Basescan verification/proxy lookup. The chain — not
    // Basescan — decides whether this is a contract or a token.
    const [identity, info] = await Promise.all([
      getTokenIdentity(address),
      deepBasescanLookup(address),
    ]);

    // EOA short-circuit: a plain wallet has no code to audit. Without this the
    // LLM reads "no metadata" as red flags and fabricates a BEARISH/AVOID 0/100
    // verdict on a normal wallet. Return an honest, neutral result instead.
    if (identity && identity.isContract === false) {
      return Response.json({
        tool: "deep-analysis",
        timestamp: new Date().toISOString(),
        address,
        chain: "base",
        chainId: 8453,
        token: { isToken: false, isContract: false, name: null, symbol: null, decimals: null, verified: false, contractName: null, isProxy: false, url: `https://basescan.org/address/${address}` },
        composite_score: null,
        verdict: "NOT_A_CONTRACT",
        action: "N/A",
        security:     { score: null, critical_risks: [], medium_risks: [], positive_signals: [], ownership_risk: "n/a", liquidity_risk: "n/a", audit_status: "n/a", summary: "This address is an externally-owned account (EOA / normal wallet), not a smart contract or token — there is no code to audit. For a wallet, use the wallet tools (PnL, AML, key-exposure) instead." },
        market:       { score: null, community_trust: "n/a", tokenomics_risk: "n/a", team_transparency: "n/a", narrative: "n/a", trading_signals: [], summary: "" },
        fundamentals: { score: null, holder_risk: "n/a", activity_level: "wallet", whale_concentration: "n/a", age_signal: "n/a", on_chain_signals: [], summary: "" },
      });
    }

    const onchain = identity ? tokenIdentityToPrompt(identity) : `Address: ${address} (Base, chain 8453). On-chain identity read unavailable — fall back to Basescan signals below; do NOT assume EOA.`;

    const ctx = `
GROUND TRUTH (from direct Base RPC reads — treat as authoritative, do NOT contradict): the on-chain section below is fact. If it says the address has bytecode, it IS a contract; never call it an "EOA" or "not a contract". Do NOT lower scores merely because Basescan source is unverified — that is common for legit tokens.

${onchain}

Basescan verification signals (supplementary — may lag or be empty for unverified / Uniswap-v4 tokens; absence is NOT proof the address is an EOA):
${info.raw}
Source verified on Basescan: ${info.verified}
Contract name: ${info.contractName ?? "unknown"}
Compiler: ${info.compilerVersion ?? "unknown"}
Proxy: ${info.isProxy ? `yes → ${info.implementationAddress}` : "no"}
${context ? `Additional context: ${context}` : ""}
`.trim();

    // 3-agent parallel deep analysis: Blue security + MiroShark market + Aeon fundamentals
    const [blueRaw, msRaw, aeonRaw] = await Promise.all([
      // Blue Agent: security deep dive
      llm(
        `You are Blue Agent — deep security analyst for Base (chain ID 8453).
Perform a comprehensive security analysis of this contract/token.
Cover: code quality signals, proxy risks, ownership/admin key risks, mint/burn abuse potential, liquidity lock status, transfer restrictions, known attack patterns.
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "security_score": <0-100>,
  "critical_risks": ["<risk>" or empty],
  "medium_risks": ["<risk>" or empty],
  "positive_signals": ["<signal>" or empty],
  "ownership_risk": "low|medium|high|unknown",
  "liquidity_risk": "low|medium|high|unknown",
  "audit_status": "audited|unaudited|unknown",
  "security_summary": "<3 sentences — key findings>"
}`,
        ctx,
        0.2,
        900
      ),
      // MiroShark: market + community signal
      llm(
        `You are MiroShark — market intelligence specialist for Base tokens.
Analyze market fundamentals and community signals for this token/contract.
Cover: trading activity patterns, community sentiment, social signals, tokenomics red flags, team transparency, narrative fit.
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "market_score": <0-100>,
  "community_trust": "high|medium|low|unknown",
  "tokenomics_risk": "low|medium|high|unknown",
  "team_transparency": "transparent|partial|anonymous|unknown",
  "narrative_alignment": "<DeFi|AI agent|meme|infra|gaming|other|unknown>",
  "trading_signals": ["<signal>" or empty],
  "market_summary": "<2-3 sentences — market outlook>"
}`,
        ctx,
        0.3,
        700
      ),
      // Aeon: fundamentals + on-chain activity
      llm(
        `You are Aeon — onchain fundamentals analyst for Base.
Assess the fundamental quality and on-chain activity of this contract/token.
Cover: holder distribution risks, transaction patterns, deployment age signals, contract activity, whale concentration, contract interactions.
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "fundamental_score": <0-100>,
  "holder_risk": "low|medium|high|unknown",
  "activity_level": "high|medium|low|inactive",
  "whale_concentration": "low|medium|high|unknown",
  "age_signal": "established|recent|very_new|unknown",
  "on_chain_signals": ["<signal>" or empty],
  "fundamentals_summary": "<2-3 sentences — on-chain health>"
}`,
        ctx,
        0.2,
        700
      ),
    ]);

    const blue = parseJson(blueRaw) ?? {
      security_score: 50,
      critical_risks: [],
      medium_risks: info.verified ? [] : ["source not verified on Basescan"],
      positive_signals: info.verified ? ["source verified on Basescan"] : [],
      ownership_risk: "unknown",
      liquidity_risk: "unknown",
      audit_status: "unknown",
      security_summary: "Security analysis inconclusive. Verify on Basescan.",
    };

    const ms = parseJson(msRaw) ?? {
      market_score: 50,
      community_trust: "unknown",
      tokenomics_risk: "unknown",
      team_transparency: "unknown",
      narrative_alignment: "unknown",
      trading_signals: [],
      market_summary: "Market data unavailable.",
    };

    const aeon = parseJson(aeonRaw) ?? {
      fundamental_score: 50,
      holder_risk: "unknown",
      activity_level: "unknown",
      whale_concentration: "unknown",
      age_signal: "unknown",
      on_chain_signals: [],
      fundamentals_summary: "On-chain data unavailable.",
    };

    // Composite score
    const secScore   = (blue.security_score ?? 50) as number;
    const mktScore   = (ms.market_score ?? 50) as number;
    const fundScore  = (aeon.fundamental_score ?? 50) as number;
    const composite  = Math.round((secScore * 0.4 + mktScore * 0.3 + fundScore * 0.3));

    const verdict  = composite >= 70 ? "BULLISH" : composite >= 45 ? "NEUTRAL" : "BEARISH";
    const action   = composite >= 70 ? "CONSIDER" : composite >= 45 ? "DYOR" : "AVOID";

    return Response.json({
      tool: "deep-analysis",
      timestamp: new Date().toISOString(),
      address,
      chain: "base",
      chainId: 8453,
      token: {
        isToken: identity?.isToken ?? info.isToken,
        isContract: identity?.isContract ?? true,
        name: identity?.name ?? info.tokenName,
        symbol: identity?.symbol ?? info.tokenSymbol,
        decimals: identity?.decimals ?? info.tokenDecimals,
        totalSupply: identity?.totalSupply ?? null,
        priceUsd: identity?.market?.priceUsd ?? null,
        liquidityUsd: identity?.market?.liquidityUsd ?? null,
        verified: info.verified,
        contractName: info.contractName,
        isProxy: info.isProxy,
        url: `https://basescan.org/address/${address}`,
      },
      composite_score: composite,
      verdict,
      action,
      security: {
        score:           secScore,
        critical_risks:  blue.critical_risks ?? [],
        medium_risks:    blue.medium_risks ?? [],
        positive_signals: blue.positive_signals ?? [],
        ownership_risk:  blue.ownership_risk ?? "unknown",
        liquidity_risk:  blue.liquidity_risk ?? "unknown",
        audit_status:    blue.audit_status ?? "unknown",
        summary:         blue.security_summary ?? "",
      },
      market: {
        score:             mktScore,
        community_trust:   ms.community_trust ?? "unknown",
        tokenomics_risk:   ms.tokenomics_risk ?? "unknown",
        team_transparency: ms.team_transparency ?? "unknown",
        narrative:         ms.narrative_alignment ?? "unknown",
        trading_signals:   ms.trading_signals ?? [],
        summary:           ms.market_summary ?? "",
      },
      fundamentals: {
        score:              fundScore,
        holder_risk:        aeon.holder_risk ?? "unknown",
        activity_level:     aeon.activity_level ?? "unknown",
        whale_concentration: aeon.whale_concentration ?? "unknown",
        age_signal:         aeon.age_signal ?? "unknown",
        on_chain_signals:   aeon.on_chain_signals ?? [],
        summary:            aeon.fundamentals_summary ?? "",
      },
    });
  } catch (error) {
    console.error("[DeepAnalysis]", error);
    return Response.json(
      { error: "Deep analysis failed", message: (error as Error).message },
      { status: 500 }
    );
  }
}
