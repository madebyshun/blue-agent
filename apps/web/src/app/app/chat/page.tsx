"use client";

import { useState } from "react";
import BuyBlueModal  from "@/components/BuyBlueModal";
import WalletBar     from "@/components/WalletBar";
import { ChatProvider, useChat } from "@/app/chat/ChatContext";

import AppSidebar    from "@/app/chat/components/AppSidebar";
import ModelsPanel   from "@/app/chat/components/ModelsPanel";
import ToolsTab      from "@/app/chat/components/ToolsTab";
import SkillsPanel   from "@/app/chat/components/SkillsPanel";
import CronPanel     from "@/app/chat/components/CronPanel";
import SettingsModal from "@/app/chat/components/SettingsModal";
import ChatMessages  from "@/app/chat/components/ChatMessages";
import ChatInput     from "@/app/chat/components/ChatInput";
import ArtifactsPanel from "@/app/chat/components/ArtifactsPanel";
import type { ActiveTab } from "@/app/chat/types";

// ── Tab metadata ───────────────────────────────────────────────────────────────
// Settings is intentionally absent — it opens as a modal from the account chip,
// not as a content tab.
const TAB_META: Record<Exclude<ActiveTab, "chat" | "settings">, { title: string; subtitle: string }> = {
  models:   { title: "Models",   subtitle: "AI engines behind Blue Chat · pick by use-case" },
  tools:    { title: "Tools",    subtitle: "50 hub tools · click to run in chat" },
  skills:   { title: "Skills",   subtitle: "Agent capabilities · Blue Agent · Bankr · Base MCP" },
  cron:     { title: "Scheduled", subtitle: "Scheduled agent tasks" },
};

// ── Mobile tab bar ─────────────────────────────────────────────────────────────
const MOBILE_TABS: { id: ActiveTab; label: string; icon: string }[] = [
  { id: "chat",     label: "Chat",     icon: "💬" },
  { id: "models",   label: "Models",   icon: "🤖" },
  { id: "tools",    label: "Tools",    icon: "🔧" },
  { id: "skills",   label: "Skills",   icon: "⚡" },
  { id: "cron",     label: "Scheduled", icon: "⏱" },
];

// ── Shell ──────────────────────────────────────────────────────────────────────
function ChatShell() {
  const { buyOpen, setBuyOpen, triggerWalletRefresh, artifactsPanelOpen, onWalletChange, walletRefresh } = useChat();
  const [activeTab, setActiveTab] = useState<ActiveTab>("chat");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const isChat = activeTab === "chat";
  const meta   = activeTab !== "chat" && activeTab !== "settings" ? TAB_META[activeTab] : null;

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

      {/* No <Navbar /> — /app/layout.tsx provides the side navigation */}

      <div className="flex bg-[#050508] font-mono h-full overflow-hidden">

        {/* ── Sidebar (desktop) ── */}
        <AppSidebar activeTab={activeTab} onSelect={setActiveTab} onOpenSettings={() => setSettingsOpen(true)} />

        {/* ── Main content area ──
            pb-14 below md clears the global mobile bottom nav (56px); md+ has
            no bottom nav so no padding. */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden pb-14 md:pb-0">

          {/* ── Mobile top bar ── chat sub-tabs as icons (replaces the old
              second bottom bar; desktop uses the AppSidebar instead) */}
          <div className="lg:hidden flex items-center justify-between gap-2 px-3 h-12 border-b border-[#1A1A2E] shrink-0 bg-[#050508]">
            <span className="font-mono text-[10px] text-[#4FC3F7] tracking-widest shrink-0 truncate">
              {isChat ? "// BLUE CHAT" : `// ${meta?.title.toUpperCase()}`}
            </span>
            <div className="flex items-center gap-0.5 bg-[#0d0d12] rounded-lg p-0.5 border border-[#1A1A2E] shrink-0">
              {MOBILE_TABS.map(tab => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    title={tab.label}
                    className="px-2.5 py-1 rounded-md text-sm leading-none transition-colors"
                    style={{ color: isActive ? "#4FC3F7" : "#64748b", background: isActive ? "#4FC3F715" : "transparent" }}
                  >
                    {tab.icon}
                  </button>
                );
              })}
              {/* Settings — opens the modal (not a content tab) */}
              <button
                onClick={() => setSettingsOpen(true)}
                title="Settings"
                className="px-2.5 py-1 rounded-md text-sm leading-none text-[#64748b] transition-colors"
              >
                ⚙️
              </button>
            </div>
          </div>

          {/* Tab header (non-chat, desktop) */}
          {!isChat && meta && (
            <div className="hidden lg:flex items-center px-6 h-14 border-b border-[#1A1A2E] flex-shrink-0">
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

            {/* 🤖 Models */}
            {activeTab === "models" && (
              <div className="flex-1 h-full overflow-hidden">
                <ModelsPanel onPick={() => setActiveTab("chat")} />
              </div>
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
          </div>
        </div>
      </div>

      {/* ⚙️ Settings — modal opened from the sidebar account chip */}
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

    </>
  );
}

export default function AppChatPage() {
  return (
    <ChatProvider>
      <ChatShell />
    </ChatProvider>
  );
}
