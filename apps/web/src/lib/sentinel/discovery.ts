/**
 * Blue Sentinel — Auto Discovery Engine
 *
 * Automatically finds targets to scan each cycle.
 * No human input needed.
 *
 * Sources:
 *   A. DexScreener   — new tokens on Base (free, no key)
 *   B. URLhaus       — crypto-related malicious URLs (free, no key)
 *   C. Pattern list  — known phishing domain patterns (built-in)
 */

export type DiscoverySource = "dexscreener" | "urlhaus" | "pattern";

export interface DiscoveredTarget {
  target:     string;
  targetType: "address" | "token" | "domain";
  source:     DiscoverySource;
  reason:     string;
}

// ─── A. DexScreener — new Base tokens ─────────────────────────────────────────

interface DexProfile {
  chainId:      string;
  tokenAddress: string;
}

interface DexBoost {
  chainId:      string;
  tokenAddress: string;
  amount?:      number;
}

async function discoverNewBaseTokens(): Promise<DiscoveredTarget[]> {
  const results: DiscoveredTarget[] = [];

  // 1. Token profiles (newest tokens with metadata)
  try {
    const res = await fetch("https://api.dexscreener.com/token-profiles/latest/v1", {
      headers: { "Accept": "application/json" },
      signal:  AbortSignal.timeout(12000),
    });
    if (res.ok) {
      const profiles = await res.json() as DexProfile[];
      for (const p of profiles) {
        if (p.chainId === "base" && p.tokenAddress) {
          results.push({
            target:     p.tokenAddress,
            targetType: "token",
            source:     "dexscreener",
            reason:     "New token profile on Base",
          });
        }
      }
    }
  } catch { /* silent */ }

  // 2. Token boosts (recently boosted = high visibility, higher risk)
  try {
    const res = await fetch("https://api.dexscreener.com/token-boosts/latest/v1", {
      headers: { "Accept": "application/json" },
      signal:  AbortSignal.timeout(12000),
    });
    if (res.ok) {
      const boosts = await res.json() as DexBoost[];
      for (const b of boosts) {
        if (b.chainId === "base" && b.tokenAddress) {
          results.push({
            target:     b.tokenAddress,
            targetType: "token",
            source:     "dexscreener",
            reason:     "Token boost on Base — elevated scam risk",
          });
        }
      }
    }
  } catch { /* silent */ }

  return results;
}

// ─── B. URLhaus — crypto malicious URLs ──────────────────────────────────────

const CRYPTO_KEYWORDS = [
  "coinbase", "metamask", "uniswap", "base", "ethereum", "crypto",
  "wallet", "defi", "nft", "airdrop", "claim", "reward", "token",
  "blueagent", "basechain", "aerodrome", "compound",
];

async function discoverFromURLhaus(): Promise<DiscoveredTarget[]> {
  const results: DiscoveredTarget[] = [];
  try {
    const res = await fetch("https://urlhaus-api.abuse.ch/v1/urls/recent/", {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    "limit=200",
      signal:  AbortSignal.timeout(12000),
    });
    if (!res.ok) return results;

    const data = await res.json() as { urls?: { url: string; url_status: string }[] };

    const seen = new Set<string>();
    for (const entry of data.urls ?? []) {
      if (entry.url_status !== "online") continue;
      const lower = entry.url.toLowerCase();
      if (!CRYPTO_KEYWORDS.some(kw => lower.includes(kw))) continue;

      try {
        const domain = new URL(entry.url).hostname.replace(/^www\./, "");
        if (!domain || seen.has(domain)) continue;
        seen.add(domain);
        results.push({
          target:     domain,
          targetType: "domain",
          source:     "urlhaus",
          reason:     "Crypto-related active malicious URL (URLhaus)",
        });
      } catch { /* invalid URL */ }
    }
  } catch { /* silent — external API might be down */ }

  return results.slice(0, 25);
}

// ─── C. Pattern list — known phishing templates ───────────────────────────────

const PHISHING_PATTERNS: string[] = [
  // Coinbase impersonation
  "coinbase-claim.net",       "coinbase-airdrop.com",     "coinbase-reward.xyz",
  "coinbase-drop.io",         "coinbase-nft.xyz",          "coinbase-wallet-claim.com",
  "coinbase-base-reward.xyz", "coinbase-free-drop.net",
  // Base chain impersonation
  "base-airdrop.xyz",         "base-claim.net",            "base-reward.io",
  "base-drop.xyz",            "base-nft-claim.com",        "getbase-reward.xyz",
  "claim-base.org",           "base-rewards.io",           "base-ecosystem-claim.xyz",
  "base-official-drop.com",   "base-chain-reward.net",
  // Uniswap impersonation
  "uniswap-v4-base.com",      "uniswap-base-claim.xyz",   "uni-airdrop-base.com",
  "uniswap-airdrop.net",      "uniswapv4-drop.xyz",
  // Aerodrome / DeFi impersonation
  "aerodrome-claim.xyz",      "aerodrome-reward.net",      "aero-airdrop.com",
  // Blue Agent impersonation
  "blueagent-airdrop.xyz",    "blue-agent-claim.net",      "blueagent-drop.com",
  "blueagent-reward.xyz",
  // Generic crypto scam
  "base-metamask-claim.xyz",  "eth-base-reward.com",       "free-base-eth.net",
  "claim-crypto-base.xyz",    "basedrop.io",
];

function discoverFromPatterns(): DiscoveredTarget[] {
  return PHISHING_PATTERNS.map(domain => ({
    target:     domain,
    targetType: "domain" as const,
    source:     "pattern" as const,
    reason:     `Phishing pattern match: ${domain}`,
  }));
}

// ─── Main: discoverAll ────────────────────────────────────────────────────────

export async function discoverAll(): Promise<DiscoveredTarget[]> {
  const [tokensResult, urlhausResult] = await Promise.allSettled([
    discoverNewBaseTokens(),
    discoverFromURLhaus(),
  ]);

  const all: DiscoveredTarget[] = [
    ...(tokensResult.status  === "fulfilled" ? tokensResult.value  : []),
    ...(urlhausResult.status === "fulfilled" ? urlhausResult.value : []),
    ...discoverFromPatterns(),
  ];

  // Deduplicate by target (case-insensitive)
  const seen = new Set<string>();
  return all.filter(t => {
    const key = t.target.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function discoverTokensOnly(): Promise<DiscoveredTarget[]> {
  return discoverNewBaseTokens();
}

export async function discoverDomainsOnly(): Promise<DiscoveredTarget[]> {
  const [urlhaus] = await Promise.allSettled([discoverFromURLhaus()]);
  return [
    ...(urlhaus.status === "fulfilled" ? urlhaus.value : []),
    ...discoverFromPatterns(),
  ];
}
