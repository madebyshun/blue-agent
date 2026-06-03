"use client";

import { useState } from "react";
import Navbar        from "@/components/Navbar";
import BuyBlueModal  from "@/components/BuyBlueModal";
import { ChatProvider, useChat } from "./ChatContext";

import AppSidebar    from "./components/AppSidebar";
import TasksPanel    from "./components/TasksPanel";
import SkillsTab     from "./components/SkillsTab";
import CronPanel     from "./components/CronPanel";
import SettingsPanel from "./components/SettingsPanel";
import ChatMessages  from "./components/ChatMessages";
import ChatInput     from "./components/ChatInput";
import ArtifactsPanel from "./components/ArtifactsPanel";

export type ActiveTab = "chat" | "tasks" | "skills" | "cron" | "settings";

// ── Mobile tab bar config ──────────────────────────────────────────────────────
const MOBILE_TABS: { id: ActiveTab; label: string; icon: string }[] = [
  { id: "chat",     label: "Chat",     icon: "💬" },
  { id: "tasks",    label: "Tasks",    icon: "📋" },
  { id: "skills",   label: "Skills",   icon: "⚡" },
  { id: "cron",     label: "Cron",     icon: "⏱" },
  { id: "settings", label: "Settings", icon: "⚙️" },
];

// ── Page header for non-chat tabs ──────────────────────────────────────────────
const TAB_META: Record<Exclude<ActiveTab, "chat">, { title: string; subtitle: string }> = {
  tasks:    { title: "Tasks",    subtitle: "Conversation history" },
  skills:   { title: "Skills",   subtitle: "50 tools · 9 toolsets" },
  cron:     { title: "Cron",     subtitle: "Scheduled tasks" },
  settings: { title: "Settings", subtitle: "Models · Credits · Wallet" },
};

// ── Shell ──────────────────────────────────────────────────────────────────────
function ChatShell() {
  const { buyOpen, setBuyOpen, triggerWalletRefresh, artifactsPanelOpen } = useChat();
  const [activeTab, setActiveTab] = useState<ActiveTab>("chat");

  const isChat = activeTab === "chat";
  const meta   = !isChat ? TAB_META[activeTab] : null;

  return (
    <>
      {buyOpen && (
        <BuyBlueModal
          onClose={() => setBuyOpen(false)}
          onSuccess={triggerWalletRefresh}
        />
      )}

      <Navbar />

      {/* ── Full app layout (below navbar) ── */}
      <div className="flex bg-[#050508] font-mono pt-16 h-screen overflow-hidden">

        {/* ── Sidebar (desktop only) ── */}
        <AppSidebar activeTab={activeTab} onSelect={setActiveTab} />

        {/* ── Main content area ── */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">

          {/* Tab page header (non-chat tabs, desktop) */}
          {!isChat && meta && (
            <div className="hidden lg:flex items-center gap-3 px-6 pt-6 pb-4 border-b border-[#1A1A2E] flex-shrink-0">
              <div>
                <p className="font-mono text-xs text-[#4FC3F7] tracking-widest">// {meta.title.toUpperCase()}</p>
                <p className="font-mono text-[10px] text-slate-700 mt-1">{meta.subtitle}</p>
              </div>
            </div>
          )}

          {/* Tab content */}
          <div className="flex-1 flex min-h-0 overflow-hidden">

            {/* 💬 Chat */}
            {isChat && (
              <>
                <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
                  <ChatMessages />
                  <ChatInput />
                </div>
                {artifactsPanelOpen && (
                  <div className="hidden lg:flex flex-col w-96 shrink-0 border-l border-[#1A1A2E] h-full overflow-hidden">
                    <ArtifactsPanel />
                  </div>
                )}
              </>
            )}

            {/* 📋 Tasks */}
            {activeTab === "tasks" && (
              <div className="flex-1 h-full overflow-hidden">
                <TasksPanel />
              </div>
            )}

            {/* ⚡ Skills */}
            {activeTab === "skills" && (
              <div className="flex-1 h-full overflow-hidden">
                <SkillsTab />
              </div>
            )}

            {/* ⏱ Cron */}
            {activeTab === "cron" && (
              <div className="flex-1 h-full overflow-hidden">
                <CronPanel />
              </div>
            )}

            {/* ⚙️ Settings */}
            {activeTab === "settings" && (
              <div className="flex-1 h-full overflow-hidden">
                <SettingsPanel />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Mobile bottom tab bar ── */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 flex bg-[#050508] border-t border-[#1A1A2E] h-14">
        {MOBILE_TABS.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
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
