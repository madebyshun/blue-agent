"use client";

import { useEffect, useState } from "react";

const SECTIONS = [
  { id: "commands",  label: "Commands" },
  { id: "skills",    label: "Skills" },
  { id: "tools",     label: "Tools" },
  { id: "ecosystem", label: "Packages" },
  { id: "quickstart",label: "Quick Start" },
];

export default function HomeNav() {
  const [active, setActive] = useState("");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Show after scrolling past hero (~100vh)
    const onScroll = () => {
      setVisible(window.scrollY > window.innerHeight * 0.6);

      // Highlight active section
      for (let i = SECTIONS.length - 1; i >= 0; i--) {
        const el = document.getElementById(SECTIONS[i].id);
        if (el && window.scrollY >= el.offsetTop - 120) {
          setActive(SECTIONS[i].id);
          break;
        }
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActive(id);
  }

  if (!visible) return null;

  return (
    <div className="fixed top-16 left-0 right-0 z-40 border-b border-[#1A1A2E] bg-[#050508]/95 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-4 flex items-center gap-1 overflow-x-auto scrollbar-none py-1">
        <a
          href="#"
          onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); setActive(""); }}
          className="font-mono text-[10px] text-slate-700 hover:text-slate-400 px-2 py-1.5 shrink-0 transition-colors"
        >
          ↑ top
        </a>
        <span className="text-slate-800 text-xs shrink-0">·</span>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => scrollTo(s.id)}
            className={`font-mono text-xs px-3 py-1.5 rounded-lg transition-all shrink-0 ${
              active === s.id
                ? "text-[#4FC3F7] bg-[#4FC3F7]/10"
                : "text-slate-500 hover:text-white hover:bg-[#1A1A2E]/50"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
