"use client";

import { useState } from "react";
import {
  useConnectors, addConnector, removeConnector, setConnectorEnabled,
  probeConnector, CONNECTOR_PRESETS, type ConnectorPreset, type McpToolDef,
} from "../connectors";

// Blue Chat Connectors — attach external MCP servers so their tools become
// callable in chat (alongside the built-in Hub tools). Each connector's tools
// are fetched once via /api/mcp-client and ride along to /api/chat at send-time.

const ACCENT = "#A78BFA"; // purple — the "connect / integrate" accent

export default function ConnectorsPanel({ onPick }: { onPick?: () => void }) {
  const connectors = useConnectors();
  const [open, setOpen] = useState(false);

  // Add-form state
  const [preset, setPreset]   = useState<ConnectorPreset | null>(null);
  const [name, setName]       = useState("");
  const [url, setUrl]         = useState("");
  const [authHeader, setAuthHeader] = useState("Authorization");
  const [authValue, setAuthValue]   = useState("");
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState("");
  const [preview, setPreview] = useState<McpToolDef[] | null>(null);

  function reset() {
    setPreset(null); setName(""); setUrl(""); setAuthHeader("Authorization");
    setAuthValue(""); setBusy(false); setError(""); setPreview(null);
  }
  function choosePreset(p: ConnectorPreset) {
    setPreset(p); setName(p.name); setUrl(p.url); setAuthHeader(p.authHeader);
    setAuthValue(""); setError(""); setPreview(null);
  }

  async function testAndAdd() {
    const u = url.trim();
    if (!u || busy) return;
    setBusy(true); setError(""); setPreview(null);
    const headers = authValue.trim() ? { [authHeader.trim() || "Authorization"]: authValue.trim() } : {};
    const res = await probeConnector(u, headers);
    if (!res.ok) { setError(res.error); setBusy(false); return; }
    if (res.tools.length === 0) { setError("Server returned no tools."); setBusy(false); return; }
    // Two-step: first probe shows a preview, second click commits.
    if (!preview) { setPreview(res.tools); setBusy(false); return; }
    addConnector({
      name: name.trim() || u,
      url: u,
      authHeader: authHeader.trim() || undefined,
      authValue: authValue.trim() || undefined,
      tools: res.tools,
    });
    setBusy(false); setOpen(false); reset();
  }

  return (
    <div className="flex flex-col h-full bg-[#050508] overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#1A1A2E] flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <p className="font-mono text-[10px] text-slate-500 tracking-widest">CONNECTORS</p>
          <span className="font-mono text-[10px] text-slate-600">{connectors.length} attached</span>
        </div>
        <p className="font-mono text-[10px] text-slate-700 leading-relaxed">
          Attach external <span style={{ color: ACCENT }}>MCP servers</span> — their tools become callable in chat.
          Tool output is treated as untrusted third-party data.
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-4 space-y-6">

          {/* Installed connectors */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <p className="font-mono text-[9px] tracking-widest flex items-center gap-2" style={{ color: ACCENT }}>
                <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: ACCENT }} />
                ATTACHED · {connectors.length}
              </p>
              <button
                onClick={() => { reset(); setOpen(true); }}
                className="font-mono text-[10px] px-2.5 py-1 rounded-lg border transition-colors"
                style={{ borderColor: `${ACCENT}30`, color: ACCENT }}
              >
                + Add connector
              </button>
            </div>

            <div className="space-y-1.5">
              {connectors.map(c => (
                <div key={c.id} className="px-4 py-3 rounded-xl border border-[#1A1A2E] bg-[#0A0A12]">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <span className="font-mono text-[13px] text-slate-200 truncate block">{c.name}</span>
                      <p className="font-mono text-[10px] text-slate-600 truncate">{c.url}</p>
                    </div>
                    <span className="font-mono text-[9px] px-1.5 py-0.5 rounded border shrink-0"
                      style={{ color: ACCENT, borderColor: `${ACCENT}30`, background: `${ACCENT}10` }}>
                      {c.tools.length} tools
                    </span>
                    <button
                      onClick={() => setConnectorEnabled(c.id, !c.enabled)}
                      title={c.enabled ? "Disable" : "Enable"}
                      className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                      style={{ background: c.enabled ? "#34D39955" : "#1A1A2E" }}
                    >
                      <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: c.enabled ? 18 : 2 }} />
                    </button>
                    <button
                      onClick={() => removeConnector(c.id)}
                      title="Remove"
                      className="font-mono text-[12px] text-slate-600 hover:text-red-400 transition-colors shrink-0"
                    >✕</button>
                  </div>
                  {/* tool chips */}
                  {c.tools.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {c.tools.slice(0, 8).map(t => (
                        <span key={t.name} className="font-mono text-[8px] px-1.5 py-0.5 rounded"
                          style={{ background: `${ACCENT}0A`, color: `${ACCENT}B0`, border: `1px solid ${ACCENT}20` }}>
                          {t.name}
                        </span>
                      ))}
                      {c.tools.length > 8 && (
                        <span className="font-mono text-[8px] px-1.5 py-0.5 text-slate-600">+{c.tools.length - 8}</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {connectors.length === 0 && (
                <p className="font-mono text-[10px] text-slate-700">No connectors yet. Click + Add connector to attach an MCP server.</p>
              )}
            </div>
          </section>

          {/* Presets */}
          <section className="border-t border-[#1A1A2E] pt-5">
            <p className="font-mono text-[9px] text-slate-600 tracking-widest mb-3">// QUICK ADD</p>
            <div className="grid grid-cols-1 gap-2">
              {CONNECTOR_PRESETS.map(p => (
                <button
                  key={p.id}
                  onClick={() => { reset(); choosePreset(p); setOpen(true); }}
                  className="px-3 py-3 rounded-xl border text-left transition-all hover:scale-[1.01]"
                  style={{ borderColor: `${ACCENT}25`, background: `${ACCENT}08` }}
                >
                  <div className="font-mono text-xs font-semibold mb-0.5" style={{ color: ACCENT }}>{p.name}</div>
                  <div className="font-mono text-[9px] text-slate-600 leading-relaxed">{p.hint}</div>
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* Add modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => { setOpen(false); reset(); }} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-5 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <p className="font-mono text-[11px] tracking-widest" style={{ color: ACCENT }}>// ADD CONNECTOR</p>
              <button onClick={() => { setOpen(false); reset(); }} className="font-mono text-[13px] text-slate-500 hover:text-white">✕</button>
            </div>

            {/* Preset chips */}
            <div className="flex gap-1.5 flex-wrap mb-3">
              {CONNECTOR_PRESETS.map(p => (
                <button key={p.id} onClick={() => choosePreset(p)}
                  className="font-mono text-[10px] px-2.5 py-1 rounded-lg border transition-colors"
                  style={preset?.id === p.id
                    ? { color: ACCENT, background: `${ACCENT}15`, borderColor: `${ACCENT}35` }
                    : { color: "#475569", borderColor: "#1A1A2E" }}>
                  {p.name}
                </button>
              ))}
            </div>

            <label className="font-mono text-[9px] text-slate-600 tracking-widest">NAME</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="My MCP server"
              className="w-full bg-[#050508] border border-[#1A1A2E] focus:border-[#A78BFA]/40 rounded-lg px-3 py-2 font-mono text-[12px] text-white placeholder:text-slate-700 outline-none mb-3 mt-1" />

            <label className="font-mono text-[9px] text-slate-600 tracking-widest">MCP ENDPOINT URL</label>
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com/mcp/"
              className="w-full bg-[#050508] border border-[#1A1A2E] focus:border-[#A78BFA]/40 rounded-lg px-3 py-2 font-mono text-[12px] text-white placeholder:text-slate-700 outline-none mb-3 mt-1" />

            <label className="font-mono text-[9px] text-slate-600 tracking-widest">AUTH (optional)</label>
            <div className="flex gap-2 mt-1 mb-1">
              <input value={authHeader} onChange={e => setAuthHeader(e.target.value)} placeholder="Authorization"
                className="w-1/3 bg-[#050508] border border-[#1A1A2E] focus:border-[#A78BFA]/40 rounded-lg px-3 py-2 font-mono text-[12px] text-white placeholder:text-slate-700 outline-none" />
              <input value={authValue} onChange={e => setAuthValue(e.target.value)} type="password"
                placeholder={preset?.authPlaceholder ?? "Bearer token…"}
                className="flex-1 bg-[#050508] border border-[#1A1A2E] focus:border-[#A78BFA]/40 rounded-lg px-3 py-2 font-mono text-[12px] text-white placeholder:text-slate-700 outline-none" />
            </div>
            <p className="font-mono text-[9px] text-slate-700 mb-3">Token is stored locally in your browser and only sent to Blue Chat when a connector tool runs.</p>

            {error && <p className="font-mono text-[10px] text-red-400 mb-3 whitespace-pre-wrap leading-relaxed">{error}</p>}

            {preview && (
              <div className="mb-3 rounded-lg border border-[#1A1A2E] bg-[#050508] p-3">
                <p className="font-mono text-[9px] tracking-widest mb-2" style={{ color: "#34D399" }}>✓ {preview.length} TOOLS FOUND</p>
                <div className="flex flex-wrap gap-1">
                  {preview.slice(0, 12).map(t => (
                    <span key={t.name} className="font-mono text-[8px] px-1.5 py-0.5 rounded"
                      style={{ background: `${ACCENT}0A`, color: `${ACCENT}B0`, border: `1px solid ${ACCENT}20` }}>{t.name}</span>
                  ))}
                  {preview.length > 12 && <span className="font-mono text-[8px] px-1.5 py-0.5 text-slate-600">+{preview.length - 12}</span>}
                </div>
              </div>
            )}

            <button
              onClick={testAndAdd}
              disabled={busy || !url.trim()}
              className="w-full font-mono text-[12px] font-bold py-2 rounded-lg border transition-colors disabled:opacity-50"
              style={{ borderColor: `${ACCENT}40`, color: ACCENT }}
            >
              {busy ? "Testing…" : preview ? "Add connector" : "Test connection"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
