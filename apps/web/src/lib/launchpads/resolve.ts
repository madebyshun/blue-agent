/**
 * "Which launchpad is token 0x… from, and is it still on its curve?" — read
 * PURELY from chain state on the token's own chain (2026-10-01).
 *
 * Every probe is a reverse lookup the launchpad's own contracts answer:
 *   Pons V2   token.curve() → curve.factory() == PONS_V2_FACTORY → graduated()
 *   Doppler   Airlock.getAssetData(token) non-zero → integrator (Bankr or an
 *             unidentified front-end, by address) + migration target
 *   Virtuals  Bonding.tokenInfo(token) → trading / tradingOnUniswap / agentToken;
 *             a GRADUATED agent token is a different address the bonding
 *             contract does not know, so it falls back to Virtuals' own keyless
 *             API (filters[tokenAddress]) — the one off-chain read here
 *   Clanker   factory.tokenDeploymentInfo(token).token == token (+ the token's
 *             self-declared `context.interface`, labelled as self-declared)
 *   Zora      token.hooks() == ZoraFactory.contentCoinHook()/creatorCoinHook()
 *
 * A revert / empty return is a MISS. A network failure is NOT: it lands in
 * `unread`, and a token with no hit but an unread probe is "could not be
 * fully checked", never "not from a launchpad". Absence from GeckoTerminal or
 * DexScreener is never used as a negative (a fresh Bankr token 404s there).
 */
import { createPublicClient, fallback, http, parseAbi, getAddress, isAddress, type Address, type PublicClient } from "viem";
import { base } from "viem/chains";
import { robinhoodMainnet } from "@/lib/robinhood/chains";
import { baseRpcUrls } from "@/lib/base-rpc";
import {
  BANKR_INTEGRATOR, CLANKER_FACTORY, DOPPLER_AIRLOCK, LAUNCHPAD_INFO, PONS_V2_FACTORY,
  VIRTUALS_BONDING, ZORA_FACTORY, type LaunchChain, type LaunchpadId,
} from "./registry";

export type LaunchStage =
  | "bonding_curve"     // still trading on the launchpad's curve
  | "graduated"         // moved to its DEX pool
  | "pool_from_launch"  // never had a curve — a DEX pool from block one
  | "unknown";

export interface LaunchpadResolution {
  chain: LaunchChain;
  token: Address;
  launchpad: LaunchpadId | null;
  name: string | null;
  stage: LaunchStage;
  /** Doppler front-end: "Bankr", or "unidentified front-end 0x…". */
  frontEnd?: string;
  /** Facts read on-chain, as short phrases (shown to the user verbatim). */
  facts: string[];
  /** Probes that failed to READ (network) — their answer is unknown. */
  unread: string[];
}

const ZERO = "0x0000000000000000000000000000000000000000";
// Both burn addresses are in use as "no migration target": Bankr's Doppler
// launches carry the all-`dead` one (read on $BLUEAGENT 2026-10-01).
const DEAD = new Set(["0x000000000000000000000000000000000000dead", "0xdeaddeaddeaddeaddeaddeaddeaddeaddeaddead"]);
const isZero = (a: string | undefined | null) => !a || a.toLowerCase() === ZERO;

const ABI = {
  airlock: parseAbi(["function getAssetData(address) view returns (address numeraire, address timelock, address governance, address liquidityMigrator, address poolInitializer, address pool, address migrationPool, uint256 numTokensToSell, uint256 totalSupply, address integrator)"]),
  ponsToken: parseAbi(["function curve() view returns (address)"]),
  ponsCurve: parseAbi(["function factory() view returns (address)", "function graduated() view returns (bool)"]),
  clanker: parseAbi(["function tokenDeploymentInfo(address) view returns ((address token, address hook, address locker, address[] extensions))"]),
  clankerToken: parseAbi(["function allData() view returns (address originalAdmin, address admin, string image, string metadata, string context)"]),
  zoraFactory: parseAbi(["function contentCoinHook() view returns (address)", "function creatorCoinHook() view returns (address)"]),
  zoraCoin: parseAbi(["function hooks() view returns (address)"]),
  // BondingV5.tokenInfo — layout from the verified Base implementation
  // (0x20c1…db40 on base.blockscout.com); the RH deployment answers the same
  // layout (read back 2026-10-01 on a live RH launch).
  virtuals: parseAbi([
    "struct Data { address token; string name; string _name; string ticker; uint256 supply; uint256 price; uint256 marketCap; uint256 liquidity; uint256 volume; uint256 volume24H; uint256 prevPrice; uint256 lastUpdated; }",
    "function tokenInfo(address) view returns (address creator, address token, address pair, address agentToken, Data data, string description, string image, string twitter, string telegram, string youtube, string website, bool trading, bool tradingOnUniswap, uint256 applicationId, uint256 initialPurchase, uint256 virtualId, bool launchExecuted)",
  ]),
};

const clients: Partial<Record<LaunchChain, PublicClient>> = {};
export function launchClient(chain: LaunchChain): PublicClient {
  if (!clients[chain]) {
    clients[chain] = (chain === "base"
      ? createPublicClient({ chain: base, transport: fallback(baseRpcUrls().map((u) => http(u, { timeout: 8_000 }))) })
      : createPublicClient({ chain: robinhoodMainnet, transport: http(undefined, { timeout: 8_000 }) })) as PublicClient;
  }
  return clients[chain]!;
}

type Probe = { hit: false } | { hit: true; res: Omit<LaunchpadResolution, "chain" | "token" | "unread"> };
const MISS: Probe = { hit: false };

/** Revert / no-data = the contract said no. Anything else = we could not ask. */
function isMiss(e: unknown): boolean {
  const m = String((e as Error)?.message ?? e);
  return /revert|returned no data|zero data|out of bounds|is not a contract|function selector|not found on ABI/i.test(m);
}

async function probePons(c: PublicClient, token: Address): Promise<Probe> {
  const curve = await c.readContract({ address: token, abi: ABI.ponsToken, functionName: "curve" });
  if (isZero(curve)) return MISS;
  const factory = await c.readContract({ address: curve, abi: ABI.ponsCurve, functionName: "factory" });
  if (factory.toLowerCase() !== PONS_V2_FACTORY.toLowerCase()) return MISS;
  const graduated = await c.readContract({ address: curve, abi: ABI.ponsCurve, functionName: "graduated" });
  // The graduation threshold is readable too, but in raw units of a quote
  // asset that varies per launch (ETH, USDG or a stock token) — a number the
  // user cannot read is left out rather than half-formatted.
  return { hit: true, res: {
    launchpad: "pons", name: LAUNCHPAD_INFO.pons.name,
    stage: graduated ? "graduated" : "bonding_curve",
    facts: [
      graduated ? "graduated from its Pons curve into a Uniswap v4 pool" : "still on its Pons bonding curve",
      `curve ${curve}`,
    ],
  } };
}

async function probeDoppler(c: PublicClient, chain: LaunchChain, token: Address): Promise<Probe> {
  const d = await c.readContract({ address: DOPPLER_AIRLOCK[chain], abi: ABI.airlock, functionName: "getAssetData", args: [token] });
  const [numeraire, , , migrator, , pool, migrationPool, , , integrator] = d;
  if (isZero(numeraire) && isZero(pool) && isZero(integrator)) return MISS;
  const bankr = integrator.toLowerCase() === BANKR_INTEGRATOR.toLowerCase();
  const noMigration = isZero(migrationPool) || DEAD.has(migrationPool.toLowerCase());
  return { hit: true, res: {
    launchpad: bankr ? "bankr" : "doppler",
    name: bankr ? LAUNCHPAD_INFO.bankr.name : LAUNCHPAD_INFO.doppler.name,
    frontEnd: bankr ? "Bankr" : isZero(integrator) ? undefined : `unidentified front-end ${integrator}`,
    // NoOp migrator + dead migration pool = the multicurve shape: the v4
    // position IS the market, there is nothing to graduate to. Any other
    // shape migrates when its sale ends, which a single read cannot date.
    stage: noMigration ? "pool_from_launch" : "unknown",
    facts: [
      bankr ? "launched through Bankr's front-end on Doppler (Doppler integrator = Bankr's fee address)" : "launched on Doppler",
      noMigration ? "trades in its Uniswap v4 launch position — no curve, nothing to graduate to" : `migrates to ${migrationPool} when its sale ends (migrator ${migrator})`,
    ],
  } };
}

async function probeVirtuals(c: PublicClient, chain: LaunchChain, token: Address): Promise<Probe> {
  const t = await c.readContract({ address: VIRTUALS_BONDING[chain], abi: ABI.virtuals, functionName: "tokenInfo", args: [token] });
  const [, tok, pair, agentToken, data, , , , , , , trading, tradingOnUniswap] = t;
  if (isZero(tok)) return MISS;
  const grad = tradingOnUniswap || !isZero(agentToken);
  return { hit: true, res: {
    launchpad: "virtuals", name: LAUNCHPAD_INFO.virtuals.name,
    stage: grad ? "graduated" : trading ? "bonding_curve" : "unknown",
    facts: [
      grad ? "graduated from the Virtuals curve" : trading ? "still on the Virtuals bonding curve (priced in VIRTUAL)" : "registered on Virtuals but not trading",
      ...(data?.ticker ? [`ticker ${data.ticker}`] : []),
      ...(!isZero(agentToken) ? [`agent token ${agentToken}`] : []),
      ...(!isZero(pair) && !grad ? [`curve pair ${pair}`] : []),
    ],
  } };
}

/** A graduated agent token is unknown to the bonding contract — ask Virtuals. */
async function probeVirtualsApi(chain: LaunchChain, token: Address): Promise<Probe> {
  const r = await fetch(`https://api.virtuals.io/api/virtuals?filters[tokenAddress]=${token}&pagination[pageSize]=1`, {
    signal: AbortSignal.timeout(6_000), headers: { Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`virtuals api ${r.status}`);
  const j = (await r.json()) as { data?: Array<{ chain?: string; symbol?: string; tokenAddress?: string | null }> };
  const row = j.data?.[0];
  if (!row || String(row.tokenAddress ?? "").toLowerCase() !== token.toLowerCase()) return MISS;
  if (String(row.chain ?? "").toUpperCase() !== (chain === "base" ? "BASE" : "ROBINHOOD")) return MISS;
  return { hit: true, res: {
    launchpad: "virtuals", name: LAUNCHPAD_INFO.virtuals.name, stage: "graduated",
    facts: ["the graduated agent token of a Virtuals launch (Virtuals' own registry)", ...(row.symbol ? [`ticker ${row.symbol}`] : [])],
  } };
}

async function probeClanker(c: PublicClient, chain: LaunchChain, token: Address): Promise<Probe> {
  const info = await c.readContract({ address: CLANKER_FACTORY[chain], abi: ABI.clanker, functionName: "tokenDeploymentInfo", args: [token] });
  if (isZero(info.token) || info.token.toLowerCase() !== token.toLowerCase()) return MISS;
  let iface: string | null = null;
  try {
    const d = await c.readContract({ address: token, abi: ABI.clankerToken, functionName: "allData" });
    const m = d[4].match(/"interface"\s*:\s*"([^"]{1,40})"/);
    iface = m ? m[1] : null;
  } catch { /* context is optional */ }
  return { hit: true, res: {
    launchpad: "clanker", name: LAUNCHPAD_INFO.clanker.name, stage: "pool_from_launch",
    facts: [
      "deployed by the Clanker v4 factory — a Uniswap v4 pool from launch, no curve",
      ...(iface ? [`front-end named in the token's own metadata: "${iface}" (self-declared, not proof)`] : []),
    ],
  } };
}

async function probeZora(c: PublicClient, token: Address): Promise<Probe> {
  const hook = await c.readContract({ address: token, abi: ABI.zoraCoin, functionName: "hooks" });
  const [content, creator] = await Promise.all([
    c.readContract({ address: ZORA_FACTORY, abi: ABI.zoraFactory, functionName: "contentCoinHook" }),
    c.readContract({ address: ZORA_FACTORY, abi: ABI.zoraFactory, functionName: "creatorCoinHook" }),
  ]);
  const h = hook.toLowerCase();
  if (h !== content.toLowerCase() && h !== creator.toLowerCase()) return MISS;
  return { hit: true, res: {
    launchpad: "zora", name: LAUNCHPAD_INFO.zora.name, stage: "pool_from_launch",
    facts: ["a Zora coin (the kind Base App posts and creators mint) — its own Uniswap v4 pool from creation"],
  } };
}

/**
 * Is this token a Bankr launch? One Airlock read: true / false, or null when
 * the read failed (never treated as "no"). Used to check GeckoTerminal's
 * `bankr` pool listing, which also files pools Bankr did not launch.
 */
export async function isBankrLaunch(chain: LaunchChain, token: Address): Promise<boolean | null> {
  try {
    const d = await launchClient(chain).readContract({ address: DOPPLER_AIRLOCK[chain], abi: ABI.airlock, functionName: "getAssetData", args: [token] });
    return d[9].toLowerCase() === BANKR_INTEGRATOR.toLowerCase();
  } catch (e) { return isMiss(e) ? false : null; }
}

/** Injectable for tests: the probes to run, in priority order. */
export type ProbeSet = Array<[string, () => Promise<Probe>]>;

export function probesFor(chain: LaunchChain, token: Address, c: PublicClient = launchClient(chain)): ProbeSet {
  return chain === "robinhood"
    ? [
        ["pons", () => probePons(c, token)],
        ["doppler", () => probeDoppler(c, chain, token)],
        ["virtuals", () => probeVirtuals(c, chain, token)],
        ["clanker", () => probeClanker(c, chain, token)],
        ["virtuals-api", () => probeVirtualsApi(chain, token)],
      ]
    : [
        ["doppler", () => probeDoppler(c, chain, token)],
        ["clanker", () => probeClanker(c, chain, token)],
        ["zora", () => probeZora(c, token)],
        ["virtuals", () => probeVirtuals(c, chain, token)],
        ["virtuals-api", () => probeVirtualsApi(chain, token)],
      ];
}

export async function resolveLaunchpad(chain: LaunchChain, tokenRaw: string, probes?: ProbeSet): Promise<LaunchpadResolution> {
  if (!isAddress(tokenRaw)) throw new Error("not an address");
  const token = getAddress(tokenRaw);
  const set = probes ?? probesFor(chain, token);
  // SEQUENTIAL, first hit wins. Measured 2026-10-01: the five Base probes run
  // in parallel made mainnet.base.org refuse most of them, which surfaced as
  // "could not be read" on USDC — a false "unknown". In order they answer,
  // and a hit stops the walk early.
  const settled: Array<{ id: string; p: Probe; err: string | null }> = [];
  for (const [id, run] of set) {
    let r: { id: string; p: Probe; err: string | null };
    try { r = { id, p: await run(), err: null }; }
    catch (e) { r = { id, p: MISS, err: isMiss(e) ? null : String((e as Error)?.message ?? e).slice(0, 120) }; }
    settled.push(r);
    if (r.p.hit) break;
  }
  const hit = settled.find((s) => s.p.hit);
  const unread = settled.filter((s) => s.err).map((s) => s.id);
  if (hit && hit.p.hit) return { chain, token, ...hit.p.res, unread };
  return {
    chain, token, launchpad: null, name: null, stage: "unknown",
    facts: [unread.length > 0
      ? `no launchpad matched, but ${unread.join(", ")} could not be read — so this is not a negative`
      : `not from any launchpad Blue Agent reads on ${chain === "base" ? "Base" : "Robinhood Chain"} (${set.map(([id]) => id).join(", ")})`],
    unread,
  };
}
