/**
 * ERC-8004 off-chain feedback file for ONE settled MCP call — the
 * `feedbackURI` a buyer's giveFeedback points at (lib/erc8004.ts).
 *
 * Built only from our own receipt book: the Base settlement tx is the proof of
 * payment. An unknown tx is a 404, never a fabricated file.
 */
import { NextResponse } from "next/server";
import { findMcpReceipt } from "@/lib/mcp-receipts";
import { BLUE_AGENT_ID, ERC8004_CHAIN_ID, ERC8004_IDENTITY } from "@/lib/erc8004";
import { X402_PAY_TO } from "@/lib/x402-payee";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function GET(_req: Request, { params }: { params: Promise<{ tx: string }> }) {
  const { tx } = await params;
  const headers = { "Access-Control-Allow-Origin": "*" };
  if (!/^0x[0-9a-fA-F]{64}$/.test(tx)) return NextResponse.json({ error: "not a tx hash" }, { status: 400, headers });
  const r = await findMcpReceipt(tx);
  if (r === undefined) return NextResponse.json({ error: "receipts unreadable, try again" }, { status: 503, headers });
  if (!r || r.outcome !== "settled") return NextResponse.json({ error: "no settled Blue Agent call with this tx" }, { status: 404, headers });
  return NextResponse.json({
    agentRegistry: `eip155:${ERC8004_CHAIN_ID}:${ERC8004_IDENTITY}`,
    agentId: BLUE_AGENT_ID === null ? null : Number(BLUE_AGENT_ID),
    clientAddress: r.payer ? `eip155:${ERC8004_CHAIN_ID}:${r.payer}` : null,
    createdAt: r.at,
    tag1: "mcp",
    tag2: r.tool,
    endpoint: "https://blueagent.dev/api/mcp",
    proofOfPayment: { fromAddress: r.payer, toAddress: X402_PAY_TO, chainId: String(ERC8004_CHAIN_ID), txHash: r.tx, amountUsdcUnits: r.units },
  }, { headers: { ...headers, "Cache-Control": "public, max-age=3600" } });
}
