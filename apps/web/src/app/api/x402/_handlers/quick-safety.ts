// x402/quick-safety — fast contract safety check (DexScreener liquidity +
// Basescan verification + an on-chain tax read). Price: $0.05
//
// 🔴 NO MODEL IN THIS TOOL SINCE 2026-09-30 (W0-19). It used to hand its three
// facts to an LLM and take back a `risk_score`, a verdict word — which it fell
// back to verbatim when the score was missing — and even `buy_tax_pct` /
// `sell_tax_pct`, numbers the model could only have invented. With three
// inputs there was nothing for a model to add except those things it must not
// produce. The verdict, flags and confidence are now arithmetic on what was
// read, and a tax is reported only when it was read on-chain (lib/token-tax).
import { getBasescanSource } from "@/lib/moralis";
import { sideOf } from "@/lib/dex-side";
import { readTokenTax } from "@/lib/token-tax";
import { measuredHoneypotVerdict, type HoneypotVerdict } from "./honeypot-check";

const DS = "https://api.dexscreener.com/latest/dex";

/** Below this, a small trade moves the price a lot and exits are thin. */
export const THIN_LIQUIDITY_USD = 10_000;

export type QuickVerdict = "SAFE" | "CAUTION" | "DANGER" | "UNKNOWN";

export interface QuickFacts {
  /** null ⇒ DexScreener did not answer — liquidity unknown, not zero. */
  liquidityUsd: number | null;
  /** null ⇒ DexScreener did not answer. */
  basePairs: number | null;
  /** null ⇒ Basescan did not answer — verification unknown, not false. */
  verified: boolean | null;
  honeypot: HoneypotVerdict;
}

/** THE verdict. Every flag is a measured fact; absence of data is never one. */
export function quickVerdict(f: QuickFacts): { verdict: QuickVerdict; flags: string[] } {
  const flags: string[] = [];
  if (f.honeypot === "HONEYPOT") flags.push("measured sell tax ≥ 50% — holders cannot exit");
  if (f.honeypot === "SUSPICIOUS") flags.push("measured sell lever (blacklist function or sell tax ≥ 10%)");
  if (f.basePairs === 0) flags.push("no Base DEX pair — there is no market to exit into");
  if (f.liquidityUsd != null && f.basePairs !== 0 && f.liquidityUsd < THIN_LIQUIDITY_USD) {
    flags.push(`thin liquidity ($${Math.round(f.liquidityUsd).toLocaleString("en-US")}) — small trades move the price`);
  }
  if (f.verified === false) flags.push("source not verified on Basescan — the code cannot be read");
  if (f.honeypot === "UNKNOWN") flags.push("buy/sell tax not readable on this contract — make a small test sell first");

  if (f.honeypot === "HONEYPOT") return { verdict: "DANGER", flags };
  if (f.honeypot === "SUSPICIOUS" || f.basePairs === 0 || (f.liquidityUsd != null && f.liquidityUsd < THIN_LIQUIDITY_USD)) {
    return { verdict: "CAUTION", flags };
  }
  // SAFE needs the sell side READ, not just verified source + a market: an
  // owner-only sell block verifies like anything else. Until 2026-10-01 this
  // line accepted honeypot UNKNOWN — so nearly every verified Base token came
  // back `safe: true` while its own flags said the tax was unreadable and
  // honeypot-check called it UNKNOWN. Unmeasured is UNKNOWN (W0-19).
  if (f.verified === true && f.liquidityUsd != null && f.honeypot === "SAFE") return { verdict: "SAFE", flags };
  return { verdict: "UNKNOWN", flags };
}

const CONFIDENCE: Record<QuickVerdict, number | null> = { DANGER: 90, CAUTION: 70, SAFE: 75, UNKNOWN: null };
const RISK_BUCKET: Record<QuickVerdict, number | null> = { DANGER: 90, CAUTION: 50, SAFE: 15, UNKNOWN: null };

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { contract?: string } = {};
    try { const t = await req.text(); if (t?.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const contract = (body.contract ?? url.searchParams.get("contract") ?? url.searchParams.get("address") ?? "").trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(contract)) return Response.json({ error: "Provide a contract address (0x…)" }, { status: 400 });

    type Pair = {
      chainId?: string;
      baseToken?: { symbol?: string; address?: string };
      quoteToken?: { symbol?: string; address?: string };
      liquidity?: { usd?: number };
    };
    const [dsRes, src, tax] = await Promise.all([
      fetch(`${DS}/tokens/${contract}`, { signal: AbortSignal.timeout(8000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      getBasescanSource(contract).catch(() => null),
      readTokenTax(contract),
    ]);
    const dsAnswered = dsRes != null;
    const pairs = (((dsRes as { pairs?: Pair[] } | null)?.pairs ?? []).filter((p) => p.chainId === "base")).sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
    const top = pairs[0];
    // `liquidity.usd` is whole-pool TVL, so the deepest pair is the right read
    // whichever side `contract` is on — only the NAME needed fixing. Reading
    // baseToken.symbol unconditionally labelled a USDC scan "AERO", because the
    // 6 deepest of USDC's 30 Base pairs all hold it as the quote (see lib/dex-side).
    // This tool reports no price, so the pair is kept rather than rejected.
    const liquidity = top?.liquidity?.usd ?? (dsAnswered && pairs.length === 0 ? 0 : null);
    const symbol = top ? sideOf(top, contract).symbol : null;
    // `getBasescanSource` answers null when Basescan did not — that is
    // "unknown", and must not become "unverified".
    const verified = src == null ? null : !!(src.SourceCode && String(src.SourceCode).length > 0);
    const honeypot = measuredHoneypotVerdict(tax);

    const { verdict, flags } = quickVerdict({
      liquidityUsd: dsAnswered ? liquidity : null,
      basePairs: dsAnswered ? pairs.length : null,
      verified,
      honeypot: honeypot.verdict,
    });

    return Response.json({
      tool: "quick-safety",
      contract,
      symbol,
      safe: verdict === "UNKNOWN" ? null : verdict === "SAFE",
      // Measured on-chain or null — never estimated.
      buy_tax_pct: tax.buy_tax != null ? tax.buy_tax / 100 : null,
      sell_tax_pct: tax.sell_tax != null ? tax.sell_tax / 100 : null,
      tax_read: tax.tax_read,
      risk_score: RISK_BUCKET[verdict],
      verdict,
      flags,
      liquidity_usd: dsAnswered ? liquidity : null,
      base_pairs: dsAnswered ? pairs.length : null,
      verified,
      confidence: CONFIDENCE[verdict],
      data_source: "DexScreener + Basescan + on-chain tax read (live)",
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return Response.json({ error: "quick-safety failed", message: (e as Error).message }, { status: 500 });
  }
}
