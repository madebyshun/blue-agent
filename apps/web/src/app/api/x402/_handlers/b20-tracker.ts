// x402/b20-tracker — Track B20 native token standard activation + B20-themed launches.
// Price: $0.05 — live Bankr API + live on-chain activation read; deterministic (no LLM).
// Activation is read from the on-chain ActivationRegistry (isActivated), NOT a hardcoded
// date: the B20 factory is a Rust precompile so getCode returns "0x" even when active, and
// the registry can flip the flag ~1h after the Beryl fork — a timestamp would lie either way.

import { getB20Activation } from "@/lib/b20/activation";

const B20_FACTORY  = "0xB20f000000000000000000000000000000000000" as const;
const LAUNCHES_URL = "https://api.bankr.bot/token-launches?limit=30";

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

  let launches: BankrLaunch[] = [];

  // Fetch launches + read on-chain activation in parallel.
  const [launchRes, act] = await Promise.all([
    (async () => {
      try {
        const res = await fetch(LAUNCHES_URL, { signal: sig.signal });
        if (res.ok) {
          try {
            const raw = await res.json();
            return Array.isArray(raw) ? raw : (raw?.launches ?? raw?.data ?? []);
          } catch { /* skip */ }
        }
      } catch { /* defensive */ }
      finally { clearTimeout(timer); }
      return [] as BankrLaunch[];
    })(),
    getB20Activation("mainnet"),
  ]);
  launches = launchRes;

  // Live activation from the ActivationRegistry (0x8453…0001). When the read fails
  // (act.ok === false) the state is UNKNOWN — never claim active from absent data.
  const activationKnown = act.ok;
  const assetLive  = act.ok && act.asset;
  const stableLive = act.ok && act.stablecoin;
  const berylActive = assetLive || stableLive;

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
      name:       l.tokenName    ?? "Unknown",
      symbol:     l.tokenSymbol  ?? "—",
      address:    l.tokenAddress ?? null,
      deployer:   l.deployer?.xUsername ?? null,
      launchType: l.launchType  ?? null,
    }));

  // Human status word: live / not-yet / unknown (RPC read failed).
  const status = !activationKnown ? "unknown" : berylActive ? "live" : "pending";

  const title = !activationKnown
    ? "B20 Native Standard · Status unavailable"
    : berylActive
      ? "B20 Native Standard · Live on Base"
      : "B20 Watch · Not yet activated";

  const summary = !activationKnown
    ? `Could not read B20 activation from the on-chain registry right now — status unavailable. ${tracked.length} B20-themed launches tracked (these are NOT native B20 standard tokens).`
    : berylActive
      ? `B20 native token standard is live on Base mainnet (asset: ${assetLive ? "enabled" : "off"}, stablecoin: ${stableLive ? "enabled" : "off"}). Factory at ${B20_FACTORY}.${tracked.length > 0 ? ` Tracking ${tracked.length} B20-related launches.` : ""}`
      : `B20 native standard is NOT yet activated on Base mainnet — the on-chain ActivationRegistry has not enabled it. ${tracked.length} B20-themed launches tracked. Native B20 deploys unlock at activation — these themed tokens are NOT native B20 standard yet.`;

  return Response.json({
    tool:         "b20-tracker",
    timestamp:    new Date().toISOString(),
    title,
    summary,
    status,
    berylActive,
    activationKnown,
    activation: {
      network:    "mainnet",
      known:      activationKnown,
      asset:      activationKnown ? assetLive  : null,
      stablecoin: activationKnown ? stableLive : null,
      source:     "ActivationRegistry 0x8453000000000000000000000000000000000001 · isActivated",
    },
    factory:      B20_FACTORY,
    tracked,
    metrics: {
      tracked_count:    tracked.length,
      beryl_active:     berylActive,
      activation_known: activationKnown,
    },
    note: !activationKnown
      ? "Activation status unavailable (registry read failed). Retry shortly — this reads the live on-chain flag, no hardcoded date."
      : berylActive
        ? "B20 native standard live. Use isB20() to verify native tokens."
        : "Pre-activation: B20-themed launches only. Native B20 deploys unlock when the on-chain ActivationRegistry enables the standard.",
    disclaimer: "Snapshot only — not financial advice. B20-themed tokens are NOT verified native B20 standard tokens.",
  });
}
