/**
 * ERC-8004 drafts for anyone's agent (/hub/create) — client-safe: no server
 * imports, so the create page can build and encode the file in the browser.
 * The wallet signs; nothing here sends a transaction.
 */
import { parseAbi } from "viem";

export const ERC8004_IDENTITY_ADDRESS = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const;

export interface AgentDraft {
  name: string;
  description: string;
  image?: string;
  web?: string;
  mcp?: string;
  a2a?: string;
  x402: boolean;
}

/** Why a draft cannot be minted, or null. Cheap, no network. */
export function draftProblem(d: AgentDraft): string | null {
  if (!d.name.trim()) return "Name is required.";
  if (d.name.length > 60) return "Name: 60 characters at most.";
  if (d.description.length > 600) return "Description: 600 characters at most.";
  for (const [k, v] of [["Image", d.image], ["Web", d.web], ["MCP", d.mcp], ["A2A", d.a2a]] as const) {
    if (v && !/^https:\/\/[^\s]+$/.test(v)) return `${k} must be an https:// URL.`;
  }
  return null;
}

/**
 * ERC-8004 registration-v1 file, embedded in the NFT as a data: URI so no one
 * (us included) has to host it. `registrations` stays empty: the agentId does
 * not exist until the mint lands; setAgentURI can add it later.
 */
export function draftRegistration(d: AgentDraft) {
  const services = [
    d.web && { name: "web", endpoint: d.web },
    d.mcp && { name: "MCP", endpoint: d.mcp },
    d.a2a && { name: "A2A", endpoint: d.a2a },
  ].filter(Boolean);
  return {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: d.name.trim(),
    description: d.description.trim(),
    ...(d.image ? { image: d.image } : {}),
    services,
    x402Support: d.x402,
    active: true,
    registrations: [],
    supportedTrust: ["reputation"],
  };
}

export function draftDataUri(d: AgentDraft): string {
  const json = JSON.stringify(draftRegistration(d));
  const b64 = typeof btoa === "function"
    ? btoa(unescape(encodeURIComponent(json)))
    : Buffer.from(json, "utf8").toString("base64");
  return `data:application/json;base64,${b64}`;
}

export const ERC8004_MANAGE_ABI = parseAbi([
  "function register(string agentURI) returns (uint256)",
  "function setAgentURI(uint256 agentId, string newURI)",
  "function transferFrom(address from, address to, uint256 tokenId)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
]);
