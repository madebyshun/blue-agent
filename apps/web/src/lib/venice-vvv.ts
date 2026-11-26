/**
 * Venice VVV / sVVV / DIEM on-chain reader & Blue Chat holder perks (Base 8453).
 *
 * Verified canonical Base 8453 contracts:
 *   - VVV  (Venice Token):        0xacfE6019Ed1A7Dc6f7B508C02d1b04ec88cC21bf (18 dec)
 *   - sVVV (Staked VVV contract): 0x321b7ff75154472B18EDb199033fF4D116F340Ff (18 dec)
 *   - DIEM (Venice DIEM token):   0xF4d97F2da56e8c3098f3a8D538DB630A2606a024 (18 dec)
 *
 * Never send raw ERC-20 transfers directly to sVVV or DIEM contract addresses —
 * staking uses `stake(amount)` on the respective contract.
 */
import { createPublicClient, erc20Abi, formatUnits, http, isAddress, type Address } from "viem";
import { base } from "viem/chains";

export const VENICE_BASE_TOKENS = {
  vvv:  "0xacfE6019Ed1A7Dc6f7B508C02d1b04ec88cC21bf" as Address,
  svvv: "0x321b7ff75154472B18EDb199033fF4D116F340Ff" as Address,
  diem: "0xF4d97F2da56e8c3098f3a8D538DB630A2606a024" as Address,
} as const;

/** Thresholds aligned with Venice's own Pro (100 sVVV) and active DIEM (0.1 DIEM) tiers. */
export const VVV_PERK_THRESHOLDS = {
  minSvvv: 100,
  minDiem: 0.1,
} as const;

/** Presets unlocked at 0 Blue Credits for eligible VVV/DIEM holders. */
export const VVV_PERK_FREE_PRESETS = ["tee"] as const;

export interface VeniceOnchainBalances {
  vvv: number;
  svvv: number;
  diem: number;
  checkedAt: string;
  cached: boolean;
}

export interface VeniceHolderPerk {
  eligible: boolean;
  tier: "diem" | "svvv" | "none";
  reason: string | null;
  freePresets: readonly string[];
}

export function evaluateVeniceHolderPerk(
  bal: Pick<VeniceOnchainBalances, "vvv" | "svvv" | "diem"> | null | undefined,
): VeniceHolderPerk {
  if (!bal) {
    return { eligible: false, tier: "none", reason: null, freePresets: [] };
  }
  if (Number.isFinite(bal.diem) && bal.diem >= VVV_PERK_THRESHOLDS.minDiem) {
    return {
      eligible: true,
      tier: "diem",
      reason: `Holds ${bal.diem.toFixed(2)} DIEM on Base (>= ${VVV_PERK_THRESHOLDS.minDiem} DIEM)`,
      freePresets: VVV_PERK_FREE_PRESETS,
    };
  }
  if (Number.isFinite(bal.svvv) && bal.svvv >= VVV_PERK_THRESHOLDS.minSvvv) {
    return {
      eligible: true,
      tier: "svvv",
      reason: `Holds ${Math.floor(bal.svvv).toLocaleString("en-US")} sVVV on Base (>= ${VVV_PERK_THRESHOLDS.minSvvv} sVVV)`,
      freePresets: VVV_PERK_FREE_PRESETS,
    };
  }
  return { eligible: false, tier: "none", reason: null, freePresets: [] };
}

export function isPresetFreeForVeniceHolder(presetId: string, perk: VeniceHolderPerk): boolean {
  return perk.eligible && perk.freePresets.includes(presetId);
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const _balCache = new Map<string, { value: VeniceOnchainBalances; at: number }>();

/**
 * Reads VVV, sVVV, and DIEM ERC-20 balances for a Base 8453 wallet in one
 * multicall. Cached 5 min per address; returns `null` on RPC failure so chat
 * billing degrades cleanly rather than blocking.
 */
export async function readVeniceOnchainBalances(
  wallet: string,
  opts?: { force?: boolean },
): Promise<VeniceOnchainBalances | null> {
  if (!isAddress(wallet)) return null;
  const key = wallet.toLowerCase();
  const now = Date.now();
  if (!opts?.force) {
    const hit = _balCache.get(key);
    if (hit && now - hit.at < CACHE_TTL_MS) {
      return { ...hit.value, cached: true };
    }
  }

  const client = createPublicClient({
    chain: base,
    transport: http(process.env.HUB_RPC_URL || "https://base-rpc.publicnode.com", {
      timeout: 8_000,
      retryCount: 1,
    }),
  });

  try {
    const res = await client.multicall({
      contracts: [
        { address: VENICE_BASE_TOKENS.vvv,  abi: erc20Abi, functionName: "balanceOf", args: [wallet as Address] },
        { address: VENICE_BASE_TOKENS.svvv, abi: erc20Abi, functionName: "balanceOf", args: [wallet as Address] },
        { address: VENICE_BASE_TOKENS.diem, abi: erc20Abi, functionName: "balanceOf", args: [wallet as Address] },
      ],
      allowFailure: true,
    });
    if (res.every((r) => r.status !== "success")) return null;
    const toNum = (idx: number) =>
      res[idx]?.status === "success" ? Number(formatUnits(res[idx].result as bigint, 18)) : 0;

    const value: VeniceOnchainBalances = {
      vvv: toNum(0),
      svvv: toNum(1),
      diem: toNum(2),
      checkedAt: new Date(now).toISOString(),
      cached: false,
    };
    _balCache.set(key, { value, at: now });
    return value;
  } catch {
    return null;
  }
}
