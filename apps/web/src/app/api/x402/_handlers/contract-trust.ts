// x402/contract-trust/index.ts
// Contract Trust — Basescan lookup + Blue security analysis + MiroShark community signal
// Price: $0.15 — SAFE / CAUTION / RED_FLAG verdict before swapping into a contract
// Fully self-contained — no external workspace imports

type Msg = { role: string; content: string };

async function llm(system: string, user: string, temp = 0.3, tokens = 800): Promise<string> {
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

// Basescan lookup — verification + source info
async function basescanLookup(address: string): Promise<{
  verified: boolean;
  contractName: string | null;
  compilerVersion: string | null;
  isProxy: boolean;
  implementationAddress: string | null;
  licenseType: string | null;
  raw: string;
}> {
  const apiKey = process.env.BASESCAN_API_KEY ?? "";
  const base = "https://api.basescan.org/api";

  const defaultResult = {
    verified: false,
    contractName: null,
    compilerVersion: null,
    isProxy: false,
    implementationAddress: null,
    licenseType: null,
    raw: "Basescan lookup unavailable",
  };

  try {
    const res = await fetch(
      `${base}?module=contract&action=getsourcecode&address=${address}&apikey=${apiKey}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return defaultResult;
    const data = await res.json() as {
      status: string;
      result?: {
        ContractName?: string;
        CompilerVersion?: string;
        Proxy?: string;
        Implementation?: string;
        LicenseType?: string;
        SourceCode?: string;
      }[];
    };
    if (data.status !== "1" || !data.result?.length) return defaultResult;
    const info = data.result[0];
    const verified = !!info.SourceCode && info.SourceCode.length > 0;
    return {
      verified,
      contractName: info.ContractName ?? null,
      compilerVersion: info.CompilerVersion ?? null,
      isProxy: info.Proxy === "1",
      implementationAddress: info.Implementation && info.Implementation !== "0x0000000000000000000000000000000000000000"
        ? info.Implementation
        : null,
      licenseType: info.LicenseType ?? null,
      raw: verified
        ? `Verified. Name: ${info.ContractName}. Compiler: ${info.CompilerVersion}. License: ${info.LicenseType ?? "none"}.${info.Proxy === "1" ? ` Proxy → ${info.Implementation}` : ""}`
        : "Source code not verified on Basescan.",
    };
  } catch {
    return defaultResult;
  }
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { address?: string; context?: string } = {};
    try {
      const t = await req.text();
      if (t?.trim().startsWith("{")) body = JSON.parse(t);
    } catch {}

    const url = new URL(req.url);
    const address = (body.address ?? url.searchParams.get("address") ?? "").trim();
    const context = body.context ?? url.searchParams.get("context") ?? "";

    if (!address) {
      return Response.json({ error: "address is required (Base mainnet contract address)" }, { status: 400 });
    }

    // Validate address format
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return Response.json({ error: "Invalid address format. Must be 0x + 40 hex chars." }, { status: 400 });
    }

    // Step 1: Basescan lookup (parallel with nothing for now, fast)
    const basescan = await basescanLookup(address);

    // Step 2 + 3: Blue security analysis + MiroShark community signal in parallel
    const contractCtx = `
Contract address: ${address} (Base mainnet, chain ID 8453)
Basescan: ${basescan.raw}
Contract name: ${basescan.contractName ?? "unknown"}
Verified: ${basescan.verified}
Proxy: ${basescan.isProxy ? `yes → ${basescan.implementationAddress}` : "no"}
${context ? `Additional context: ${context}` : ""}
`.trim();

    const [blueRaw, msRaw] = await Promise.all([
      // Blue Agent: security analysis
      llm(
        `You are Blue Agent — security specialist for Base (chain ID 8453).
Analyze a contract for trust signals before a user swaps or interacts with it.
Focus on: verification status, proxy risks, known attack patterns (reentrancy, owner backdoors, mint/burn abuse, fee manipulation, honeypot patterns, rugpull vectors).
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "security_score": <0-100>,
  "verified": <boolean>,
  "proxy_risk": "none|low|medium|high",
  "red_flags": ["<flag>" or empty],
  "green_flags": ["<flag>" or empty],
  "attack_vectors": ["<vector>" or empty],
  "known_pattern": "<ERC-20|ERC-721|LP|lending|bridge|unknown>",
  "blue_assessment": "<2-3 sentences — direct, no fluff>"
}`,
        contractCtx,
        0.2,
        700
      ),
      // MiroShark: community trust signal
      llm(
        `You are MiroShark — community intelligence persona on Base.
Assess community trust signals for this contract based on name, address, and context.
Consider: is this a known protocol? Is the contract name familiar? Any degen red flags? Community consensus?
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "community_trust": "high|medium|low|unknown",
  "recognition": "known_protocol|known_token|unknown|suspicious",
  "degen_flags": ["<flag>" or empty],
  "community_verdict": "<1-2 sentences>"
}`,
        contractCtx,
        0.3,
        400
      ),
    ]);

    const blue = parseJson(blueRaw) ?? {
      security_score: 50,
      verified: basescan.verified,
      proxy_risk: "unknown",
      red_flags: [],
      green_flags: basescan.verified ? ["source verified on Basescan"] : [],
      attack_vectors: [],
      known_pattern: "unknown",
      blue_assessment: "Analysis inconclusive. Proceed with caution.",
    };

    const ms = parseJson(msRaw) ?? {
      community_trust: "unknown",
      recognition: "unknown",
      degen_flags: [],
      community_verdict: "Community signal unavailable.",
    };

    // Step 4: Blue Agent final verdict synthesis
    const verdictRaw = await llm(
      `You are Blue Agent — final arbiter for contract trust on Base.
Given security analysis + community signal, issue a final verdict.
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "verdict": "SAFE|CAUTION|RED_FLAG",
  "confidence": <0-100>,
  "headline": "<one punchy verdict sentence>",
  "action": "PROCEED|PROCEED_WITH_CAUTION|ABORT",
  "summary": "<2-3 sentences — what matters, what to watch>",
  "checklist": ["<item to verify before interacting>"]
}

Rules:
- RED_FLAG if: security_score < 40, OR 2+ red_flags, OR proxy_risk=high, OR recognition=suspicious
- CAUTION if: not verified, OR proxy_risk=medium, OR community_trust=low
- SAFE if: verified + security_score >= 70 + no red_flags + known protocol`,
      `Address: ${address}
Blue security: ${JSON.stringify(blue)}
MiroShark community: ${JSON.stringify(ms)}
Basescan: ${basescan.raw}`,
      0.2,
      600
    );

    const verdict = parseJson(verdictRaw) ?? {
      verdict: "CAUTION",
      confidence: 50,
      headline: "Insufficient data — treat as unverified",
      action: "PROCEED_WITH_CAUTION",
      summary: "Could not fully analyze this contract. Verify on Basescan before interacting.",
      checklist: ["Check Basescan for source verification", "Confirm contract is not a honeypot"],
    };

    return Response.json({
      tool: "contract-trust",
      timestamp: new Date().toISOString(),
      address,
      chain: "base",
      chainId: 8453,
      basescan: {
        verified: basescan.verified,
        contractName: basescan.contractName,
        compilerVersion: basescan.compilerVersion,
        isProxy: basescan.isProxy,
        implementationAddress: basescan.implementationAddress,
        licenseType: basescan.licenseType,
        url: `https://basescan.org/address/${address}`,
      },
      security: {
        score: blue.security_score ?? 50,
        verified: blue.verified ?? basescan.verified,
        proxy_risk: blue.proxy_risk ?? "unknown",
        red_flags: blue.red_flags ?? [],
        green_flags: blue.green_flags ?? [],
        attack_vectors: blue.attack_vectors ?? [],
        known_pattern: blue.known_pattern ?? "unknown",
        assessment: blue.blue_assessment ?? "",
      },
      community: {
        trust: ms.community_trust ?? "unknown",
        recognition: ms.recognition ?? "unknown",
        degen_flags: ms.degen_flags ?? [],
        verdict: ms.community_verdict ?? "",
      },
      verdict: verdict.verdict ?? "CAUTION",
      confidence: verdict.confidence ?? 50,
      headline: verdict.headline ?? "",
      action: verdict.action ?? "PROCEED_WITH_CAUTION",
      summary: verdict.summary ?? "",
      checklist: verdict.checklist ?? [],
    });
  } catch (error) {
    console.error("[ContractTrust]", error);
    return Response.json(
      { error: "Contract trust check failed", message: (error as Error).message },
      { status: 500 }
    );
  }
}
