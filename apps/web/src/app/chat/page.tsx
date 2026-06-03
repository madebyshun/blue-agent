"use client";

import { useState } from "react";
import Navbar        from "@/components/Navbar";
import BuyBlueModal  from "@/components/BuyBlueModal";
import { ChatProvider, useChat } from "./ChatContext";
import type { SidebarTab } from "./types";

import NavRail        from "./components/NavRail";
import TasksPanel     from "./components/TasksPanel";
import SkillsTab      from "./components/SkillsTab";
import CronPanel      from "./components/CronPanel";
import SettingsPanel  from "./components/SettingsPanel";
import ChatMessages   from "./components/ChatMessages";
import ChatInput      from "./components/ChatInput";
import ArtifactsPanel from "./components/ArtifactsPanel";

// ── Panel config ───────────────────────────────────────────────────────────────
const PANELS: Record<string, { title: string; subtitle: string; width: string }> = {
  tasks:    { title: "Tasks",    subtitle: "Conversation history",   width: "w-72" },
  skills:   { title: "Skills",   subtitle: "50 tools · 9 toolsets",  width: "w-80" },
  cron:     { title: "Cron",     subtitle: "Scheduled tasks",         width: "w-72" },
  settings: { title: "Settings", subtitle: "Models · Credits · Wallet", width: "w-80" },
};

type ActivePanel = SidebarTab | "chat";

// ── Mobile tab definitions ─────────────────────────────────────────────────────
const MOBILE_TABS = [
  { id: "chat"     as const, label: "Chat",     icon: "💬" },
  { id: "tasks"    as const, label: "Tasks",    icon: "📋" },
  { id: "skills"   as const, label: "Skills",   icon: "⚡" },
  { id: "cron"     as const, label: "Cron",     icon: "⏱" },
  { id: "settings" as const, label: "Settings", icon: "⚙️" },
] as const;
type MobileTab = typeof MOBILE_TABS[number]["id"];

// ── Shell ──────────────────────────────────────────────────────────────────────
function ChatShell() {
  const { buyOpen, setBuyOpen, triggerWalletRefresh, artifactsPanelOpen } = useChat();
  const [activePanel, setActivePanel] = useState<ActivePanel>("chat");
  const [mobileTab,   setMobileTab]   = useState<MobileTab>("chat");

  const panelCfg    = activePanel !== "chat" ? PANELS[activePanel] : null;
  const isPanelOpen = activePanel !== "chat" && !!panelCfg;

  function handleNavSelect(id: ActivePanel) {
    // Toggle: clicking active non-chat panel closes it
    setActivePanel(prev => (prev === id && id !== "chat") ? "chat" : id);
  }

  return (
    <>
      {buyOpen && (
        <BuyBlueModal
          onClose={() => setBuyOpen(false)}
          onSuccess={triggerWalletRefresh}
        />
      )}

      <Navbar />

      <div className="flex bg-[#050508] font-mono pt-16 h-screen overflow-hidden">

        {/* ── 1. Nav rail (56px, desktop) ── */}
        <NavRail activePanel={activePanel} onSelect={handleNavSelect} />

        {/* ── 2. Content panel (slides in, desktop) ── */}
        <div
          className={`hidden lg:flex flex-col border-r border-[#1A1A2E] h-full overflow-hidden flex-shrink-0 transition-all duration-200 ease-in-out ${
            isPanelOpen ? `${panelCfg?.width ?? "w-72"} opacity-100` : "w-0 opacity-0 pointer-events-none"
          }`}
        >
          {isPanelOpen && (
            <>
              {/* Panel header */}
              <div className="flex items-center justify-between px-4 pt-5 pb-4 border-b border-[#1A1A2E] flex-shrink-0">
                <div>
                  <h2 className="font-mono text-sm font-bold text-white">
                    {panelCfg!.title}
                  </h2>
                  <p className="font-mono text-[10px] text-slate-600 mt-0.5">
                    {panelCfg!.subtitle}
                  </p>
                </div>
                <button
                  onClick={() => setActivePanel("chat")}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-600 hover:text-slate-300 hover:bg-white/5 transition-all"
                  title="Close panel  (click icon again to reopen)"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Panel body */}
              <div className="flex-1 overflow-hidden">
                {activePanel === "tasks"    && <TasksPanel />}
                {activePanel === "skills"   && <SkillsTab />}
                {activePanel === "cron"     && <CronPanel />}
                {activePanel === "settings" && <SettingsPanel />}
              </div>
            </>
          )}
        </div>

        {/* ── 3. Chat area (always visible) ── */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">

          {/* Mobile: panel content above chat */}
          {mobileTab !== "chat" && (
            <div className="lg:hidden flex-1 overflow-y-auto bg-[#050508] border-b border-[#1A1A2E]">
              {mobileTab === "tasks"    && <TasksPanel />}
              {mobileTab === "skills"   && <SkillsTab />}
              {mobileTab === "cron"     && <CronPanel />}
              {mobileTab === "settings" && <SettingsPanel />}
            </div>
          )}

          <div className={`flex flex-col flex-1 min-h-0 overflow-hidden ${mobileTab !== "chat" ? "hidden lg:flex" : "flex"}`}>
            <ChatMessages />
            <ChatInput />
          </div>
        </div>

        {/* ── 4. Artifacts panel (right, desktop only) ── */}
        {artifactsPanelOpen && (
          <div className="hidden lg:flex flex-col w-96 shrink-0 border-l border-[#1A1A2E] h-full overflow-hidden">
            <ArtifactsPanel />
          </div>
        )}
      </div>

      {/* ── Mobile bottom tab bar ── */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 flex bg-[#050508] border-t border-[#1A1A2E] h-14 safe-area-pb">
        {MOBILE_TABS.map(tab => {
          const isActive = mobileTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setMobileTab(prev => prev === tab.id && tab.id !== "chat" ? "chat" : tab.id)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors"
              style={{ color: isActive ? "#4FC3F7" : "#475569" }}
            >
              <span className="text-lg leading-none">{tab.icon}</span>
              <span className="font-mono text-[8px] leading-none mt-0.5">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

export default function ChatPage() {
  return (
    <ChatProvider>
      <ChatShell />
    </ChatProvider>
  );
}
