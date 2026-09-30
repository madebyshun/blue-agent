// x402/honeypot-check
// Honeypot token detection — checks if a token can be bought but not sold on Base
// Price: $0.10 — verdict: SAFE / SUSPICIOUS / HONEYPOT / UNKNOWN (code-mapped, W0-19)
//
// 🔴 CONFIDENCE IS EARNED BY A TAX READ, IN CODE. Read `clampConfidence` below
// before touching anything that produces `confidence`.
//
// MEASURED 2026-09-26 across the 18 tools on /api/mcp: 12 of 12 tokens came back
// `tax: "unknown"` and every one of them was still `verdict: SAFE` at
// `confidence: 90-99`. Both halves came from the model — the tax string because
// the prompt asked it to write one, the confidence because the prompt asked it
// to "reflect evidence strength". A number the model chooses is not evidence of
// anything, and "SAFE, 95%" is read by a human as a verification that happened.
//
// Two things changed, and they are both code, not prompt (CLAUDE.md: prompts do
// not prevent hallucination, data sources do):
//   1. The tax comes from `lib/token-tax.ts` — an `eth_call` against the token's
//      own selectors — or it is `null`. The model is no longer asked for it and
//      no longer has a field to put one in.
//   2. `confidence >= 90` is unreachable unless that read succeeded. The clamp
//      is arithmetic on the way out, so no prompt edit, model swap or
//      temperature change can lift it.
//
// The verdict/action mapping is likewise arithmetic. Per CLAUDE.md a verdict
// word chosen by the LLM flips between runs on identical input; both passes now
// run at temperature 0 and only write prose and flags.

import { getTokenIdentity, tokenIdentityToPrompt } from "@/lib/onchain";
import { callLLM } from "@/app/api/_lib/llm";
import { readTokenTax, type TaxRead } from "@/lib/token-tax";
import { robinhoodCodeHint } from "@/lib/cross-chain-hint";

type Msg = { role: string; content: string };

/** The ceiling a tool may claim when it never read the tax. */
export const TAX_UNVERIFIED_CONFIDENCE_CAP = 70;

/** A sell tax at or above this is a sell restriction, i.e. the honeypot itself.
 *  Only ever applied to a MEASURED value — an unread tax stays unread. */
export const HONEYPOT_SELL_TAX_BPS = 5_000; // 50%

/**
 * The whole fix in one function. `raw` is whatever the model said; the return
 * value is what the caller is allowed to be told.
 *
 * Deleting the `Math.min(..., CAP)` restores the measured bug with zero visible
 * symptoms — the tool still answers 200, still says SAFE, and the only
 * difference is a number nobody can check. `scripts/honeypot-tax-read-test.ts`
 * asserts both directions (capped when unread, NOT capped when read) so the
 * revert goes red instead of shipping.
 */
export function clampConfidence(raw: unknown, taxRead: TaxRead["tax_read"] | "not_applicable"): number {
  const n = typeof raw === "number" && Number.isFinite(raw) ? Math.round(raw) : 50;
  const bounded = Math.max(0, Math.min(100, n));
  return taxRead === "template" ? bounded : Math.min(bounded, TAX_UNVERIFIED_CONFIDENCE_CAP);
}

/** A MEASURED sell tax at/above this is a real exit cost short of a trap. */
export const SUSPICIOUS_SELL_TAX_BPS = 1_000; // 10%

export type HoneypotVerdict = "SAFE" | "SUSPICIOUS" | "HONEYPOT" | "UNKNOWN";

/**
 * THE verdict — arithmetic on measured signals only (W0-19, 2026-09-30), and
 * shared with `safe-trending` so the two tools can never disagree on a token.
 *
 * Until then `is_honeypot` from the model — and `known_rug` from a second model
 * pass — ORed straight into HONEYPOT, and SAFE came from a model-chosen
 * `confidence`. A verdict a model picks flips between runs on the same input
 * (CLAUDE.md), and a model's "is_honeypot: true" on a token nobody measured is
 * exactly the negative-from-absent-data this repo forbids. Now:
 *   HONEYPOT   — a measured sell tax ≥ 50%: the holder cannot get out
 *   UNKNOWN    — the tax could not be read: no measured basis either way
 *   SUSPICIOUS — read, and a measured lever is there (blacklists(address), or
 *                a sell tax ≥ 10%)
 *   SAFE       — read, and neither
 * `confidence` is set here too, so no model number reaches the caller.
 */
export function measuredHoneypotVerdict(
  tax: Pick<TaxRead, "tax_read" | "sell_tax" | "has_blacklist">,
): { verdict: HoneypotVerdict; confidence: number; isHoneypot: boolean } {
  const isHoneypot = tax.sell_tax != null && tax.sell_tax >= HONEYPOT_SELL_TAX_BPS;
  if (isHoneypot) return { verdict: "HONEYPOT", confidence: 95, isHoneypot };
  if (tax.tax_read !== "template") return { verdict: "UNKNOWN", confidence: 50, isHoneypot };
  const risky = tax.has_blacklist === true || (tax.sell_tax != null && tax.sell_tax >= SUSPICIOUS_SELL_TAX_BPS);
  return risky
    ? { verdict: "SUSPICIOUS", confidence: 70, isHoneypot }
    : { verdict: "SAFE", confidence: 85, isHoneypot };
}

/**
 * Hard-mapped from the verdict + whether the tax was read. `SAFE_TO_TRADE` is
 * the claim this tool was making without evidence, so it is now reachable only
 * on a successful read; everything else tradeable says so in the action word
 * itself rather than burying it in prose the caller may not render.
 */
export function honeypotAction(verdict: string, taxRead: TaxRead["tax_read"] | "not_applicable"): string {
  if (verdict === "HONEYPOT") return "DO_NOT_BUY";
  if (verdict === "NOT_A_TOKEN") return "N/A";
  if (taxRead !== "template") return "TRADEABLE_TAX_UNVERIFIED";
  return verdict === "SUSPICIOUS" ? "DYOR" : "SAFE_TO_TRADE";
}

// Bankr LLM (llm.bankr.bot) was 403-banned 2026-07-20 → route through callLLM
// (Virtuals). Signature/temperature defaults preserved so call sites are unchanged.
async function llm(system: string, user: string, temp = 0.2, tokens = 600): Promise<string> {
  return (await callLLM({ system, messages: [{ role: "user", content: user }] as Msg[], temperature: temp, maxTokens: tokens })).text;
}

/** A model-produced list, or an empty one. Never a string split into letters. */
function asList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
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
  const base = "https://api.etherscan.io/v2/api?chainid=8453";
  const def = { name: null, symbol: null, decimals: null, verified: false, contractName: null, raw: "Basescan unavailable" };

  try {
    const [tokenRes, srcRes] = await Promise.all([
      fetch(`${base}&module=token&action=tokeninfo&contractaddress=${address}&apikey=${apiKey}`, { signal: AbortSignal.timeout(8000) }),
      fetch(`${base}&module=contract&action=getsourcecode&address=${address}&apikey=${apiKey}`, { signal: AbortSignal.timeout(8000) }),
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

    // Authoritative on-chain identity (eth_getCode + ERC-20 metadata + live
    // DexScreener liquidity), the Basescan verification lookup, and the tax
    // read — all three in parallel. The tax probe is three `eth_call`s that
    // return immediately against an address with no code, so running it before
    // we know whether this IS a token costs a round-trip we are already waiting
    // on, and saves a serial hop on the common path.
    const [identity, tokenInfo, tax] = await Promise.all([
      getTokenIdentity(address),
      getTokenInfo(address),
      readTokenTax(address),
    ]);

    // Guard: there is nothing to honeypot-check unless the address is an actual
    // ERC-20 token. An EOA (wallet) has no code; a non-token contract (liquidity
    // pool, router, multisig) has code but no ERC-20 transfer surface. In both
    // cases the LLM would read "no token metadata" as honeypot red flags and
    // return a dangerous false "HONEYPOT". Short-circuit to a clean NOT_A_TOKEN.
    if (identity && identity.isToken === false) {
      const isEOA = identity.isContract === false;
      // This tool reads Base 8453 and nothing else, and the sentence below used
      // to phrase that as a verdict about the TOKEN. VEX
      // (0x8Ff9…796b) is a live token on Robinhood Chain 4663 and got back "this
      // is a wallet, not a token" — true of Base, false of the token, and the
      // tool never named the chain it was speaking for. One `eth_getCode`
      // against 4663 turns a wrong answer into a correct one plus a pointer.
      const hint = await robinhoodCodeHint(address);
      return Response.json({
        tool: "honeypot-check",
        timestamp: new Date().toISOString(),
        address,
        chain: "base",
        chainId: 8453,
        token: { name: identity.name, symbol: identity.symbol, decimals: identity.decimals, verified: tokenInfo.verified, url: `https://basescan.org/address/${address}` },
        verdict: "NOT_A_TOKEN",
        action: "N/A",
        confidence: 0,
        is_honeypot: false,
        // No token means no tax to read — "not_applicable" is a different fact
        // from "failed" (we looked and the contract does not expose it) and the
        // two must not collapse into one word.
        tax_read: "not_applicable" as const,
        tax_units: "basis_points" as const,
        buy_tax: null,
        sell_tax: null,
        tax_source: null,
        token_template: null,
        has_blacklist: null,
        confidence_capped: false,
        sell_tax_estimate: "n/a",
        buy_tax_estimate: "n/a",
        red_flags: [],
        green_flags: [],
        honeypot_patterns: [],
        community: { alert: "none", known_rug: false, rug_patterns: [], signal: "" },
        assessment: [
          isEOA
            ? "On Base (chain 8453) this address is an externally-owned account (EOA / normal wallet), not a token contract — there is nothing to honeypot-check here. Pass a Base token CONTRACT address to scan a token."
            : `On Base (chain 8453) this is a non-token contract${tokenInfo.contractName ? ` (${tokenInfo.contractName})` : ""} — infrastructure such as a liquidity pool or router, not an ERC-20 token. A honeypot check only applies to tradeable tokens.`,
          hint ? hint.note : "",
        ].filter(Boolean).join(" "),
        ...(hint ? { hint } : {}),
      });
    }

    // The tax block is a MEASUREMENT handed to the model, not a question asked
    // of it. When the read failed the model is told so in the imperative — it
    // has no tax field in its schema any more, and inventing one in the prose
    // is the last remaining way to reintroduce the bug.
    const taxCtx = tax.tax_read === "template"
      ? [
          `On-chain tax (AUTHORITATIVE — read from the contract's own ${tax.tax_source}):`,
          `- buy tax: ${tax.buy_tax} basis points (${tax.buy_tax_pct})`,
          `- sell tax: ${tax.sell_tax} basis points (${tax.sell_tax_pct})`,
          `- template: ${tax.template}`,
          `- blacklists(address): ${tax.has_blacklist
            ? "PRESENT — a privileged role can block addresses from transferring (censorship / honeypot lever)."
            : "ABSENT on this template — no address can be frozen. This is a POSITIVE, not a risk."}`,
          `These are measured numbers. Use them; do not restate them differently and do not hedge them.`,
        ].join("\n")
      : [
          `On-chain tax read FAILED: this contract does not answer totalBuyTaxBasisPoints() / totalSellTaxBasisPoints(), so the buy and sell tax are GENUINELY UNKNOWN.`,
          `Do NOT state, estimate, bracket or imply a tax figure — not "0%", not "low", not "likely standard". Say the tax could not be read.`,
          `An unread tax is NOT evidence of a honeypot either. It is absence of information: it must not raise is_honeypot and must not be listed as a red flag.`,
        ].join("\n");

    const tokenCtx = `
${identity ? tokenIdentityToPrompt(identity) : `Token address: ${address} (Base, chain 8453). On-chain identity read unavailable — do NOT assume EOA.`}

${taxCtx}

Basescan: source verified = ${tokenInfo.verified}, contract name = ${tokenInfo.contractName ?? "unknown"}. (An unverified source is common for legitimate tokens and is NOT, by itself, a honeypot signal. The contract NAME is deployer-chosen and proves nothing — the tax block above was read by selector, which cannot be faked.)
`.trim();

    // Two passes in parallel: honeypot analysis + degen signal. The second
    // keeps its "You are MiroShark" prefix (retired persona, load-bearing
    // prefix) — see the 🔴 CANONICAL NOTE in api/_lib/llm.ts.
    const [blueRaw, msRaw] = await Promise.all([
      llm(
        `You are Blue Agent — token security specialist for Base (chain ID 8453).
Analyze whether this token is a honeypot (buy works, sell blocked or taxed to 100%).
Key honeypot patterns: trading disabled post-launch, massive sell tax (>50%), blacklist abuse, ownership not renounced with dangerous functions, transfer() reverts on sell.

EVIDENCE RULES (critical — avoid false positives):
- Only set is_honeypot=true when there is CONCRETE evidence of a sell restriction (sell blocked, sell tax >50%, blacklist, trading disabled, or a known rug). With no such evidence, set is_honeypot=false.
- Missing Basescan verification, missing metadata, or an unfamiliar token name is NOT evidence of a honeypot. Do NOT flag on absence of information.
- Healthy two-sided DEX liquidity and real 24h volume (in the context) are strong evidence the token is tradeable — weight them as green flags, not red.
- TAX NUMBERS ARE NOT YOURS TO PRODUCE. The tax block in the context is either a measured read or an explicit failure. There is no tax field in your schema; never write a tax figure into a flag or the assessment unless the context measured it.
- Set confidence to reflect EVIDENCE strength, not how scary the unknowns feel. It is a ceiling, not a score: an unread tax is capped downstream regardless of what you write here, so do not compensate.

CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "is_honeypot": <boolean>,
  "confidence": <0-100>,
  "red_flags": ["<flag>" or empty],
  "green_flags": ["<flag>" or empty],
  "honeypot_patterns": ["<pattern>" or empty],
  "assessment": "<2 sentences — is this safe to trade?>"
}`,
        tokenCtx,
        // temperature 0: `is_honeypot` and `confidence` both feed a verdict.
        // A verdict that flips between runs on identical input is the exact
        // failure CLAUDE.md names.
        0,
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
        // temperature 0 for the same reason: `known_rug` ORs straight into the
        // HONEYPOT verdict.
        0,
        300
      ),
    ]);

    const hasLiquidity = (identity?.market?.liquidityUsd ?? 0) > 0;
    // NOTE: no `*_tax_estimate` keys here any more. The fallback used to seed
    // them with "unknown", which then rendered in a tax field as though it were
    // a reading. Tax now comes from `tax` (measured) or is `null` (unread).
    const blue = parseJson(blueRaw) ?? {
      is_honeypot: false,
      confidence: 50,
      red_flags: [],
      green_flags: [
        ...(tokenInfo.verified ? ["source verified on Basescan"] : []),
        ...(hasLiquidity ? ["active DEX liquidity on Base"] : []),
      ],
      honeypot_patterns: [],
      assessment: "Automated honeypot analysis was inconclusive (no concrete sell-block evidence found). This is not a honeypot verdict — verify liquidity and try a small test sell before trading.",
    };

    const ms = parseJson(msRaw) ?? {
      community_alert: "watch",
      known_rug: false,
      rug_patterns: [],
      community_signal: "No community data available.",
    };

    // ── Final verdict — arithmetic, not opinion ──────────────────────────────
    // A MEASURED sell tax at or above 50% is a honeypot by definition: the
    // holder cannot get their money out. This is the one place a successful tax
    // read feeds the verdict rather than merely decorating it. An UNREAD tax
    // never contributes here — absence of a reading is not evidence of a trap.
    // W0-19: verdict, confidence and is_honeypot are all arithmetic on what
    // was measured — see `measuredHoneypotVerdict`. The two model passes keep
    // writing prose and flags, and their booleans are returned as a labelled
    // opinion below, never as a verdict input.
    const measured = measuredHoneypotVerdict(tax);
    const measuredHoneypot = measured.isHoneypot;
    const isHoneypot = measured.isHoneypot;
    const confidence = measured.confidence;
    // "Capped" now means: limited because the tax was never read.
    const confidenceCapped = tax.tax_read !== "template";
    const verdict = measured.verdict;
    const action = honeypotAction(verdict, tax.tax_read);

    // Code-derived flags. These are measurements, so they are appended in code
    // rather than asked for in a prompt.
    const taxRedFlags = [
      ...(measuredHoneypot
        ? [`measured sell tax ${tax.sell_tax_pct} on Base 8453 — a seller cannot exit at that rate`]
        : []),
      ...(tax.has_blacklist === true
        ? ["contract exposes blacklists(address) — the owner can block individual wallets from selling"]
        : []),
    ];
    const taxGreenFlags =
      tax.tax_read === "template" && tax.buy_tax === 0 && tax.sell_tax === 0
        ? ["buy and sell tax both measured at 0% on the contract (Base 8453)"]
        : [];

    // Appended in code so the caveat cannot be dropped by a model that decided
    // the token looked fine.
    const taxCaveat =
      tax.tax_read === "template"
        ? ""
        : ` Buy/sell tax could NOT be read from this contract (it does not expose the Virtuals AgentToken tax selectors), so confidence is capped at ${TAX_UNVERIFIED_CONFIDENCE_CAP}. This is unverified, not clean — do a small test sell before committing size.`;

    return Response.json({
      tool: "honeypot-check",
      timestamp: new Date().toISOString(),
      address,
      chain: "base",
      chainId: 8453,
      token: {
        name: identity?.name ?? tokenInfo.name,
        symbol: identity?.symbol ?? tokenInfo.symbol,
        decimals: identity?.decimals ?? tokenInfo.decimals,
        verified: tokenInfo.verified,
        liquidityUsd: identity?.market?.liquidityUsd ?? null,
        url: `https://basescan.org/address/${address}`,
      },
      verdict,
      action,
      confidence,
      confidence_capped: confidenceCapped,
      is_honeypot: isHoneypot,
      // ── Tax: measured on-chain or explicitly null. Never a guess. ──────────
      tax_read: tax.tax_read,
      tax_units: tax.tax_units,
      buy_tax: tax.buy_tax,
      sell_tax: tax.sell_tax,
      tax_source: tax.tax_source,
      token_template: tax.template,
      has_blacklist: tax.has_blacklist,
      // BREAKING (documented): these were the string "unknown" when unread.
      // They are now `null`, because "unknown" rendered as a measurement.
      sell_tax_estimate: tax.sell_tax_pct,
      buy_tax_estimate:  tax.buy_tax_pct,
      // Measured flags lead; the model's prose flags follow. `asList` is a
      // guard, not decoration — `parseJson` types these `unknown`, and a model
      // that returns a bare string here would otherwise spread into characters.
      red_flags:         [...taxRedFlags, ...asList(blue.red_flags)],
      green_flags:       [...taxGreenFlags, ...asList(blue.green_flags)],
      honeypot_patterns: asList(blue.honeypot_patterns),
      community: {
        alert:   ms.community_alert ?? "watch",
        known_rug: ms.known_rug ?? false,
        rug_patterns: ms.rug_patterns ?? [],
        signal:  ms.community_signal ?? "",
        model_generated: true,
      },
      // What the two model passes THOUGHT. Labelled and kept apart from the
      // verdict fields above, which only measurements decide (W0-19).
      model_opinion: {
        is_honeypot: Boolean(blue.is_honeypot),
        known_rug:   Boolean(ms.known_rug),
        note: "model-generated opinion — not an input to verdict, action or confidence",
      },
      assessment: `${typeof blue.assessment === "string" ? blue.assessment : ""}${taxCaveat}`,
    });
  } catch (error) {
    console.error("[HoneypotCheck]", error);
    return Response.json(
      { error: "Honeypot check failed", message: (error as Error).message },
      { status: 500 }
    );
  }
}
