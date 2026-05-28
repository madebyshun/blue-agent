import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      ok:        true,
      service:   "blueagent-api",
      version:   "v1",
      timestamp: new Date().toISOString(),
      tools:     41,
      upstreamLlm: !!process.env.BANKR_API_KEY,
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
      },
    }
  );
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin":  "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    },
  });
}
