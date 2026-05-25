import { NextRequest } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/messages";

export async function POST(req: NextRequest) {
  return proxyTool(req, ENDPOINT);
}
