"use client";

import { useState, useEffect } from "react";
import AppPageHeader from "@/components/app/AppPageHeader";
import AppCard from "@/components/app/AppCard";

// ── Types ─────────────────────────────────────────────────────────────────────

type AlertType = "price_above" | "price_below" | "whale_move";
type AlertStatus = "active" | "triggered" | "dismissed";

interface Alert {
  id:        string;
  type:      AlertType;
  label:     string;       // e.g. "ETH above $3,000"
  token:     string;       // symbol or address
  condition: string;       // e.g. "> 3000"
  value:     string;       // threshold
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

function saveAlerts(alerts: Alert[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
}

function uid() { return Math.random().toString(36).slice(2, 9); }

// ── Alert type config ──────────────────────────────────────────────────────────

const ALERT_TYPES: { id: AlertType; label: string; icon: string; color: string; desc: string }[] = [
  { id: "price_above", label: "Price Above",  icon: "↑", color: "#22C55E", desc: "Alert when token price exceeds threshold" },
  { id: "price_below", label: "Price Below",  icon: "↓", color: "#EF4444", desc: "Alert when token price drops below threshold" },
  { id: "whale_move",  label: "Whale Move",   icon: "🐋", color: "#A78BFA", desc: "Alert when a whale wallet makes a large move" },
];

const QUICK_TOKENS = ["ETH", "BTC", "BLUE", "USDC", "AERO", "cbBTC"];

// ── Components ────────────────────────────────────────────────────────────────

function AlertCard({ alert, onDismiss, onDelete }: { alert: Alert; onDismiss: () => void; onDelete: () => void }) {
  const typeConfig = ALERT_TYPES.find(t => t.id === alert.type)!;
  const isActive = alert.status === "active";
  const isTriggered = alert.status === "triggered";

  return (
    <div className={`rounded-2xl border p-4 transition-all ${
      isTriggered ? "border-[#22C55E]/40 bg-[#22C55E]/5" :
      isActive    ? "border-[#1A1A2E] bg-[#0d0d12]" :
                    "border-[#1A1A2E] bg-[#0a0a0f] opacity-50"
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm shrink-0"
            style={{ background: `${typeConfig.color}18`, border: `1px solid ${typeConfig.color}30` }}>
            {typeConfig.icon}
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{alert.label}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: typeConfig.color, background: `${typeConfig.color}18` }}>
                {typeConfig.label}
              </span>
              {isTriggered && <span className="text-[10px] text-[#22C55E]">✓ Triggered</span>}
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
            <button onClick={onDismiss} className="text-[10px] text-slate-500 hover:text-slate-300 px-2 py-1 border border-[#1A1A2E] rounded-lg transition-colors">
              Dismiss
            </button>
          )}
          <button onClick={onDelete} className="text-[10px] text-red-500/50 hover:text-red-400 px-2 py-1 transition-colors">
            ✕
          </button>
        </div>
      </div>

      {/* Coming soon badge for active alerts */}
      {isActive && (
        <div className="mt-3 flex items-center gap-2">
          <span className="w-1 h-1 rounded-full bg-[#F59E0B] animate-pulse" />
          <p className="text-[10px] text-slate-700">Monitoring active · webhook integration coming in v2</p>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AlertsPage() {
  const [alerts, setAlerts]       = useState<Alert[]>([]);
  const [showForm, setShowForm]   = useState(false);
  const [type, setType]           = useState<AlertType>("price_above");
  const [token, setToken]         = useState("");
  const [value, setValue]         = useState("");
  const [customToken, setCustomToken] = useState(false);

  useEffect(() => { setAlerts(loadAlerts()); }, []);

  function createAlert() {
    if (!token || !value) return;
    const typeConfig = ALERT_TYPES.find(t => t.id === type)!;
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
    setAlerts(updated);
    saveAlerts(updated);
  }

  function deleteAlert(id: string) {
    const updated = alerts.filter(a => a.id !== id);
    setAlerts(updated);
    saveAlerts(updated);
  }

  const activeAlerts    = alerts.filter(a => a.status === "active");
  const triggeredAlerts = alerts.filter(a => a.status === "triggered");
  const selectedType    = ALERT_TYPES.find(t => t.id === type)!;

  return (
    <div className="flex flex-col h-full bg-[#050508] text-white font-mono overflow-hidden">

      <AppPageHeader
        label="ALERTS"
        subtitle="Price alerts · whale moves · Base Mainnet"
        accent="#F59E0B"
        right={activeAlerts.length > 0 ? <span style={{ color: "#F59E0B" }}>{activeAlerts.length} active</span> : undefined}
      />

      <div className="flex-1 overflow-y-auto">
      <div className="px-6 py-6 max-w-2xl mx-auto">

        {/* Coming soon banner */}
        <div className="rounded-2xl border border-[#F59E0B]/20 bg-[#F59E0B]/5 px-5 py-4 mb-6 flex items-start gap-3">
          <span className="text-[#F59E0B] shrink-0 mt-0.5">⚡</span>
          <div>
            <p className="text-xs text-[#F59E0B] font-semibold mb-1">Phase 1 — Local Alerts</p>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Alerts are stored locally. Real-time push notifications via Sentinel webhook integration coming in v2.
              For now, you can set up alerts and check back, or connect to Blue Sentinel for live monitoring.
            </p>
          </div>
        </div>

        {/* Triggered alerts */}
        {triggeredAlerts.length > 0 && (
          <div className="mb-6">
            <p className="text-[10px] text-[#22C55E] tracking-widest mb-3">TRIGGERED</p>
            <div className="space-y-2">
              {triggeredAlerts.map(a => (
                <AlertCard key={a.id} alert={a} onDismiss={() => dismissAlert(a.id)} onDelete={() => deleteAlert(a.id)} />
              ))}
            </div>
          </div>
        )}

        {/* Create alert */}
        {!showForm ? (
          <button
            onClick={() => setShowForm(true)}
            className="w-full rounded-2xl border border-dashed border-[#1A1A2E] hover:border-[#F59E0B]/30 bg-transparent hover:bg-[#F59E0B]/5 p-5 text-center transition-all mb-6 group"
          >
            <p className="text-sm text-slate-600 group-hover:text-[#F59E0B] transition-colors">+ Create Alert</p>
            <p className="text-[10px] text-slate-700 mt-1">Price threshold · whale wallet · token event</p>
          </button>
        ) : (
          <div className="rounded-2xl border border-[#F59E0B]/20 bg-[#0d0d12] p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-[#F59E0B] tracking-widest">NEW ALERT</p>
              <button onClick={() => setShowForm(false)} className="text-slate-600 hover:text-slate-400 text-lg leading-none">✕</button>
            </div>

            {/* Alert type selector */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {ALERT_TYPES.map(t => (
                <button
                  key={t.id}
                  onClick={() => setType(t.id)}
                  className="rounded-xl border p-3 text-left transition-all"
                  style={type === t.id
                    ? { borderColor: `${t.color}40`, background: `${t.color}10`, color: t.color }
                    : { borderColor: "#1A1A2E", color: "#475569" }}
                >
                  <div className="text-lg mb-1">{t.icon}</div>
                  <div className="text-[11px] font-semibold">{t.label}</div>
                </button>
              ))}
            </div>

            {/* Token */}
            <div className="mb-3">
              <label className="text-[10px] text-slate-600 tracking-widest block mb-2">TOKEN</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {QUICK_TOKENS.map(t => (
                  <button
                    key={t}
                    onClick={() => { setToken(t); setCustomToken(false); }}
                    className="px-3 py-1 rounded-lg text-[11px] border transition-all"
                    style={token === t && !customToken
                      ? { color: selectedType.color, background: `${selectedType.color}10`, borderColor: `${selectedType.color}30` }
                      : { color: "#475569", borderColor: "#1A1A2E" }}
                  >
                    {t}
                  </button>
                ))}
                <button
                  onClick={() => { setCustomToken(true); setToken(""); }}
                  className="px-3 py-1 rounded-lg text-[11px] border transition-all"
                  style={customToken
                    ? { color: selectedType.color, borderColor: `${selectedType.color}30`, background: `${selectedType.color}10` }
                    : { color: "#475569", borderColor: "#1A1A2E" }}
                >
                  Custom
                </button>
              </div>
              {customToken && (
                <input
                  type="text"
                  placeholder="Token symbol or 0x address"
                  value={token}
                  onChange={e => setToken(e.target.value)}
                  className="w-full h-10 px-4 bg-[#0a0a0f] border border-[#1A1A2E] rounded-xl text-sm text-white placeholder-slate-700 outline-none focus:border-[#F59E0B]/30 transition-colors"
                />
              )}
            </div>

            {/* Value */}
            {type !== "whale_move" && (
              <div className="mb-4">
                <label className="text-[10px] text-slate-600 tracking-widest block mb-2">
                  {type === "price_above" ? "ALERT WHEN PRICE ABOVE ($)" : "ALERT WHEN PRICE BELOW ($)"}
                </label>
                <input
                  type="number"
                  placeholder="e.g. 3000"
                  value={value}
                  onChange={e => setValue(e.target.value)}
                  className="w-full h-10 px-4 bg-[#0a0a0f] border border-[#1A1A2E] rounded-xl text-sm text-white placeholder-slate-700 outline-none focus:border-[#F59E0B]/30 transition-colors"
                />
              </div>
            )}

            {type === "whale_move" && (
              <div className="mb-4">
                <label className="text-[10px] text-slate-600 tracking-widest block mb-2">MIN TRADE SIZE (USD)</label>
                <input
                  type="number"
                  placeholder="e.g. 100000"
                  value={value}
                  onChange={e => setValue(e.target.value)}
                  className="w-full h-10 px-4 bg-[#0a0a0f] border border-[#1A1A2E] rounded-xl text-sm text-white placeholder-slate-700 outline-none focus:border-[#F59E0B]/30 transition-colors"
                />
              </div>
            )}

            <button
              onClick={createAlert}
              disabled={!token || !value}
              className="w-full h-10 rounded-xl text-sm font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                background: `linear-gradient(135deg, ${selectedType.color}, ${selectedType.color}cc)`,
                color: "#050508",
              }}
            >
              Create Alert
            </button>
          </div>
        )}

        {/* Active alerts */}
        {activeAlerts.length > 0 ? (
          <div>
            <p className="text-[10px] text-slate-600 tracking-widest mb-3">ACTIVE ALERTS ({activeAlerts.length})</p>
            <div className="space-y-2">
              {activeAlerts.map(a => (
                <AlertCard key={a.id} alert={a} onDismiss={() => dismissAlert(a.id)} onDelete={() => deleteAlert(a.id)} />
              ))}
            </div>
          </div>
        ) : !showForm && (
          <AppCard className="p-8 text-center">
            <p className="text-2xl mb-3">🔔</p>
            <p className="text-sm text-slate-400 mb-1">No active alerts</p>
            <p className="text-[10px] text-slate-600">Create an alert to get notified when conditions are met</p>
          </AppCard>
        )}

        {/* Connect to Sentinel CTA */}
        <AppCard className="mt-8">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#34D399]/10 border border-[#34D399]/20 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-[#34D399]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-[#34D399] mb-1">Blue Sentinel — Real-time monitoring</p>
              <p className="text-[10px] text-slate-500 leading-relaxed">
                For live onchain event monitoring, connect to Blue Sentinel. Detects rug patterns, whale moves,
                protocol exploits, and suspicious activity in real time.
              </p>
            </div>
          </div>
        </AppCard>
      </div>
      </div>
    </div>
  );
}
