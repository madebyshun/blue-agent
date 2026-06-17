// Auto-generated thin proxy → blueagent.dev (single source of truth: apps/web).
// Bankr x402 Cloud collects the USDC payment, then forwards here; we proxy to
// blueagent.dev with the internal bypass so the tool runs there without a second
// charge. Paid tools need BOTH headers: X-Blue-Internal (the shared secret) gets
// past the auth gate, and X-Blue-Service: internal selects the free server path
// (without it, blueagent.dev returns WALLET_REQUIRED for a priced tool).
// No business logic + no data-source secrets live in apps/api.
const TOOL_ID = "community-growth-playbook";

export default async function handler(req: Request): Promise<Response> {
  let body: unknown = {};
  try { body = await req.json(); } catch {}
  try {
    const upstream = await fetch(`https://blueagent.dev/api/x402/${TOOL_ID}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Blue-Internal": process.env.INTERNAL_SERVICE_KEY ?? "",
        "X-Blue-Service": "internal",
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
