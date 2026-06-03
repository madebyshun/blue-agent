"use client";

import { useState } from "react";
import Navbar from "@/components/Navbar";
import BuyBlueModal from "@/components/BuyBlueModal";
import { ChatProvider, useChat } from "./ChatContext";

import Sidebar        from "./components/Sidebar";
import ChatMessages   from "./components/ChatMessages";
import ChatInput      from "./components/ChatInput";
import ArtifactsPanel from "./components/ArtifactsPanel";

// ── Mobile bottom nav ──────────────────────────────────────────────────────────
import TasksPanel    from "./components/TasksPanel";
import SkillsTab     from "./components/SkillsTab";
import CronPanel     from "./components/CronPanel";
import SettingsPanel from "./components/SettingsPanel";

const MOBILE_TABS = [
  { id: "chat",     label: "Chat",     icon: "💬" },
  { id: "tasks",    label: "Tasks",    icon: "📋" },
  { id: "skills",   label: "Skills",   icon: "⚡" },
  { id: "cron",     label: "Cron",     icon: "⏱" },
  { id: "settings", label: "Settings", icon: "⚙️" },
] as const;
type MobileTab = typeof MOBILE_TABS[number]["id"];

// ── Shell ──────────────────────────────────────────────────────────────────────
function ChatShell() {
  const { buyOpen, setBuyOpen, triggerWalletRefresh, artifactsPanelOpen } = useChat();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("chat");

  return (
    <>
      {buyOpen && (
        <BuyBlueModal
          onClose={() => setBuyOpen(false)}
          onSuccess={() => triggerWalletRefresh()}
        />
      )}

      <Navbar />

      <div className="flex bg-[#050508] font-mono pt-16 h-screen overflow-hidden">

        {/* ── Desktop sidebar ── */}
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(v => !v)}
        />

        {/* ── Main chat ── */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
          {/* Mobile: show panel content above chat when tab active */}
          {mobileTab !== "chat" && (
            <div className="lg:hidden flex-1 overflow-y-auto border-b border-[#1A1A2E]">
              {mobileTab === "tasks"    && <TasksPanel />}
              {mobileTab === "skills"   && <SkillsTab />}
              {mobileTab === "cron"     && <CronPanel />}
              {mobileTab === "settings" && <SettingsPanel />}
            </div>
          )}
          {/* Chat messages always rendered (hidden on mobile when panel open) */}
          <div className={`flex-1 flex flex-col min-w-0 overflow-hidden ${mobileTab !== "chat" ? "hidden lg:flex" : "flex"}`}>
            <ChatMessages />
            <ChatInput />
          </div>
        </div>

        {/* ── Artifacts panel (right, desktop only) ── */}
        {artifactsPanelOpen && (
          <div className="hidden lg:flex flex-col w-96 shrink-0 h-full overflow-hidden">
            <ArtifactsPanel />
          </div>
        )}
      </div>

      {/* ── Mobile bottom tab bar ── */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 flex bg-[#050508] border-t border-[#1A1A2E] h-14">
        {MOBILE_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setMobileTab(tab.id)}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors"
            style={{ color: mobileTab === tab.id ? "#4FC3F7" : "#475569" }}
          >
            <span className="text-base leading-none">{tab.icon}</span>
            <span className="font-mono text-[8px]">{tab.label}</span>
          </button>
        ))}
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
