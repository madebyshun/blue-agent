/**
 * ERC-8004 (Trustless Agents) — Blue Agent's on-chain identity and reputation.
 *
 * Two registries on Base 8453, both read-verified 2026-10-27 against
 * mainnet.base.org (`name()` = "AgentIdentity"; the reputation registry's
 * `getIdentityRegistry()` points back at the identity one):
 *   • Identity   — ERC-721; tokenURI = our registration file.
 *   • Reputation — clients post signed feedback; we only READ it.
 * The validation registry is testnet-only and is not used.
 *
 * NON-CUSTODIAL BY CONSTRUCTION: this module never signs. `register` calldata
 * is printed by scripts/erc8004-register.ts for ShunTr to sign from the wallet
 * that should own the agent NFT; feedback calldata is handed to the BUYER, who
 * signs it from their own wallet (the spec forbids the owner rating itself).
 *
 * `BLUE_AGENT_ID` stays null until that registration tx exists. Every reader
 * treats null as "not registered yet" — never as a zero score.
 */
import { createPublicClient, encodeFunctionData, http, keccak256, parseAbi, toHex } from "viem";
import { base } from "viem/chains";
import { MCP_TOOLS } from "@/lib/mcp-tools";
import { MCP_PRICES } from "@/lib/mcp-paid";
import { X402_PAY_TO } from "@/lib/x402-payee";

export const ERC8004_IDENTITY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const;
export const ERC8004_REPUTATION = "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63" as const;
export const ERC8004_CHAIN_ID = 8453;

/** Set after the registration tx lands (read the agentId from its Transfer log). */
// Registered 2026-10-27: tx 0x63772f863a35364880f85bf8af68cb9cb591294288671bbffd9abc4d7e0fb7c1
// (Base block 53,164,193). ownerOf = getAgentWallet = 0x00fd29b7…746f (ShunTr's
// test-buyer wallet); tokenURI = REGISTRATION_URL. Read back on-chain the same day.
export const BLUE_AGENT_ID: bigint | null = 1137821n;

export const REGISTRATION_URL = "https://blueagent.dev/.well-known/agent-registration.json";

export const ERC8004_ABI = parseAbi([
  "function register(string agentURI) returns (uint256)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function getClients(uint256 agentId) view returns (address[])",
  "function getSummary(uint256 agentId, address[] clientAddresses, string tag1, string tag2) view returns (uint64, int128, uint8)",
  "function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)",
]);

/** The ERC-8004 registration-v1 file the identity NFT points at. */
export function registrationFile() {
  const paid = MCP_TOOLS.filter((t) => MCP_PRICES[t.name]).map((t) => t.name);
  return {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: "Blue Agent",
    description:
      "Onchain tools for agents on Base 8453 and Robinhood Chain 4663: token verdicts, stock token signals, wallet risk, safe trending and unsigned swap, send and bridge transactions. MCP server with x402 pay-per-call in USDC on Base; every settled call has a public Base receipt.",
    image: "https://blueagent.dev/opengraph-image",
    services: [
      { name: "web", endpoint: "https://blueagent.dev/app/services" },
      { name: "MCP", endpoint: "https://blueagent.dev/api/mcp", version: "2025-06-18", tools: MCP_TOOLS.map((t) => t.name) },
      { name: "x402", endpoint: "https://blueagent.dev/api/x402/{tool}", paidTools: paid },
      { name: "ACP", endpoint: "https://blueagent.dev/app/jobs" },
    ],
    x402Support: true,
    active: true,
    registrations: BLUE_AGENT_ID === null ? [] : [
      { agentId: Number(BLUE_AGENT_ID), agentRegistry: `eip155:${ERC8004_CHAIN_ID}:${ERC8004_IDENTITY}` },
    ],
    supportedTrust: ["reputation"],
    payTo: X402_PAY_TO,
  };
}

/** Calldata ShunTr signs to mint the identity. Never sent from here. */
export function registerCalldata(uri = REGISTRATION_URL) {
  return encodeFunctionData({ abi: ERC8004_ABI, functionName: "register", args: [uri] });
}

/** Off-chain feedback file URL for one settled call. */
export const feedbackUri = (tx: string) => `https://blueagent.dev/api/agent-feedback/${tx}`;

/**
 * The unsigned feedback the buyer may post after a settled call. `value` is
 * left for the buyer to choose (0-100); we prefill everything that is fact.
 * Returned only when we are registered — feedback needs an agentId to land on.
 */
export function feedbackTemplate(tool: string, tx: string) {
  if (BLUE_AGENT_ID === null) return null;
  const uri = feedbackUri(tx);
  return {
    chainId: ERC8004_CHAIN_ID,
    to: ERC8004_REPUTATION,
    function: "giveFeedback(uint256,int128,uint8,string,string,string,string,bytes32)",
    args: {
      agentId: BLUE_AGENT_ID.toString(),
      value: "<0-100, your score>",
      valueDecimals: 0,
      tag1: "mcp",
      tag2: tool,
      endpoint: "https://blueagent.dev/api/mcp",
      feedbackURI: uri,
      feedbackHash: keccak256(toHex(uri)),
    },
    note: "Optional. Sign from the wallet that paid; the proof of payment is the Base tx in feedbackURI.",
  };
}

export interface Reputation {
  registered: boolean;
  /** null = registry unreadable; never shown as 0. */
  readable: boolean;
  count: number;
  /** Average score 0-100 across all clients, or null with no feedback. */
  average: number | null;
}

/** Reputation summary for ANY agent id on Base (all clients, all tags). */
export async function readAgentReputation(agentId: bigint): Promise<Reputation> {
  try {
    const c = createPublicClient({ chain: base, transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org") });
    const clients = await c.readContract({ address: ERC8004_REPUTATION, abi: ERC8004_ABI, functionName: "getClients", args: [agentId] });
    if (!clients.length) return { registered: true, readable: true, count: 0, average: null };
    const [count, value, decimals] = await c.readContract({ address: ERC8004_REPUTATION, abi: ERC8004_ABI, functionName: "getSummary", args: [agentId, [...clients], "", ""] });
    const n = Number(count);
    return { registered: true, readable: true, count: n, average: n ? Number(value) / 10 ** decimals : null };
  } catch {
    return { registered: true, readable: false, count: 0, average: null };
  }
}

/** Reputation summary for Blue Agent (optionally one tool, via tag2). */
export async function readReputation(tool?: string): Promise<Reputation> {
  if (BLUE_AGENT_ID === null) return { registered: false, readable: true, count: 0, average: null };
  try {
    const c = createPublicClient({ chain: base, transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org") });
    const clients = await c.readContract({ address: ERC8004_REPUTATION, abi: ERC8004_ABI, functionName: "getClients", args: [BLUE_AGENT_ID] });
    if (!clients.length) return { registered: true, readable: true, count: 0, average: null };
    const [count, value, decimals] = await c.readContract({
      address: ERC8004_REPUTATION, abi: ERC8004_ABI, functionName: "getSummary",
      args: [BLUE_AGENT_ID, [...clients], tool ? "mcp" : "", tool ?? ""],
    });
    const n = Number(count);
    return { registered: true, readable: true, count: n, average: n ? Number(value) / 10 ** decimals : null };
  } catch {
    return { registered: true, readable: false, count: 0, average: null };
  }
}

/** Does `wallet` own ERC-8004 agent `agentId` on Base right now? null = could not read. */
export async function ownsAgent(wallet: string, agentId: string): Promise<boolean | null> {
  if (!/^\d{1,12}$/.test(agentId)) return false;
  try {
    const c = createPublicClient({ chain: base, transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org") });
    const owner = await c.readContract({ address: ERC8004_IDENTITY, abi: ERC8004_ABI, functionName: "ownerOf", args: [BigInt(agentId)] });
    return owner.toLowerCase() === wallet.toLowerCase();
  } catch (e) {
    return /nonexistent|ERC721/i.test(String((e as Error).message)) ? false : null;
  }
}
