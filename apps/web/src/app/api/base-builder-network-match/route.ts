import { NextRequest } from "next/server";
const ENDPOINT = "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/base-builder-network-match";
export async function POST(req: NextRequest) {
  const body = await req.text();
  const r = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body });
  const data = await r.text();
  return new Response(data, { status: r.status, headers: { "Content-Type": "application/json" } });
}
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const qs = searchParams.toString();
  const r = await fetch(`${ENDPOINT}${qs ? `?${qs}` : ""}`);
  const data = await r.text();
  return new Response(data, { status: r.status, headers: { "Content-Type": "application/json" } });
}
