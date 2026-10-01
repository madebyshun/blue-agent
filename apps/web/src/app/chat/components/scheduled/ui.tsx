"use client";
/**
 * Small pieces the Scheduled page is built from (redesign 2026-10-01). Same
 * palette as the rest of the app: #050508 page, #0D0D14 panels, #1A1A2E lines,
 * #4FC3F7 accent, mono type.
 */
import { useEffect, type ReactNode } from "react";

export const C = {
  page: "#050508", panel: "#0D0D14", line: "#1A1A2E", accent: "#4FC3F7",
  text: "#E2E8F0", sub: "#94A3B8", dim: "#64748B", faint: "#475569",
  green: "#34D399", red: "#F87171", amber: "#F59E0B",
} as const;

export function Drawer({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[110] flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="relative h-full w-full sm:w-[440px] bg-[#08080E] border-l border-[#1A1A2E] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between h-14 px-5 border-b border-[#1A1A2E] shrink-0">
          <span className="font-mono text-[11px] font-semibold tracking-[0.16em] text-[#E2E8F0]">{title}</span>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-[#1A1A2E]" title="Close (Esc)">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
      </aside>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex w-full rounded-xl border border-[#1A1A2E] bg-[#050508] p-1 gap-1">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className="flex-1 font-mono text-[11px] rounded-lg px-2.5 py-1.5 transition-colors"
          style={value === o.value ? { background: "#4FC3F71A", color: C.accent, boxShadow: "inset 0 0 0 1px #4FC3F740" } : { color: C.dim }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label className="font-mono text-[10px] tracking-[0.08em] text-slate-500 block mb-1.5">{label}{hint && <span className="text-slate-700"> · {hint}</span>}</label>
      {children}
    </div>
  );
}

export const inputCls = "w-full bg-[#050508] border border-[#1A1A2E] focus:border-[#4FC3F7]/40 rounded-xl px-3 py-2.5 font-mono text-[13px] text-white placeholder:text-slate-700 outline-none transition-colors";

export function StatTile({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string }) {
  return (
    <div className="rounded-2xl border border-[#1A1A2E] bg-[#0D0D14] px-4 py-3 min-w-0">
      <p className="font-mono text-[9.5px] tracking-[0.14em] text-[#64748B]">{label}</p>
      <p className="font-mono text-[20px] font-semibold mt-1 truncate" style={{ color: tone ?? C.text }}>{value}</p>
      {sub && <p className="font-mono text-[10px] text-[#475569] mt-0.5 truncate">{sub}</p>}
    </div>
  );
}

export function ChainBadge({ chain }: { chain: "base" | "robinhood" }) {
  const base = chain === "base";
  return (
    <span className="font-mono text-[9px] font-medium rounded-[5px] px-1.5 py-[2px] shrink-0"
      style={base ? { color: "#60A5FA", background: "#60A5FA14" } : { color: "#A3E635", background: "#A3E63514" }}>
      {base ? "Base" : "Robinhood"}
    </span>
  );
}

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 mb-2.5">
      <span className="font-mono text-[9.5px] font-medium tracking-[0.14em] text-[#64748B]">{children}</span>
      {right && <span className="font-mono text-[10px] text-[#475569] text-right">{right}</span>}
    </div>
  );
}
