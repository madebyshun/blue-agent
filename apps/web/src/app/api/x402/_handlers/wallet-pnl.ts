// x402/wallet-pnl — Wallet PnL report on Base
// Price: $1.00 — grounded in real on-chain activity (getWalletSnapshot). PnL /
// win-rate are explicitly labelled estimates (no cost-basis price feed), and we
// never fabricate a report from an empty data response.

import { getWalletSnapshot } from "@/lib/onchain";
import { callVeniceLLM } from "@/app/api/_lib/llm";

type BankrMessage = { role: string; content: string };

async function callBankrLLM(opts: {
  model?: string; system: string; messages: BankrMessage[];
  temperature?: number; maxTokens?: number;
}): Promise<string> {
  return callVeniceLLM({ system: opts.system, messages: opts.messages, temperature: opts.temperature, maxTokens: opts.maxTokens });
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  let raw = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
  if (s >= 0 && e > s) raw = raw.slice(s, e + 1);
  try { return JSON.parse(raw); } catch {}
  try { return JSON.parse(raw.replace(/[\x00-\x1F\x7F]/g, " ")); } catch {}
  return null;
}

async function getBasescanTxs(address: string): Promise<unknown[]> {
  const apiKey = process.env.BASESCAN_API_KEY;
  if (!apiKey) return [];
  try {
    const url = `https://api.etherscan.io/v2/api?chainid=8453&module=account&action=tokentx&address=${address}&startblock=0&endblock=99999999&sort=desc&apikey=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const data = await res.json() as { status: string; result?: unknown[] };
    if (data.status === "1" && Array.isArray(data.result)) {
      return data.result.slice(0, 50);
    }
    return [];
  } catch {
    return [];
  }
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { address?: string } = {};
    try {
      const text = await req.text();
      if (text && text.trim().startsWith("{")) body = JSON.parse(text);
    } catch {}
    const url = new URL(req.url);
    if (!body.address) body.address = url.searchParams.get("address") || undefined;

    const { address } = body;
    if (!address || !address.startsWith("0x")) {
      return Response.json({ error: "Please provide a valid wallet address (0x...)" }, { status: 400 });
    }

    console.log(`[WalletPnL] Analyzing: ${address}`);

    const [txs, snap] = await Promise.all([
      getBasescanTxs(address),
      getWalletSnapshot(address),
    ]);

    // Guard: with no readable transfer history AND no on-chain activity, do not
    // let the LLM fabricate a $-PnL / win-rate / score. Return an honest result.
    const nonce = snap?.txCount ?? null;
    if (txs.length === 0 && snap && snap.transferCount === 0) {
      const neverActive = nonce === 0;
      return Response.json({
        address,
        trades: 0,
        tokens: 0,
        pnl: "n/a",
        winRate: "n/a",
        style: "Inactive",
        topTokens: [],
        risk: "n/a",
        score: null,
        summary: neverActive
          ? "This wallet has no token-transfer history on Base — nothing to analyze yet."
          : "No token-transfer history could be read for this wallet (data source unavailable or empty).",
        tip: "Fund and trade from this wallet, then re-run the report.",
        dataSource: "live Base RPC + Basescan token transfers",
        disclaimer: "PnL and win-rate are rough estimates — this tool has no cost-basis or historical price feed, so they are not accounting-grade figures.",
      }, { status: 200 });
    }

    const txSummary = txs.length > 0
      ? (txs as { tokenSymbol: string; value: string; tokenDecimal: string; to?: string; timeStamp: string }[])
        .slice(0, 20).map(tx => ({
          token: tx.tokenSymbol,
          value: tx.value,
          decimals: tx.tokenDecimal,
          direction: tx.to?.toLowerCase() === address.toLowerCase() ? "IN" : "OUT",
          timestamp: new Date(parseInt(tx.timeStamp) * 1000).toISOString(),
        }))
      : [];

    const snapCtx = snap
      ? `Real on-chain activity: native ETH ${snap.ethBalance ?? "?"}, total sent tx (nonce) ${nonce ?? "?"}, ${snap.transferCount} ERC-20 transfers across ${snap.distinctTokens} tokens, last activity ${snap.lastActivityDays === null ? "unknown" : snap.lastActivityDays + "d ago"}. Most-traded: ${snap.topTokens.slice(0, 6).map(t => `${t.symbol}(${t.transfers}x)`).join(", ") || "none"}.`
      : "On-chain snapshot unavailable.";

    const systemPrompt = `You are a crypto portfolio analyst specializing in onchain wallet analysis on Base chain.

IMPORTANT HONESTY RULES:
- You do NOT have cost-basis or historical price data. So "pnl" and "winRate" are ROUGH ESTIMATES inferred from flow patterns — never present them as precise accounting. Prefer ranges or qualitative reads when data is thin.
- Base every field on the provided real on-chain activity; do not invent tokens or trades that aren't in the data.

CRITICAL: Return ONLY raw JSON. No markdown. No backticks. Start with { and end with }.

{
  "address": "string",
  "trades": <number — from real data>,
  "tokens": <number of unique tokens — from real data>,
  "pnl": "rough estimate e.g. ~+$1,240 or ~-$320 (label as estimate)",
  "winRate": "rough estimate e.g. ~65% (label as estimate)",
  "style": "Memecoin Aper | DeFi Farmer | Long-term Holder | Active Trader | Degen",
  "topTokens": ["token1", "token2", "token3"],
  "risk": "Conservative | Moderate | Aggressive | Degen",
  "score": <0-100 smart money score>,
  "summary": "2-3 sentence summary of trading behavior",
  "tip": "one actionable recommendation"
}`;

    const userPrompt = `Analyze this Base wallet: ${address}\n\n${snapCtx}\n\nRecent token transactions (sample):\n${JSON.stringify(txSummary, null, 2)}\n\nTotal transfers sampled: ${txs.length}`;

    const llmResponse = await callBankrLLM({
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      temperature: 0.5,
      maxTokens: 1200,
    });

    let result = extractJsonObject(llmResponse);
    if (!result) result = { degraded: true, note: "Synthesis briefly unavailable - please retry." };
    return Response.json({
      ...result,
      address,
      dataSource: "live Base RPC + Basescan token transfers",
      disclaimer: "PnL and win-rate are rough estimates — this tool has no cost-basis or historical price feed, so they are not accounting-grade figures.",
    }, { status: 200 });
  } catch (error) {
    console.error("[WalletPnL] Error:", error);
    return Response.json({ error: "Failed to analyze wallet", message: (error as Error).message }, { status: 500 });
  }
}
