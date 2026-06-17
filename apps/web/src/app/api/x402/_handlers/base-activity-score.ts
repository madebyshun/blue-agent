// x402/base-activity-score — onchain activity score for a Base wallet (Moralis).
// Pure scoring formula, no LLM. Price: $0.05
import { getMoralisNativeTx, getMoralisERC20Transfers } from "@/lib/moralis";

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { address?: string } = {};
    try { const t = await req.text(); if (t?.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const address = (body.address ?? url.searchParams.get("address") ?? "").trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return Response.json({ error: "Provide a wallet address (0x…)" }, { status: 400 });

    const [nat, erc] = await Promise.all([getMoralisNativeTx(address, 100), getMoralisERC20Transfers(address, 100)]);
    const txs = [...nat, ...erc] as Record<string, unknown>[];
    const lower = address.toLowerCase();
    const counterparties = new Set<string>();
    let oldest = Infinity, newest = 0;
    for (const t of txs) {
      const from = String(t.from_address ?? "").toLowerCase();
      const to = String(t.to_address ?? "").toLowerCase();
      if (from && from !== lower) counterparties.add(from);
      if (to && to !== lower) counterparties.add(to);
      const ts = t.block_timestamp ? new Date(String(t.block_timestamp)).getTime() : 0;
      if (ts) { oldest = Math.min(oldest, ts); newest = Math.max(newest, ts); }
    }
    const txCount = nat.length;
    const ageDays = oldest !== Infinity ? Math.floor((Date.now() - oldest) / 86400000) : 0;
    const lastActiveDays = newest ? Math.floor((Date.now() - newest) / 86400000) : null;
    const uniqueProtocols = counterparties.size;
    const defiInteractions = erc.length;

    const score = Math.max(0, Math.min(100, Math.round(
      Math.min(txCount, 100) * 0.3 +
      Math.min(uniqueProtocols, 50) * 0.8 +
      Math.min(ageDays / 3, 30) +
      Math.min(defiInteractions, 50) * 0.4
    )));
    const tier = score >= 80 ? "OG" : score >= 55 ? "Power User" : score >= 25 ? "Active" : "Newcomer";
    const strengths: string[] = [];
    if (txCount > 50) strengths.push("High transaction volume");
    if (uniqueProtocols > 10) strengths.push("Diverse counterparty/protocol usage");
    if (ageDays > 180) strengths.push("Long-standing wallet");
    if (defiInteractions > 20) strengths.push("Active DeFi participant");
    if (!strengths.length) strengths.push("Early-stage onchain activity");

    return Response.json({
      tool: "base-activity-score",
      address,
      score,
      tier,
      activity: { tx_count: txCount, unique_protocols: uniqueProtocols, age_days: ageDays, last_active_days_ago: lastActiveDays, defi_interactions: defiInteractions },
      strengths,
      potential_eligibility: ["Base ecosystem activity programs (no official airdrop announced)"],
      share_text: `My Base activity score is ${score}/100 (${tier}) — ${txCount} txns across ${uniqueProtocols} counterparties. Check yours on Blue Agent.`,
      disclaimer: "No official $BASE airdrop announced. Score reflects onchain activity only.",
      data_source: "Moralis (live)",
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return Response.json({ error: "base-activity-score failed", message: (e as Error).message }, { status: 500 });
  }
}
