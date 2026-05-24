/**
 * Blue Sentinel — Threat Catalog
 *
 * Canonical threat definitions — categories, indicators, known-bad seeds.
 * Types live in types.ts, constants in constants.ts.
 * This file contains only the THREAT_CATALOG data + catalog helpers.
 */

// Re-export types for backward compatibility
export type {
  ThreatCategory,
  ThreatSeverity,
  ThreatEntry,
  Finding,
  WatchSubscription,
} from "@/lib/sentinel/types";

// Re-export constants for backward compatibility (SEVERITY_WEIGHT excluded — import from constants directly)
export {
  SENTINEL_KV,
  SENTINEL_TTL,
} from "@/lib/sentinel/constants";

export { SEVERITY_WEIGHT } from "@/lib/sentinel/constants";

// Import types needed by THREAT_CATALOG data
import type { ThreatEntry } from "@/lib/sentinel/types";

// ─── Seed Catalog ─────────────────────────────────────────────────────────────

export const THREAT_CATALOG: ThreatEntry[] = [
  // ── Honeypot ────────────────────────────────────────────────────────────────
  {
    id:          "honeypot-erc20-v1",
    category:    "honeypot",
    severity:    "critical",
    name:        "ERC-20 Honeypot Token",
    description: "Token contract allows buys but blocks sells via owner-controlled transfer restrictions, hidden fee >50%, or blacklist mechanism.",
    indicators:  [
      "sell_blocked",
      "transfer_restriction",
      "hidden_fee_above_50",
      "owner_can_blacklist",
      "buy_only_contract",
      "max_tx_manipulation",
    ],
    updatedAt: "2026-05-23",
  },
  {
    id:          "honeypot-nft-v1",
    category:    "honeypot",
    severity:    "high",
    name:        "NFT Honeypot",
    description: "NFT contract mints freely but transfer/sell is gated or permanently disabled after mint.",
    indicators:  [
      "nft_transfer_disabled",
      "soulbound_undisclosed",
      "approve_blocked_post_mint",
    ],
    updatedAt: "2026-05-23",
  },

  // ── Rug Pull ─────────────────────────────────────────────────────────────────
  {
    id:          "rug-liquidity-v1",
    category:    "rug",
    severity:    "critical",
    name:        "Liquidity Rug Pull",
    description: "Team can withdraw all liquidity from the pool — LP tokens not locked, renounce pattern missing.",
    indicators:  [
      "lp_unlocked",
      "owner_can_remove_liquidity",
      "no_lock_contract",
      "dev_wallet_holds_lp",
      "single_lp_provider",
    ],
    updatedAt: "2026-05-23",
  },
  {
    id:          "rug-mint-v1",
    category:    "rug",
    severity:    "critical",
    name:        "Unlimited Mint / Supply Inflation",
    description: "Owner retains unrestricted mint capability, enabling infinite supply dilution.",
    indicators:  [
      "owner_can_mint",
      "mint_function_not_renounced",
      "uncapped_supply",
      "mint_to_arbitrary_address",
    ],
    updatedAt: "2026-05-23",
  },
  {
    id:          "rug-ownership-v1",
    category:    "rug",
    severity:    "high",
    name:        "Unrenounced Dangerous Ownership",
    description: "Contract ownership not renounced and owner has write access to critical parameters (fees, pausing, blacklisting).",
    indicators:  [
      "owner_not_renounced",
      "owner_can_pause",
      "owner_can_change_fee",
      "owner_can_blacklist",
      "proxy_upgrade_no_timelock",
    ],
    updatedAt: "2026-05-23",
  },

  // ── Phishing ─────────────────────────────────────────────────────────────────
  {
    id:          "phishing-domain-v1",
    category:    "phishing",
    severity:    "critical",
    name:        "Phishing Domain",
    description: "Domain impersonates a legitimate Base/DeFi protocol to steal wallet approvals or seed phrases.",
    indicators:  [
      "domain_typosquat",
      "lookalike_domain",
      "fake_coinbase_domain",
      "fake_uniswap_domain",
      "fake_base_domain",
      "drain_approval_pattern",
    ],
    domains: [
      "base-airdrop.xyz",
      "coinbase-claim.net",
      "uniswap-v4-base.com",
      "blueagent-airdrop.xyz",
      "base-rewards.io",
      "claim-base.org",
    ],
    updatedAt: "2026-05-23",
  },
  {
    id:          "phishing-approval-v1",
    category:    "phishing",
    severity:    "critical",
    name:        "Malicious Wallet Approval Drainer",
    description: "Contract requests unlimited ERC-20 approval then drains wallet in a follow-up transaction.",
    indicators:  [
      "unlimited_approval_request",
      "drain_after_approval",
      "approval_to_unknown_contract",
      "setApprovalForAll_nft_drain",
    ],
    updatedAt: "2026-05-23",
  },

  // ── Mixer / Money Laundering ──────────────────────────────────────────────────
  {
    id:          "mixer-tornado-v1",
    category:    "mixer",
    severity:    "high",
    name:        "Tornado Cash / Mixer Exposure",
    description: "Address has direct interaction with Tornado Cash or known Base chain mixer contracts.",
    indicators:  [
      "tornado_cash_interaction",
      "mixer_deposit",
      "mixer_withdrawal",
      "layered_hops_through_mixer",
    ],
    addresses: [
      "0x4447eF57E6F7bA1FbB5f01E809d56B67F62B001E", // TC on Base (example placeholder — verify)
    ],
    updatedAt: "2026-05-23",
  },

  // ── Exploit ───────────────────────────────────────────────────────────────────
  {
    id:          "exploit-flash-loan-v1",
    category:    "exploit",
    severity:    "critical",
    name:        "Flash Loan Attack Pattern",
    description: "Transaction pattern consistent with flash loan price manipulation or oracle attack.",
    indicators:  [
      "flash_loan_borrow_repay_single_tx",
      "price_oracle_manipulation",
      "abnormal_reserve_change",
      "multi_protocol_single_tx",
    ],
    updatedAt: "2026-05-23",
  },
  {
    id:          "exploit-reentrancy-v1",
    category:    "exploit",
    severity:    "critical",
    name:        "Reentrancy Vulnerability",
    description: "Contract code pattern suggests reentrancy vulnerability — state changes after external calls.",
    indicators:  [
      "external_call_before_state_change",
      "missing_reentrancy_guard",
      "recursive_call_pattern",
    ],
    updatedAt: "2026-05-23",
  },

  // ── Wallet Drain ──────────────────────────────────────────────────────────────
  {
    id:          "drain-approve-v1",
    category:    "drain",
    severity:    "critical",
    name:        "Token Approval Drain",
    description: "Known drainer contract pattern — requests approvals via social engineering then sweeps assets.",
    indicators:  [
      "known_drainer_address",
      "approval_to_drainer",
      "nft_approval_to_drainer",
      "permit2_abuse",
    ],
    updatedAt: "2026-05-23",
  },
  {
    id:          "drain-airdrop-v1",
    category:    "drain",
    severity:    "high",
    name:        "Fake Airdrop Drain",
    description: "Fake airdrop contract requires approval or 'claiming fee' that enables asset drain.",
    indicators:  [
      "fake_airdrop_claim",
      "approval_required_to_claim",
      "fee_to_claim_airdrop",
      "zero_liquidity_airdrop_token",
    ],
    updatedAt: "2026-05-23",
  },

  // ── AML / Sanctions ───────────────────────────────────────────────────────────
  {
    id:          "aml-sanctions-v1",
    category:    "aml",
    severity:    "critical",
    name:        "OFAC Sanctioned Address",
    description: "Address appears on OFAC SDN list or has direct interaction with a sanctioned entity.",
    indicators:  [
      "ofac_sdn_match",
      "interaction_with_sanctioned_address",
      "chainalysis_severe_risk",
    ],
    updatedAt: "2026-05-23",
  },
  {
    id:          "aml-high-risk-v1",
    category:    "aml",
    severity:    "high",
    name:        "High-Risk AML Pattern",
    description: "Address shows layering, structuring, or high-risk counterparty exposure patterns.",
    indicators:  [
      "layering_pattern",
      "structuring_below_threshold",
      "darknet_market_exposure",
      "high_risk_exchange_source",
    ],
    updatedAt: "2026-05-23",
  },

  // ── Scam Token ────────────────────────────────────────────────────────────────
  {
    id:          "scam-token-impersonation-v1",
    category:    "scam_token",
    severity:    "high",
    name:        "Token Impersonation",
    description: "Token uses same name/symbol as a legitimate token with no relation — designed to confuse users.",
    indicators:  [
      "duplicate_symbol",
      "impersonates_major_token",
      "similar_name_zero_utility",
      "airdropped_to_holders_of_real_token",
    ],
    updatedAt: "2026-05-23",
  },

  // ── Proxy Upgrade ─────────────────────────────────────────────────────────────
  {
    id:          "proxy-upgrade-malicious-v1",
    category:    "proxy_upgrade",
    severity:    "critical",
    name:        "Malicious Proxy Upgrade",
    description: "Contract implementation was upgraded and new bytecode contains dangerous patterns: selfdestruct, arbitrary delegatecall, hidden backdoor, or ownership theft.",
    indicators:  [
      "selfdestruct_in_implementation",
      "arbitrary_delegatecall",
      "hidden_owner_backdoor",
      "implementation_rug_pattern",
      "unauthorized_upgrade",
    ],
    updatedAt: "2026-05-24",
  },
  {
    id:          "proxy-upgrade-suspicious-v1",
    category:    "proxy_upgrade",
    severity:    "high",
    name:        "Suspicious Proxy Upgrade",
    description: "Contract was upgraded with changes to critical functions: fee logic, pausing, minting, or ownership transfer patterns.",
    indicators:  [
      "fee_function_changed",
      "new_mint_function",
      "pause_mechanism_added",
      "ownership_transfer_in_upgrade",
      "unverified_new_implementation",
    ],
    updatedAt: "2026-05-24",
  },

  // ── Post-Deploy Risk ─────────────────────────────────────────────────────────
  {
    id:          "post-deploy-backdoor-v1",
    category:    "post_deploy",
    severity:    "critical",
    name:        "Backdoor in Deployed Contract",
    description: "Newly deployed contract contains a hidden backdoor: selfdestruct, arbitrary delegatecall, hidden owner, or privileged drain function discovered post-deployment.",
    indicators:  [
      "selfdestruct_callable",
      "arbitrary_delegatecall",
      "hidden_owner_function",
      "privileged_drain_function",
      "deploy_backdoor_pattern",
    ],
    updatedAt: "2026-05-24",
  },
  {
    id:          "post-deploy-risk-v1",
    category:    "post_deploy",
    severity:    "high",
    name:        "High-Risk Deployed Contract",
    description: "Newly deployed contract shows high-risk patterns: unverified source, dangerous owner permissions, or honeypot-like transfer restrictions.",
    indicators:  [
      "unverified_source_code",
      "owner_retains_full_control",
      "transfer_restriction_on_deploy",
      "deploy_risk_score_high",
      "no_audit_on_deploy",
    ],
    updatedAt: "2026-05-24",
  },
  {
    id:          "post-deploy-low-quality-v1",
    category:    "post_deploy",
    severity:    "medium",
    name:        "Suspicious Deploy Pattern",
    description: "Contract deployment shows low-quality or suspicious patterns: copy-paste bytecode, minimal testing, or copied from known scam templates.",
    indicators:  [
      "known_scam_template_bytecode",
      "low_test_coverage",
      "copied_contract_pattern",
      "rapid_deploy_then_trade",
    ],
    updatedAt: "2026-05-24",
  },

  // ── Liquidity Drain ───────────────────────────────────────────────────────────
  {
    id:          "liquidity-critical-drop-v1",
    category:    "liquidity_drain",
    severity:    "critical",
    name:        "Critical Liquidity Drop",
    description: "Token liquidity dropped >70% in a single cycle — consistent with rug pull or coordinated LP removal.",
    indicators:  [
      "liquidity_drop_70pct",
      "lp_removal_pattern",
      "coordinated_sell_wall",
      "single_cycle_rug",
    ],
    updatedAt: "2026-05-24",
  },
  {
    id:          "liquidity-low-v1",
    category:    "liquidity_drain",
    severity:    "high",
    name:        "Critically Low Liquidity",
    description: "Token pool liquidity below $10,000 USD — extremely vulnerable to manipulation, price impact attacks, or exit scam.",
    indicators:  [
      "liquidity_below_10k",
      "thin_pool_manipulation_risk",
      "high_price_impact",
    ],
    updatedAt: "2026-05-24",
  },
  {
    id:          "liquidity-vol-ratio-v1",
    category:    "liquidity_drain",
    severity:    "high",
    name:        "Extreme Volume/Liquidity Ratio",
    description: "24h trading volume >10x the liquidity pool size — indicates wash trading, pump-and-dump, or imminent exit scam.",
    indicators:  [
      "vol_liq_ratio_10x",
      "wash_trading_pattern",
      "pump_dump_vol_pattern",
      "exit_scam_volume_signal",
    ],
    updatedAt: "2026-05-24",
  },
  {
    id:          "liquidity-price-crash-v1",
    category:    "liquidity_drain",
    severity:    "high",
    name:        "Rapid Price Crash",
    description: "Token price dropped >50% in the last hour — may indicate rug pull, coordinated dump, or exploit.",
    indicators:  [
      "price_drop_50pct_1h",
      "coordinated_dump_pattern",
      "rug_price_signal",
    ],
    updatedAt: "2026-05-24",
  },

  // ── Malicious Approval ────────────────────────────────────────────────────────
  {
    id:          "malicious-approval-infinite-v1",
    category:    "malicious_approval",
    severity:    "high",
    name:        "Infinite Token Approval to Unverified Contract",
    description: "Wallet has granted unlimited token spend approval to an unverified or suspicious contract.",
    indicators:  [
      "infinite_approval",
      "approval_to_unverified",
      "approval_to_proxy_with_no_audit",
      "stale_unlimited_approval",
    ],
    updatedAt: "2026-05-23",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

import type { ThreatSeverity, ThreatCategory } from "@/lib/sentinel/types";

/** All known-bad addresses from the catalog */
export function getAllBadAddresses(): string[] {
  return THREAT_CATALOG.flatMap(t => t.addresses ?? []);
}

/** All known-bad domains from the catalog */
export function getAllBadDomains(): string[] {
  return THREAT_CATALOG.flatMap(t => t.domains ?? []);
}

/** Get entries by severity */
export function getBySeverity(severity: ThreatSeverity): ThreatEntry[] {
  return THREAT_CATALOG.filter(t => t.severity === severity);
}

/** Get entries by category */
export function getByCategory(category: ThreatCategory): ThreatEntry[] {
  return THREAT_CATALOG.filter(t => t.category === category);
}
