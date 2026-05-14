"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";

const GRID_BG = {
  backgroundImage:
    "linear-gradient(rgba(79,195,247,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(79,195,247,0.03) 1px,transparent 1px)",
  backgroundSize: "40px 40px",
};

export default function ProfilePage() {
  const [handle, setHandle] = useState("");
  const router = useRouter();

  const goBuilder = () => {
    const h = handle.replace(/^@/, "").trim();
    if (h) router.push(`/builder/${h}`);
  };

  const goAgent = () => {
    const h = handle.replace(/^@/, "").trim();
    if (h) router.push(`/agent/${h}`);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") goBuilder();
  };

  return (
    <>
      <Navbar />
      <main
        className="bg-[#050508] font-mono min-h-screen flex flex-col items-center justify-center px-6 pt-16"
        style={GRID_BG}
      >
        <div className="max-w-md w-full text-center">
          <p className="font-mono text-xs tracking-[0.3em] text-slate-600 mb-3 uppercase">
            BLUEAGENT · PROFILES
          </p>
          <h1 className="font-mono text-3xl sm:text-4xl font-bold text-white mb-4 leading-tight">
            Find a Builder<br />
            <span className="text-[#4FC3F7]">or Agent</span>
          </h1>
          <p className="font-mono text-xs text-slate-600 mb-10">
            Enter an X/Twitter handle, npm package, or agent name
          </p>

          {/* Search input */}
          <div className="card-surface rounded-lg p-1 flex items-center gap-2 mb-6">
            <span className="font-mono text-slate-600 text-sm pl-3">@</span>
            <input
              type="text"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              onKeyDown={handleKey}
              placeholder="handle or agent name"
              className="flex-1 bg-transparent font-mono text-sm text-white placeholder-slate-700 outline-none py-3"
              autoFocus
            />
            {handle && (
              <button
                onClick={() => setHandle("")}
                className="font-mono text-xs text-slate-700 hover:text-white pr-3 transition-colors"
              >
                ✕
              </button>
            )}
          </div>

          {/* CTAs */}
          <div className="flex gap-3 justify-center">
            <button
              onClick={goBuilder}
              disabled={!handle.trim()}
              className="font-mono text-sm font-semibold bg-[#4FC3F7] text-[#050508] px-6 py-3 rounded hover:bg-[#29ABE2] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Builder Profile →
            </button>
            <button
              onClick={goAgent}
              disabled={!handle.trim()}
              className="font-mono text-sm text-slate-400 border border-[#1A1A2E] px-6 py-3 rounded hover:border-[#4FC3F7]/30 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Agent Profile →
            </button>
          </div>

          {/* Examples */}
          <div className="mt-12 space-y-1">
            <p className="font-mono text-[10px] text-slate-700 mb-3">examples</p>
            {[
              { label: "@vitalik", type: "builder" },
              { label: "npm:@blueagent/builder", type: "agent" },
              { label: "@blockyagent", type: "builder" },
            ].map((ex) => (
              <button
                key={ex.label}
                onClick={() => {
                  const h = ex.label.replace(/^@/, "").split(":").pop() ?? "";
                  setHandle(h);
                }}
                className="block mx-auto font-mono text-[10px] text-slate-600 hover:text-[#4FC3F7] transition-colors"
              >
                {ex.label} <span className="text-slate-800">({ex.type})</span>
              </button>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
