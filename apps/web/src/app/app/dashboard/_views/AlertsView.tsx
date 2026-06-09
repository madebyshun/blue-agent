"use client";

/**
 * AlertsView — Dashboard "Alerts" tab. Bento-style restructure: the
 * phase-1 disclosure, create-alert affordance, alert list, and Sentinel
 * upgrade CTA are each their own bento cell with a distinct accent, so
 * the empty state no longer feels like an apology page.
 */

import { useState, useEffect } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type AlertType   = "price_above" | "price_below" | "whale_move";
type AlertStatus = "active" | "triggered" | "dismissed";

interface Alert {
  id:        string;
  type:      AlertType;
  label:     string;
  token:     string;
  condition: string;
  value:     string;
  status:    AlertStatus;
  createdAt: number;
  triggeredAt?: number;
}

const STORAGE_KEY = "blue_alerts_v1";

function loadAlerts(): Alert[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveAlerts(alerts: Alert[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts)); }
function uid() { return Math.random().toString(36).slice(2, 9); }

const ALERT_TYPES: { id: AlertType; label: string; icon: string; color: string; desc: string }[] = [
  { id: "price_above", label: "Price Above", icon: "↑", color: "#22C55E", desc: "Alert when token price exceeds threshold" },
  { id: "price_below", label: "Price Below", icon: "↓", color: "#EF4444", desc: "Alert when token price drops below threshold" },
  { id: "whale_move",  label: "Whale Move",  icon: "🐋", color: "#A78BFA", desc: "Alert when a whale wallet makes a large move" },
];

const QUICK_TOKENS = ["ETH", "BTC", "BLUE", "USDC", "AERO", "cbBTC"];

// ── Alert row ─────────────────────────────────────────────────────────────────

function AlertCard({ alert, onDismiss, onDelete }: { alert: Alert; onDismiss: () => void; onDelete: () => void }) {
  const typeConfig  = ALERT_TYPES.find(t => t.id === alert.type)!;
  const isActive    = alert.status === "active";
  const isTriggered = alert.status === "triggered";

  return (
    <div className={`rounded-2xl border p-4 transition-all ${
      isTriggered ? "border-[#22C55E]/40 bg-[#22C55E]/5" :
      isActive    ? "border-[#1A1A2E] bg-[#0d0d12] hover:border-[#2a2a3e]" :
                    "border-[#1A1A2E] bg-[#0a0a0f] opacity-50"
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm shrink-0"
            style={{ background: `${typeConfig.color}18`, border: `1px solid ${typeConfig.color}30` }}>
            {typeConfig.icon}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{alert.label}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-[10px] px-1.5 py-0.5 rounded font-bold tracking-widest"
                    style={{ color: typeConfig.color, background: `${typeConfig.color}18` }}>
                {typeConfig.label.toUpperCase()}
              </span>
              {isTriggered && <span className="text-[10px] text-[#22C55E] font-bold">● TRIGGERED</span>}
              {isActive && (
                <span className="text-[10px] text-slate-600">
                  {new Date(alert.createdAt).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isTriggered && (
            <button onClick={onDismiss}
              className="text-[10px] text-slate-500 hover:text-slate-300 px-2 py-1 border border-[#1A1A2E] rounded-lg transition-colors">
              Dismiss
            </button>
          )}
          <button onClick={onDelete} className="text-[10px] text-red-500/50 hover:text-red-400 px-2 py-1 transition-colors">
            ✕
          </button>
        </div>
      </div>

      {isActive && (
        <div className="mt-3 flex items-center gap-2 pt-3 border-t border-[#1A1A2E]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B] animate-pulse" />
          <p className="text-[10px] text-slate-500">Monitoring · push notifications land in v2 via Sentinel</p>
        </div>
      )}
    </div>
  );
}

// ── View ──────────────────────────────────────────────────────────────────────

export default function AlertsView() {
  const [alerts, setAlerts]           = useState<Alert[]>([]);
  const [showForm, setShowForm]       = useState(false);
  const [type, setType]               = useState<AlertType>("price_above");
  const [token, setToken]             = useState("");
  const [value, setValue]             = useState("");
  const [customToken, setCustomToken] = useState(false);

  useEffect(() => { setAlerts(loadAlerts()); }, []);

  function createAlert() {
    if (!token || !value) return;
    const label = type === "whale_move"
      ? `Whale move on ${token}`
      : `${token} ${type === "price_above" ? "above" : "below"} $${value}`;
    const newAlert: Alert = {
      id:        uid(),
      type,
      label,
      token,
      condition: type === "price_above" ? `> ${value}` : type === "price_below" ? `< ${value}` : `whale: ${value}`,
      value,
      status:    "active",
      createdAt: Date.now(),
    };
    const updated = [newAlert, ...alerts];
    setAlerts(updated);
    saveAlerts(updated);
    setShowForm(false);
    setToken("");
    setValue("");
  }

  function dismissAlert(id: string) {
    const updated = alerts.map(a => a.id === id ? { ...a, status: "dismissed" as AlertStatus } : a);
    setAlerts(updated); saveAlerts(updated);
  }
  function deleteAlert(id: string) {
    const updated = alerts.filter(a => a.id !== id);
    setAlerts(updated); saveAlerts(updated);
  }

  const activeAlerts    = alerts.filter(a => a.status === "active");
  const triggeredAlerts = alerts.filter(a => a.status === "triggered");
  const selectedType    = ALERT_TYPES.find(t => t.id === type)!;

  return (
    <div className="relative">
      {/* Ambient amber glow */}
      <div className="pointer-events-none overflow-hidden absolute inset-x-0 top-0 h-[260px]">
        <div className="absolute inset-0"
          style={{ background: "radial-gradient(ellipse 70% 50% at 50% -10%, #F59E0B0a 0%, transparent 70%)" }} />
      </div>

      <div className="relative px-3 sm:px-5 py-5 max-w-3xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

          {/* ── Phase 1 disclosure (2 col) ──────────────────────────────── */}
          <div className="sm:col-span-2 rounded-2xl border border-[#F59E0B]/25 p-4 relative overflow-hidden"
               style={{ background: "linear-gradient(135deg, #F59E0B12 0%, #0d0d12 60%)" }}>
            <span aria-hidden className="absolute inset-x-0 top-0 h-px"
                  style={{ background: "linear-gradient(90deg, transparent, #F59E0B, transparent)" }} />
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#F59E0B]/15 border border-[#F59E0B]/30 flex items-center justify-center shrink-0">
                <span className="text-base">⚡</span>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-[#F59E0B] font-bold tracking-widest mb-1">PHASE 1 · LOCAL ALERTS</p>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Alerts persist in your browser. Real-time push notifications via Sentinel webhook land in v2 —
                  the card below previews how that upgrade will look.
                </p>
              </div>
            </div>
          </div>

          {/* ── Create Alert (2 col when collapsed, 2 col form when open) */}
          <div className={showForm ? "sm:col-span-2" : "sm:col-span-2"}>
            {!showForm ? (
              <button
                onClick={() => setShowForm(true)}
                className="w-full rounded-2xl border border-dashed border-[#F59E0B]/30 hover:border-[#F59E0B]/60 bg-[#F59E0B]/[0.03] hover:bg-[#F59E0B]/[0.06] p-5 text-center transition-all group">
                <div className="text-2xl mb-1.5">＋</div>
                <p className="text-sm font-bold text-[#F59E0B] group-hover:text-[#FBBF24] transition-colors">Create Alert</p>
                <p className="text-[10px] text-slate-600 mt-1">Price threshold · whale wallet · token event</p>
              </button>
            ) : (
              <div className="rounded-2xl border border-[#F59E0B]/30 p-5"
                   style={{ background: "linear-gradient(135deg, #F59E0B0a 0%, #0d0d12 70%)" }}>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[11px] text-[#F59E0B] font-bold tracking-widest">NEW ALERT</p>
                  <button onClick={() => setShowForm(false)} className="text-slate-600 hover:text-slate-400 text-lg leading-none">✕</button>
                </div>

                {/* Alert type — bento cells */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {ALERT_TYPES.map(t => (
                    <button key={t.id} onClick={() => setType(t.id)}
                      className="rounded-xl border p-3 text-left transition-all"
                      style={type === t.id
                        ? { borderColor: `${t.color}50`, background: `${t.color}12`, color: t.color, boxShadow: `0 0 16px ${t.color}10` }
                        : { borderColor: "#1A1A2E", color: "#475569", background: "#0a0a0f" }}>
                      <div className="text-lg mb-1">{t.icon}</div>
                      <div className="text-[11px] font-semibold">{t.label}</div>
                    </button>
                  ))}
                </div>

                {/* Token */}
                <div className="mb-3">
                  <label className="text-[10px] text-slate-600 tracking-widest block mb-2 font-bold">TOKEN</label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {QUICK_TOKENS.map(t => (
                      <button key={t} onClick={() => { setToken(t); setCustomToken(false); }}
                        className="px-2.5 py-1 rounded-lg text-[11px] border transition-all font-mono"
                        style={token === t && !customToken
                          ? { color: selectedType.color, background: `${selectedType.color}12`, borderColor: `${selectedType.color}40` }
                          : { color: "#475569", borderColor: "#1A1A2E", background: "#0a0a0f" }}>
                        {t}
                      </button>
                    ))}
                    <button onClick={() => { setCustomToken(true); setToken(""); }}
                      className="px-2.5 py-1 rounded-lg text-[11px] border transition-all"
                      style={customToken
                        ? { color: selectedType.color, borderColor: `${selectedType.color}40`, background: `${selectedType.color}12` }
                        : { color: "#475569", borderColor: "#1A1A2E", background: "#0a0a0f" }}>
                      Custom
                    </button>
                  </div>
                  {customToken && (
                    <input type="text" placeholder="Token symbol or 0x address"
                      value={token} onChange={e => setToken(e.target.value)}
                      className="w-full h-10 px-3 bg-[#0a0a0f] border border-[#1A1A2E] rounded-xl text-sm text-white placeholder-slate-700 outline-none focus:border-[#F59E0B]/40 transition-colors" />
                  )}
                </div>

                {/* Threshold */}
                <div className="mb-4">
                  <label className="text-[10px] text-slate-600 tracking-widest block mb-2 font-bold">
                    {type === "price_above" ? "ALERT ABOVE ($)" :
                     type === "price_below" ? "ALERT BELOW ($)" :
                                              "MIN TRADE SIZE (USD)"}
                  </label>
                  <input type="number" placeholder={type === "whale_move" ? "100000" : "3000"}
                    value={value} onChange={e => setValue(e.target.value)}
                    className="w-full h-10 px-3 bg-[#0a0a0f] border border-[#1A1A2E] rounded-xl text-sm text-white placeholder-slate-700 outline-none focus:border-[#F59E0B]/40 transition-colors" />
                </div>

                <button onClick={createAlert} disabled={!token || !value}
                  className="w-full h-10 rounded-xl text-sm font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{
                    background: `linear-gradient(135deg, ${selectedType.color}, ${selectedType.color}cc)`,
                    color: "#050508",
                    boxShadow: (!token || !value) ? "none" : `0 0 16px ${selectedType.color}25`,
                  }}>
                  Create Alert
                </button>
              </div>
            )}
          </div>

          {/* ── Triggered alerts (2 col) ────────────────────────────────── */}
          {triggeredAlerts.length > 0 && (
            <div className="sm:col-span-2">
              <p className="text-[10px] text-[#22C55E] tracking-widest font-bold mb-2">● TRIGGERED ({triggeredAlerts.length})</p>
              <div className="space-y-2">
                {triggeredAlerts.map(a => (
                  <AlertCard key={a.id} alert={a} onDismiss={() => dismissAlert(a.id)} onDelete={() => deleteAlert(a.id)} />
                ))}
              </div>
            </div>
          )}

          {/* ── Active alerts (2 col) or empty state ────────────────────── */}
          {activeAlerts.length > 0 ? (
            <div className="sm:col-span-2">
              <p className="text-[10px] text-slate-500 tracking-widest font-bold mb-2">
                ACTIVE · {activeAlerts.length}
              </p>
              <div className="space-y-2">
                {activeAlerts.map(a => (
                  <AlertCard key={a.id} alert={a} onDismiss={() => dismissAlert(a.id)} onDelete={() => deleteAlert(a.id)} />
                ))}
              </div>
            </div>
          ) : !showForm && (
            <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-8 text-center">
              <div className="w-14 h-14 mx-auto mb-3 rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] flex items-center justify-center">
                <span className="text-2xl opacity-40">🔔</span>
              </div>
              <p className="text-sm font-bold text-white mb-1">No active alerts</p>
              <p className="text-[10px] text-slate-600 leading-relaxed">Tap Create Alert above to get pinged when a token moves.</p>
            </div>
          )}

          {/* ── Sentinel upgrade CTA (full width or 1 col next to empty) ── */}
          <div className={`${activeAlerts.length === 0 && !showForm ? "" : "sm:col-span-2"} rounded-2xl border border-[#34D399]/25 p-4 relative overflow-hidden`}
               style={{ background: "linear-gradient(135deg, #34D39912 0%, #0d0d12 60%)" }}>
            <span aria-hidden className="absolute inset-x-0 top-0 h-px"
                  style={{ background: "linear-gradient(90deg, transparent, #34D399, transparent)" }} />
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#34D399]/15 border border-[#34D399]/30 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-[#34D399]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-[#34D399] font-bold tracking-widest mb-1">BLUE SENTINEL · COMING SOON</p>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Real-time onchain monitoring — rug patterns, whale moves, protocol exploits.
                  Pings via Telegram + browser push.
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
