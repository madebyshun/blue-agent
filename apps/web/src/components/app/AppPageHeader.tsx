// Shared page header for all /app/* content pages (Type A layout)

interface AppPageHeaderProps {
  label: string;          // e.g. "PORTFOLIO"
  subtitle?: string;      // e.g. "Token balances · Base Mainnet"
  accent?: string;        // hex color, default #4FC3F7
  right?: React.ReactNode;
}

export default function AppPageHeader({
  label,
  subtitle,
  accent = "#4FC3F7",
  right,
}: AppPageHeaderProps) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-[#1A1A2E] shrink-0">
      <div className="flex items-center gap-3">
        <span
          className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0"
          style={{ background: accent }}
        />
        <p className="font-mono text-xs tracking-widest" style={{ color: accent }}>
          // {label}
        </p>
        {subtitle && (
          <p className="font-mono text-[10px] text-slate-700 hidden sm:block">{subtitle}</p>
        )}
      </div>
      {right && (
        <div className="font-mono text-[10px] text-slate-600 shrink-0">{right}</div>
      )}
    </div>
  );
}
