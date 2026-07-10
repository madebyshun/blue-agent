"use client";

type Item = {
  serial: string;
  url: string;
  original_url?: string | null;
  created_at?: string;
};

function rarityFor(serial: string) {
  const n = parseInt(serial.replace(/\D/g, ""), 10) || 0;
  const h = ((n * 2654435761) >>> 0) % 1000;
  if (h < 5) return { tier: "MYTHIC", color: "#FF3B7D", score: h / 10 };
  if (h < 50) return { tier: "EPIC", color: "#8B5CF6", score: h / 10 };
  if (h < 200) return { tier: "RARE", color: "#0052FF", score: h / 10 };
  return { tier: "COMMON", color: "var(--mute-3)", score: h / 10 };
}

export function RarityCard({ item }: { item: Item }) {
  const r = rarityFor(item.serial);
  const mono = "[font-family:'JetBrains_Mono',ui-monospace,monospace]";
  return (
    <div
      className="w-full border-2 bg-[var(--panel)]"
      style={{
        borderColor: r.color,
        boxShadow: `0 0 60px ${r.color}30, inset 0 0 30px ${r.color}10`,
      }}
    >
      <div
        className={`${mono} flex items-center justify-between px-3 py-2 text-[10px] tracking-widest border-b`}
        style={{ borderColor: r.color }}
      >
        <span style={{ color: r.color }}>◆ {r.tier}</span>
        <span className="text-[var(--mute-3)]">BLUE FORGE</span>
      </div>
      <img
        src={item.url}
        alt={item.serial}
        className="w-full aspect-square object-cover"
      />
      <div className={`${mono} p-3 text-[10px] tracking-widest space-y-1`}>
        <div className="flex justify-between">
          <span className="text-[var(--mute-3)]">SERIAL</span>
          <span style={{ color: r.color }}>{item.serial}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--mute-3)]">RARITY SCORE</span>
          <span className="text-[var(--fg)]">{r.score.toFixed(1)} / 100</span>
        </div>
        {item.created_at && (
          <div className="flex justify-between">
            <span className="text-[var(--mute-3)]">FORGED</span>
            <span className="text-[var(--fg)]">
              {new Date(item.created_at).toISOString().slice(0, 10)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
