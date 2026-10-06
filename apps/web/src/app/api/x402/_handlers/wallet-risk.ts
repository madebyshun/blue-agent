// x402/wallet-risk — is this ADDRESS known to be dangerous?
// Price: $0.05 — no LLM, verdict picked in code.
//
// 2026-10-07 (plan-build-2026-10-06 task 2.1). The old handler read the
// wallet's history from Moralis and let a model write `risk_score`; it had
// been HALTED since 2026-09-30 (Moralis 401), which left an MCP-preloaded
// safety tool answering only 501. Rebuilt on sources that answer, with the
// verdict decided in code:
//   • GoPlus address_security — named flags (stealing_attack, phishing,
//     sanctioned, money_laundering, mixer…) and the feeds behind them;
//   • the chain explorer (Blockscout v2) — its own is_scam mark and tags;
//   • the chain itself — nonce, ETH balance, and whether there is code at the
//     address (a contract, or an EIP-7702 delegated account, and to whom).
//
// Verdicts — never "CLEAN": absence of a flag is not a clean bill of health.
//   FLAGGED         a hard flag from GoPlus, or the explorer marks it a scam
//   CAUTION         only soft flags (mixer, blacklist doubt, fake KYC)
//   NO_KNOWN_FLAGS  the feeds were read and named nothing
// The risk feed unread → 502 with verdict UNKNOWN: an unscreened address is
// not sold as screened (the x402 route settles only after a 2xx).

import { addressFlags, flagLabel } from "@/lib/recipient-check";
import { clientFor, parseTxChain, type TxChain } from "@/lib/tx-chains";

const UA = "Mozilla/5.0 (compatible; BlueAgent/1.0; +https://blueagent.dev)";
const EXPLORER: Record<TxChain, string> = { base: "https://base.blockscout.com", robinhood: "https://robinhoodchain.blockscout.com" };
const SOFT = new Set(["blacklist_doubt", "mixer", "fake_kyc"]);

type Explorer = { is_scam: boolean; tags: string[]; name: string | null };
async function explorerInfo(chain: TxChain, a: string): Promise<Explorer | null> {
  try {
    const r = await fetch(`${EXPLORER[chain]}/api/v2/addresses/${a}`, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(6_000) });
    if (!r.ok) return null;
    const j = await r.json() as { is_scam?: boolean; name?: string | null; public_tags?: { display_name?: string }[]; private_tags?: unknown[] };
    return { is_scam: j.is_scam === true, tags: (j.public_tags ?? []).map((t) => t.display_name ?? "").filter(Boolean), name: j.name ?? null };
  } catch { return null; }
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { address?: string; chain?: string } = {};
    try { const t = await req.text(); if (t?.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const address = (body.address ?? url.searchParams.get("address") ?? "").trim();
    const chain = parseTxChain(body.chain ?? url.searchParams.get("chain") ?? "base");
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return Response.json({ error: "Provide a wallet address (0x…)" }, { status: 400 });
    if (!chain) return Response.json({ error: "chain must be base (8453) or robinhood (4663)" }, { status: 400 });

    const client = clientFor(chain);
    const a = address as `0x${string}`;
    const [flags, explorer, nonce, wei, code] = await Promise.all([
      addressFlags(chain, address),
      explorerInfo(chain, address),
      client.getTransactionCount({ address: a }).catch(() => null),
      client.getBalance({ address: a }).catch(() => null),
      client.getCode({ address: a }).then((c) => c ?? "0x").catch(() => null),
    ]);

    const kind = code == null ? null
      : code.toLowerCase().startsWith("0xef0100") && code.length === 48 ? "eip7702_account"
      : code !== "0x" ? "contract" : "wallet";
    const chainFacts = {
      kind,
      delegate: kind === "eip7702_account" ? "0x" + code!.slice(8) : null,
      outbound_tx_count: nonce,
      eth_balance: wei == null ? null : +(Number(wei) / 1e18).toFixed(6),
    };

    if (!flags) {
      return Response.json({
        tool: "wallet-risk", address, chain, verdict: "UNKNOWN", status: "error", flags: null, chain_facts: chainFacts,
        explorer: explorer,
        error: { source: "goplus", code: "UPSTREAM_ERROR", message: "The address-risk feed (GoPlus) did not answer, so this address was not screened." },
        note: "Not screened — an unscreened address is not a safe one. You were not charged.",
        timestamp: new Date().toISOString(),
      }, { status: 502 });
    }

    const hard = flags.hard, soft = flags.soft.filter((f) => SOFT.has(f));
    const verdict = hard.length || explorer?.is_scam ? "FLAGGED" : soft.length ? "CAUTION" : "NO_KNOWN_FLAGS";
    const reasons: string[] = [];
    for (const f of hard) reasons.push(`GoPlus flag: ${flagLabel(f)}`);
    for (const f of soft) reasons.push(`GoPlus soft flag: ${flagLabel(f)}`);
    if (explorer?.is_scam) reasons.push("The chain explorer marks this address as a scam.");
    if (kind === "eip7702_account") reasons.push(`EIP-7702 account delegated to ${chainFacts.delegate}: its code, not only its key, controls it.`);

    return Response.json({
      tool: "wallet-risk",
      address,
      chain,
      chain_id: chain === "robinhood" ? 4663 : 8453,
      status: "ok",
      verdict,
      reasons,
      flags: { hard, soft, source: flags.source || null },
      explorer: explorer ?? null,
      chain_facts: chainFacts,
      how_to_read: "FLAGGED: do not send to or trust this address. CAUTION: a soft mark — know who it is first. NO_KNOWN_FLAGS: no feed names it; that is not a clean bill of health.",
      data_sources: ["GoPlus address_security", "Blockscout address info", `${chain === "robinhood" ? "Robinhood Chain" : "Base"} RPC (nonce, balance, code)`],
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return Response.json({ error: "wallet-risk failed", verdict: "UNKNOWN", message: (e as Error).message }, { status: 502 });
  }
}
