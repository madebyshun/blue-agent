"use client";

import { useEffect, useState } from "react";

type Item = { serial: string; created_at?: string };

function agoString(iso?: string): string {
  if (!iso) return "just now";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function ActivityTicker({
  onSelect,
}: {
  onSelect?: (serial: string) => void;
}) {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    let cancel = false;
    async function load() {
      try {
        const r = await fetch("/api/gallery", { cache: "no-store" });
        const d = await r.json();
        if (!cancel) setItems((d.items ?? []).slice(0, 16));
      } catch {}
    }
    load();
    const id = setInterval(load, 15000);
    return () => {
      cancel = true;
      clearInterval(id);
    };
  }, []);

  if (items.length === 0) return null;

  const strip = [...items, ...items];

  return (
    <div
      className="w-full max-w-md overflow-hidden border border-[#1A1A22] bg-[#0A0A10] mt-2"
      style={{
        maskImage:
          "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
      }}
    >
      <div
        className="flex items-center gap-4 py-1.5 whitespace-nowrap"
        style={{ animation: "ticker 40s linear infinite" }}
      >
        {strip.map((it, i) => (
          <button
            key={`${it.serial}-${i}`}
            onClick={() => onSelect?.(it.serial)}
            className="flex items-center gap-1.5 [font-family:'JetBrains_Mono',ui-monospace,monospace] text-[10px] tracking-widest hover:text-[#0052FF] transition-colors shrink-0 pl-3"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#2ECC71]" />
            <span className="text-[#0052FF]">{it.serial}</span>
            <span className="text-[#4A4A55]">· {agoString(it.created_at)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
