// Shared card component for /app/* pages

interface AppCardProps {
  children: React.ReactNode;
  className?: string;
  accent?: string;   // optional glow color
  noPad?: boolean;
}

export default function AppCard({ children, className = "", accent, noPad }: AppCardProps) {
  return (
    <div
      className={`rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] ${noPad ? "" : "p-5"} ${className}`}
      style={accent ? { boxShadow: `0 0 40px ${accent}0a` } : undefined}
    >
      {children}
    </div>
  );
}

// ── Stat cell used inside cards ──────────────────────────────────────────────

interface AppStatProps {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}

export function AppStat({ label, value, sub, color = "#fff" }: AppStatProps) {
  return (
    <div className="rounded-xl bg-[#0a0a0f] border border-[#1A1A2E] p-4">
      <div className="font-mono text-[10px] text-slate-600 tracking-widest mb-2">{label}</div>
      <div className="font-mono text-2xl font-bold" style={{ color }}>{value}</div>
      {sub && <div className="font-mono text-[10px] text-slate-600 mt-1">{sub}</div>}
    </div>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────

export function AppSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-3">{children}</p>
  );
}
