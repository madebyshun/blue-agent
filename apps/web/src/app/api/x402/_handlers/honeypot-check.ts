// x402/honeypot-check
// Honeypot token detection — checks if a token can be bought but not sold on Base
// Price: $0.10 — verdict: SAFE / HONEYPOT / SUSPICIOUS

type Msg = { role: string; content: string };

async function llm(system: string, user: string, temp = 0.2, tokens = 600): Promise<string> {
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

// Does this address have contract bytecode? An EOA (normal wallet) returns
// "0x" — there is no token there to honeypot-check. Returns null if the RPC
// can't be reached (caller then degrades to the full analysis).
const BASE_RPC = "https://mainnet.base.org";
async function hasContractCode(address: string): Promise<boolean | null> {
  try {
    const r = await fetch(BASE_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getCode", params: [address, "latest"] }),
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return null;
    const d = await r.json() as { result?: string };
    if (typeof d.result !== "string") return null;
    return d.result.replace(/^0x/, "").length > 0; // ""/"0" → EOA, longer → contract
  } catch { return null; }
}

function parseJson(t: string): Record<string, unknown> | null {
  let s = t.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  const i = s.indexOf("{"), j = s.lastIndexOf("}");
  if (i >= 0 && j > i) s = s.slice(i, j + 1);
  try { return JSON.parse(s); } catch {
    try { return JSON.parse(s.replace(/[\x00-\x1F\x7F]/g, " ")); } catch { return null; }
  }
}

// Fetch token info from Basescan
async function getTokenInfo(address: string): Promise<{
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  verified: boolean;
  contractName: string | null;
  raw: string;
}> {
  const apiKey = process.env.BASESCAN_API_KEY ?? "";
  const base = "https://api.basescan.org/api";
  const def = { name: null, symbol: null, decimals: null, verified: false, contractName: null, raw: "Basescan unavailable" };

  try {
    const [tokenRes, srcRes] = await Promise.all([
      fetch(`${base}?module=token&action=tokeninfo&contractaddress=${address}&apikey=${apiKey}`, { signal: AbortSignal.timeout(8000) }),
      fetch(`${base}?module=contract&action=getsourcecode&address=${address}&apikey=${apiKey}`, { signal: AbortSignal.timeout(8000) }),
    ]);

    let name: string | null = null, symbol: string | null = null, decimals: number | null = null;
    if (tokenRes.ok) {
      const td = await tokenRes.json() as { status: string; result?: { tokenName?: string; symbol?: string; divisor?: string }[] };
      if (td.status === "1" && td.result?.length) {
        name    = td.result[0].tokenName ?? null;
        symbol  = td.result[0].symbol ?? null;
        decimals = td.result[0].divisor ? parseInt(td.result[0].divisor) : null;
      }
    }

    let verified = false, contractName: string | null = null;
    if (srcRes.ok) {
      const sd = await srcRes.json() as { status: string; result?: { ContractName?: string; SourceCode?: string }[] };
      if (sd.status === "1" && sd.result?.length) {
        verified = !!sd.result[0].SourceCode && sd.result[0].SourceCode.length > 0;
        contractName = sd.result[0].ContractName ?? null;
      }
    }

    const raw = `Token: ${name ?? "unknown"} (${symbol ?? "???"}) | Verified: ${verified} | Contract: ${contractName ?? "unknown"}`;
    return { name, symbol, decimals, verified, contractName, raw };
  } catch {
    return def;
  }
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { token?: string; address?: string } = {};
    try {
      const t = await req.text();
      if (t?.trim().startsWith("{")) body = JSON.parse(t);
    } catch {}

    const url = new URL(req.url);
    const address = (body.token ?? body.address ?? url.searchParams.get("token") ?? url.searchParams.get("address") ?? "").trim();

    if (!address) {
      return Response.json({ error: "token address is required" }, { status: 400 });
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return Response.json({ error: "Invalid address format. Must be 0x + 40 hex chars." }, { status: 400 });
    }

    // Guard: an EOA (normal wallet) has no contract code — there is no token to
    // honeypot-check. Without this, the LLM reads "no metadata / unverified" as
    // honeypot red flags and returns a dangerous false "HONEYPOT" verdict on a
    // plain wallet. Short-circuit to a clean NOT_A_TOKEN result (and skip the
    // paid LLM calls). If the RPC is unreachable (null), fall through.
    const hasCode = await hasContractCode(address);
    if (hasCode === false) {
      return Response.json({
        tool: "honeypot-check",
        timestamp: new Date().toISOString(),
        address,
        chain: "base",
        chainId: 8453,
        token: { name: null, symbol: null, decimals: null, verified: false, url: `https://basescan.org/address/${address}` },
        verdict: "NOT_A_TOKEN",
        action: "N/A",
        confidence: 0,
        is_honeypot: false,
        sell_tax_estimate: "n/a",
        buy_tax_estimate: "n/a",
        red_flags: [],
        green_flags: [],
        honeypot_patterns: [],
        community: { alert: "none", known_rug: false, rug_patterns: [], signal: "" },
        assessment: "This address is an externally-owned account (EOA / normal wallet), not a token contract — there is nothing to honeypot-check. Pass a token CONTRACT address to scan a token.",
      });
    }

    // Fetch token info from Basescan
    const tokenInfo = await getTokenInfo(address);

    const tokenCtx = `
Token address: ${address} (Base mainnet, chain ID 8453)
${tokenInfo.raw}
Name: ${tokenInfo.name ?? "unknown"}
Symbol: ${tokenInfo.symbol ?? "unknown"}
Verified: ${tokenInfo.verified}
Contract name: ${tokenInfo.contractName ?? "unknown"}
`.trim();

    // Run Blue Agent honeypot analysis + MiroShark degen signal in parallel
    const [blueRaw, msRaw] = await Promise.all([
      llm(
        `You are Blue Agent — token security specialist for Base (chain ID 8453).
Analyze whether this token is a honeypot (buy works, sell blocked or taxed to 100%).
Key honeypot patterns: trading disabled post-launch, massive sell tax (>50%), blacklist abuse, ownership not renounced with dangerous functions, transfer() reverts on sell.
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "is_honeypot": <boolean>,
  "confidence": <0-100>,
  "sell_tax_estimate": "<0%|high|extreme|unknown>",
  "buy_tax_estimate": "<0%|low|high|unknown>",
  "red_flags": ["<flag>" or empty],
  "green_flags": ["<flag>" or empty],
  "honeypot_patterns": ["<pattern>" or empty],
  "assessment": "<2 sentences — is this safe to trade?>"
}`,
        tokenCtx,
        0.2,
        500
      ),
      llm(
        `You are MiroShark — degen intelligence on Base.
Give community signal on this token — is it a known rug/honeypot? Any red flags from the community? Known scam patterns?
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "community_alert": "none|watch|danger",
  "known_rug": <boolean>,
  "rug_patterns": ["<pattern>" or empty],
  "community_signal": "<1-2 sentences>"
}`,
        tokenCtx,
        0.3,
        300
      ),
    ]);

    const blue = parseJson(blueRaw) ?? {
      is_honeypot: false,
      confidence: 50,
      sell_tax_estimate: "unknown",
      buy_tax_estimate: "unknown",
      red_flags: tokenInfo.verified ? [] : ["source not verified on Basescan"],
      green_flags: tokenInfo.verified ? ["source verified on Basescan"] : [],
      honeypot_patterns: [],
      assessment: "Unable to fully analyze. Verify manually before trading.",
    };

    const ms = parseJson(msRaw) ?? {
      community_alert: "watch",
      known_rug: false,
      rug_patterns: [],
      community_signal: "No community data available.",
    };

    // Final verdict
    const isHoneypot   = blue.is_honeypot || ms.known_rug;
    const confidence   = (blue.confidence ?? 50) as number;
    const verdict      = isHoneypot ? "HONEYPOT" : confidence >= 70 ? "SAFE" : "SUSPICIOUS";
    const action       = verdict === "HONEYPOT" ? "DO_NOT_BUY" : verdict === "SUSPICIOUS" ? "DYOR" : "SAFE_TO_TRADE";

    return Response.json({
      tool: "honeypot-check",
      timestamp: new Date().toISOString(),
      address,
      chain: "base",
      chainId: 8453,
      token: {
        name: tokenInfo.name,
        symbol: tokenInfo.symbol,
        decimals: tokenInfo.decimals,
        verified: tokenInfo.verified,
        url: `https://basescan.org/address/${address}`,
      },
      verdict,
      action,
      confidence,
      is_honeypot: isHoneypot,
      sell_tax_estimate: blue.sell_tax_estimate ?? "unknown",
      buy_tax_estimate:  blue.buy_tax_estimate  ?? "unknown",
      red_flags:         blue.red_flags ?? [],
      green_flags:       blue.green_flags ?? [],
      honeypot_patterns: blue.honeypot_patterns ?? [],
      community: {
        alert:   ms.community_alert ?? "watch",
        known_rug: ms.known_rug ?? false,
        rug_patterns: ms.rug_patterns ?? [],
        signal:  ms.community_signal ?? "",
      },
      assessment: blue.assessment ?? "",
    });
  } catch (error) {
    console.error("[HoneypotCheck]", error);
    return Response.json(
      { error: "Honeypot check failed", message: (error as Error).message },
      { status: 500 }
    );
  }
}
