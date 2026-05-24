/**
 * Blue Sentinel — Auto Discovery Engine
 *
 * Automatically finds targets to scan each cycle.
 * No human input needed.
 *
 * Sources:
 *   A. DexScreener    — new tokens on Base (free, no key)
 *   B. URLhaus        — crypto-related malicious URLs (free, no key)
 *   C. Pattern list   — known phishing domain patterns (built-in, catalog-check only)
 *   D. UpgradeWatcher — recent proxy upgrades on Base (EIP-1967 Upgraded events)
 *
 * Optimizations:
 *   - DexScreener tokens: KV-cached seen set (24h TTL) — only return NEW tokens
 *   - Pattern domains: flagged as catalogOnly=true — skip expensive hub scan
 *   - URLhaus domains: always fresh (malicious URLs change every cycle)
 *   - Upgrade events: block checkpoint in KV — never re-scan same block twice
 */

import { kvGet, kvSet } from "@/lib/kv";
import { discoverUpgrades } from "@/lib/sentinel/upgrade-watcher";
import { discoverFromOpenPhish } from "@/lib/sentinel/phishing-dna";

export type DiscoverySource = "dexscreener" | "urlhaus" | "pattern" | "upgrade_watcher";

export interface DiscoveredTarget {
  target:      string;
  targetType:  "address" | "token" | "domain";
  source:      DiscoverySource;
  reason:      string;
  /** If true, only run catalog check — skip hub tool scan (saves credits) */
  catalogOnly?: boolean;
  /** Extra metadata passed to scanner (e.g. newImpl for proxy upgrades) */
  metadata?:   Record<string, string>;
}

// ─── Seen-token cache ─────────────────────────────────────────────────────────

const SEEN_TOKENS_KEY = "sentinel:discovery:seen_tokens";
const SEEN_TOKENS_TTL = 60 * 60 * 24; // 24h

async function getSeenTokens(): Promise<Set<string>> {
  const arr = (await kvGet<string[]>(SEEN_TOKENS_KEY)) ?? [];
  return new Set(arr.map(t => t.toLowerCase()));
}

async function markTokensSeen(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  const existing = (await kvGet<string[]>(SEEN_TOKENS_KEY)) ?? [];
  const merged   = [...new Set([...existing, ...tokens.map(t => t.toLowerCase())])];
  // Cap at 500 to avoid KV bloat
  await kvSet(SEEN_TOKENS_KEY, merged.slice(-500), SEEN_TOKENS_TTL);
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
  const seen    = await getSeenTokens();
  const results: DiscoveredTarget[] = [];
  const newTokens: string[] = [];

  // 1. Token profiles (newest tokens with metadata)
  try {
    const res = await fetch("https://api.dexscreener.com/token-profiles/latest/v1", {
      headers: { "Accept": "application/json" },
      signal:  AbortSignal.timeout(12000),
    });
    if (res.ok) {
      const profiles = await res.json() as DexProfile[];
      for (const p of profiles) {
        if (p.chainId === "base" && p.tokenAddress && !seen.has(p.tokenAddress.toLowerCase())) {
          results.push({
            target:     p.tokenAddress,
            targetType: "token",
            source:     "dexscreener",
            reason:     "New token profile on Base",
          });
          newTokens.push(p.tokenAddress);
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
        if (b.chainId === "base" && b.tokenAddress && !seen.has(b.tokenAddress.toLowerCase())) {
          // Avoid duplicate if already added from profiles
          if (!newTokens.includes(b.tokenAddress)) {
            results.push({
              target:     b.tokenAddress,
              targetType: "token",
              source:     "dexscreener",
              reason:     "Token boost on Base — elevated scam risk",
            });
            newTokens.push(b.tokenAddress);
          }
        }
      }
    }
  } catch { /* silent */ }

  // Mark all discovered tokens as seen (24h)
  await markTokensSeen(newTokens);

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
    target:      domain,
    targetType:  "domain" as const,
    source:      "pattern" as const,
    reason:      `Phishing pattern match: ${domain}`,
    catalogOnly: true, // static list — catalog check only, no hub credit needed
  }));
}

// ─── D. Upgrade Watcher — recent proxy upgrades on Base ──────────────────────

async function discoverFromUpgradeWatcher(): Promise<DiscoveredTarget[]> {
  try {
    const upgrades = await discoverUpgrades();
    return upgrades.map(u => ({
      target:     u.proxyAddress,
      targetType: "address" as const,
      source:     "upgrade_watcher" as const,
      reason:     `Proxy upgraded → new impl ${u.newImpl.slice(0, 10)}… (block ${u.blockNumber})`,
      metadata:   {
        newImpl:     u.newImpl,
        blockNumber: String(u.blockNumber),
        txHash:      u.txHash,
      },
    }));
  } catch { return []; }
}

// ─── Main: discoverAll ────────────────────────────────────────────────────────

export async function discoverAll(): Promise<DiscoveredTarget[]> {
  const [tokensResult, urlhausResult, upgradeResult, openphishResult] = await Promise.allSettled([
    discoverNewBaseTokens(),
    discoverFromURLhaus(),
    discoverFromUpgradeWatcher(),
    discoverFromOpenPhish(),
  ]);

  const all: DiscoveredTarget[] = [
    ...(tokensResult.status    === "fulfilled" ? tokensResult.value    : []),
    ...(urlhausResult.status   === "fulfilled" ? urlhausResult.value   : []),
    ...(upgradeResult.status   === "fulfilled" ? upgradeResult.value   : []),
    ...(openphishResult.status === "fulfilled" ? openphishResult.value : []),
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
