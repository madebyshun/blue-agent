/**
 * Token launchpads on Base (8453) and Robinhood Chain (4663) — the addresses
 * and event topics Blue Agent reads to answer "which launchpad is this token
 * from, is it still on its curve?" and "what launched today?" (2026-10-01).
 *
 * EVERY address below was checked on its OWN chain the day it was added:
 * bytecode present (eth_getCode), and either live events seen from it that day
 * or state read back from it that points at it (e.g. a Pons curve's
 * `factory()`, a token's Doppler `getAssetData`). Sources are named per entry.
 * Measured activity (24h, 2026-10-01): RH — Pons V2 6,914 launches / 77
 * graduations, Flap 5,159, Doppler 2,543 (Bankr 82), Virtuals 17, Clanker ~2;
 * Base — Doppler 1,155 (Bankr 470), Zora 666, Clanker v4 147, Flaunch ≥127,
 * Virtuals 6. Launch counts are spam-scale: never present a launch as a pick.
 *
 * Event topics were recomputed from their signatures with keccak256 and
 * matched against live logs (scripts/launchpad-check.ts pins them).
 *
 * WHAT IS NOT HERE, on purpose:
 *  - Flaunch's addresses from a docs.base.org snippet (0x9A70…AFdC etc.) have NO
 *    code on Base; only the official SDK's PositionManagers are real, and they
 *    expose no cheap reverse lookup, so Flaunch is named in the knowledge text
 *    only.
 *  - Any Bankr API. Bankr's account is suspended and its integration was
 *    removed (CLAUDE.md, "Bankr is fully removed"). A Bankr launch is
 *    identified PURELY ON-CHAIN: Doppler's `getAssetData(token).integrator`
 *    is Bankr's fee address, verified on three known Bankr launches —
 *    including the original $BLUEAGENT. That is a label read from chain state,
 *    not an integration (ShunTr approved this distinction 2026-10-01).
 *  - Names for the other Doppler integrators. Six on Base and five on RH are
 *    unidentified; they are reported by address, never by a guessed name.
 */
import type { Address, Hex } from "viem";

export type LaunchChain = "base" | "robinhood";

export const DOPPLER_AIRLOCK: Record<LaunchChain, Address> = {
  // docs.doppler.lol/reference/contract-addresses — both chains listed there.
  base: "0x660eAaEdEBc968f8f3694354FA8EC0b4c5Ba8D12",
  robinhood: "0xeb7c034704ef8dcd2d32324c1545f62fb4ad0862",
};

/** Bankr's integrator / fee address — on-chain marker only (see header). */
export const BANKR_INTEGRATOR: Address = "0xF60633D02690e2A15A54AB919925F3d038Df163e";

export const CLANKER_FACTORY: Record<LaunchChain, Address> = {
  // Base v4.0 factory: clanker.gitbook.io deployed-contracts. RH: absent from
  // Clanker's docs page, but Clanker's own API lists 7,521 chain-4663 tokens
  // with this factory, and it emits the same TokenCreated event.
  base: "0xE85A59c628F7d27878ACeB4bf3b35733630083a9",
  robinhood: "0xD3f2cC1731b7Fd17f28798835C2E02f0a1839A94",
};

export const VIRTUALS_BONDING: Record<LaunchChain, Address> = {
  // whitepaper.virtuals.io — important-links-and-resources/contract-addresses.
  base: "0x1A540088125d00dD3990f9dA45CA0859af4d3B01",
  robinhood: "0xd4cCBFA37e2f35611b3042e4096Ad7a3459Bd007",
};

/** Zora coins factory — Base only (no code on RH). docs.zora.co/coins. */
export const ZORA_FACTORY: Address = "0x777777751622c0d3258f214F9DF38E35BF45baF3";

/** Pons Family launchpad V2 factory — Robinhood Chain only (ponsfamily.com;
 *  address from Bitquery's Pons V2 list, verified via `curve.factory()`). */
export const PONS_V2_FACTORY: Address = "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e";

/** Flap (flap.sh) launcher on Robinhood Chain — Bitquery's Flap docs. */
export const FLAP_RH: Address = "0x26605f322f7ff986f381bb9a6e3f5dab0beaeb09";

export const TOPICS = {
  /** Airlock: Create(address asset, address indexed numeraire, address initializer, address poolOrHook) */
  dopplerCreate: "0x68ff1cfcdcf76864161555fc0de1878d8f83ec6949bf351df74d8a4a1a2679ab",
  /** Clanker v4: TokenCreated(address msgSender, address indexed tokenAddress, …) */
  clankerTokenCreated: "0x9299d1d1a88d8e1abdc591ae7a167a6bc63a8f17d695804e9091ee33aa89fb67",
  /** Pons V2: TokenLaunched(address indexed token, address indexed curve, address indexed creator, address quoteAsset, uint256, uint256 threshold) */
  ponsLaunched: "0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607",
  /** Pons V2: PoolGraduated(address indexed token, …) */
  ponsGraduated: "0x0a44ef75df69c534f43cd6c1aa3ef8983065fe5fe79ef9e79f6494e6f258c259",
  /** Flap: TokenCreated(uint256 ts, address creator, uint256 nonce, address token, string name, string symbol, string meta) — no indexed fields */
  flapCreated: "0x504e7f360b2e5fe33cbaaae4c593bc55305328341bf79009e43e0e3b7f699603",
  /** Virtuals BondingV5: Launched(address indexed token, address indexed pair, uint256 virtualId, …) */
  virtualsLaunched: "0x6ed5dc54f1333f448f2cdf7a6efc675343f880035d6f647fb7f6e9cbf8959718",
  /** Virtuals BondingV5: Graduated(address indexed token, address agentToken) */
  virtualsGraduated: "0x381d54fa425631e6266af114239150fae1d5db67bb65b4fa9ecc65013107e07e",
} as const satisfies Record<string, Hex>;

export type LaunchpadId = "pons" | "doppler" | "bankr" | "virtuals" | "clanker" | "zora" | "flap";

/** Display names + one-line mechanism, used by both readers and the prompt. */
export const LAUNCHPAD_INFO: Record<LaunchpadId, { name: string; chains: LaunchChain[]; mechanism: string }> = {
  pons:     { name: "Pons (Pons Family)", chains: ["robinhood"], mechanism: "bonding curve quoted in ETH, USDG or a stock token; graduates (4.2 ETH on the ETH quote) into a Uniswap v4 pool with locked LP" },
  doppler:  { name: "Doppler", chains: ["base", "robinhood"], mechanism: "launch protocol many front-ends build on; tokens start in a Uniswap v4 multicurve position" },
  bankr:    { name: "Bankr (via Doppler)", chains: ["base", "robinhood"], mechanism: "launched through Bankr's front-end on Doppler — straight into a Uniswap v4 multicurve position, no bonding curve, no graduation" },
  virtuals: { name: "Virtuals", chains: ["base", "robinhood"], mechanism: "AI-agent launchpad; bonding curve priced in VIRTUAL, graduates to a Uniswap V2 pool" },
  clanker:  { name: "Clanker", chains: ["base", "robinhood"], mechanism: "no bonding curve — a Uniswap v4 pool is created at launch" },
  zora:     { name: "Zora (incl. Base App coins)", chains: ["base"], mechanism: "content / creator coins, each in a Uniswap v4 pool from creation — no bonding curve" },
  flap:     { name: "Flap (flap.sh)", chains: ["robinhood"], mechanism: "bonding-curve launchpad (graduation details not verified)" },
};
