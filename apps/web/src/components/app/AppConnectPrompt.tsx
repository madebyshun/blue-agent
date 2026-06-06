// Shared "connect wallet" empty state for /app/* pages

import { ConnectButton } from "@/components/ConnectModal";

interface AppConnectPromptProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  accent?: string;
}

export default function AppConnectPrompt({
  icon,
  title,
  subtitle,
  accent = "#4FC3F7",
}: AppConnectPromptProps) {
  return (
    <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-12 text-center">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
        style={{
          background: `${accent}10`,
          border: `1px solid ${accent}20`,
        }}
      >
        <div style={{ color: accent }}>{icon}</div>
      </div>
      <h2 className="font-mono text-lg font-bold text-white mb-2">{title}</h2>
      <p className="font-mono text-slate-500 text-sm mb-8 max-w-xs mx-auto">{subtitle}</p>
      <ConnectButton label="Connect Wallet" />
    </div>
  );
}
