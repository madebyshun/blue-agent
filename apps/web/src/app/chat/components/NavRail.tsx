"use client";
import type { ActiveTab } from "../page";
import { useChat } from "../ChatContext";

interface RailItem {
  id:    ActiveTab;
  icon:  React.ReactNode;
  label: string;
}

const TOP_ITEMS: RailItem[] = [
  {
    id: "chat",
    label: "Chat",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
  {
    id: "tasks",
    label: "Tasks",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
  },
  {
    id: "skills",
    label: "Skills",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    id: "cron",
    label: "Cron",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

const BOTTOM_ITEMS: RailItem[] = [
  {
    id: "settings",
    label: "Settings",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

export default function NavRail({
  activePanel,
  onSelect,
}: {
  activePanel: ActiveTab;
  onSelect: (id: ActiveTab) => void;
}) {
  const { tasks, crons, credits, isUnlimited, holderTier, artifacts, artifactsPanelOpen, setArtifactsPanelOpen } = useChat();

  const activeCrons = crons.filter(c => c.active).length;

  function badge(id: string): number | null {
    if (id === "tasks"  && tasks.length  > 1) return tasks.length;
    if (id === "cron"   && activeCrons   > 0) return activeCrons;
    return null;
  }

  return (
    <nav className="hidden lg:flex flex-col w-14 shrink-0 border-r border-[#1A1A2E] h-full bg-[#050508]">

      {/* Logo */}
      <div className="flex items-center justify-center h-14 border-b border-[#1A1A2E] flex-shrink-0">
        <div className="w-7 h-7 rounded-xl bg-[#4FC3F7] flex items-center justify-center">
          <span className="font-mono text-[10px] font-black text-[#050508]">B</span>
        </div>
      </div>

      {/* Top nav */}
      <div className="flex flex-col items-center gap-1 pt-2 flex-1">
        {TOP_ITEMS.map(item => {
          const isActive = activePanel === item.id;
          const b = badge(item.id);
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              title={item.label}
              className="relative flex flex-col items-center justify-center w-10 h-10 rounded-xl transition-all"
              style={isActive
                ? { color: "#4FC3F7", background: "#4FC3F715" }
                : { color: "#475569" }}
            >
              {item.icon}
              {b !== null && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 rounded-full bg-[#4FC3F7] text-[#050508] font-mono font-bold text-[7px] flex items-center justify-center px-0.5">
                  {b > 9 ? "9+" : b}
                </span>
              )}
            </button>
          );
        })}

        {/* Artifacts — shown only when code blocks exist */}
        {artifacts.length > 0 && (
          <button
            onClick={() => setArtifactsPanelOpen(!artifactsPanelOpen)}
            title={`Artifacts (${artifacts.length})`}
            className="relative flex items-center justify-center w-10 h-10 rounded-xl transition-all mt-1"
            style={artifactsPanelOpen
              ? { color: "#A78BFA", background: "#A78BFA15" }
              : { color: "#475569" }}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 rounded-full bg-[#A78BFA] text-[#050508] font-mono font-bold text-[7px] flex items-center justify-center px-0.5">
              {artifacts.length}
            </span>
          </button>
        )}
      </div>

      {/* Bottom nav */}
      <div className="flex flex-col items-center gap-1 pb-3 border-t border-[#1A1A2E] pt-2">
        {/* Credits mini */}
        <div
          className="flex flex-col items-center gap-0.5 py-1 cursor-pointer"
          onClick={() => onSelect("settings")}
          title="Credits"
        >
          <span className="font-mono text-[8px] font-bold"
            style={{ color: isUnlimited ? holderTier.color : credits <= 20 ? "#EF4444" : "#64748b" }}>
            {isUnlimited ? "∞" : credits > 999 ? `${Math.floor(credits/1000)}k` : credits}
          </span>
          <span className="font-mono text-[7px] text-slate-700">cr</span>
        </div>

        {BOTTOM_ITEMS.map(item => {
          const isActive = activePanel === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              title={item.label}
              className="flex items-center justify-center w-10 h-10 rounded-xl transition-all"
              style={isActive
                ? { color: "#4FC3F7", background: "#4FC3F715" }
                : { color: "#475569" }}
            >
              {item.icon}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
