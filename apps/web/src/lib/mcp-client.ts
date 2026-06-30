// Minimal MCP (Model Context Protocol) CLIENT — lets Blue Chat consume tools
// from external MCP servers (GitHub MCP, generic HTTP MCP, etc).
//
// Transport: Streamable HTTP (spec 2025-03-26). We POST JSON-RPC 2.0 to the
// server endpoint and accept BOTH a plain `application/json` reply and an
// SSE-framed (`text/event-stream`) reply, since remote MCP servers use either.
// Session continuity is carried via the `Mcp-Session-Id` response header.
//
// SECURITY: connector tool descriptions and results are THIRD-PARTY DATA, never
// trusted instructions. The chat route labels them as such in the system prompt.
// `assertSafeMcpUrl` blocks SSRF to internal/metadata hosts — these calls run on
// our server with our network position, so a user-supplied URL must not be able
// to reach internal infra.

const PROTOCOL_VERSION = "2025-03-26";
const DEFAULT_TIMEOUT_MS = 20_000;

export interface McpServerConfig {
  url: string;
  /** Optional auth headers (e.g. { Authorization: "Bearer ghp_…" }). */
  headers?: Record<string, string>;
}

export interface McpToolDef {
  name: string;
  description?: string;
  // JSON Schema for the tool's arguments (MCP `inputSchema`).
  inputSchema: Record<string, unknown>;
}

export interface McpCallResult {
  text: string;
  isError: boolean;
}

// ── SSRF guard ────────────────────────────────────────────────────────────────
const BLOCKED_HOSTS = new Set(["localhost", "0.0.0.0", "metadata.google.internal"]);

/** Throw if `raw` is not a safe, external https(/http) MCP endpoint. */
export function assertSafeMcpUrl(raw: string): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error("Invalid URL"); }
  if (u.protocol !== "https:" && u.protocol !== "http:")
    throw new Error("Only http(s) MCP endpoints are allowed");
  const host = u.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host)) throw new Error("Host not allowed");
  // Block private / link-local / loopback IPv4 ranges + IPv6 loopback.
  if (
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||              // link-local + cloud metadata
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) || // 172.16–172.31
    host === "::1" ||
    host.endsWith(".internal") ||
    host.endsWith(".local")
  ) throw new Error("Internal hosts are not allowed");
  return u;
}

// ── JSON-RPC plumbing ───────────────────────────────────────────────────────────
interface RpcResponse {
  jsonrpc: "2.0";
  id?: number | string;
  result?: unknown;
  error?: { code: number; message: string };
}

/** Pull the JSON-RPC response with `id` out of a fetch Response that may be JSON
 *  or an SSE (`text/event-stream`) frame. */
async function readRpc(res: Response, id: number): Promise<RpcResponse> {
  const ct = res.headers.get("content-type") ?? "";
  const body = await res.text();
  if (ct.includes("text/event-stream")) {
    // Parse SSE: collect every `data:` payload, return the one matching `id`.
    for (const line of body.split(/\r?\n/)) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const obj = JSON.parse(payload) as RpcResponse;
        if (obj.id === id || obj.result !== undefined || obj.error !== undefined) return obj;
      } catch { /* skip non-JSON keepalive lines */ }
    }
    throw new Error("No JSON-RPC response in SSE stream");
  }
  try { return JSON.parse(body) as RpcResponse; }
  catch { throw new Error(`Non-JSON response (${res.status})`); }
}

async function postRpc(
  url: string,
  headers: Record<string, string>,
  sessionId: string | undefined,
  id: number,
  method: string,
  params: Record<string, unknown>,
  timeoutMs: number,
): Promise<{ rpc: RpcResponse; sessionId?: string }> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    ...headers,
  };
  if (sessionId) h["Mcp-Session-Id"] = sessionId;

  const res = await fetch(url, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const nextSession = res.headers.get("mcp-session-id") ?? sessionId;
  if (!res.ok && res.status !== 200) {
    const snippet = (await res.text().catch(() => "")).slice(0, 160);
    throw new Error(`MCP ${method} failed: ${res.status} ${snippet}`);
  }
  const rpc = await readRpc(res, id);
  if (rpc.error) throw new Error(`MCP ${method}: ${rpc.error.message}`);
  return { rpc, sessionId: nextSession ?? undefined };
}

/** Send the post-initialize notification (best-effort; servers reply 202). */
async function sendInitialized(
  url: string, headers: Record<string, string>, sessionId: string | undefined, timeoutMs: number,
): Promise<void> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    ...headers,
  };
  if (sessionId) h["Mcp-Session-Id"] = sessionId;
  try {
    await fetch(url, {
      method: "POST",
      headers: h,
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch { /* non-fatal — many servers don't require it */ }
}

async function initialize(
  url: string, headers: Record<string, string>, timeoutMs: number,
): Promise<string | undefined> {
  const { sessionId } = await postRpc(url, headers, undefined, 1, "initialize", {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "blue-chat", version: "1.0.0" },
  }, timeoutMs);
  await sendInitialized(url, headers, sessionId, timeoutMs);
  return sessionId;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Handshake + list the tools an MCP server exposes. */
export async function mcpListTools(
  server: McpServerConfig,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<McpToolDef[]> {
  const url = assertSafeMcpUrl(server.url).toString();
  const headers = server.headers ?? {};
  const sessionId = await initialize(url, headers, timeoutMs);
  const { rpc } = await postRpc(url, headers, sessionId, 2, "tools/list", {}, timeoutMs);
  const tools = (rpc.result as { tools?: unknown[] } | undefined)?.tools ?? [];
  return tools
    .map((t) => t as { name?: string; description?: string; inputSchema?: Record<string, unknown> })
    .filter((t): t is McpToolDef => typeof t.name === "string")
    .map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema ?? { type: "object", properties: {} },
    }));
}

/** Invoke one tool on an MCP server. Re-handshakes each call (stateless server
 *  side — simplest correct behavior for our short-lived serverless requests). */
export async function mcpCallTool(
  server: McpServerConfig,
  name: string,
  args: Record<string, unknown>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<McpCallResult> {
  const url = assertSafeMcpUrl(server.url).toString();
  const headers = server.headers ?? {};
  const sessionId = await initialize(url, headers, timeoutMs);
  const { rpc } = await postRpc(url, headers, sessionId, 3, "tools/call",
    { name, arguments: args }, timeoutMs);
  const result = rpc.result as
    | { content?: Array<{ type?: string; text?: string }>; isError?: boolean }
    | undefined;
  const text = (result?.content ?? [])
    .map((c) => (typeof c?.text === "string" ? c.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
  return { text: text || "(no content returned)", isError: Boolean(result?.isError) };
}
