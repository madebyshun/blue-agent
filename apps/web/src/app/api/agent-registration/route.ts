/** ERC-8004 registration file — the identity NFT's tokenURI (lib/erc8004.ts). */
import { NextResponse } from "next/server";
import { registrationFile } from "@/lib/erc8004";

export const runtime = "nodejs";
export const maxDuration = 10;

export function GET() {
  return NextResponse.json(registrationFile(), {
    headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300" },
  });
}
