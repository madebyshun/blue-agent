"use client";

import { useEffect, useState } from "react";

const STAGES = [
  "> init model · nano-banana-2-edit",
  "> lock pixels · face · hair · background",
  "> synthesize · hoodie · forest green",
  "> render pass · 1024²",
  "> verify · identity preserved",
];

type Props = { active: boolean; done: boolean; serial?: string };

export function ForgeTerminal({ active, done, serial }: Props) {
  const [lines, setLines] = useState<string[]>([]);
  const [typing, setTyping] = useState<string>("");

  useEffect(() => {
    // Effect drives an async typewriter animation keyed off `active`; the
    // set-state-in-effect rule doesn't apply to this kind of imperative
    // animation loop.
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

  return (
    <div className="absolute inset-0 bg-[#050508]/85 backdrop-blur-sm flex flex-col justify-end p-4 gap-0.5 [font-family:'JetBrains_Mono',ui-monospace,monospace] text-[10px] leading-relaxed">
      {lines.map((l, i) => (
        <div key={i} className="text-[#2ECC71]/80">
          {l}
        </div>
      ))}
      {typing && !done && (
        <div className="text-[#0052FF]">
          {typing}
          <span className="animate-pulse">▊</span>
        </div>
      )}
      {done && serial && (
        <div className="text-[#00E070]">{`> forge complete · ${serial} ✓`}</div>
      )}
    </div>
  );
}
