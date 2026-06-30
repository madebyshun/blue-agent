"use client";

// Client store for Blue Chat MCP Connectors — external MCP servers the user
// attaches so their tools become callable in chat. localStorage-backed and
// broadcast on a window event so the Connectors panel + badge row update live.
// ChatContext reads the enabled connectors at send-time and forwards them
// (url + auth headers + tool schemas) to /api/chat, which prefixes the tool
// names `mcp__<id>__<tool>` and routes tool_use calls back to the server.
//
// NOTE on secrets: auth tokens live in localStorage (same trust model as the
// existing skills/integrations stores). They never leave the user's browser
// except to /api/chat (our origin) when a connector tool is actually invoked.

import { useEffect, useState } from "react";

export interface McpToolDef {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface McpConnector {
  id: string;          // slug, stable — used to namespace tool names
  name: string;        // display label
  url: string;         // MCP endpoint (Streamable HTTP)
  authHeader?: string; // e.g. "Authorization"
  authValue?: string;  // e.g. "Bearer ghp_…" — stored locally only
  tools: McpToolDef[]; // fetched once at add-time via /api/mcp-client
  enabled: boolean;
  addedAt: number;
}

const KEY   = "blueagent:connectors";
const EVENT = "blueagent:connectors-changed";
const isClient = typeof window !== "undefined";

function emit() { if (isClient) window.dispatchEvent(new Event(EVENT)); }

// ── Presets — one-click starting points (URL + which auth header to ask for) ──
export interface ConnectorPreset {
  id: string;
  name: string;
  url: string;
  authHeader: string;
  authPlaceholder: string;
  hint: string;
}
export const CONNECTOR_PRESETS: ConnectorPreset[] = [
  {
    id: "github",
    name: "GitHub",
    url: "https://api.githubcopilot.com/mcp/",
    authHeader: "Authorization",
    authPlaceholder: "Bearer ghp_… (GitHub PAT)",
    hint: "GitHub MCP — repos, issues, PRs, code search. Needs a GitHub personal access token.",
  },
];

// ── CRUD ────────────────────────────────────────────────────────────────────
export function loadConnectors(): McpConnector[] {
  if (!isClient) return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

export function saveConnectors(list: McpConnector[]): void {
  if (!isClient) return;
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 20))); emit(); }
  catch { /* storage blocked / quota */ }
}

/** Build a filesystem-safe, Anthropic-tool-name-safe slug from a label/url. */
export function slugifyConnectorId(input: string): string {
  const base = input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24);
  return base || "mcp";
}

export function addConnector(c: Omit<McpConnector, "id" | "addedAt" | "enabled"> & { id?: string }): McpConnector {
  const list = loadConnectors();
  let id = c.id || slugifyConnectorId(c.name || c.url);
  // De-dup id collisions so two connectors never share a tool namespace.
  if (list.some(x => x.id === id)) {
    let n = 2;
    while (list.some(x => x.id === `${id}-${n}`)) n++;
    id = `${id}-${n}`;
  }
  const entry: McpConnector = {
    id,
    name: c.name || c.url,
    url: c.url,
    authHeader: c.authHeader,
    authValue: c.authValue,
    tools: c.tools ?? [],
    enabled: true,
    addedAt: Date.now(),
  };
  saveConnectors([entry, ...list]);
  return entry;
}

export function removeConnector(id: string): void {
  saveConnectors(loadConnectors().filter(c => c.id !== id));
}

export function setConnectorEnabled(id: string, enabled: boolean): void {
  saveConnectors(loadConnectors().map(c => (c.id === id ? { ...c, enabled } : c)));
}

/**
 * Shape forwarded to /api/chat — only enabled connectors, with auth folded into
 * a headers map. Tool schemas ride along so the route needn't re-list per send.
 */
export interface ChatConnectorPayload {
  id: string;
  name: string;
  url: string;
  headers: Record<string, string>;
  tools: McpToolDef[];
}
export function enabledConnectorsForChat(): ChatConnectorPayload[] {
  return loadConnectors()
    .filter(c => c.enabled && c.url && c.tools.length > 0)
    .map(c => ({
      id: c.id,
      name: c.name,
      url: c.url,
      headers: c.authValue ? { [c.authHeader || "Authorization"]: c.authValue } : {},
      tools: c.tools,
    }));
}

/** Test a server + fetch its tool list via the server proxy (handles CORS). */
export async function probeConnector(
  url: string, headers: Record<string, string>,
): Promise<{ ok: true; tools: McpToolDef[] } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/mcp-client", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, headers }),
    });
    const data = await res.json();
    if (data?.ok) return { ok: true, tools: data.tools as McpToolDef[] };
    return { ok: false, error: data?.error || "Failed to reach MCP server" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ── Live hook ─────────────────────────────────────────────────────────────────
export function useConnectors(): McpConnector[] {
  const [list, setList] = useState<McpConnector[]>([]);
  useEffect(() => {
    const refresh = () => setList(loadConnectors());
    refresh();
    window.addEventListener(EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => { window.removeEventListener(EVENT, refresh); window.removeEventListener("storage", refresh); };
  }, []);
  return list;
}
