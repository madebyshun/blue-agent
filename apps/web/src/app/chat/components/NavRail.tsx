"use client";
import { useChat } from "../ChatContext";
import type { SidebarTab } from "../types";

interface NavItem {
  id:    SidebarTab;
  icon:  React.ReactNode;
  label: string;
}

const TOP_ITEMS: NavItem[] = [
  {
    id: "tasks",
    label: "Tasks",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
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

export default function NavRail() {
  const {
    sidebarTab, setSidebarTab,
    artifacts, artifactsPanelOpen, setArtifactsPanelOpen,
    credits, isUnlimited, holderTier,
    crons, tasks,
  } = useChat();

  function toggle(id: SidebarTab) {
    setSidebarTab(sidebarTab === id ? "none" : id);
  }

  const activeCrons = crons.filter(c => c.active).length;

  return (
    <nav className="hidden lg:flex flex-col w-12 shrink-0 border-r border-[#1A1A2E] h-full bg-[#050508] z-10">

      {/* Logo */}
      <div className="flex items-center justify-center h-12 border-b border-[#1A1A2E]">
        <div className="w-6 h-6 rounded-full bg-[#4FC3F7] flex items-center justify-center">
          <span className="font-mono text-[9px] font-black text-[#050508]">B</span>
        </div>
      </div>

      {/* Top nav items */}
      <div className="flex flex-col items-center gap-1 pt-2 flex-1">
        {TOP_ITEMS.map(item => {
          const isActive = sidebarTab === item.id;
          const badge =
            item.id === "cron"   ? (activeCrons > 0 ? activeCrons : null) :
            item.id === "tasks"  ? (tasks.length > 1 ? tasks.length : null) :
            null;

          return (
            <button
              key={item.id}
              onClick={() => toggle(item.id)}
              title={item.label}
              className="relative w-9 h-9 rounded-lg flex items-center justify-center transition-all"
              style={isActive
                ? { color: "#4FC3F7", background: "#4FC3F715" }
                : { color: "#475569" }}
            >
              {item.icon}
              {badge !== null && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#4FC3F7] text-[#050508] font-mono font-bold text-[8px] flex items-center justify-center">
                  {badge > 9 ? "9+" : badge}
                </span>
              )}
            </button>
          );
        })}

        {/* Artifacts toggle — only shown when artifacts exist */}
        {artifacts.length > 0 && (
          <button
            onClick={() => setArtifactsPanelOpen(!artifactsPanelOpen)}
            title={`Artifacts (${artifacts.length})`}
            className="relative w-9 h-9 rounded-lg flex items-center justify-center transition-all"
            style={artifactsPanelOpen
              ? { color: "#A78BFA", background: "#A78BFA15" }
              : { color: "#475569" }}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#A78BFA] text-[#050508] font-mono font-bold text-[8px] flex items-center justify-center">
              {artifacts.length}
            </span>
          </button>
        )}
      </div>

      {/* Bottom: Settings + credits badge */}
      <div className="flex flex-col items-center gap-1 pb-3">
        {/* Credits mini indicator */}
        <button
          onClick={() => toggle("settings")}
          title="Credits & Settings"
          className="w-9 h-9 rounded-lg flex flex-col items-center justify-center gap-0.5 transition-all"
          style={sidebarTab === "settings"
            ? { color: holderTier.color, background: `${holderTier.color}15` }
            : { color: "#475569" }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="font-mono text-[7px] leading-none"
            style={{ color: isUnlimited ? holderTier.color : credits <= 20 ? "#EF4444" : "#475569" }}>
            {isUnlimited ? "∞" : credits > 999 ? `${Math.floor(credits / 1000)}k` : credits}
          </span>
        </button>
      </div>
    </nav>
  );
}
