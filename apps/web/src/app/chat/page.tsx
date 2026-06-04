"use client";

import { useState } from "react";
import Navbar        from "@/components/Navbar";
import BuyBlueModal  from "@/components/BuyBlueModal";
import WalletBar     from "@/components/WalletBar";
import { ChatProvider, useChat } from "./ChatContext";

import AppSidebar    from "./components/AppSidebar";
import ToolsTab      from "./components/ToolsTab";
import SkillsPanel   from "./components/SkillsPanel";
import CronPanel     from "./components/CronPanel";
import SettingsPanel from "./components/SettingsPanel";
import ChatMessages  from "./components/ChatMessages";
import ChatInput     from "./components/ChatInput";
import ArtifactsPanel from "./components/ArtifactsPanel";

export type ActiveTab = "chat" | "tools" | "skills" | "cron" | "settings";

// ── Tab metadata ───────────────────────────────────────────────────────────────
const TAB_META: Record<Exclude<ActiveTab, "chat">, { title: string; subtitle: string }> = {
  tools:    { title: "Tools",    subtitle: "50 hub tools · click to run in chat" },
  skills:   { title: "Skills",   subtitle: "Agent capabilities · Blue Agent · Bankr · Base MCP" },
  cron:     { title: "Cron",     subtitle: "Scheduled agent tasks" },
  settings: { title: "Settings", subtitle: "Model · Persona · Credits · Wallet" },
};

// ── Mobile tab bar ─────────────────────────────────────────────────────────────
const MOBILE_TABS: { id: ActiveTab; label: string; icon: string }[] = [
  { id: "chat",     label: "Chat",     icon: "💬" },
  { id: "tools",    label: "Tools",    icon: "🔧" },
  { id: "skills",   label: "Skills",   icon: "⚡" },
  { id: "cron",     label: "Cron",     icon: "⏱" },
  { id: "settings", label: "Settings", icon: "⚙️" },
];

// ── Shell ──────────────────────────────────────────────────────────────────────
function ChatShell() {
  const { buyOpen, setBuyOpen, triggerWalletRefresh, artifactsPanelOpen, onWalletChange, walletRefresh } = useChat();
  const [activeTab, setActiveTab] = useState<ActiveTab>("chat");

  const isChat = activeTab === "chat";
  const meta   = !isChat ? TAB_META[activeTab] : null;

  return (
    <>
      {/* Hidden wallet detector — always mounted so onWalletChange fires on load */}
      <div className="hidden">
        <WalletBar onWalletChange={onWalletChange} refreshTrigger={walletRefresh} />
      </div>

      {buyOpen && (
        <BuyBlueModal
          onClose={() => setBuyOpen(false)}
          onSuccess={triggerWalletRefresh}
        />
      )}

      <Navbar />

      <div className="flex bg-[#050508] font-mono pt-16 h-screen overflow-hidden">

        {/* ── Sidebar (desktop) ── */}
        <AppSidebar activeTab={activeTab} onSelect={setActiveTab} />

        {/* ── Main content area ── */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">

          {/* Tab header (non-chat, desktop) */}
          {!isChat && meta && (
            <div className="hidden lg:flex items-center px-6 pt-6 pb-4 border-b border-[#1A1A2E] flex-shrink-0">
              <div>
                <p className="font-mono text-xs text-[#4FC3F7] tracking-widest">
                  // {meta.title.toUpperCase()}
                </p>
                <p className="font-mono text-[10px] text-slate-700 mt-1">{meta.subtitle}</p>
              </div>
            </div>
          )}

          {/* Content area */}
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

            {/* 🔧 Tools */}
            {activeTab === "tools" && (
              <div className="flex-1 h-full overflow-hidden">
                <ToolsTab />
              </div>
            )}

            {/* ⚡ Skills */}
            {activeTab === "skills" && (
              <div className="flex-1 h-full overflow-hidden">
                <SkillsPanel />
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
