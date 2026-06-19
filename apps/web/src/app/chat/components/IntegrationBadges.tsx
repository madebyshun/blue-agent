"use client";

// Integration badge row — sits under the chat input and shows which
// integrations are active. Doubles as the control surface: Base MCP toggles,
// Coinbase connects (OAuth), Tools/Skills jump to their tabs. State is the
// localStorage-backed integrations store, read live via useIntegrations().
import { useIntegrations, setIntegration } from "../integrations";

const PILL = "font-mono text-[11px] rounded-full px-2 py-0.5 border transition-colors whitespace-nowrap shrink-0";

export default function IntegrationBadges({
  onOpenSkills, onOpenTools,
}: { onOpenSkills?: () => void; onOpenTools?: () => void }) {
  const { integrations, skills } = useIntegrations();
  const enabledSkills = skills.filter(s => s.enabled).length;

  function connectCoinbase() {
    if (integrations.coinbase) { setIntegration("coinbase", false); return; }
    // Coinbase for Agents — OAuth 2.1. Open the consent page; mark connected
    // optimistically so the system prompt + badge reflect it this session.
    if (typeof window !== "undefined")
      window.open("https://agents.coinbase.com/mcp", "_blank", "noopener,noreferrer");
    setIntegration("coinbase", true);
  }

  return (
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
        onClick={connectCoinbase}
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
  );
}
