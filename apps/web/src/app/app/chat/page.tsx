"use client";

import { useEffect, useState } from "react";
import BuyBlueModal  from "@/components/BuyBlueModal";
import WalletBar     from "@/components/WalletBar";
import { ChatProvider, useChat } from "@/app/chat/ChatContext";
import { useAppChrome, type DrawerNavItem, type DrawerRecent } from "@/app/app/AppChrome";

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

// Drawer sub-tab rows (mobile) — Blue Chat's content tabs live in the global
// nav drawer now (no more in-page mobile tab bar). icon = emoji glyph.
const CHAT_SUBTABS: { id: ActiveTab; label: string; icon: string }[] = [
  { id: "chat",     label: "Chat",      icon: "💬" },
  { id: "models",   label: "Models",    icon: "🤖" },
  { id: "tools",    label: "Tools",     icon: "🔧" },
  { id: "skills",   label: "Skills",    icon: "⚡" },
  { id: "cron",     label: "Scheduled", icon: "⏱" },
];

// ── Shell ──────────────────────────────────────────────────────────────────────
function ChatShell() {
  const {
    buyOpen, setBuyOpen, triggerWalletRefresh, artifactsPanelOpen,
    onWalletChange, walletRefresh,
    createNewTask, tasks, selectTask, activeTaskId,
  } = useChat();
  const [activeTab, setActiveTab] = useState<ActiveTab>("chat");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { setContextual } = useAppChrome();

  const isChat = activeTab === "chat";
  const meta   = activeTab !== "chat" && activeTab !== "settings" ? TAB_META[activeTab] : null;

  // Register Blue Chat's sub-nav + recents into the global mobile drawer.
  // Re-runs when the active tab or conversation list changes so highlights and
  // the recents list stay current; cleared on unmount (when leaving /app/chat).
  useEffect(() => {
    const items: DrawerNavItem[] = [
      { id: "newchat", label: "New chat", icon: "✏️", onSelect: () => { createNewTask(); setActiveTab("chat"); } },
      ...CHAT_SUBTABS.map(t => ({
        id: t.id, label: t.label, icon: t.icon,
        active: activeTab === t.id,
        onSelect: () => setActiveTab(t.id),
      })),
      { id: "settings", label: "Settings", icon: "⚙️", onSelect: () => setSettingsOpen(true) },
    ];
    const recents: DrawerRecent[] = [...tasks]
      .filter(t => t.messages.length > 0)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 12)
      .map(t => ({
        id: t.id,
        title: t.title || "New conversation",
        active: t.id === activeTaskId && activeTab === "chat",
        onSelect: () => { selectTask(t.id); setActiveTab("chat"); },
      }));
    setContextual({
      barTitle:   isChat ? "Blue Chat" : (meta?.title ?? "Blue Chat"),
      groupTitle: "Blue Chat",
      items,
      recents,
    });
    return () => setContextual(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, tasks, activeTaskId]);

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
            The global mobile top bar + nav drawer (see /app/layout.tsx) own
            mobile navigation now, so there's no in-page mobile tab bar and no
            bottom-bar padding to clear. */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">

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
                <ToolsTab onPick={() => setActiveTab("chat")} />
              </div>
            )}

            {/* ⚡ Skills */}
            {activeTab === "skills" && (
              <div className="flex-1 h-full overflow-hidden">
                <SkillsPanel onPick={() => setActiveTab("chat")} />
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
