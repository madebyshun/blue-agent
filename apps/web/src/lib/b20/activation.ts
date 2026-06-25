/**
 * B20 ActivationRegistry check — reads isActivated(featureId) for both B20
 * variants on a given network so the Launch UI can gate the Deploy button
 * BEFORE the wallet step.
 *
 * WHY: createB20 reverts FeatureNotActivated until the ActivationRegistry
 * (0x8453…0001) enables B20 — which can be ~1h after the Beryl hardfork, NOT at
 * the timestamp the fork lands. Without this gate the user clicks Deploy, the
 * wallet tries to estimate gas, the estimate reverts, and they see a confusing
 * "Unable to estimate fee" with no explanation. Reading isActivated up front lets
 * us disable Deploy with a clear message and auto-enable it the moment the
 * registry flips the flag — no code change / redeploy needed.
 *
 * ZERO LLM. One viem multicall (two reads). Light in-memory cache (60s): the flag
 * changes rarely, but a short TTL means the UI auto-detects mainnet going live
 * within a minute of a remount / network toggle.
 *
 * Never throws — on any RPC failure returns ok:false (state unknown) so the caller
 * falls back to the existing flow rather than wrongly blocking a valid deploy.
 */

import { createPublicClient, http } from "viem";
import { base, baseSepolia } from "viem/chains";
import {
  ACTIVATION_REGISTRY_ADDRESS,
  ACTIVATION_REGISTRY_ABI,
  B20_ASSET_FEATURE_ID,
  B20_STABLECOIN_FEATURE_ID,
} from "./inspect-abi";

const NETS = {
  mainnet: { chain: base,        rpc: "https://mainnet.base.org" },
  sepolia: { chain: baseSepolia, rpc: "https://sepolia.base.org" },
} as const;

export interface B20Activation {
  network:    "mainnet" | "sepolia";
  /** false ⟹ the read failed; asset/stablecoin are NOT authoritative — do not block */
  ok:         boolean;
  asset:      boolean;  // ASSET-variant deploys enabled
  stablecoin: boolean;  // STABLECOIN-variant deploys enabled
  checkedAt:  number;
}

const TTL_MS = 60_000;
const cache = new Map<string, B20Activation>();

export async function getB20Activation(
  network: "mainnet" | "sepolia",
): Promise<B20Activation> {
  const hit = cache.get(network);
  if (hit && Date.now() - hit.checkedAt < TTL_MS) return hit;

  const net    = NETS[network];
  const reg    = ACTIVATION_REGISTRY_ADDRESS as `0x${string}`;

  try {
    const client = createPublicClient({ chain: net.chain, transport: http(net.rpc) });
    const res = await client.multicall({
      allowFailure: true,
      contracts: [
        { address: reg, abi: ACTIVATION_REGISTRY_ABI, functionName: "isActivated", args: [B20_ASSET_FEATURE_ID] },
        { address: reg, abi: ACTIVATION_REGISTRY_ABI, functionName: "isActivated", args: [B20_STABLECOIN_FEATURE_ID] },
      ],
    });

    // A per-call failure (status !== "success") means we couldn't read that flag —
    // treat the whole result as unknown rather than guessing "not active".
    if (res[0].status !== "success" || res[1].status !== "success") {
      return { network, ok: false, asset: true, stablecoin: true, checkedAt: Date.now() };
    }

    const out: B20Activation = {
      network,
      ok:         true,
      asset:      Boolean(res[0].result),
      stablecoin: Boolean(res[1].result),
      checkedAt:  Date.now(),
    };
    cache.set(network, out); // only cache authoritative reads
    return out;
  } catch {
    // Transport / network error — unknown, do not block the deploy flow.
    return { network, ok: false, asset: true, stablecoin: true, checkedAt: Date.now() };
  }
}
