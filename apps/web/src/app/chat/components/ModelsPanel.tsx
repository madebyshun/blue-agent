"use client";

import { useChat } from "../ChatContext";
import { MODEL_PRESETS, ALL_TIERS } from "./ChatInput";

/**
 * Models page — a readable catalog of every model Blue Chat can run, so users
 * understand what's available and what each one is for before picking. Each
 * card maps a use-case preset (Chat · Fast · Web Search · Deep Think · Fable ·
 * Private) to its underlying model + cost, and selecting one sets the active
 * chat model (same pipeline as the composer model picker).
 *
 * Data is sourced 1:1 from MODEL_PRESETS + ALL_TIERS in ChatInput — single
 * source of truth, no duplicated model facts.
 */

// Funding / provider group → human label + accent. Mirrors the comments in
// ChatInput: Bankr models are funded via the $BLUEAGENT loop, Venice models
// are paid in USDC, Privacy models are end-to-end encrypted.
const GROUP_META: Record<string, { label: string; color: string }> = {
  bankr:   { label: "Bankr · $BLUEAGENT", color: "#4FC3F7" },
  venice:  { label: "Venice · USDC",      color: "#34D399" },
  privacy: { label: "Private · E2EE",     color: "#6EE7B7" },
};

// Longer "best for" guidance per preset — grounded extension of the short
// composer descriptions, not new model claims.
const BEST_FOR: Record<string, string> = {
  "chat":       "Everyday building, brainstorming, and the 5 blue commands. The balanced default.",
  "fast":       "High-volume or long-context tasks where speed and cost matter more than depth.",
  "web-search": "Anything needing fresh, live data — prices, news, X/Twitter chatter, what's happening now.",
  "deep-think": "Hard reasoning: audits, architecture, tricky debugging, multi-step analysis.",
  "fable":      "Long-form writing, narrative, and creative copy with a 1M-token context.",
  "private":    "Sensitive prompts — runs end-to-end encrypted with no logs retained.",
  "gemini":     "Google Gemini 2.5 Flash — multimodal, fast, and strong at structured reasoning tasks.",
  "kimi":       "Moonshot Kimi K2 — long-context powerhouse, ideal for large docs and extended analysis.",
  "deepseek":   "DeepSeek V4 · 1M token context at minimal cost. Best for bulk or long-document tasks.",
};

export default function ModelsPanel({ onPick }: { onPick?: () => void }) {
  const { chatTier, setChatTier, setWebSearch } = useChat();

  function pick(tier: string, webSearch: boolean | undefined) {
    setChatTier(tier);
    if (typeof webSearch === "boolean") setWebSearch(webSearch);
    onPick?.();
  }

  return (
    <div className="flex flex-col h-full bg-[#050508] overflow-y-auto">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#1A1A2E] flex-shrink-0">
        <p className="font-mono text-[10px] text-slate-500 tracking-widest mb-1">MODELS</p>
        <p className="font-mono text-[10px] text-slate-700">
          The engines behind Blue Chat. Pick by use-case — selecting one sets your active model.
        </p>
      </div>

      {/* Cards */}
      <div className="flex-1 px-5 py-4">
        <div className="grid gap-2.5 sm:grid-cols-2">
          {MODEL_PRESETS.map(preset => {
            const tier = ALL_TIERS.find(t => t.id === preset.tier);
            if (!tier) return null;
            const isActive = chatTier === preset.tier;
            const group    = GROUP_META[tier.group] ?? GROUP_META.bankr;

            return (
              <button
                key={preset.id}
                onClick={() => pick(preset.tier, preset.webSearch)}
                className="group text-left rounded-2xl border p-4 transition-all"
                style={{
                  borderColor: isActive ? `${tier.color}55` : "#1A1A2E",
                  background:  isActive ? `${tier.color}0d` : "#0A0A12",
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.borderColor = `${tier.color}33`; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.borderColor = "#1A1A2E"; }}
              >
                {/* Title row */}
                <div className="flex items-center gap-2.5 mb-2">
                  <span
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0"
                    style={{ background: `${tier.color}14` }}
                  >
                    {preset.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-white truncate">{preset.label}</span>
                      {isActive && (
                        <span
                          className="font-mono text-[8px] px-1.5 py-0.5 rounded-full font-bold tracking-wider shrink-0"
                          style={{ background: tier.color, color: "#050508" }}
                        >
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-[11px] text-slate-500 truncate block">{tier.model}</span>
                  </div>
                </div>

                {/* Description */}
                <p className="font-mono text-[11px] text-slate-400 leading-relaxed mb-3">
                  {BEST_FOR[preset.id] ?? preset.desc}
                </p>

                {/* Meta row — spec chips */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className="font-mono text-[9px] px-2 py-0.5 rounded-md"
                    style={{ background: `${group.color}12`, color: group.color }}
                  >
                    {group.label}
                  </span>
                  <span className="font-mono text-[9px] px-2 py-0.5 rounded-md bg-[#1A1A2E] text-slate-400">
                    {tier.note}
                  </span>
                  {preset.webSearch && (
                    <span className="font-mono text-[9px] px-2 py-0.5 rounded-md bg-[#1A1A2E] text-slate-400">
                      🔍 web
                    </span>
                  )}
                  <span className="font-mono text-[9px] px-2 py-0.5 rounded-md bg-[#1A1A2E] text-slate-300 ml-auto">
                    ~{tier.credits} cr/msg
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <p className="font-mono text-[10px] text-slate-700 mt-4 leading-relaxed">
          Cost shown is the base credit price per message before any holder discount.
          1 credit ≈ $0.0005. Connect a wallet holding $BLUEAGENT for a discount or
          unlimited use at the top tier.
        </p>
      </div>
    </div>
  );
}
