/**
 * One ERC-8004 agent on Base, assembled from what the chain and our indexes
 * say about it — the /exchange/agent/<id> page (after TOLLY's agent page).
 *
 *   identity   ownerOf / getAgentWallet / tokenURI → its registration file
 *   payTo      the file's `payTo`, else its agentWallet, else its owner
 *   revenue    the Exchange index row for that payTo (measured x402 inflow)
 *   coins      Quadra v3 `Launched` with creator = owner or agentWallet, and
 *              RevenueShare `Created` with agent = agentWallet / owner
 *   market     DexScreener for each coin (base-side pair only, or nothing)
 *
 * Nothing is inferred from a name. A file that cannot be fetched is shown as
 * unreadable; a coin with no pair has no price, not a guessed one.
 */
import { createPublicClient, http, parseAbiItem, type Address } from "viem";
import { base } from "viem/chains";
import { ERC8004_ABI, ERC8004_IDENTITY, readAgentReputation, type Reputation } from "@/lib/erc8004";
import { QUADRA_FACTORY_V3, REVENUE_SHARE_DEPLOYER, REVENUE_SHARE_DEPLOY_BLOCK } from "@/lib/agent-coin";
import { getTokenMarket, type TokenMarket } from "@/lib/market-data";

const QUADRA_V3_BLOCK = 52_929_530n;   // v3 deploy (quadra contracts/README.md)
const LAUNCHED = parseAbiItem("event Launched(address indexed token, address indexed creator, bytes32 indexed poolId, uint256 devBuyIn, uint256 devBuyTokens)");
const CREATED = parseAbiItem("event Created(address indexed token, address indexed share, address indexed agent, uint16 agentBps)");
const WALLET_ABI = [{ type: "function", name: "getAgentWallet", stateMutability: "view", inputs: [{ name: "agentId", type: "uint256" }], outputs: [{ type: "address" }] }] as const;

export interface Registration {
  name?: string; description?: string; image?: string; payTo?: string; x402Support?: boolean;
  services?: { name?: string; endpoint?: string; version?: string }[];
}
export interface AgentCoin { token: string; via: "launched" | "shared"; share?: string; agentBps?: number; market: TokenMarket | null }
export interface AgentProfile {
  id: string;
  owner: string;
  agentWallet: string | null;
  uri: string;
  reg: Registration | null;
  regError: string | null;
  payTo: string;
  reputation: Reputation;
  coins: AgentCoin[] | null;     // null = logs unreadable
}

const lc = (a: string) => a.toLowerCase();
/** publicnode answers "exceed maximum block range: 50000" past 50k blocks (measured 2026-10-28). */
const SPAN = 49_000n;

async function logsInChunks<T>(head: bigint, from: bigint, read: (a: bigint, b: bigint) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let a = from; a <= head; a += SPAN) out.push(...(await read(a, a + SPAN - 1n < head ? a + SPAN - 1n : head)));
  return out;
}

async function readRegistration(uri: string): Promise<{ reg: Registration | null; error: string | null }> {
  try {
    if (uri.startsWith("data:")) {
      const body = uri.slice(uri.indexOf(",") + 1);
      const text = uri.includes(";base64,") ? Buffer.from(body, "base64").toString("utf8") : decodeURIComponent(body);
      return { reg: JSON.parse(text), error: null };
    }
    const url = uri.startsWith("ipfs://") ? `https://ipfs.io/ipfs/${uri.slice(7)}` : uri;
    if (!/^https:\/\//.test(url)) return { reg: null, error: "registration file is not https, data: or ipfs" };
    const r = await fetch(url, { signal: AbortSignal.timeout(6_000), next: { revalidate: 600 } });
    if (!r.ok) return { reg: null, error: `registration file answered HTTP ${r.status}` };
    return { reg: (await r.json()) as Registration, error: null };
  } catch {
    return { reg: null, error: "registration file could not be read" };
  }
}

export async function readAgentProfile(id: string): Promise<AgentProfile | null> {
  if (!/^\d{1,12}$/.test(id)) return null;
  const c = createPublicClient({ chain: base, transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org") });
  const logs = createPublicClient({ chain: base, transport: http(process.env.HUB_RPC_URL || "https://base-rpc.publicnode.com") });
  const agentId = BigInt(id);
  let owner: string;
  try { owner = lc(await c.readContract({ address: ERC8004_IDENTITY, abi: ERC8004_ABI, functionName: "ownerOf", args: [agentId] })); }
  catch { return null; }
  const [uri, wallet, reputation] = await Promise.all([
    c.readContract({ address: ERC8004_IDENTITY, abi: ERC8004_ABI, functionName: "tokenURI", args: [agentId] }).catch(() => ""),
    c.readContract({ address: ERC8004_IDENTITY, abi: WALLET_ABI, functionName: "getAgentWallet", args: [agentId] }).then(lc).catch(() => null),
    readAgentReputation(agentId),
  ]);
  const { reg, error } = uri ? await readRegistration(uri) : { reg: null, error: "no registration file" };
  const agentWallet = wallet && wallet !== "0x0000000000000000000000000000000000000000" ? wallet : null;
  const regPay = typeof reg?.payTo === "string" && /^0x[0-9a-fA-F]{40}$/.test(reg.payTo) ? lc(reg.payTo) : null;
  const payTo = regPay ?? agentWallet ?? owner;

  let coins: AgentCoin[] | null = null;
  try {
    const who = [...new Set([owner, agentWallet].filter(Boolean))] as Address[];
    const head = await logs.getBlockNumber();
    const [launched, shared] = await Promise.all([
      logsInChunks(head, QUADRA_V3_BLOCK, (a, b) => logs.getLogs({ address: QUADRA_FACTORY_V3, event: LAUNCHED, args: { creator: who }, fromBlock: a, toBlock: b })),
      logsInChunks(head, REVENUE_SHARE_DEPLOY_BLOCK, (a, b) => logs.getLogs({ address: REVENUE_SHARE_DEPLOYER, event: CREATED, args: { agent: who }, fromBlock: a, toBlock: b })),
    ]);
    const byToken = new Map<string, AgentCoin>();
    for (const l of launched) byToken.set(lc(l.args.token!), { token: lc(l.args.token!), via: "launched", market: null });
    for (const l of shared) byToken.set(lc(l.args.token!), { token: lc(l.args.token!), via: "shared", share: lc(l.args.share!), agentBps: Number(l.args.agentBps), market: null });
    coins = await Promise.all([...byToken.values()].slice(0, 6).map(async (k) => ({ ...k, market: await getTokenMarket(k.token).catch(() => null) })));
  } catch { coins = null; }

  return { id, owner, agentWallet, uri, reg, regError: error, payTo, reputation, coins };
}
