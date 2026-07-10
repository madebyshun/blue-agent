"use client";

const PHRASES = [
  "HOOD UP",
  "STAY BASED",
  "$HOODUP",
  "BLUE FORGE",
  "HOOD UP",
  "STAY BASED",
  "$HOODUP",
  "BLUE FORGE",
];

export function MemeMarquee() {
  const strip = [...PHRASES, ...PHRASES];
  return (
    <div
      className="w-full overflow-hidden border-y border-[var(--line)] py-3"
      style={{
        maskImage:
          "linear-gradient(to right, transparent, black 6%, black 94%, transparent)",
      }}
    >
      <div
        className="flex items-center gap-10 whitespace-nowrap"
        style={{ animation: "marquee 40s linear infinite" }}
      >
        {strip.map((p, i) => (
          <span
            key={i}
            className="flex items-center gap-10 [font-family:'JetBrains_Mono',ui-monospace,monospace] text-sm tracking-[0.35em] text-[var(--mute-3)] shrink-0"
          >
            {p}
            <span className="text-[var(--line)]">◆</span>
          </span>
        ))}
      </div>
    </div>
  );
}
