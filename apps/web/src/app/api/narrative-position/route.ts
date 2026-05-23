import { NextRequest } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";

const ENDPOINT = "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/narrative-position";

export async function POST(req: NextRequest) {
  return proxyTool(req, ENDPOINT);
}
