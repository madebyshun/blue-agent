"use client";

// Integration badge row — sits under the chat input and shows which
// integrations are active. Doubles as the control surface: Base MCP toggles,
// Coinbase connects (OAuth), Tools/Skills jump to their tabs. State is the
// localStorage-backed integrations store, read live via useIntegrations().
import { useState } from "react";
import { useIntegrations, setIntegration } from "../integrations";

const PILL = "font-mono text-[11px] rounded-full px-2 py-0.5 border transition-colors whitespace-nowrap shrink-0";

export default function IntegrationBadges({
  onOpenSkills, onOpenTools,
}: { onOpenSkills?: () => void; onOpenTools?: () => void }) {
  const { integrations, skills } = useIntegrations();
  const enabledSkills = skills.filter(s => s.enabled).length;
  const [coinbaseModal, setCoinbaseModal] = useState(false);

  // Click toggles state — OFF → open a confirm modal (NO redirect); ON → disconnect.
  function onCoinbaseClick() {
    if (integrations.coinbase) { setIntegration("coinbase", false); return; }
    setCoinbaseModal(true);
  }
  // Confirm in the modal → open Coinbase consent in a NEW TAB + mark connected.
  function confirmCoinbase() {
    if (typeof window !== "undefined")
      window.open("https://agents.coinbase.com/mcp", "_blank", "noopener,noreferrer");
    setIntegration("coinbase", true);
    setCoinbaseModal(false);
  }

  return (
    <>
    <div className="flex items-center gap-1.5 px-3 sm:px-4 pb-2 pt-0.5 flex-wrap">
      <button
        onClick={onOpenTools}
        title="74 x402 Hub tools — click to browse"
        className={`${PILL} text-[#4FC3F7] border-[#4FC3F7]/30 bg-[#4FC3F7]/10 hover:bg-[#4FC3F7]/15`}
      >
        🟦 74 Tools
      </button>

      <button
        onClick={() => setIntegration("baseMcp", !integrations.baseMcp)}
        title={integrations.baseMcp ? "Base MCP on — click to disable" : "Enable Base MCP onchain actions"}
        className={`${PILL} ${integrations.baseMcp
          ? "text-[#FB923C] border-[#FB923C]/40 bg-[#FB923C]/10"
          : "text-slate-600 border-[#1A1A2E] hover:text-slate-400"}`}
      >
        ⭐ Base MCP{integrations.baseMcp ? " ✓" : ""}
      </button>

      <span
        title="Bankr — agent + LLM provider (always on)"
        className={`${PILL} text-[#A78BFA] border-[#A78BFA]/30 bg-[#A78BFA]/10`}
      >
        Bankr
      </span>

      <button
        onClick={onCoinbaseClick}
        title={integrations.coinbase ? "Coinbase connected — click to disconnect" : "Connect Coinbase (spot trading)"}
        className={`${PILL} ${integrations.coinbase
          ? "text-[#34D399] border-[#34D399]/40 bg-[#34D399]/10"
          : "text-slate-600 border-[#1A1A2E] hover:text-slate-400"}`}
      >
        Coinbase{integrations.coinbase ? " ✓" : ""}
      </button>

      <button
        onClick={onOpenSkills}
        title="Installed skills — manage in the Skills tab"
        className={`${PILL} ${enabledSkills > 0
          ? "text-[#34D399] border-[#34D399]/30 bg-[#34D399]/10"
          : "text-slate-600 border-[#1A1A2E] hover:text-slate-400"}`}
      >
        Skills: {enabledSkills}
      </button>
    </div>

    {/* Connect Coinbase — confirm modal (stays on /app/chat; opens in a new tab) */}
    {coinbaseModal && (
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => setCoinbaseModal(false)} />
        <div className="relative z-10 w-full max-w-sm rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[15px]">🟦</span>
            <p className="font-mono text-[13px] font-bold text-white">Connect Coinbase</p>
          </div>
          <p className="font-mono text-[11px] text-slate-400 leading-relaxed mb-4">
            Enable spot trading on 900+ pairs via Coinbase Advanced Trade.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={confirmCoinbase}
              className="flex-1 font-mono text-[12px] font-bold py-2 rounded-lg border border-[#34D399]/40 text-[#34D399] hover:bg-[#34D399]/10 transition-colors"
            >
              Connect →
            </button>
            <button
              onClick={() => setCoinbaseModal(false)}
              className="font-mono text-[12px] px-4 py-2 rounded-lg border border-[#1A1A2E] text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
