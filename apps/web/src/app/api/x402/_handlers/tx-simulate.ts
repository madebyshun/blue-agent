// x402/tx-simulate — dry-run any unsigned tx { from, to, data, value } before signing.
// Free ($0.00): preview -> prepare -> execute safety gate.
import { TX_CHAINS, parseTxChain } from "@/lib/tx-chains";

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

function toHexWei(v: unknown): string {
  if (v === undefined || v === null || v === "") return "0x0";
  const s = String(v).trim();
  if (/^0x[0-9a-fA-F]+$/.test(s)) return s;
  if (/^\d+$/.test(s)) return `0x${BigInt(s).toString(16)}`;
  throw new Error("tx.value must be a decimal wei string or 0x hex string");
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: {
      chain?: string;
      from?: string;
      to?: string;
      data?: string;
      value?: string | number;
    } = {};
    try {
      const t = await req.text();
      if (t?.trim().startsWith("{")) body = JSON.parse(t);
    } catch {}

    const chain = parseTxChain(body.chain ?? "base");
    if (!chain) {
      return Response.json({ error: 'chain must be "base" or "robinhood"' }, { status: 400 });
    }
    const from = (body.from ?? "").trim();
    const to = (body.to ?? "").trim();
    const data = (body.data ?? "0x").trim();
    if (!ADDR_RE.test(from) || !ADDR_RE.test(to)) {
      return Response.json({ error: "from and to must be valid 0x addresses" }, { status: 400 });
    }
    if (!/^0x([0-9a-fA-F]{2})*$/.test(data)) {
      return Response.json({ error: "data must be valid 0x-prefixed hex calldata" }, { status: 400 });
    }
    const valueHex = toHexWei(body.value);
    const rpcUrl = TX_CHAINS[chain].rpc;

    // Try eth_simulateV1 first (gives full transfer trace), fallback to eth_call
    try {
      const simRes = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_simulateV1",
          params: [
            {
              blockStateCalls: [{ calls: [{ from, to, data, value: valueHex }] }],
              traceTransfers: true,
            },
            "latest",
          ],
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const simJson = (await simRes.json()) as {
        result?: Array<{
          number?: string;
          calls?: Array<{
            status?: string;
            gasUsed?: string;
            error?: { message?: string };
            logs?: Array<{ address?: string; topics?: string[]; data?: string }>;
          }>;
        }>;
        error?: { message?: string };
      };
      if (!simJson.error && Array.isArray(simJson.result) && simJson.result[0]?.calls?.[0]) {
        const call = simJson.result[0].calls[0];
        const ok = call.status === "0x1";
        const logs = Array.isArray(call.logs) ? call.logs : [];
        const transfers = logs
          .filter((l) => l.topics?.[0] === TRANSFER_TOPIC && l.topics.length >= 3 && typeof l.data === "string")
          .slice(0, 20)
          .map((l) => ({
            asset: l.address ?? null,
            from: `0x${(l.topics?.[1] ?? "").slice(-40)}`,
            to: `0x${(l.topics?.[2] ?? "").slice(-40)}`,
            amount_raw: /^0x[0-9a-fA-F]+$/.test(l.data ?? "") ? BigInt(l.data!).toString() : "0",
          }));
        return Response.json({
          tool: "tx-simulate",
          method: "eth_simulateV1",
          chain,
          chain_id: TX_CHAINS[chain].chainId,
          block: simJson.result[0].number ?? null,
          will_succeed: ok,
          revert_reason: ok ? null : (call.error?.message ?? "reverted with no reason"),
          gas_used: call.gasUsed && /^0x[0-9a-fA-F]+$/.test(call.gasUsed) ? Number(BigInt(call.gasUsed)) : null,
          logs_count: logs.length,
          erc20_transfers: transfers,
          timestamp: new Date().toISOString(),
        });
      }
    } catch { /* fallback to eth_call */ }

    const callRes = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ from, to, data, value: valueHex }, "latest"],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const callJson = (await callRes.json()) as { result?: string; error?: { message?: string; data?: unknown } };
    const ok = !callJson.error;
    return Response.json({
      tool: "tx-simulate",
      method: "eth_call",
      chain,
      chain_id: TX_CHAINS[chain].chainId,
      will_succeed: ok,
      revert_reason: ok ? null : (callJson.error?.message ?? "eth_call reverted"),
      return_data: ok ? (callJson.result ?? "0x") : null,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return Response.json({ error: "tx-simulate failed", message: (e as Error).message }, { status: 502 });
  }
}
