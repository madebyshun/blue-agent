// x402/bankr-pulse — Bankr ecosystem pulse (trending agent launches + $BNKR price)
// Price: $0.05 — real data from Bankr API + DexScreener; deterministic summary (no LLM)

const BNKR_ADDRESS        = "0x05fa92bc81ae6c6d7e65b636a72398f6d0b15c85";
const BANKR_LAUNCHES_URL  = "https://api.bankr.bot/token-launches?limit=20";
const DEXSCREENER_URL     = `https://api.dexscreener.com/latest/dex/tokens/${BNKR_ADDRESS}`;

// Symbols/names to filter out (spam/meme tokens)
const SPAM_SYMBOLS = new Set(["B20", ".", "Another"]);

export default async function handler(_req: Request): Promise<Response> {
  const sig   = new AbortController();
  const timer = setTimeout(() => sig.abort(), 8000);

  let launches: {
    tokenName?:    string;
    tokenSymbol?:  string;
    tokenAddress?: string;
    deployer?:     { walletAddress?: string; xUsername?: string };
    timestamp?:    number;
    status?:       string;
    launchType?:   string;
  }[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let bnkrPair: any = null;
  let launchesOk = true;
  let bnkrOk     = true;

  try {
    const [launchRes, dexRes] = await Promise.allSettled([
      fetch(BANKR_LAUNCHES_URL, { signal: sig.signal }),
      fetch(DEXSCREENER_URL,    { signal: sig.signal }),
    ]);

    if (launchRes.status === "fulfilled" && launchRes.value.ok) {
      try {
        const raw = await launchRes.value.json();
        launches = Array.isArray(raw) ? raw : (raw?.data ?? raw?.launches ?? []);
      } catch { launchesOk = false; }
    } else { launchesOk = false; }

    if (dexRes.status === "fulfilled" && dexRes.value.ok) {
      try {
        const raw   = await dexRes.value.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pairs: any[] = raw?.pairs ?? [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        bnkrPair = pairs.sort((a: any, b: any) => (b?.volume?.h24 ?? 0) - (a?.volume?.h24 ?? 0))[0] ?? null;
      } catch { bnkrOk = false; }
    } else { bnkrOk = false; }
  } finally {
    clearTimeout(timer);
  }

  console.log(`[BankrPulse] launches=${launchesOk ? launches.length : "err"}, bnkr=${bnkrOk ? "ok" : "err"}`);

  if (!launchesOk && !bnkrOk) {
    return Response.json({
      tool:       "bankr-pulse",
      timestamp:  new Date().toISOString(),
      title:      "Bankr data temporarily unavailable",
      summary:    "Live Bankr and DexScreener data could not be fetched. Please retry.",
      trending:   [],
      bnkr_price: null,
      bnkr_change: null,
      sentiment:  "neutral",
      metrics:    { total_launches: null, avg_change24h: null },
      note:       "Both data sources unavailable — no fabricated data shown.",
    });
  }

  const bnkrPrice  = bnkrPair?.priceUsd != null ? parseFloat(bnkrPair.priceUsd) : null;
  const bnkrChange = bnkrPair?.priceChange?.h24 ?? null;

  // ── Scam / spam filter ────────────────────────────────────────────────────
  const cleanLaunches = launches.filter(l => {
    const sym  = (l.tokenSymbol ?? "").trim();
    const name = (l.tokenName ?? "").trim();
    if (!sym || !name) return false;
    if (SPAM_SYMBOLS.has(sym)) return false;
    if (name.length < 2 || /^[.\s]+$/.test(name)) return false;
    return true;
  });

  // Dedupe by symbol (keep first occurrence)
  const seen  = new Set<string>();
  const dedup = cleanLaunches.filter(l => {
    const s = l.tokenSymbol!;
    if (seen.has(s)) return false;
    seen.add(s); return true;
  });

  // ── Build output ──────────────────────────────────────────────────────────
  const launchSample = dedup.slice(0, 15).map(l => ({
    name:       l.tokenName   ?? "Unknown",
    symbol:     l.tokenSymbol ?? "—",
    deployer:   l.deployer?.xUsername ?? null,
    address:    l.tokenAddress ?? null,
    launchType: l.launchType ?? null,
  }));

  const recentLaunches = dedup.slice(0, 8);
  const topNames = recentLaunches.slice(0, 4)
    .map(l => l.tokenSymbol)
    .filter(Boolean) as string[];

  const trending = recentLaunches.map(l => ({
    name:      l.tokenName  ?? "Unknown",
    symbol:    l.tokenSymbol ?? "—",
    deployer:  l.deployer?.xUsername ?? null,
    sentiment: "neutral" as const,
  }));

  const summary = launches.length
    ? `${launches.length} recent token launches on Bankr. Latest: ${topNames.join(" · ")}.${bnkrPrice != null ? ` $BNKR at $${bnkrPrice.toFixed(6)}.` : ""}`
    : "Bankr ecosystem pulse — no recent launches.";

  const sentiment = bnkrChange != null && bnkrChange > 0 ? "bullish"
                  : bnkrChange != null && bnkrChange < 0 ? "bearish"
                  : "neutral";

  return Response.json({
    tool:        "bankr-pulse",
    timestamp:   new Date().toISOString(),
    title:       "Bankr Trending",
    summary,
    trending,
    launches:    launchSample,
    bnkr_price:  bnkrPrice,
    bnkr_change: bnkrChange,
    sentiment,
    metrics:     { total_launches: launches.length, avg_change24h: null },
    data_source: "Bankr API + DexScreener (live)",
    disclaimer:  "Snapshot only — not financial advice.",
  });
}
