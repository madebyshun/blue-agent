/**
 * Blue Agent Credit System — Balance-based daily refresh
 *
 * Credits are granted daily based on $BLUEAGENT balance.
 * No purchase needed — just hold BLUE.
 *
 * Tiers (at $BLUEAGENT $0.000001/token):
 *   Guest    (no wallet):     30 cr/day
 *   Starter  (500K BLUE):   500 cr/day  (~$0.50)
 *   Pro      (2M BLUE):    2000 cr/day  (~$2)
 *   Max      (10M BLUE):      ∞ cr/day  (~$10)
 */

export const BLUE_TOKEN = "0xf895783b2931c919955e18b5e3343e7c7c456ba3";
export const BASE_RPC   = "https://mainnet.base.org";

const REFRESH_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CAP    = 50_000;              // "unlimited" practical cap

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
  { min:  2_000_000, tier: "Pro",     dailyCr: 2_000, discount: 0.20, color: "#A78BFA" },
  { min:    500_000, tier: "Starter", dailyCr:   500, discount: 0,    color: "#4FC3F7" },
];

/** Guest = no wallet connected */
export const GUEST_DAILY = 30;

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
  fast:              10,
  pro:               50,
  max:              200,
  "venice-deepseek": 10,
  "venice-grok":     60,
  "venice-uncut":    20,
  "venice-mistral":  10,
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

  if (isFirstTime || isDue) {
    setCredits(daily, address);
    localStorage.setItem(refreshKey(address), String(now));
    return { credits: daily, refreshed: true, daily };
  }

  return { credits: Math.max(0, current), refreshed: false, daily };
}

// ── BLUE balance via Base RPC ─────────────────────────────────────────────────

export async function fetchBlueBalance(address: string): Promise<number> {
  const data = "0x70a08231" + address.slice(2).padStart(64, "0");
  try {
    const res  = await fetch(BASE_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1,
        method: "eth_call",
        params: [{ to: BLUE_TOKEN, data }, "latest"],
      }),
      signal: AbortSignal.timeout(5000),
    });
    const json = await res.json() as { result?: string };
    const hex  = json.result;
    if (!hex || hex === "0x") return 0;
    const raw = BigInt(hex);
    return Math.floor(Number(raw / BigInt(10 ** 16))) / 100;
  } catch {
    return 0;
  }
}
