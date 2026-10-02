/**
 * Coinbase as a Blue Chat connector — READ-ONLY, server-held OAuth (ShunTr
 * 2026-10-02: option A).
 *
 * agents.coinbase.com/mcp is an MCP server that answers 401 until the person
 * signs in to their Coinbase account through OAuth (RFC 9728 → login.coinbase
 * .com: dynamic client registration, PKCE S256, refresh tokens). Every other
 * Blue Chat connector keeps its token in the browser (connectors.ts) and the
 * browser sends it with each chat — fine for a GitHub PAT, not for the key to
 * someone's exchange account. So this one is different on purpose:
 *
 *   • the token NEVER reaches the browser: it lives in KV, encrypted with
 *     AES-256-GCM under CONNECTOR_TOKEN_KEY, keyed by the SIWE wallet;
 *   • only READ scopes are requested (READ_SCOPES). The server would refuse a
 *     write anyway — and on top of that, `isReadOnlyTool` keeps only tools whose
 *     name reads as a read, so even a token that came back wider cannot place,
 *     cancel or transfer through Blue Chat;
 *   • the OAuth `state` is single-use, expires in 10 minutes, and is bound to
 *     the wallet that started the flow; the callback must arrive in a session
 *     for that same wallet.
 *
 * Coinbase holds the funds (custodial). Blue Agent's own model — no key, the
 * wallet signs — is unchanged: this connector can look, never act.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { kvDel, kvGetProbe, kvSetNX, kvSetOrThrow } from "@/lib/kv";
import { mcpListTools, type McpToolDef } from "@/lib/mcp-client";

export const COINBASE_MCP_URL = "https://agents.coinbase.com/mcp";

/** Any URL on agents.coinbase.com is THIS connector — matched by host, so a
 *  trailing slash or query cannot slip a client-held token past the rule. */
export function isCoinbaseMcpUrl(u: unknown): boolean {
  try { return typeof u === "string" && new URL(u).host.toLowerCase() === "agents.coinbase.com"; } catch { return false; }
}
const RESOURCE_METADATA = "https://agents.coinbase.com/.well-known/oauth-protected-resource";
export const READ_SCOPES = ["mcp:accounts:read", "mcp:portfolios:read", "mcp:products:read", "offline_access"] as const;
const STATE_TTL_S = 10 * 60;
const TOKEN_TTL_S = 90 * 24 * 60 * 60;   // the KV record; the refresh token decides real validity
const TOOLS_TTL_S = 60 * 60;
const REFRESH_SKEW_MS = 60_000;

const kClient = (redirectUri: string) => `cbconn:client:${createHash("sha256").update(redirectUri).digest("hex").slice(0, 32)}`;
const kState = (state: string) => `cbconn:state:${state}`;
const kToken = (wallet: string) => `cbconn:tok:${wallet.toLowerCase()}`;
const kTools = (wallet: string) => `cbconn:tools:${wallet.toLowerCase()}`;

type Fetch = typeof fetch;
let fetchImpl: Fetch = (...a) => fetch(...a);
/** Tests swap the network. */
export function __setFetch(f: Fetch) { fetchImpl = f; }

/* ─── read-only tool filter ────────────────────────────────────────────── */

const READ_VERB = /^(get|list|search|describe|fetch|read|view|show|query|lookup|find)(_|-|[A-Z]|$)/i;
const WRITE_WORD = /(create|place|submit|cancel|delete|remove|update|edit|modify|transfer|send|withdraw|deposit|trade|buy|sell|convert|swap|close|move|allocate)/i;

/** A tool BlueChat may call on Coinbase: its name starts with a read verb and
 *  the rest carries no write verb ("list_orders" yes, "get_or_create_x" no). */
export function isReadOnlyTool(name: string): boolean {
  if (!READ_VERB.test(name)) return false;
  const rest = name.replace(READ_VERB, "");
  return !WRITE_WORD.test(rest.replace(/orders?|trades?|transfers?|deposits?|withdrawals?/gi, ""));
}

/* ─── token encryption at rest ─────────────────────────────────────────── */

function key(): Buffer | null {
  const hex = (process.env.CONNECTOR_TOKEN_KEY ?? "").trim();
  return /^[0-9a-f]{64}$/i.test(hex) ? Buffer.from(hex, "hex") : null;
}
export const isConfigured = () => key() !== null;

function seal(obj: unknown): string {
  const k = key();
  if (!k) throw new Error("CONNECTOR_TOKEN_KEY is not set");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), ct.toString("base64")].join(".");
}

function open<T>(sealed: string): T | null {
  const k = key();
  const [v, iv, tag, ct] = sealed.split(".");
  if (!k || v !== "v1" || !iv || !tag || !ct) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return JSON.parse(Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]).toString("utf8")) as T;
  } catch { return null; }
}

/* ─── discovery + registration ─────────────────────────────────────────── */

type AuthServer = { authorization_endpoint: string; token_endpoint: string; registration_endpoint?: string };
let asCache: { at: number; v: AuthServer } | null = null;

async function authServer(): Promise<AuthServer> {
  if (asCache && Date.now() - asCache.at < 60 * 60 * 1000) return asCache.v;
  const pr = await fetchImpl(RESOURCE_METADATA, { signal: AbortSignal.timeout(8_000) });
  if (!pr.ok) throw new Error(`Coinbase resource metadata: ${pr.status}`);
  const issuer = String(((await pr.json()) as { authorization_servers?: string[] }).authorization_servers?.[0] ?? "");
  if (!/^https:\/\/login\.coinbase\.com\/?$/.test(issuer)) throw new Error("Unexpected Coinbase authorization server");
  const mr = await fetchImpl(`${issuer.replace(/\/$/, "")}/.well-known/oauth-authorization-server`, { signal: AbortSignal.timeout(8_000) });
  if (!mr.ok) throw new Error(`Coinbase authorization metadata: ${mr.status}`);
  const m = (await mr.json()) as AuthServer;
  for (const u of [m.authorization_endpoint, m.token_endpoint, m.registration_endpoint]) {
    if (u && !/^https:\/\/login\.coinbase\.com\//.test(u)) throw new Error("Coinbase endpoint outside login.coinbase.com");
  }
  asCache = { at: Date.now(), v: m };
  return m;
}

/** One public client per redirect URI, registered once (RFC 7591) and kept. */
async function clientId(redirectUri: string): Promise<string> {
  const hit = await kvGetProbe<string>(kClient(redirectUri));
  if (hit.status === "hit" && hit.value) return hit.value;
  if (hit.status === "error") throw new Error("KV unavailable");
  const as = await authServer();
  if (!as.registration_endpoint) throw new Error("Coinbase offers no client registration");
  const r = await fetchImpl(as.registration_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_name: "Blue Agent",
      client_uri: "https://blueagent.dev",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: READ_SCOPES.join(" "),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const j = (await r.json().catch(() => ({}))) as { client_id?: string; error?: string };
  if (!r.ok || !j.client_id) throw new Error(`Coinbase client registration failed: ${r.status} ${j.error ?? ""}`.trim());
  await kvSetOrThrow(kClient(redirectUri), j.client_id);
  return j.client_id;
}

/* ─── the flow ─────────────────────────────────────────────────────────── */

const b64url = (b: Buffer) => b.toString("base64url");
type PendingState = { wallet: string; verifier: string; redirectUri: string; clientId: string };

export async function startAuth(wallet: string, redirectUri: string): Promise<string> {
  const cid = await clientId(redirectUri);
  const as = await authServer();
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const state = b64url(randomBytes(24));
  const pending: PendingState = { wallet: wallet.toLowerCase(), verifier, redirectUri, clientId: cid };
  if (!(await kvSetNX(kState(state), pending, STATE_TTL_S))) throw new Error("Could not start sign-in");
  const u = new URL(as.authorization_endpoint);
  u.search = new URLSearchParams({
    response_type: "code",
    client_id: cid,
    redirect_uri: redirectUri,
    scope: READ_SCOPES.join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: COINBASE_MCP_URL,
  }).toString();
  return u.toString();
}

type Tokens = { access_token: string; refresh_token?: string; expires_at: number; scope?: string; client_id: string };

async function tokenRequest(body: Record<string, string>): Promise<Omit<Tokens, "client_id">> {
  const as = await authServer();
  const r = await fetchImpl(as.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(10_000),
  });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string };
  if (!r.ok || !j.access_token) throw new Error(`Coinbase token request failed: ${r.status} ${j.error ?? ""}`.trim());
  return { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + (j.expires_in ?? 3600) * 1000, scope: j.scope };
}

export type FinishResult = { ok: true } | { ok: false; reason: "state" | "wallet" | "exchange" | "config" };

/** The callback: one use of `state`, from the same wallet that started it. */
export async function finishAuth(code: string, state: string, sessionWallet: string): Promise<FinishResult> {
  if (!isConfigured()) return { ok: false, reason: "config" };
  const p = await kvGetProbe<PendingState>(kState(state));
  if (p.status !== "hit") return { ok: false, reason: "state" };
  await kvDel(kState(state));
  if (p.value.wallet !== sessionWallet.toLowerCase()) return { ok: false, reason: "wallet" };
  try {
    const t = await tokenRequest({
      grant_type: "authorization_code", code, redirect_uri: p.value.redirectUri,
      client_id: p.value.clientId, code_verifier: p.value.verifier, resource: COINBASE_MCP_URL,
    });
    await kvSetOrThrow(kToken(p.value.wallet), seal({ ...t, client_id: p.value.clientId }), TOKEN_TTL_S);
    await kvDel(kTools(p.value.wallet));
    return { ok: true };
  } catch { return { ok: false, reason: "exchange" }; }
}

/** A usable access token for this wallet, refreshed when within a minute of
 *  expiry (or when `force` after a 401). null ⟹ not connected / revoked. */
export async function accessToken(wallet: string, force = false): Promise<string | null> {
  const p = await kvGetProbe<string>(kToken(wallet));
  if (p.status !== "hit") return null;
  const t = open<Tokens>(p.value);
  if (!t) return null;
  if (!force && t.expires_at - Date.now() > REFRESH_SKEW_MS) return t.access_token;
  if (!t.refresh_token) return null;
  try {
    const n = await tokenRequest({ grant_type: "refresh_token", refresh_token: t.refresh_token, client_id: t.client_id, resource: COINBASE_MCP_URL });
    const next: Tokens = { ...n, refresh_token: n.refresh_token ?? t.refresh_token, client_id: t.client_id };
    await kvSetOrThrow(kToken(wallet), seal(next), TOKEN_TTL_S);
    return next.access_token;
  } catch { return null; }
}

export async function disconnect(wallet: string): Promise<void> {
  await kvDel(kToken(wallet), kTools(wallet));
}

/** Read-only tools for this wallet's connection (cached an hour). */
export async function readOnlyTools(wallet: string): Promise<McpToolDef[] | null> {
  const c = await kvGetProbe<McpToolDef[]>(kTools(wallet));
  if (c.status === "hit" && Array.isArray(c.value)) return c.value;
  for (const force of [false, true]) {
    const tok = await accessToken(wallet, force);
    if (!tok) return null;
    try {
      const tools = (await mcpListTools({ url: COINBASE_MCP_URL, headers: { Authorization: `Bearer ${tok}` } })).filter((t) => isReadOnlyTool(t.name));
      await kvSetOrThrow(kTools(wallet), tools, TOOLS_TTL_S).catch(() => {});
      return tools;
    } catch (e) {
      if (!force && /\b401\b/.test((e as Error).message)) continue;
      return null;
    }
  }
  return null;
}
