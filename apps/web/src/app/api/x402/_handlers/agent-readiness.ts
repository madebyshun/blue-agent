// x402/agent-readiness — probe a URL for x402 payments, MCP support, and uptime
// Price: $0.10 — Pure probing (no LLM); all signals measured from the real HTTP response

type UptimeCheck = "online" | "offline" | "timeout";

type Probe = {
  uptime: UptimeCheck;
  latencyMs: number | null;
  status: number | null;
  headers: Headers | null;
  bodyText: string;
};

async function probeUrl(url: string): Promise<Probe> {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": "blue-agent" },
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });
    const latencyMs = Date.now() - start;
    let bodyText = "";
    try {
      bodyText = (await res.text()).slice(0, 20000);
    } catch {}
    // Any HTTP response (2xx/3xx/4xx/5xx) means the host is reachable.
    return { uptime: "online", latencyMs, status: res.status, headers: res.headers, bodyText };
  } catch (e) {
    const name = (e as Error)?.name ?? "";
    const uptime: UptimeCheck = name === "TimeoutError" || name === "AbortError" ? "timeout" : "offline";
    return { uptime, latencyMs: null, status: null, headers: null, bodyText: "" };
  }
}

function safeJsonParse(text: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { url?: string } = {};
    try {
      const text = await req.text();
      if (text?.trim().startsWith("{")) body = JSON.parse(text);
    } catch {}
    const reqUrl = new URL(req.url);
    if (!body.url) body.url = reqUrl.searchParams.get("url") || reqUrl.searchParams.get("target") || undefined;

    const target = body.url?.trim();
    if (!target) return Response.json({ error: "Provide a url to probe" }, { status: 400 });
    if (!/^https?:\/\//i.test(target)) {
      return Response.json({ error: "Provide a valid http(s) URL" }, { status: 400 });
    }

    console.log(`[AgentReadiness] Probing: ${target}`);

    const probe = await probeUrl(target);

    // ── x402 detection ──────────────────────────────────────────────────────
    let x402Compatible = false;
    let x402Price: string | number | null = null;
    let x402Asset: string | null = null;
    if (probe.status === 402) x402Compatible = true;
    const wwwAuth = probe.headers?.get("www-authenticate") ?? "";
    if (/x402|x-402/i.test(wwwAuth)) x402Compatible = true;
    if (probe.headers?.get("x-402") || probe.headers?.get("x402")) x402Compatible = true;
    const json = probe.bodyText ? safeJsonParse(probe.bodyText) : null;
    if (json) {
      const accepts = json["accepts"];
      if (json["x402"] || accepts || json["price"] || json["paymentRequirements"]) {
        x402Compatible = true;
        // Pull a price/asset out of an x402 "accepts" entry if present.
        const acc = Array.isArray(accepts) ? (accepts[0] as Record<string, unknown> | undefined) : undefined;
        const priceVal = (acc?.["maxAmountRequired"] ?? acc?.["price"] ?? json["price"]) as string | number | undefined;
        const assetVal = (acc?.["asset"] ?? acc?.["currency"] ?? json["asset"]) as string | undefined;
        if (priceVal !== undefined) x402Price = priceVal;
        if (typeof assetVal === "string") x402Asset = assetVal;
      }
    }

    // ── MCP detection ───────────────────────────────────────────────────────
    let mcpAvailable = false;
    let mcpToolsCount: number | null = null;
    try {
      const base = target.replace(/\/+$/, "");
      const wellKnown = `${base}/.well-known/mcp`;
      const mcpRes = await fetch(wellKnown, {
        headers: { "User-Agent": "blue-agent" },
        signal: AbortSignal.timeout(6000),
      });
      if (mcpRes.ok) {
        mcpAvailable = true;
        const mcpText = (await mcpRes.text()).slice(0, 20000);
        const mcpJson = safeJsonParse(mcpText);
        const tools = mcpJson?.["tools"];
        if (Array.isArray(tools)) mcpToolsCount = tools.length;
      }
    } catch {}
    if (!mcpAvailable && /\bmcp\b|model context protocol|\/api\/mcp/i.test(probe.bodyText)) {
      mcpAvailable = true; // referenced in body; tool count unknown
    }

    // ── Score (code, deterministic) ──────────────────────────────────────────
    let agentScore = 0;
    if (probe.uptime === "online") agentScore += 30;
    if (x402Compatible) agentScore += 35;
    if (mcpAvailable) agentScore += 35;
    if (probe.uptime === "online" && probe.latencyMs !== null && probe.latencyMs < 1000) {
      // already counted uptime; no extra — keep score interpretable
    }
    agentScore = Math.max(0, Math.min(100, agentScore));

    const verdict =
      x402Compatible && mcpAvailable
        ? "AGENT_READY"
        : x402Compatible || mcpAvailable
          ? "PARTIAL"
          : "NOT_READY";

    const recommendations: string[] = [];
    if (probe.uptime !== "online") recommendations.push(`Endpoint is ${probe.uptime} — agents cannot reach it.`);
    if (!x402Compatible) recommendations.push("Add x402 payment support (HTTP 402 + accepts/price) so agents can pay per call.");
    if (!mcpAvailable) recommendations.push("Expose an MCP endpoint (e.g. /.well-known/mcp) so agents can discover tools.");
    if (mcpAvailable && mcpToolsCount === null) recommendations.push("MCP detected but tool count unknown — verify the manifest lists tools.");
    if (verdict === "AGENT_READY") recommendations.push("Endpoint is agent-ready: both x402 payments and MCP discovery are present.");

    return Response.json({
      tool: "agent-readiness",
      url: target,
      x402_compatible: x402Compatible,
      x402_price: x402Price,
      x402_asset: x402Asset,
      mcp_available: mcpAvailable,
      mcp_tools_count: mcpToolsCount,
      latency_ms: probe.latencyMs,
      uptime_check: probe.uptime,
      agent_score: agentScore,
      verdict,
      recommendations,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[AgentReadiness] Error:", error);
    return Response.json(
      { error: "Agent readiness probe failed", message: (error as Error).message },
      { status: 500 }
    );
  }
}
