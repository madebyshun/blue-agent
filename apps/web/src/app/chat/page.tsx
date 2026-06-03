"use client";

import Navbar from "@/components/Navbar";
import BuyBlueModal from "@/components/BuyBlueModal";
import { ChatProvider, useChat } from "./ChatContext";

import NavRail      from "./components/NavRail";
import TasksPanel   from "./components/TasksPanel";
import SkillsTab    from "./components/SkillsTab";
import CronPanel    from "./components/CronPanel";
import SettingsPanel from "./components/SettingsPanel";
import ChatMessages from "./components/ChatMessages";
import ChatInput    from "./components/ChatInput";
import ArtifactsPanel from "./components/ArtifactsPanel";

// Panel labels for header
const PANEL_LABELS: Record<string, { title: string; subtitle: string }> = {
  tasks:    { title: "Tasks",    subtitle: "Conversation history" },
  skills:   { title: "Skills",   subtitle: "50 tools · 9 toolsets" },
  cron:     { title: "Cron",     subtitle: "Scheduled tasks" },
  settings: { title: "Settings", subtitle: "Models · Credits · Wallet" },
};

function ChatShell() {
  const {
    buyOpen, setBuyOpen, triggerWalletRefresh,
    sidebarTab, setSidebarTab,
    artifactsPanelOpen,
  } = useChat();

  const panelOpen = sidebarTab !== "none";
  const panelMeta = PANEL_LABELS[sidebarTab];

  return (
    <>
      {buyOpen && (
        <BuyBlueModal
          onClose={() => setBuyOpen(false)}
          onSuccess={() => triggerWalletRefresh()}
        />
      )}

      <Navbar />

      {/* ── Full-height app shell ── */}
      <div className="flex bg-[#050508] font-mono pt-16 h-screen overflow-hidden">

        {/* ── Nav rail (48px, desktop only) ── */}
        <NavRail />

        {/* ── Slide-over panel ── */}
        <div
          className={`hidden lg:flex flex-col border-r border-[#1A1A2E] h-full overflow-hidden transition-all duration-200 flex-shrink-0 ${
            panelOpen ? "w-72 opacity-100" : "w-0 opacity-0"
          }`}
        >
          {panelOpen && panelMeta && (
            <>
              {/* Panel header with close */}
              <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-[#1A1A2E] flex-shrink-0">
                <div>
                  <h2 className="font-mono text-xs font-bold text-white tracking-widest">{panelMeta.title.toUpperCase()}</h2>
                  <p className="font-mono text-[9px] text-slate-600 mt-0.5">{panelMeta.subtitle}</p>
                </div>
                <button
                  onClick={() => setSidebarTab("none")}
                  className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-600 hover:text-slate-400 hover:bg-white/5 transition-all"
                  title="Close panel"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Panel content */}
              <div className="flex-1 overflow-hidden">
                {sidebarTab === "tasks"    && <TasksPanel />}
                {sidebarTab === "skills"   && <SkillsTab />}
                {sidebarTab === "cron"     && <CronPanel />}
                {sidebarTab === "settings" && <SettingsPanel />}
              </div>
            </>
          )}
        </div>

        {/* ── Main chat area ── */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
          <ChatMessages />
          <ChatInput />
        </div>

        {/* ── Artifacts panel (right, desktop) ── */}
        {artifactsPanelOpen && (
          <div className="hidden lg:flex flex-col w-96 shrink-0 h-full overflow-hidden">
            <ArtifactsPanel />
          </div>
        )}
      </div>

      {/* ── Mobile bottom tab bar ── */}
      <MobileTabBar />
    </>
  );
}

// ── Mobile bottom nav (shown only on < lg) ────────────────────────────────────
function MobileTabBar() {
  const { sidebarTab, setSidebarTab, artifacts, artifactsPanelOpen, setArtifactsPanelOpen } = useChat();

  const tabs = [
    { id: "none" as const,     label: "Chat",     icon: "💬" },
    { id: "tasks" as const,    label: "Tasks",    icon: "📋" },
    { id: "skills" as const,   label: "Skills",   icon: "⚡" },
    { id: "cron" as const,     label: "Cron",     icon: "⏱" },
    { id: "settings" as const, label: "Settings", icon: "⚙️" },
  ];

  return (
    <>
      {/* Mobile: overlay panel */}
      {sidebarTab !== "none" && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setSidebarTab("none")} />
      )}
      {sidebarTab !== "none" && (
        <div className="lg:hidden fixed bottom-16 left-0 right-0 z-50 bg-[#0D0D14] border-t border-[#1A1A2E] max-h-[70vh] overflow-y-auto rounded-t-2xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#1A1A2E]">
            <span className="font-mono text-xs font-bold text-white">
              {PANEL_LABELS[sidebarTab]?.title?.toUpperCase()}
            </span>
            <button onClick={() => setSidebarTab("none")} className="text-slate-500 hover:text-white">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="p-2">
            {sidebarTab === "tasks"    && <TasksPanel />}
            {sidebarTab === "skills"   && <SkillsTab />}
            {sidebarTab === "cron"     && <CronPanel />}
            {sidebarTab === "settings" && <SettingsPanel />}
          </div>
        </div>
      )}

      {/* Bottom tab bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 flex bg-[#050508] border-t border-[#1A1A2E] h-16">
        {tabs.map(tab => {
          const isActive = tab.id === "none" ? sidebarTab === "none" : sidebarTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setSidebarTab(tab.id === sidebarTab ? "none" : tab.id)}
              className="flex-1 flex flex-col items-center justify-center gap-1 transition-all"
              style={{ color: isActive ? "#4FC3F7" : "#475569" }}
            >
              <span className="text-base">{tab.icon}</span>
              <span className="font-mono text-[8px]">{tab.label}</span>
            </button>
          );
        })}
        {artifacts.length > 0 && (
          <button
            onClick={() => setArtifactsPanelOpen(!artifactsPanelOpen)}
            className="flex-1 flex flex-col items-center justify-center gap-1 transition-all relative"
            style={{ color: artifactsPanelOpen ? "#A78BFA" : "#475569" }}
          >
            <span className="text-base">◈</span>
            <span className="font-mono text-[8px]">Code</span>
            <span className="absolute top-2 right-3 w-3.5 h-3.5 rounded-full bg-[#A78BFA] text-[#050508] font-mono font-bold text-[7px] flex items-center justify-center">
              {artifacts.length}
            </span>
          </button>
        )}
      </div>
    </>
  );
}

// ── Page export ────────────────────────────────────────────────────────────────
export default function ChatPage() {
  return (
    <ChatProvider>
      <ChatShell />
    </ChatProvider>
  );
}
