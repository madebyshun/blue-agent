"use client";

import { useEffect, useState } from "react";

const STAGES = [
  "> init model · nano-banana-2-edit",
  "> lock pixels · face · hair · background",
  "> synthesize · hoodie · forest green",
  "> render pass · 1024²",
  "> verify · identity preserved",
];

type Props = { active: boolean };

export function ForgeTerminal({ active }: Props) {
  const [lines, setLines] = useState<string[]>([]);
  const [typing, setTyping] = useState<string>("");

  useEffect(() => {
    // Effect drives an async typewriter animation keyed off `active`.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!active) {
      setLines([]);
      setTyping("");
      return;
    }
    let cancel = false;
    (async () => {
      for (let i = 0; i < STAGES.length; i++) {
        if (cancel) return;
        for (let c = 1; c <= STAGES[i].length; c++) {
          if (cancel) return;
          setTyping(STAGES[i].slice(0, c));
          await new Promise((r) => setTimeout(r, 14));
        }
        await new Promise((r) => setTimeout(r, 220));
        if (cancel) return;
        setLines((prev) => [...prev, STAGES[i]]);
        setTyping("");
      }
    })();
    return () => {
      cancel = true;
    };
  }, [active]);

  if (!active) return null;

  return (
    <div
      className="absolute left-0 right-0 bottom-0 pointer-events-none [font-family:'JetBrains_Mono',ui-monospace,monospace] text-[10px] leading-relaxed"
      style={{
        background:
          "linear-gradient(to top, rgba(5,5,8,0.92) 0%, rgba(5,5,8,0.75) 55%, rgba(5,5,8,0) 100%)",
      }}
    >
      <div className="flex flex-col justify-end gap-0.5 p-3 pt-8 min-h-[7.5rem]">
        {lines.map((l, i) => (
          <div key={i} className="text-[#2ECC71]/85 drop-shadow-[0_0_6px_rgba(46,204,113,0.35)]">
            {l}
          </div>
        ))}
        {typing && (
          <div className="text-[#0052FF] drop-shadow-[0_0_6px_rgba(0,82,255,0.5)]">
            {typing}
            <span className="animate-pulse">▊</span>
          </div>
        )}
      </div>
    </div>
  );
}
