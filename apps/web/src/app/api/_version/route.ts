import { NextResponse } from "next/server";
import { HANDLERS } from "@/app/api/x402/_handlers";
export async function GET() {
  return NextResponse.json({
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "unknown",
    hasSim1: typeof HANDLERS["launch-simulator-1"] === "function",
    totalHandlers: Object.keys(HANDLERS).length,
  });
}
