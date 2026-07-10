"use client";

import { useCallback, useRef, useState } from "react";

type Props = {
  before?: string | null;
  after: string;
  alt: string;
};

export function BeforeAfterSlider({ before, after, alt }: Props) {
  const [pos, setPos] = useState(50);
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const move = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const p = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.max(0, Math.min(100, p)));
  }, []);

  if (!before) {
    return (
      <img
        src={after}
        alt={alt}
        className="w-full aspect-square object-cover border border-[#1A1A22]"
      />
    );
  }

  return (
    <div
      ref={containerRef}
      onMouseDown={(e) => {
        setDragging(true);
        move(e.clientX);
      }}
      onMouseMove={(e) => dragging && move(e.clientX)}
      onMouseUp={() => setDragging(false)}
      onMouseLeave={() => setDragging(false)}
      onTouchStart={(e) => move(e.touches[0].clientX)}
      onTouchMove={(e) => move(e.touches[0].clientX)}
      className="relative aspect-square w-full select-none border border-[#1A1A22] overflow-hidden cursor-ew-resize"
    >
      <img
        src={after}
        alt={`${alt} · forged`}
        draggable={false}
        className="absolute inset-0 w-full h-full object-cover"
      />
      <img
        src={before}
        alt={`${alt} · original`}
        draggable={false}
        className="absolute inset-0 w-full h-full object-cover"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
      />
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-[#0052FF] pointer-events-none"
        style={{ left: `${pos}%` }}
      >
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-[#0052FF] flex items-center justify-center text-white text-[10px] [font-family:'JetBrains_Mono',ui-monospace,monospace] shadow-lg shadow-[#0052FF]/50">
          ⇔
        </div>
      </div>
      <div className="absolute top-2 left-2 [font-family:'JetBrains_Mono',ui-monospace,monospace] text-[9px] text-white bg-black/70 px-1.5 py-0.5 tracking-widest pointer-events-none">
        BEFORE
      </div>
      <div className="absolute top-2 right-2 [font-family:'JetBrains_Mono',ui-monospace,monospace] text-[9px] text-white bg-[#0052FF]/90 px-1.5 py-0.5 tracking-widest pointer-events-none">
        FORGED
      </div>
    </div>
  );
}
