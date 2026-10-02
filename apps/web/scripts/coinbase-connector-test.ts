/**
 * coinbase-connector-test — the read-only Coinbase connector
 * (lib/connectors/coinbase.ts). Hermetic: in-memory KV, every request to
 * Coinbase's OAuth server and MCP server answered by a stub.
 *
 *   1. only READ tools pass the filter; a write verb anywhere fails it
 *   2. sign-in asks for read scopes only, PKCE S256, one client registration
 *   3. the state is single-use and bound to the wallet that started it
 *   4. tokens are stored encrypted, never readable from KV
 *   5. an expiring token is refreshed; without the key nothing is stored
 *   6. the tool list served to chat is the filtered one
 */
for (const k of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) delete process.env[k];
process.env.CONNECTOR_TOKEN_KEY = "a".repeat(64);

import {
  __setFetch, accessToken, finishAuth, isCoinbaseMcpUrl, isReadOnlyTool, readOnlyTools, startAuth, READ_SCOPES,
} from "../src/lib/connectors/coinbase";
import { kvScan, kvGet } from "../src/lib/kv";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

const W = "0x" + "ab".repeat(20), OTHER = "0x" + "cd".repeat(20);
const REDIRECT = "https://app.blueagent.dev/api/connectors/coinbase/callback";
let registrations = 0, tokenCalls: Record<string, string>[] = [], expiresIn = 3600, issued = 0;

__setFetch((async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url === "https://agents.coinbase.com/.well-known/oauth-protected-resource") {
    return Response.json({ resource: "https://agents.coinbase.com/mcp", authorization_servers: ["https://login.coinbase.com/"] });
  }
  if (url === "https://login.coinbase.com/.well-known/oauth-authorization-server") {
    return Response.json({
      authorization_endpoint: "https://login.coinbase.com/oauth2/auth",
      token_endpoint: "https://login.coinbase.com/oauth2/token",
      registration_endpoint: "https://login.coinbase.com/oauth2/register",
    });
  }
  if (url === "https://login.coinbase.com/oauth2/register") {
    registrations++;
    const b = JSON.parse(String(init?.body));
    return Response.json({ client_id: "client-123", ...b });
  }
  if (url === "https://login.coinbase.com/oauth2/token") {
    const b = Object.fromEntries(new URLSearchParams(String(init?.body)));
    tokenCalls.push(b);
    issued++;
    return Response.json({ access_token: `at-${issued}`, refresh_token: `rt-${issued}`, expires_in: expiresIn, scope: READ_SCOPES.join(" ") });
  }
  return new Response("not stubbed", { status: 502 });
}) as typeof fetch);

// The MCP server itself is reached through lib/mcp-client (global fetch).
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.startsWith("https://agents.coinbase.com/mcp")) return new Response("not stubbed", { status: 502 });
  const auth = new Headers(init?.headers).get("authorization") ?? "";
  if (!auth.startsWith("Bearer at-")) return new Response("unauthorized", { status: 401 });
  const rpc = JSON.parse(String(init?.body));
  if (rpc.method === "initialize") return Response.json({ jsonrpc: "2.0", id: rpc.id, result: { protocolVersion: "2025-03-26", capabilities: {}, serverInfo: { name: "cb" } } });
  if (rpc.method === "notifications/initialized") return new Response(null, { status: 202 });
  if (rpc.method === "tools/list") {
    return Response.json({ jsonrpc: "2.0", id: rpc.id, result: { tools: [
      { name: "list_accounts", description: "Accounts", inputSchema: { type: "object" } },
      { name: "get_product", description: "A product", inputSchema: { type: "object" } },
      { name: "create_order", description: "Place an order", inputSchema: { type: "object" } },
      { name: "create_transfer", description: "Move funds", inputSchema: { type: "object" } },
    ] } });
  }
  return Response.json({ jsonrpc: "2.0", id: rpc.id, error: { code: -32601, message: "no" } });
}) as typeof fetch;

(async () => {
  console.log("1. read-only filter");
  for (const n of ["list_accounts", "get_portfolio", "list_orders", "get_product", "list_products", "getAccount", "search_assets"]) ok(`allows ${n}`, isReadOnlyTool(n));
  for (const n of ["create_order", "cancel_orders", "place_trade", "transfer_funds", "update_portfolio", "send_crypto", "get_or_create_address", "withdraw", "edit_order", "convert_quote"]) ok(`refuses ${n}`, !isReadOnlyTool(n));
  ok("host match covers variants", isCoinbaseMcpUrl("https://agents.coinbase.com/mcp/") && isCoinbaseMcpUrl("https://AGENTS.coinbase.com/mcp?x=1") && !isCoinbaseMcpUrl("https://evil.example/agents.coinbase.com"));

  console.log("2. sign-in request");
  const u1 = new URL(await startAuth(W, REDIRECT));
  const scope = u1.searchParams.get("scope") ?? "";
  ok("authorize endpoint on login.coinbase.com", u1.origin === "https://login.coinbase.com" && u1.pathname === "/oauth2/auth");
  ok("read scopes only — no create/update/delete/transfer", scope.split(" ").every((s) => /:read$|^offline_access$/.test(s)) && !/create|update|delete|transfer/.test(scope), scope);
  ok("PKCE S256 + state + redirect", u1.searchParams.get("code_challenge_method") === "S256" && !!u1.searchParams.get("code_challenge") && !!u1.searchParams.get("state") && u1.searchParams.get("redirect_uri") === REDIRECT);
  await startAuth(W, REDIRECT);
  ok("the client registers once per redirect URI", registrations === 1, String(registrations));

  console.log("3. state: single use, same wallet");
  const state = u1.searchParams.get("state")!;
  let r = await finishAuth("code-x", state, OTHER);
  ok("a session for ANOTHER wallet is refused", !r.ok && r.reason === "wallet");
  r = await finishAuth("code-x", state, W);
  ok("…and the state is spent by that attempt", !r.ok && r.reason === "state");
  const u2 = new URL(await startAuth(W, REDIRECT));
  r = await finishAuth("code-y", u2.searchParams.get("state")!, W);
  ok("the right wallet connects", r.ok);
  const sent = tokenCalls.at(-1)!;
  ok("token exchange sends the verifier, not a secret", sent.grant_type === "authorization_code" && !!sent.code_verifier && !("client_secret" in sent), JSON.stringify(Object.keys(sent)));

  console.log("4. tokens at rest");
  const keys = await kvScan("cbconn:tok:*");
  const raw = String(await kvGet<string>(keys[0]));
  ok("stored, and the access token is not readable in KV", keys.length === 1 && !raw.includes("at-") && raw.startsWith("v1."), raw.slice(0, 12));
  ok("accessToken decrypts it", (await accessToken(W)) === `at-${issued}`);

  console.log("5. refresh");
  expiresIn = 10; // the next token expires inside the refresh window
  const u3 = new URL(await startAuth(W, REDIRECT));
  await finishAuth("code-z", u3.searchParams.get("state")!, W);
  const before = tokenCalls.length;
  const t = await accessToken(W);
  ok("an expiring token is refreshed with the refresh token", tokenCalls.length === before + 1 && tokenCalls.at(-1)!.grant_type === "refresh_token" && t === `at-${issued}`);
  expiresIn = 3600;
  ok("no connection → null", (await accessToken(OTHER)) === null);

  console.log("6. tools served to chat");
  const tools = await readOnlyTools(W);
  ok("only the read tools survive", JSON.stringify(tools?.map((x) => x.name)) === JSON.stringify(["list_accounts", "get_product"]), JSON.stringify(tools?.map((x) => x.name)));

  console.log("7. without the encryption key");
  delete process.env.CONNECTOR_TOKEN_KEY;
  const u4 = new URL(await startAuth(OTHER, REDIRECT).catch(() => "https://x.invalid/?state=none"));
  r = await finishAuth("c", u4.searchParams.get("state") ?? "none", OTHER);
  ok("nothing is stored without CONNECTOR_TOKEN_KEY", !r.ok && r.reason === "config");

  console.log(failures === 0 ? "\ncoinbase-connector-test: PASS" : `\ncoinbase-connector-test: FAIL — ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
})();
