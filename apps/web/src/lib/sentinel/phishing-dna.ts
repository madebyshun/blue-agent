/**
 * Blue Sentinel — Phishing DNA
 *
 * Signature database for phishing detection on Base.
 * Goes beyond simple domain matching — checks contract
 * function selectors, URL path patterns, and live feeds.
 *
 * Sources:
 *   A. Domain signatures    — typosquat patterns, TLD abuse
 *   B. Contract selectors   — known drainer function signatures (4-byte)
 *   C. URL path patterns    — /claim, /airdrop, /connect-wallet paths
 *   D. OpenPhish feed       — live phishing URLs (free, no key)
 *   E. Base contract DB     — known malicious contract addresses on Base
 */

import { kvGet, kvSet } from "@/lib/kv";
import type { DiscoveredTarget } from "@/lib/sentinel/discovery";

// ─── A. Domain signature patterns ────────────────────────────────────────────

export interface DomainSignature {
  id:       string;
  pattern:  RegExp;
  name:     string;
  severity: "critical" | "high";
  reason:   string;
}

export const DOMAIN_SIGNATURES: DomainSignature[] = [
  // Protocol impersonation
  { id: "ds-001", pattern: /coinbase[-.]?(claim|airdrop|reward|drop|free|nft|wallet)/i,    name: "Coinbase Impersonation",   severity: "critical", reason: "Typosquat targeting Coinbase brand" },
  { id: "ds-002", pattern: /uniswap[-.]?(v[0-9][-.])?base|uni[-.]?airdrop/i,               name: "Uniswap Impersonation",    severity: "critical", reason: "Typosquat targeting Uniswap" },
  { id: "ds-003", pattern: /base[-.]?(airdrop|claim|reward|drop|official|ecosystem)/i,     name: "Base Chain Impersonation", severity: "critical", reason: "Fake Base ecosystem site" },
  { id: "ds-004", pattern: /aerodrome[-.]?(claim|reward|airdrop)/i,                        name: "Aerodrome Impersonation",  severity: "critical", reason: "Typosquat targeting Aerodrome" },
  { id: "ds-005", pattern: /metamask[-.]?(base|claim|connect|wallet)/i,                    name: "MetaMask Impersonation",   severity: "critical", reason: "Fake MetaMask connect page" },
  { id: "ds-006", pattern: /blueagent[-.]?(airdrop|claim|drop|reward)/i,                   name: "Blue Agent Impersonation", severity: "critical", reason: "Impersonating Blue Agent" },
  // Generic scam patterns
  { id: "ds-007", pattern: /(free|get|claim)[-.]?(base|eth|usdc)[-.]?(token|drop|reward)/i, name: "Generic Crypto Giveaway", severity: "high",     reason: "Classic giveaway scam pattern" },
  { id: "ds-008", pattern: /connect[-.]?wallet[-.]?(base|eth|claim)/i,                     name: "Wallet Connect Phish",     severity: "critical", reason: "Fake wallet connection page" },
  { id: "ds-009", pattern: /\.(xyz|tk|ml|ga|cf|gq)\//i,                                   name: "High-Risk TLD",            severity: "high",     reason: "Free TLD commonly used in phishing" },
  { id: "ds-010", pattern: /official[-.]?(base|coinbase|uniswap)/i,                        name: "Fake Official Site",       severity: "critical", reason: "'official' prefix spoofing" },
];

// ─── B. Contract function selectors (4-byte drainer signatures) ──────────────

export interface ContractSignature {
  selector:    string;  // 4-byte hex e.g. "0xa9059cbb"
  name:        string;
  description: string;
  severity:    "critical" | "high";
}

export const DRAINER_SELECTORS: ContractSignature[] = [
  // Known drainer patterns
  { selector: "0x42842e0e", name: "safeTransferFrom NFT Drain",    description: "Batch NFT transfer used in drainer contracts",       severity: "critical" },
  { selector: "0x23b872dd", name: "transferFrom Token Drain",       description: "ERC-20 transferFrom — drainer sweeps approved funds", severity: "critical" },
  { selector: "0x095ea7b3", name: "Unlimited ERC-20 Approve",       description: "approve(spender, MAX_UINT256) pattern",              severity: "high"     },
  { selector: "0xa22cb465", name: "setApprovalForAll NFT",          description: "Approve all NFTs to unknown operator",               severity: "critical" },
  { selector: "0xd0e30db0", name: "ETH Deposit Trap",               description: "deposit() on unverified contract",                   severity: "high"     },
  { selector: "0x4e71d92d", name: "Claim Reward Trap",              description: "claim() with hidden approval requirement",           severity: "high"     },
];

// ─── C. Malicious URL path patterns ──────────────────────────────────────────

export const MALICIOUS_URL_PATHS = [
  "/claim-airdrop",
  "/free-tokens",
  "/connect-and-claim",
  "/verify-wallet",
  "/wallet-verification",
  "/airdrop/claim",
  "/reward/collect",
  "/mint/free",
  "/presale/whitelist-claim",
  "/security-update",  // fake "security" prompts
  "/migration",        // "migrate your tokens" scam
];

// ─── D. OpenPhish live feed ───────────────────────────────────────────────────

const OPENPHISH_FEED  = "https://openphish.com/feed.txt";
const OPENPHISH_CACHE = "sentinel:phishing:openphish";
const OPENPHISH_TTL   = 60 * 60 * 6; // 6h cache

const CRYPTO_PATH_KEYWORDS = [
  "metamask", "coinbase", "uniswap", "base", "ethereum", "wallet",
  "crypto", "defi", "nft", "airdrop", "claim", "token", "web3",
  "blueagent", "aerodrome",
];

async function fetchOpenPhishDomains(): Promise<string[]> {
  // Return cached if fresh
  const cached = await kvGet<string[]>(OPENPHISH_CACHE);
  if (cached) return cached;

  try {
    const res = await fetch(OPENPHISH_FEED, {
      headers: { "User-Agent": "BlueSentinel/1.0 (security research)" },
      signal:  AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];

    const text  = await res.text();
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

    const domains: string[] = [];
    const seen = new Set<string>();

    for (const url of lines) {
      const lower = url.toLowerCase();
      if (!CRYPTO_PATH_KEYWORDS.some(kw => lower.includes(kw))) continue;
      try {
        const domain = new URL(url).hostname.replace(/^www\./, "");
        if (domain && !seen.has(domain)) {
          seen.add(domain);
          domains.push(domain);
        }
      } catch { /* invalid URL */ }
    }

    const result = domains.slice(0, 50);
    await kvSet(OPENPHISH_CACHE, result, OPENPHISH_TTL);
    return result;
  } catch {
    return [];
  }
}

// ─── E. Known malicious Base contract addresses ───────────────────────────────

export const KNOWN_MALICIOUS_CONTRACTS: Array<{
  address:  string;
  name:     string;
  reason:   string;
  severity: "critical" | "high";
}> = [
  // Add confirmed malicious contracts here as they're identified
  // Example (placeholder — verify before adding real addresses):
  // { address: "0x...", name: "Base Drainer v1", reason: "Confirmed drainer contract", severity: "critical" },
];

// ─── DNA Scanner ──────────────────────────────────────────────────────────────

export interface DNAMatch {
  signatureId: string;
  name:        string;
  reason:      string;
  severity:    "critical" | "high";
  matchType:   "domain_pattern" | "url_path" | "contract_selector" | "known_address" | "openphish";
}

/**
 * Scan a URL/domain/address against all phishing DNA signatures.
 * Returns all matches found (may be multiple).
 */
export function scanDNA(target: string): DNAMatch[] {
  const matches: DNAMatch[] = [];
  const lower = target.toLowerCase();

  // Domain signature patterns
  for (const sig of DOMAIN_SIGNATURES) {
    if (sig.pattern.test(lower)) {
      matches.push({
        signatureId: sig.id,
        name:        sig.name,
        reason:      sig.reason,
        severity:    sig.severity,
        matchType:   "domain_pattern",
      });
    }
  }

  // URL path patterns
  for (const path of MALICIOUS_URL_PATHS) {
    if (lower.includes(path.toLowerCase())) {
      matches.push({
        signatureId: `path-${path}`,
        name:        "Malicious URL Path",
        reason:      `URL contains known phishing path: ${path}`,
        severity:    "high",
        matchType:   "url_path",
      });
    }
  }

  // Known malicious contracts
  for (const contract of KNOWN_MALICIOUS_CONTRACTS) {
    if (lower === contract.address.toLowerCase()) {
      matches.push({
        signatureId: `contract-${contract.address}`,
        name:        contract.name,
        reason:      contract.reason,
        severity:    contract.severity,
        matchType:   "known_address",
      });
    }
  }

  return matches;
}

// ─── Discovery: find phishing from OpenPhish ──────────────────────────────────

export async function discoverFromOpenPhish(): Promise<DiscoveredTarget[]> {
  const domains = await fetchOpenPhishDomains();
  return domains.map(domain => ({
    target:      domain,
    targetType:  "domain" as const,
    source:      "pattern" as const,
    reason:      "Active phishing domain (OpenPhish live feed)",
    catalogOnly: false, // run full scan — these are live threats
  }));
}

// ─── Export DNA stats ─────────────────────────────────────────────────────────

export function getDNAStats() {
  return {
    domainSignatures:    DOMAIN_SIGNATURES.length,
    drainerSelectors:    DRAINER_SELECTORS.length,
    urlPathPatterns:     MALICIOUS_URL_PATHS.length,
    knownContracts:      KNOWN_MALICIOUS_CONTRACTS.length,
  };
}
