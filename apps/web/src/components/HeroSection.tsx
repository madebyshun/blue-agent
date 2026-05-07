"use client";
import { useEffect, useState } from "react";

const TOKEN = "0xf895783b2931c919955e18b5e3343e7c7c456ba3";

const STATS = [
  { value: "5",    label: "Core Commands" },
  { value: "$0.05", label: "Min. per Call" },
  { value: "Base",  label: "Network" },
  { value: "x402",  label: "Protocol" },
];

const CHAT_SCENES = [
  [
    { from: "user",  text: "blue idea" },
    { from: "agent", text: "Fundable brief ready. Why now, GTM, risks, 24h plan." },
    { from: "user",  text: "blue build" },
    { from: "agent", text: "Architecture + stack + first build steps generated." },
  ],
  [
    { from: "user",  text: "blue audit" },
    { from: "agent", text: "Risk review complete. Blockers and fixes identified." },
    { from: "user",  text: "blue ship" },
    { from: "agent", text: "Deploy checklist ready. Verify, launch, monitor." },
  ],
  [
    { from: "user",  text: "blue launch" },
    { from: "agent", text: "Token launch plan + Bankr prompt ready. 40% fees → you." },
    { from: "user",  text: "blue raise" },
    { from: "agent", text: "Pitch narrative generated for investors and partners." },
  ],
];

function fmtPrice(p: number) {
  if (!p) return "—";
  if (p < 0.000001) return "$" + p.toExponential(2);
  if (p < 0.0001)   return "$" + p.toFixed(8);
  if (p < 0.01)     return "$" + p.toFixed(6);
  return "$" + p.toFixed(4);
}

export default function HeroSection() {
  const [priceStr, setPriceStr] = useState("—");
  const [change24h, setChange24h] = useState(0);
  const [sceneIdx, setSceneIdx] = useState(0);
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    const fetch_ = async () => {
      try {
        const res = await fetch(`https://api.geckoterminal.com/api/v2/networks/base/tokens/${TOKEN}`);
        const data = await res.json();
        const attr = data?.data?.attributes;
        if (!attr) return;
        setPriceStr(fmtPrice(parseFloat(attr.price_usd || "0")));
        setChange24h(parseFloat(attr.price_change_percentage?.h24 || "0"));
      } catch {}
    };
    fetch_();
    const iv = setInterval(fetch_, 30000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const scene = CHAT_SCENES[sceneIdx];
    if (visibleCount < scene.length) {
      const t = setTimeout(() => setVisibleCount((v) => v + 1), visibleCount === 0 ? 600 : 900);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => { setSceneIdx((s) => (s + 1) % CHAT_SCENES.length); setVisibleCount(0); }, 2000);
    return () => clearTimeout(t);
  }, [sceneIdx, visibleCount]);

  const isUp = change24h >= 0;

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden pt-16">
      {/* Grid + glow */}
      <div className="absolute inset-0 bg-grid-pattern" style={{ backgroundSize: "40px 40px" }} />
      <div className="absolute inset-0 bg-hero-glow" />

      {/* Animated orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-[rgba(26,82,255,0.06)] blur-3xl animate-pulse-slow" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-[rgba(51,195,255,0.05)] blur-3xl animate-pulse-slow" style={{ animationDelay: "2s" }} />

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 w-full">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          {/* Left */}
          <div>
            <div className="inline-flex items-center gap-2 border border-[#1A52FF]/25 bg-[#1A52FF]/8 rounded-full px-4 py-1.5 mb-8">
              <span className="w-2 h-2 rounded-full bg-[#1A52FF] animate-pulse" />
              <span className="font-mono text-xs text-[#33C3FF] tracking-widest">BUILT ON BASE · POWERED BY BANKR</span>
            </div>

            <h1 className="font-sans font-bold tracking-tight mb-4">
              <span className="block text-4xl sm:text-5xl lg:text-6xl text-gradient-white">BLUE</span>
              <span className="block text-4xl sm:text-5xl lg:text-6xl text-gradient-blue">AGENT</span>
            </h1>

            <p className="text-[#B8CBE8] text-lg mb-6 leading-relaxed max-w-md">
              The <span className="text-white font-medium">founder console</span> for Base builders.
              Idea, build, audit, ship, and raise — all from one workflow.
            </p>

            {/* Token price */}
            <div className="flex items-center gap-3 mb-8 flex-wrap">
              <div className="flex items-center gap-2 border border-white/10 bg-[#0F1C35] rounded-lg px-3 py-1.5">
                <div className="glow-dot" style={{ width: 6, height: 6 }} />
                <span className="font-mono text-sm text-[#33C3FF]">{priceStr}</span>
                {change24h !== 0 && (
                  <span className={`font-mono text-xs ${isUp ? "text-emerald-400" : "text-red-400"}`}>
                    {isUp ? "↑" : "↓"} {Math.abs(change24h).toFixed(2)}%
                  </span>
                )}
              </div>
              <span className="font-mono text-xs text-[#3D5275]">$BLUEAGENT</span>
            </div>

            <div className="flex gap-3 flex-wrap">
              <a href="/code" className="btn-primary text-sm font-semibold px-5 py-2.5 rounded-lg">
                Open Console →
              </a>
              <a
                href="https://github.com/madebyshun/blue-agent"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[#B8CBE8] hover:text-white border border-white/15 hover:border-[#1A52FF]/40 px-5 py-2.5 rounded-lg transition-all"
              >
                GitHub
              </a>
            </div>
          </div>

          {/* Right — chat mockup */}
          <div className="flex justify-center">
            <div className="w-72 bg-[#0F1C35] border border-white/10 rounded-2xl overflow-hidden shadow-[0_30px_80px_rgba(26,82,255,0.18)]">
              {/* Header */}
              <div className="bg-[#060C18] border-b border-white/10 px-4 py-3 flex items-center gap-2.5">
                <div className="glow-dot" />
                <span className="font-mono text-xs font-semibold text-white tracking-widest">BLUEAGENT</span>
                <span className="ml-auto font-mono text-[10px] text-emerald-400">● online</span>
              </div>

              {/* Messages */}
              <div className="p-4 flex flex-col gap-3 min-h-64">
                {CHAT_SCENES[sceneIdx].slice(0, visibleCount).map((msg, i) => {
                  const isUser = msg.from === "user";
                  return (
                    <div key={`${sceneIdx}-${i}`} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] px-3 py-2 rounded-xl font-mono text-xs leading-relaxed ${
                        isUser
                          ? "text-white rounded-br-sm"
                          : "bg-[#162040] text-[#B8CBE8] rounded-bl-sm border border-white/10"
                      }`}
                        style={isUser ? { background: "linear-gradient(135deg, #1A52FF, #2E6AFF)" } : {}}
                      >
                        {msg.text}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Input */}
              <div className="border-t border-white/10 px-3 py-2.5 flex items-center gap-2">
                <div className="flex-1 bg-[#060C18] border border-white/10 rounded-lg px-3 py-1.5 font-mono text-[11px] text-[#3D5275]">
                  Message Blue Agent...
                </div>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                  style={{ background: "linear-gradient(135deg, #1A52FF, #2E6AFF)" }}>
                  ↑
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-20 grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-2xl mx-auto">
          {STATS.map(({ value, label }) => (
            <div key={label} className="card-surface rounded-xl p-4 text-center">
              <div className="font-mono text-2xl font-bold text-gradient-blue">{value}</div>
              <div className="text-xs text-[#7A8FAE] mt-1 tracking-wider uppercase">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-[#3D5275]">
        <span className="font-mono text-xs tracking-widest">SCROLL</span>
        <div className="w-px h-8 bg-gradient-to-b from-[#1A52FF]/50 to-transparent" />
      </div>
    </section>
  );
}
