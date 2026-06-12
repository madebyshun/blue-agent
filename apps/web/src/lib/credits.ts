/**
 * Blue Agent Credit System — Balance-based daily refresh
 *
 * Credits are granted daily based on $BLUEAGENT balance.
 * No purchase needed — just hold BLUE.
 *
 * Tiers (at $BLUEAGENT $0.000001/token):
 *   Guest    (no wallet):    100 cr/day  (≈10 free Fast messages — growth tier)
 *   Starter  (500K BLUE):   500 cr/day  (~$0.50)
 *   Pro      (2M BLUE):    2000 cr/day  (~$2)
 *   Max      (10M BLUE):      ∞ cr/day  (~$10)
 */

export const BLUE_TOKEN     = "0xf895783b2931c919955e18b5e3343e7c7c456ba3";
export const BASE_RPC       = "https://mainnet.base.org";
export const STAKING_ADDRESS = "0x69e539684EE48F71eCDAd58618d8e8a2423E279d";

const REFRESH_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CAP    = 50_000;              // "unlimited" practical cap

// ── LocalStorage key for last-known daily allowance ───────────────────────────
// Used to detect real tier upgrades (user bought more BLUE) vs normal deductions
const dailyKey = (a?: string) => a ? `blue_cr_daily_${a.toLowerCase()}` : "blue_cr_daily_guest";

// ── Tiers ─────────────────────────────────────────────────────────────────────

export type HolderTier = "Guest" | "Starter" | "Pro" | "Max";

export interface TierInfo {
  tier:        HolderTier;
  blueBalance: number;
  dailyCr:     number;   // credits per day; -1 = unlimited (capped at WHALE_CAP)
  discount:    number;   // Hub tool discount 0–0.50
  color:       string;
  nextTier?:   { name: string; need: number; dailyCr: number };
}

const TIERS: { min: number; tier: HolderTier; dailyCr: number; discount: number; color: string }[] = [
  { min: 10_000_000, tier: "Max",     dailyCr: -1,    discount: 0.40, color: "#F59E0B" },
  { min:  2_000_000, tier: "Pro",     dailyCr: 6_000, discount: 0.20, color: "#A78BFA" },
  { min:    500_000, tier: "Starter", dailyCr: 2_000, discount: 0,    color: "#4FC3F7" },
];

/**
 * Guest = no wallet connected. A SAMPLER, not a free ride: 500/day ≈ one
 * typical x402 tool ($0.20–$0.25 = 400–500 cr) or ~50 Fast msgs — enough to
 * try the product once, but deliberately below the holder tiers so there's a
 * real reason to hold/stake $BLUE. Daily credits cover chat + light tool use;
 * heavy tool usage is pay-per-use (x402 / buy credits) — that keeps the tool
 * revenue intact instead of giving holders unlimited free tools.
 */
export const GUEST_DAILY = 500;

export function getTierInfo(blueBalance: number): TierInfo {
  const idx = TIERS.findIndex((t) => blueBalance >= t.min);

  // Wallet connected but balance below Starter threshold — show as Guest+ with next-tier hint
  if (idx === -1) {
    const lowestTier = TIERS[TIERS.length - 1]; // Starter (500K)
    return {
      tier:        "Starter",
      blueBalance,
      dailyCr:     GUEST_DAILY,  // same as Guest until threshold reached
      discount:    0,
      color:       "#475569",
      nextTier:    { name: lowestTier.tier, need: Math.ceil(lowestTier.min - blueBalance), dailyCr: lowestTier.dailyCr },
    };
  }

  const t    = TIERS[idx];
  const next = TIERS[idx - 1];
  return {
    tier:        t.tier,
    blueBalance,
    dailyCr:     t.dailyCr,
    discount:    t.discount,
    color:       t.color,
    nextTier:    next
      ? { name: next.tier, need: Math.ceil(next.min - blueBalance), dailyCr: next.dailyCr }
      : undefined,
  };
}

export function getDailyCr(tier: TierInfo, hasWallet: boolean): number {
  if (!hasWallet) return GUEST_DAILY;
  return tier.dailyCr === -1 ? MAX_CAP : tier.dailyCr;
}

// ── Credit costs ──────────────────────────────────────────────────────────────

export const BASE_COST: Record<string, number> = {
  // Bankr (Anthropic)
  fast:                   10,
  pro:                    50,
  max:                   200,
  // Venice — standard
  "venice-deepseek":      10,
  "venice-deepseek-pro":  30,
  "venice-kimi":          20,
  "venice-claude":        80,
  "venice-fable":         120,
  "venice-grok":          60,
  "venice-qwen":          40,
  "venice-mistral":       10,
  "venice-uncut":         20,
  // Venice — Privacy / E2EE
  "venice-e2ee-venice":   30,
  "venice-e2ee-gemma":    30,
  "venice-e2ee-qwen":     40,
};

export function creditCost(chatTier: string, holderTier: TierInfo): number {
  const base = BASE_COST[chatTier] ?? BASE_COST.pro;
  return Math.max(1, Math.round(base * (1 - holderTier.discount)));
}

// ── LocalStorage keys ─────────────────────────────────────────────────────────

const crKey      = (a?: string) => a ? `blue_cr_${a.toLowerCase()}`         : "blue_cr_guest";
const refreshKey = (a?: string) => a ? `blue_cr_refresh_${a.toLowerCase()}` : "blue_cr_refresh_guest";

// ── Credit helpers ────────────────────────────────────────────────────────────

export function getCredits(address?: string): number {
  if (typeof window === "undefined") return 0;
  const raw = localStorage.getItem(crKey(address));
  return raw !== null ? Math.max(0, parseInt(raw, 10)) : -1; // -1 = never initialized
}

export function setCredits(amount: number, address?: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(crKey(address), String(Math.max(0, amount)));
}

export function deductCredits(amount: number, address?: string): number {
  const next = Math.max(0, getCredits(address) - amount);
  setCredits(next, address);
  return next;
}

export function addCredits(amount: number, address?: string): number {
  const next = Math.max(0, getCredits(address)) + amount;
  setCredits(next, address);
  return next;
}

// ── Daily refresh ─────────────────────────────────────────────────────────────

export function getLastRefresh(address?: string): number {
  if (typeof window === "undefined") return 0;
  const raw = localStorage.getItem(refreshKey(address));
  return raw ? parseInt(raw, 10) : 0;
}

export function getNextRefresh(address?: string): number {
  return getLastRefresh(address) + REFRESH_MS;
}

export interface RefreshResult {
  credits:   number;
  refreshed: boolean;
  daily:     number;
}

/**
 * Call on mount after fetching blue balance.
 * Grants daily credits if 24h have passed since last refresh.
 */
export function refreshCreditsIfNeeded(
  blueBalance: number,
  address?: string,
): RefreshResult {
  if (typeof window === "undefined") return { credits: 0, refreshed: false, daily: 0 };

  const tier    = getTierInfo(blueBalance);
  const daily   = getDailyCr(tier, !!address);
  const last    = getLastRefresh(address);
  const now     = Date.now();
  const current = getCredits(address);

  const isFirstTime = current === -1;
  const isDue       = now - last >= REFRESH_MS;

  // Tier upgrade: only fires when daily QUOTA itself increased (user bought more BLUE).
  // Compare against last-known daily rather than current credits — otherwise any deduction
  // would look like a "tier upgrade" and reset credits back to full. Bug fix: was previously
  // `daily > current` which reset credits after every WalletBar re-fetch cycle.
  const lastKnownDaily = parseInt(localStorage.getItem(dailyKey(address)) ?? "0", 10);
  const tierUpgraded   = current >= 0 && lastKnownDaily > 0 && daily > lastKnownDaily;

  if (isFirstTime || isDue || tierUpgraded) {
    setCredits(daily, address);
    localStorage.setItem(refreshKey(address), String(now));
    localStorage.setItem(dailyKey(address), String(daily));
    return { credits: daily, refreshed: true, daily };
  }

  // First time we've seen a daily value — store it (without resetting credits)
  if (lastKnownDaily === 0 && current >= 0) {
    localStorage.setItem(dailyKey(address), String(daily));
  }

  return { credits: Math.max(0, current), refreshed: false, daily };
}

// ── BLUE balance via Base RPC ─────────────────────────────────────────────────

/** Convert wei (18 decimals) hex string to BLUE units with 2-decimal precision */
function weiHexToBlue(hex: string | undefined): number {
  if (!hex || hex === "0x") return 0;
  try {
    const raw = BigInt(hex);
    return Math.floor(Number(raw / BigInt(10 ** 16))) / 100;
  } catch {
    return 0;
  }
}

/**
 * Returns EFFECTIVE BLUE balance = wallet ERC-20 balanceOf + staked amount.
 * Stakers count toward tier (e.g., Starter tier at 500K BLUE staked OR held).
 */
export async function fetchBlueBalance(address: string): Promise<number> {
  // ERC-20 balanceOf(address) — selector 0x70a08231
  const balanceOfData = "0x70a08231" + address.slice(2).padStart(64, "0");
  // BlueMarketStaking.stakeInfo(address) — selector 0x1601e641
  // (Returns tuple (amount, stakedAt, dailyCredits, cooldown, pendingUsdc) — we only read amount = first 32 bytes of result)
  const stakeInfoData = "0x1601e641" + address.slice(2).padStart(64, "0");

  try {
    const res = await fetch(BASE_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        { jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: BLUE_TOKEN,     data: balanceOfData }, "latest"] },
        { jsonrpc: "2.0", id: 2, method: "eth_call", params: [{ to: STAKING_ADDRESS, data: stakeInfoData }, "latest"] },
      ]),
      signal: AbortSignal.timeout(5000),
    });
    const json = await res.json() as { id: number; result?: string }[];
    const walletHex = json.find(r => r.id === 1)?.result;
    const stakeHex  = json.find(r => r.id === 2)?.result;

    const wallet = weiHexToBlue(walletHex);
    // stakeInfo returns 5 uint256 values — amount is the first 32 bytes (after 0x prefix).
    const stakedAmountHex = stakeHex && stakeHex.length >= 66 ? "0x" + stakeHex.slice(2, 66) : undefined;
    const staked = weiHexToBlue(stakedAmountHex);

    return wallet + staked;
  } catch {
    return 0;
  }
}
