// x402/b20-policy-check — on-chain B20 issuer policy & authorization check on Base 8453.
// Free ($0.00): eligibility & safety checks should never be gated.
import { type Address } from "viem";
import { clientFor } from "@/lib/tx-chains";
import {
  B20_FACTORY_ADDRESS,
  POLICY_REGISTRY_ADDRESS,
  ALWAYS_ALLOW_POLICY_ID,
  ALWAYS_BLOCK_POLICY_ID,
  PAUSABLE_FEATURE,
  FACTORY_ABI,
  TOKEN_READ_ABI,
  POLICY_REGISTRY_ABI,
} from "@/lib/b20/inspect-abi";

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { token?: string; wallet?: string } = {};
    try {
      const t = await req.text();
      if (t?.trim().startsWith("{")) body = JSON.parse(t);
    } catch {}
    const url = new URL(req.url);
    const token = (body.token ?? url.searchParams.get("token") ?? "").trim();
    const wallet = (body.wallet ?? url.searchParams.get("wallet") ?? "").trim();

    if (!ADDR_RE.test(token)) {
      return Response.json({ error: "Provide a valid Base token address (0x...)" }, { status: 400 });
    }
    if (wallet && !ADDR_RE.test(wallet)) {
      return Response.json({ error: "wallet must be a valid 0x address when provided" }, { status: 400 });
    }

    const client = clientFor("base");
    const tokenAddr = token as Address;

    const isB20 = Boolean(
      await client.readContract({
        address: B20_FACTORY_ADDRESS,
        abi: FACTORY_ABI,
        functionName: "isB20",
        args: [tokenAddr],
      }),
    );

    if (!isB20) {
      return Response.json({
        tool: "b20-policy-check",
        chain: "base",
        chain_id: 8453,
        token,
        is_b20: false,
        verdict: "NOT_B20",
        note: "This contract is not registered as a Coinbase B20 token on B20Factory.",
        timestamp: new Date().toISOString(),
      });
    }

    const [symbol, paused, senderScope, receiverScope, executorScope] = await Promise.all([
      client.readContract({ address: tokenAddr, abi: TOKEN_READ_ABI, functionName: "symbol" }).catch(() => ""),
      client.readContract({ address: tokenAddr, abi: TOKEN_READ_ABI, functionName: "isPaused", args: [PAUSABLE_FEATURE.TRANSFER] }).catch(() => null),
      client.readContract({ address: tokenAddr, abi: TOKEN_READ_ABI, functionName: "TRANSFER_SENDER_POLICY" }),
      client.readContract({ address: tokenAddr, abi: TOKEN_READ_ABI, functionName: "TRANSFER_RECEIVER_POLICY" }),
      client.readContract({ address: tokenAddr, abi: TOKEN_READ_ABI, functionName: "TRANSFER_EXECUTOR_POLICY" }),
    ]);

    const [senderPolicyId, receiverPolicyId, executorPolicyId] = await Promise.all([
      client.readContract({ address: tokenAddr, abi: TOKEN_READ_ABI, functionName: "policyId", args: [senderScope] }),
      client.readContract({ address: tokenAddr, abi: TOKEN_READ_ABI, functionName: "policyId", args: [receiverScope] }),
      client.readContract({ address: tokenAddr, abi: TOKEN_READ_ABI, functionName: "policyId", args: [executorScope] }),
    ]);

    const describePolicy = (id: bigint) =>
      id === ALWAYS_ALLOW_POLICY_ID ? "ALWAYS_ALLOW"
      : id === ALWAYS_BLOCK_POLICY_ID ? "ALWAYS_BLOCK"
      : `POLICY_${id.toString()}`;

    let walletAuth: Record<string, boolean | null> | null = null;
    if (wallet) {
      const checkScope = async (pid: bigint): Promise<boolean | null> => {
        if (pid === ALWAYS_ALLOW_POLICY_ID) return true;
        if (pid === ALWAYS_BLOCK_POLICY_ID) return false;
        try {
          return Boolean(
            await client.readContract({
              address: POLICY_REGISTRY_ADDRESS,
              abi: POLICY_REGISTRY_ABI,
              functionName: "isAuthorized",
              args: [pid, wallet as Address],
            }),
          );
        } catch {
          return null;
        }
      };
      const [senderOk, receiverOk, executorOk] = await Promise.all([
        checkScope(senderPolicyId),
        checkScope(receiverPolicyId),
        checkScope(executorPolicyId),
      ]);
      walletAuth = {
        can_send: senderOk,
        can_receive: receiverOk,
        can_execute: executorOk,
      };
    }

    const blocked =
      paused === true ||
      senderPolicyId === ALWAYS_BLOCK_POLICY_ID ||
      receiverPolicyId === ALWAYS_BLOCK_POLICY_ID ||
      (walletAuth !== null && (walletAuth.can_send === false || walletAuth.can_receive === false || walletAuth.can_execute === false));

    const unknown =
      paused === null ||
      (walletAuth !== null && (walletAuth.can_send === null || walletAuth.can_receive === null || walletAuth.can_execute === null));

    return Response.json({
      tool: "b20-policy-check",
      chain: "base",
      chain_id: 8453,
      token,
      symbol: symbol || null,
      is_b20: true,
      transfer_paused: paused,
      policies: {
        sender: { id: senderPolicyId.toString(), mode: describePolicy(senderPolicyId) },
        receiver: { id: receiverPolicyId.toString(), mode: describePolicy(receiverPolicyId) },
        executor: { id: executorPolicyId.toString(), mode: describePolicy(executorPolicyId) },
      },
      ...(wallet ? { wallet, wallet_authorization: walletAuth } : {}),
      verdict: blocked ? "BLOCKED" : unknown ? "UNKNOWN" : "AUTHORIZED",
      note: "Read live from B20 token and PolicyRegistry on Base 8453. Note: ERC-20 approve() is not policy-gated, so checking policy authorization before swap prevents wasted gas.",
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return Response.json({ error: "b20-policy-check failed", message: (e as Error).message }, { status: 502 });
  }
}
