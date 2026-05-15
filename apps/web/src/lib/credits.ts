/**
 * Blue Agent Credit System
 *
 * Credits are the in-app currency for chat.
 * Holders of $BLUEAGENT get discounts based on their tier.
 *
 * Storage: localStorage (client-side, keyed by wallet address)
 * Balance: fetched via Base RPC — no wallet signing needed
 */

export const BLUE_TOKEN  = "0xf895783b2931c919955e18b5e3343e7c7c456ba3";
export const BASE_RPC    = "https://mainnet.base.org";

// ── Tiers ─────────────────────────────────────────────────────────────────────

export type HolderTier = "Explorer" | "Builder" | "Maker" | "Founder";

export interface TierInfo {
  tier:        HolderTier;
  blueBalance: number;
  discount:    number;   // 0–0.70
  color:       string;
  nextTier?:   { name: string; need: number };
}

const TIERS: { min: number; tier: HolderTier; discount: number; color: string }[] = [
  { min: 100_000, tier: "Founder",  discount: 0.70, color: "#F59E0B" },
  { min: 10_000,  tier: "Maker",    discount: 0.50, color: "#7C3AED" },
  { min: 1_000,   tier: "Builder",  discount: 0.30, color: "#0EA5E9" },
  { min: 0,       tier: "Explorer", discount: 0,    color: "#475569" },
];

export function getTierInfo(blueBalance: number): TierInfo {
  const idx  = TIERS.findIndex((t) => blueBalance >= t.min);
  const t    = TIERS[idx];
  const next = TIERS[idx - 1];
  return {
    tier:        t.tier,
    blueBalance,
    discount:    t.discount,
    color:       t.color,
    nextTier:    next ? { name: next.tier, need: next.min - blueBalance } : undefined,
  };
}

// ── Credit costs ──────────────────────────────────────────────────────────────

export const BASE_COST: Record<string, number> = {
  fast: 10,
  pro:  50,
  max:  200,
};

/** Credit cost after holder discount */
export function creditCost(chatTier: string, holderTier: TierInfo): number {
  const base = BASE_COST[chatTier] ?? BASE_COST.pro;
  return Math.max(1, Math.round(base * (1 - holderTier.discount)));
}

// ── LocalStorage helpers ──────────────────────────────────────────────────────

const key      = (addr?: string) => addr ? `blue_cr_${addr.toLowerCase()}` : "blue_cr_guest";
const initFlag = (addr?: string) => addr ? `blue_cr_init_${addr.toLowerCase()}` : "blue_cr_init_guest";

export const FREE_WALLET = 200;
export const FREE_GUEST  = 50;

export function getCredits(address?: string): number {
  if (typeof window === "undefined") return 0;
  const raw = localStorage.getItem(key(address));
  return raw !== null ? parseInt(raw, 10) : -1;  // -1 = never initialized
}

/** Initialize credits for new users. Returns current balance. */
export function ensureCredits(address?: string): number {
  if (typeof window === "undefined") return 0;
  const flag = initFlag(address);
  const k    = key(address);
  const free = address ? FREE_WALLET : FREE_GUEST;

  if (!localStorage.getItem(flag)) {
    localStorage.setItem(flag, "1");
    if (!localStorage.getItem(k)) {
      localStorage.setItem(k, String(free));
      return free;
    }
  }
  const raw = localStorage.getItem(k);
  return raw !== null ? parseInt(raw, 10) : 0;
}

export function setCredits(amount: number, address?: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(key(address), String(Math.max(0, amount)));
}

export function deductCredits(amount: number, address?: string): number {
  const current = Math.max(0, getCredits(address));
  const next    = Math.max(0, current - amount);
  setCredits(next, address);
  return next;
}

// ── BLUE balance via Base RPC ─────────────────────────────────────────────────

/** Fetch $BLUEAGENT balance for a wallet address (no signing needed) */
export async function fetchBlueBalance(address: string): Promise<number> {
  // ERC-20 balanceOf(address) selector: 0x70a08231
  const data = "0x70a08231" + address.slice(2).padStart(64, "0");
  try {
    const res = await fetch(BASE_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to: BLUE_TOKEN, data }, "latest"],
      }),
      signal: AbortSignal.timeout(5000),
    });
    const json = await res.json() as { result?: string };
    const hex  = json.result;
    if (!hex || hex === "0x") return 0;
    // 18 decimals → display with up to 2 decimal places
    const raw = BigInt(hex);
    return Math.floor(Number(raw / BigInt(10 ** 16))) / 100;
  } catch {
    return 0;
  }
}
