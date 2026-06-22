// x402/b20-tracker — Track B20 native token standard activation + B20-themed launches.
// Price: $0.05 — live Bankr API + on-chain factory check; deterministic (no LLM).

import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

const B20_FACTORY     = "0xB20f000000000000000000000000000000000000" as const;
const BERYL_MAINNET   = 1782410400; // June 25 2026 18:00 UTC (unix seconds)
const LAUNCHES_URL    = "https://api.bankr.bot/token-launches?limit=30";

interface BankrLaunch {
  tokenName?:    string;
  tokenSymbol?:  string;
  tokenAddress?: string;
  deployer?:     { walletAddress?: string; xUsername?: string };
  timestamp?:    number;
  launchType?:   string;
}

export default async function handler(_req: Request): Promise<Response> {
  const sig   = new AbortController();
  const timer = setTimeout(() => sig.abort(), 8000);

  let launches:   BankrLaunch[] = [];
  let berylLive   = false;

  try {
    const client = createPublicClient({ chain: base, transport: http("https://mainnet.base.org") });

    const [launchRes, codeRes] = await Promise.allSettled([
      fetch(LAUNCHES_URL, { signal: sig.signal }),
      client.getCode({ address: B20_FACTORY }),
    ]);

    if (launchRes.status === "fulfilled" && launchRes.value.ok) {
      try {
        const raw = await launchRes.value.json();
        launches = Array.isArray(raw) ? raw : (raw?.launches ?? raw?.data ?? []);
      } catch { /* skip */ }
    }

    if (codeRes.status === "fulfilled") {
      berylLive = !!codeRes.value && codeRes.value !== "0x";
    }
  } catch { /* defensive */ }
  finally { clearTimeout(timer); }

  const now         = Math.floor(Date.now() / 1000);
  const berylActive = now >= BERYL_MAINNET || berylLive;
  const daysToBeryl = berylActive ? 0 : Math.ceil((BERYL_MAINNET - now) / 86400);

  // Filter B20-themed launches (NOT native B20 standard — themed/named only)
  const b20Related = launches.filter((l) => {
    const name = (l.tokenName   ?? "").toLowerCase();
    const sym  = (l.tokenSymbol ?? "").toLowerCase();
    return (
      name.includes("b20") || sym.includes("b20") ||
      name.includes("beryl") || name.includes("base native")
    );
  });

  // Dedupe by symbol + filter short/empty names
  const seen    = new Set<string>();
  const tracked = b20Related
    .filter((l) => {
      const s    = l.tokenSymbol;
      if (!s || seen.has(s)) return false;
      const name = (l.tokenName ?? "").trim();
      if (name.length < 2) return false;
      seen.add(s); return true;
    })
    .slice(0, 10)
    .map((l) => ({
      name:      l.tokenName    ?? "Unknown",
      symbol:    l.tokenSymbol  ?? "—",
      address:   l.tokenAddress ?? null,
      deployer:  l.deployer?.xUsername ?? null,
      launchType: l.launchType ?? null,
    }));

  const title = berylActive
    ? "B20 Native Standard · Live on Base"
    : `B20 Watch · Beryl in ${daysToBeryl}d`;

  const summary = berylActive
    ? `B20 native token standard is live on Base mainnet. Factory at ${B20_FACTORY}.${tracked.length > 0 ? ` Tracking ${tracked.length} B20-related launches.` : ""}`
    : `Base Beryl activates June 25 18:00 UTC (${daysToBeryl} day${daysToBeryl !== 1 ? "s" : ""} away). ${tracked.length} B20-themed launches tracked. Native B20 deploys unlock at activation — these themed tokens are NOT native B20 standard yet.`;

  return Response.json({
    tool:         "b20-tracker",
    timestamp:    new Date().toISOString(),
    title,
    summary,
    berylActive,
    daysToBeryl,
    factory:      B20_FACTORY,
    tracked,
    metrics: {
      tracked_count: tracked.length,
      beryl_active:  berylActive,
      days_to_beryl: daysToBeryl,
    },
    note: berylActive
      ? "B20 native standard live. Use isB20() to verify native tokens."
      : "Pre-activation: B20-themed launches only. Native B20 standard activates June 25 18:00 UTC.",
    disclaimer: "Snapshot only — not financial advice. B20-themed tokens are NOT verified native B20 standard tokens.",
  });
}
