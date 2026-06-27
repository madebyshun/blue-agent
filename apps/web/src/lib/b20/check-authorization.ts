/**
 * B20 authorization check — "is this account allowed to send / receive / mint?"
 * ZERO LLM. Reads live policy state from Base RPC:
 *   1. token.<SCOPE>_POLICY()      → bytes32 scope id
 *   2. token.policyId(scope)        → uint64 policy id bound to that scope
 *   3. policyRegistry.isAuthorized(policyId, account) → bool   (never reverts)
 *
 * ALWAYS_ALLOW (policyId 0) short-circuits to authorized; ALWAYS_BLOCK to denied.
 * Basenames (e.g. alice.base.eth) resolve via L1 CCIP-read; on any failure we
 * report "unresolved" rather than guessing an address.
 */

import {
  createPublicClient,
  http,
  isAddress,
  getAddress,
  type Hex,
} from "viem";
import { base, baseSepolia, mainnet } from "viem/chains";
import { normalize } from "viem/ens";
import {
  B20_FACTORY_ADDRESS,
  POLICY_REGISTRY_ADDRESS,
  ALWAYS_ALLOW_POLICY_ID,
  ALWAYS_BLOCK_POLICY_ID,
  FACTORY_ABI,
  TOKEN_READ_ABI,
  POLICY_REGISTRY_ABI,
} from "./inspect-abi";

// ── Network config (accepts both naming schemes) ────────────────────────────────
const NETWORKS = {
  mainnet: { chain: base,        rpc: "https://mainnet.base.org", explorer: "https://basescan.org" },
  sepolia: { chain: baseSepolia, rpc: "https://sepolia.base.org", explorer: "https://sepolia.basescan.org" },
} as const;
type NetKey = keyof typeof NETWORKS;

function normalizeNetwork(network?: string): NetKey {
  const n = (network ?? "").toLowerCase();
  if (n === "base" || n === "mainnet" || n === "8453") return "mainnet";
  return "sepolia";
}

// ── Scope → token scope-constant view fn ────────────────────────────────────────
export type AuthScope = "sender" | "receiver" | "executor" | "mint_receiver";

const SCOPE_FN: Record<AuthScope, "TRANSFER_SENDER_POLICY" | "TRANSFER_RECEIVER_POLICY" | "TRANSFER_EXECUTOR_POLICY" | "MINT_RECEIVER_POLICY"> = {
  sender:        "TRANSFER_SENDER_POLICY",
  receiver:      "TRANSFER_RECEIVER_POLICY",
  executor:      "TRANSFER_EXECUTOR_POLICY",
  mint_receiver: "MINT_RECEIVER_POLICY",
};

const SCOPE_LABEL: Record<AuthScope, string> = {
  sender:        "transfer sender",
  receiver:      "transfer receiver",
  executor:      "transfer executor",
  mint_receiver: "mint receiver",
};

function normalizeScope(scope?: string): AuthScope {
  const s = (scope ?? "").toLowerCase().replace(/[\s-]/g, "_");
  if (s === "sender" || s === "transfer_sender") return "sender";
  if (s === "executor" || s === "transfer_executor") return "executor";
  if (s === "mint_receiver" || s === "mint" || s === "mintreceiver") return "mint_receiver";
  return "receiver"; // default
}

export interface AuthCheck {
  authorized: boolean | null; // true / false; null when undeterminable
  token: string;
  account: string;            // resolved 0x address (or the input when unresolved)
  accountInput: string;       // raw input the user gave
  resolvedFromBasename: boolean;
  scope: AuthScope;
  scopeLabel: string;
  policyId: string;           // decimal string ("" when not read)
  policyKind: "open" | "blocked" | "custom" | "unknown";
  network: NetKey;
  status:
    | "authorized" | "denied"      // determined
    | "invalid_token" | "invalid_account" | "unresolved" | "not_b20" | "error"; // problems
  message: string;
  explorerUrl: string;
  error?: string;
}

/** Resolve a basename (e.g. alice.base.eth) to an address via L1 CCIP-read.
 *  Returns null on any failure — we never guess. */
async function resolveBasename(name: string): Promise<string | null> {
  try {
    const l1 = createPublicClient({ chain: mainnet, transport: http("https://eth.llamarpc.com") });
    const addr = await l1.getEnsAddress({ name: normalize(name) });
    return addr && isAddress(addr) ? getAddress(addr) : null;
  } catch {
    return null;
  }
}

/**
 * Check whether `account` is authorized on a B20 token's policy for a given scope.
 * Never throws — returns a status-tagged result the chat UI can render directly.
 */
export async function checkAuthorization(opts: {
  token: string;
  account: string;
  scope?: string;
  network?: string;
}): Promise<AuthCheck> {
  const net    = normalizeNetwork(opts.network);
  const cfg    = NETWORKS[net];
  const scope  = normalizeScope(opts.scope);
  const scopeLabel = SCOPE_LABEL[scope];
  const tokenIn = (opts.token ?? "").trim();
  const acctIn  = (opts.account ?? "").trim();
  const explorerUrl = `${cfg.explorer}/token/${tokenIn}`;

  const base0: Omit<AuthCheck, "status" | "message" | "authorized" | "policyId" | "policyKind"> = {
    token: tokenIn, account: acctIn, accountInput: acctIn,
    resolvedFromBasename: false, scope, scopeLabel, network: net, explorerUrl,
  };

  if (!isAddress(tokenIn)) {
    return { ...base0, authorized: null, policyId: "", policyKind: "unknown",
      status: "invalid_token", message: "The token value isn't a valid 0x address." };
  }

  // Resolve account — direct address, or basename via CCIP.
  let account = acctIn;
  let resolvedFromBasename = false;
  if (!isAddress(acctIn)) {
    if (/\./.test(acctIn)) {
      const resolved = await resolveBasename(acctIn);
      if (!resolved) {
        return { ...base0, authorized: null, policyId: "", policyKind: "unknown",
          status: "unresolved", message: `Couldn't resolve "${acctIn}" to an address.` };
      }
      account = resolved;
      resolvedFromBasename = true;
    } else {
      return { ...base0, authorized: null, policyId: "", policyKind: "unknown",
        status: "invalid_account", message: "The account isn't a valid address or basename." };
    }
  } else {
    account = getAddress(acctIn);
  }

  const client = createPublicClient({ chain: cfg.chain, transport: http(cfg.rpc) });
  const token   = tokenIn as Hex;
  const factory = B20_FACTORY_ADDRESS as Hex;
  const pReg     = POLICY_REGISTRY_ADDRESS as Hex;

  // Round 1: confirm B20 + read the scope bytes32 for this scope.
  const r1 = await client.multicall({
    allowFailure: true,
    contracts: [
      { address: factory, abi: FACTORY_ABI,    functionName: "isB20", args: [token] },
      { address: token,   abi: TOKEN_READ_ABI, functionName: SCOPE_FN[scope] },
    ],
  });

  const isB20 = r1[0].status === "success" ? (r1[0].result as boolean) : false;
  const scopeId = r1[1].status === "success" ? (r1[1].result as Hex) : undefined;

  if (!isB20 || !scopeId) {
    return { ...base0, account, resolvedFromBasename, authorized: null,
      policyId: "", policyKind: "unknown", status: "not_b20",
      message: "This address isn't a B20 token (or its policy scope couldn't be read)." };
  }

  // Round 2: scope → policyId.
  let policyId: bigint;
  try {
    policyId = await client.readContract({
      address: token, abi: TOKEN_READ_ABI, functionName: "policyId", args: [scopeId],
    }) as bigint;
  } catch (e) {
    return { ...base0, account, resolvedFromBasename, authorized: null,
      policyId: "", policyKind: "unknown", status: "error",
      message: "Couldn't read the policy bound to that scope.", error: (e as Error).message };
  }

  // Sentinels short-circuit — no registry call needed.
  if (policyId === ALWAYS_ALLOW_POLICY_ID) {
    return { ...base0, account, resolvedFromBasename, authorized: true,
      policyId: policyId.toString(), policyKind: "open", status: "authorized",
      message: `Open scope (ALWAYS_ALLOW) — anyone can be a ${scopeLabel}.` };
  }
  if (policyId === ALWAYS_BLOCK_POLICY_ID) {
    return { ...base0, account, resolvedFromBasename, authorized: false,
      policyId: policyId.toString(), policyKind: "blocked", status: "denied",
      message: `This scope uses ALWAYS_BLOCK — every address is denied as a ${scopeLabel}.` };
  }

  // Custom policy → isAuthorized(policyId, account). Per IPolicyRegistry this
  // never reverts (returns false for unknown policies), but we still guard.
  try {
    const allowed = await client.readContract({
      address: pReg, abi: POLICY_REGISTRY_ABI, functionName: "isAuthorized",
      args: [policyId, account as Hex],
    }) as boolean;
    return { ...base0, account, resolvedFromBasename, authorized: allowed,
      policyId: policyId.toString(), policyKind: "custom",
      status: allowed ? "authorized" : "denied",
      message: allowed
        ? `Authorized on custom policy #${policyId.toString()} for the ${scopeLabel} scope.`
        : `NOT authorized — custom policy #${policyId.toString()} denies this address as a ${scopeLabel}.` };
  } catch (e) {
    return { ...base0, account, resolvedFromBasename, authorized: null,
      policyId: policyId.toString(), policyKind: "custom", status: "error",
      message: "Couldn't read isAuthorized from the PolicyRegistry.", error: (e as Error).message };
  }
}
