/**
 * x402/b20-inspect — Live on-chain B20 token inspector.
 *
 * Reads real state from Base RPC (multicall). ZERO LLM.
 * Price: $0.05 — deterministic chain reads only.
 *
 * Inputs:
 *   address  (or token / contract) — B20 token address (0x-prefixed, 40 hex chars)
 *   network  — "mainnet" (default) | "sepolia"
 *
 * Returns B20Inspection: isB20, name/symbol/decimals, totalSupply, supplyCap,
 *   variant (ASSET/STABLECOIN), pause status, policy IDs per scope.
 */

import { inspectB20 } from "@/lib/b20/inspect";

export default async function handler(req: Request): Promise<Response> {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body — use query params */ }

  // Accept address as `address`, `token`, or `contract`
  const raw = (body.address ?? body.token ?? body.contract) as string | undefined;
  const address = raw?.trim();

  const networkRaw = ((body.network ?? "mainnet") as string).toLowerCase();
  const network = (networkRaw === "sepolia" ? "sepolia" : "mainnet") as "mainnet" | "sepolia";

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return Response.json(
      { error: "address required — 0x-prefixed 40-char hex (e.g. 0xB20f…)" },
      { status: 400 },
    );
  }

  try {
    const result = await inspectB20(address, network);
    return Response.json({ tool: "b20-inspect", ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[b20-inspect] RPC error:", msg);
    return Response.json({ error: "RPC error", detail: msg }, { status: 502 });
  }
}
