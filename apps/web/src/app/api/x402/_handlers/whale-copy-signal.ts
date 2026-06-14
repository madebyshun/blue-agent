// x402/whale-copy-signal — copy-trade signal from REAL on-chain whale flow.
// Movements are pulled from Basescan (Etherscan v2, chainid 8453) token
// transfers for the given wallet/token. The LLM reads ONLY the real transfer
// list and produces a copy signal — it never invents a movement, a wallet
// count, a price, or a target. topMovements is built in code from on-chain
// data. Price: $0.35

type Msg = { role: string; content: string };

async function llm(system: string, user: string, temp = 0.3, tokens = 600): Promise<string> {
  const r = await fetch("https://llm.bankr.bot/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.LLM_API_KEY ?? process.env.BANKR_API_KEY ?? "", "Content-Type": "application/json", "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-haiku-4-5", system, messages: [{ role: "user", content: user }] as Msg[], temperature: temp, max_tokens: tokens }),
  });
  if (!r.ok) throw new Error(`LLM ${r.status}: ${await r.text()}`);
  const d = await r.json() as { content?: { text: string }[] };
  return d.content?.[0]?.text ?? "";
}

function parseJson(t: string): Record<string, unknown> | null {
  let s = t.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const i = s.indexOf("{"), j = s.lastIndexOf("}");
  if (i >= 0 && j > i) s = s.slice(i, j + 1);
  try { return JSON.parse(s); } catch { try { return JSON.parse(s.replace(/[\x00-\x1F]/g, " ")); } catch { return null; } }
}

type TokenTx = { value: string; tokenDecimal?: string; from?: string; to?: string; tokenSymbol: string; timeStamp: string };

async function getTokenTx(address: string, limit = 100): Promise<TokenTx[]> {
  const key = process.env.BASESCAN_API_KEY ?? "";
  try {
    const res = await fetch(
      `https://api.etherscan.io/v2/api?chainid=8453&module=account&action=tokentx&address=${address}&sort=desc&offset=${limit}&page=1&apikey=${key}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const data = await res.json() as { status: string; result?: TokenTx[] };
    return data.status === "1" ? (data.result ?? []) : [];
  } catch {
    return [];
  }
}

const SYSTEM = `You are a smart-money / copy-trade signal analyst for Base chain.
You are given a REAL list of recent large on-chain token transfers for a wallet.
Read ONLY those transfers — never invent a movement, token, amount, wallet count or price.
Decide whether this wallet is worth copying based on what the transfers actually show.
Return ONLY valid JSON:
{
  "signal": "STRONG_BUY|BUY|WATCH|PASS",
  "whale_activity": "accumulating|distributing|neutral|mixed",
  "confidence": <0-100>,
  "entry_timing": "<immediate|wait for dip|wait for confirmation|no clear entry>",
  "patterns": ["<pattern grounded in the transfers>"],
  "summary": "<2 sentences grounded ONLY in the transfers above>"
}`;

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { token?: string; wallet?: string; address?: string } = {};
    try { const t = await req.text(); if (t.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    // Copy-signal is about a specific whale wallet (preferred) or token address.
    const address = body.wallet ?? body.token ?? body.address
      ?? url.searchParams.get("wallet") ?? url.searchParams.get("token") ?? url.searchParams.get("address") ?? "";

    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return Response.json(
        { error: "Provide a whale WALLET address (0x…) to analyse its real on-chain flow and get a copy signal." },
        { status: 400 },
      );
    }

    const txs = await getTokenTx(address, 100);

    // Build the real large-transfer list in code (top 15 by token amount).
    const largeTxs = txs
      .map((tx) => {
        const amount = parseFloat(tx.value) / Math.pow(10, parseInt(tx.tokenDecimal || "18"));
        return {
          token: tx.tokenSymbol,
          amount: Number.isFinite(amount) ? amount : 0,
          direction: tx.to?.toLowerCase() === address.toLowerCase() ? "IN" : "OUT",
          timestamp: new Date(parseInt(tx.timeStamp) * 1000).toISOString(),
        };
      })
      .filter((t) => t.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 15);

    const topMovements = largeTxs.map((t) => ({
      token: t.token,
      action: t.direction === "IN" ? "received" : "sent",
      amount: t.amount.toLocaleString(undefined, { maximumFractionDigits: 2 }),
      direction: t.direction,
      significance: t.amount >= 100_000 ? "HIGH" : t.amount >= 10_000 ? "MEDIUM" : "LOW",
    }));

    const base = {
      tool: "whale-copy-signal",
      timestamp: new Date().toISOString(),
      chain: "base",
      chainId: 8453,
      address,
      data_source: "Basescan (live on-chain transfers)",
      transfers_analyzed: txs.length,
      topMovements,
      url: `https://basescan.org/address/${address}`,
    };

    // No real flow → no signal. Never fabricate one.
    if (!txs.length) {
      return Response.json({
        ...base,
        signal: "PASS",
        whale_activity: "neutral",
        confidence: 0,
        entry_timing: "no clear entry",
        patterns: [],
        summary: "No recent token transfers found for this address on Base (or Basescan is unavailable). Nothing on-chain to copy right now.",
      });
    }

    const raw = await llm(
      SYSTEM,
      `Wallet: ${address} (Base)\nRecent large transfers (real, on-chain):\n${JSON.stringify(topMovements, null, 2)}\nTotal transfers analysed: ${txs.length}`,
      0.3,
      600,
    );
    const analysis = parseJson(raw) ?? {};

    return Response.json({
      ...base,
      signal: analysis.signal ?? "WATCH",
      whale_activity: analysis.whale_activity ?? "neutral",
      confidence: analysis.confidence ?? 50,
      entry_timing: analysis.entry_timing ?? "wait for confirmation",
      patterns: analysis.patterns ?? [],
      summary: analysis.summary ?? "",
    });
  } catch (e) {
    return Response.json({ error: "Whale copy signal failed", message: (e as Error).message }, { status: 500 });
  }
}
