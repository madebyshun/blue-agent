"use client";

import type { MicroPlatform, MicroProof } from "@/lib/micro-types";

interface FilterState {
  platform: string;
  proof: string;
  sort: string;
}

interface Props {
  filters: FilterState;
  onChange: (next: FilterState) => void;
}

const PLATFORMS: { value: string; label: string }[] = [
  { value: "", label: "All platforms" },
  { value: "x", label: "𝕏 Twitter" },
  { value: "farcaster", label: "Farcaster" },
  { value: "telegram", label: "Telegram" },
  { value: "web", label: "Web" },
];

const PROOFS: { value: string; label: string }[] = [
  { value: "", label: "All proof types" },
  { value: "reply", label: "Reply" },
  { value: "quote", label: "Quote" },
  { value: "screenshot", label: "Screenshot" },
  { value: "url", label: "URL" },
  { value: "video", label: "Video" },
  { value: "text", label: "Text" },
];

const SORTS: { value: string; label: string }[] = [
  { value: "created_at", label: "Newest" },
  { value: "reward", label: "Highest reward" },
  { value: "deadline", label: "Ending soon" },
  { value: "slots", label: "Most slots" },
];

const SELECT_CLS =
  "font-mono text-xs bg-[#0D0D14] border border-[#1A1A2E] text-slate-400 rounded-lg px-3 py-2 hover:border-[#4FC3F7]/30 focus:outline-none focus:border-[#4FC3F7]/50 transition-colors cursor-pointer";

export function MicroTaskFilters({ filters, onChange }: Props) {
  const set = (key: keyof FilterState) => (e: React.ChangeEvent<HTMLSelectElement>) =>
    onChange({ ...filters, [key]: e.target.value });

  return (
    <div className="flex flex-wrap gap-2">
      <select value={filters.platform} onChange={set("platform")} className={SELECT_CLS}>
        {PLATFORMS.map((p) => (
          <option key={p.value} value={p.value}>{p.label}</option>
        ))}
      </select>

      <select value={filters.proof} onChange={set("proof")} className={SELECT_CLS}>
        {PROOFS.map((p) => (
          <option key={p.value} value={p.value}>{p.label}</option>
        ))}
      </select>

      <select value={filters.sort} onChange={set("sort")} className={SELECT_CLS}>
        {SORTS.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
    </div>
  );
}
