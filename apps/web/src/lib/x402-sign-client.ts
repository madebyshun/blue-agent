/**
 * Browser half of an x402 payment to ANY payee the server quoted — used by the
 * job board's unlock, where the poster pays the delivering agent directly.
 * Signs one EIP-3009 TransferWithAuthorization for exactly the quoted amount and
 * payee, and returns the X-PAYMENT header. Client-safe: no server imports.
 * The amount and payee come from the server's 402 and are shown to the user
 * before the wallet opens; nothing here picks either.
 */
import { toHex } from "viem";

export const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

export interface Quote { network: string; asset: string; amount: string; payTo: string; maxTimeoutSeconds: number; extra?: { name?: string; version?: string }; x402Version?: 1 | 2 }

/**
 * One accept entry from a seller's 402, in either x402 version, as a Quote — or
 * null if it is not USDC on Base. v1 says `network: "base"` and
 * `maxAmountRequired`; v2 says `eip155:8453` and `amount`.
 */
export function toQuote(a: Record<string, unknown>, version: number): Quote | null {
  const network = String(a.network ?? "");
  if (network !== "eip155:8453" && network !== "base") return null;
  const amount = String(a.amount ?? a.maxAmountRequired ?? "");
  return {
    network: "eip155:8453",
    asset: String(a.asset ?? ""),
    amount,
    payTo: String(a.payTo ?? ""),
    maxTimeoutSeconds: Math.min(600, Math.max(30, Number(a.maxTimeoutSeconds) || 120)),
    extra: (a.extra as Quote["extra"]) ?? undefined,
    x402Version: version === 1 || network === "base" ? 1 : 2,
  };
}

type SignTyped = (args: {
  domain: { name: string; version: string; chainId: number; verifyingContract: `0x${string}` };
  types: Record<string, { name: string; type: string }[]>;
  primaryType: "TransferWithAuthorization";
  message: Record<string, unknown>;
}) => Promise<`0x${string}`>;

/** Refuse anything that is not USDC on Base: the only payment this app signs. */
export function quoteProblem(q: Quote): string | null {
  if (q.network !== "eip155:8453") return "This payment is not on Base.";
  if (q.asset.toLowerCase() !== USDC_BASE.toLowerCase()) return "This payment is not in USDC.";
  if (!/^0x[0-9a-fA-F]{40}$/.test(q.payTo)) return "The payee is not an address.";
  if (!/^\d+$/.test(q.amount) || BigInt(q.amount) <= 0n) return "The amount is not valid.";
  return null;
}

export async function signX402(from: `0x${string}`, q: Quote, signTypedDataAsync: SignTyped): Promise<string> {
  const why = quoteProblem(q);
  if (why) throw new Error(why);
  const nonce = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + q.maxTimeoutSeconds + 60);
  const name = q.extra?.name ?? "USD Coin";
  const version = q.extra?.version ?? "2";
  const signature = await signTypedDataAsync({
    domain: { name, version, chainId: 8453, verifyingContract: USDC_BASE },
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization",
    message: { from, to: q.payTo, value: BigInt(q.amount), validAfter: 0n, validBefore, nonce },
  });
  const authorization = { from, to: q.payTo, value: q.amount, validAfter: "0", validBefore: validBefore.toString(), nonce };
  if (q.x402Version === 1) {
    // v1 payload: network by name, no `accepted` block.
    return btoa(JSON.stringify({ x402Version: 1, scheme: "exact", network: "base", payload: { signature, authorization } }));
  }
  return btoa(JSON.stringify({
    x402Version: 2, scheme: "exact", network: q.network,
    accepted: { scheme: "exact", network: q.network, asset: USDC_BASE, amount: q.amount, payTo: q.payTo, maxTimeoutSeconds: q.maxTimeoutSeconds, extra: { name, version } },
    payload: { signature, authorization },
  }));
}
