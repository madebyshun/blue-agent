// Auto-generated thin proxy → blueagent.dev (single source of truth: apps/web).
// Bankr x402 Cloud collects the USDC payment, then forwards here; we proxy to
// blueagent.dev using the internal bypass header so the tool runs there without
// a second charge. No business logic + no data-source secrets live in apps/api.
const TOOL_ID = "pitch-intelligence";

export default async function handler(req: Request): Promise<Response> {
  let body: unknown = {};
  try { body = await req.json(); } catch {}
  try {
    const upstream = await fetch(`https://blueagent.dev/api/x402/${TOOL_ID}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Blue-Internal": process.env.INTERNAL_SERVICE_KEY ?? "",
      },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(30000),
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    return Response.json(
      { error: "Upstream proxy failed", tool: TOOL_ID, message: (err as Error).message },
      { status: 502 },
    );
  }
}
