"use client";

import type { ActiveTab } from "../types";
import { useChat } from "../ChatContext";

// ── Helpers ───────────────────────────────────────────────────────────────────
function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function relativeGroup(ms: number): "today" | "yesterday" | "older" {
  const diff = Date.now() - ms;
  if (diff < 86_400_000)  return "today";
  if (diff < 172_800_000) return "yesterday";
  return "older";
}

const GROUP_LABELS = { today: "Today", yesterday: "Yesterday", older: "Earlier" };

// ── Nav tabs ──────────────────────────────────────────────────────────────────
const NAV_TABS: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
  {
    id: "chat",
    label: "Chat",
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
  {
    id: "tools",
    label: "Tools",
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
      </svg>
    ),
  },
  {
    id: "skills",
    label: "Skills",
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    id: "cron",
    label: "Cron",
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    id: "settings",
    label: "Settings",
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

// ── Component ─────────────────────────────────────────────────────────────────
export default function AppSidebar({
  activeTab,
  onSelect,
}: {
  activeTab: ActiveTab;
  onSelect: (id: ActiveTab) => void;
}) {
  const {
    tasks, activeTaskId, createNewTask, selectTask, deleteTask,
    crons, credits, isUnlimited, holderTier, walletReady,
  } = useChat();

  const activeCrons = crons.filter(c => c.active).length;

  const sorted = [...tasks].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 40);
  const groups = (["today", "yesterday", "older"] as const)
    .map(g => ({ key: g, label: GROUP_LABELS[g], items: sorted.filter(t => relativeGroup(t.updatedAt) === g) }))
    .filter(g => g.items.length > 0);

  return (
    <aside className="hidden lg:flex flex-col w-64 shrink-0 h-full border-r border-[#1A1A2E] bg-[#050508]">

      {/* ── Identity ── aligned with main sidebar h-14 logo row */}
      <div className="px-4 h-14 flex items-center border-b border-[#1A1A2E] shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] animate-pulse shrink-0 mr-2" />
        <p className="font-mono text-[10px] text-[#4FC3F7] tracking-widest">// BLUE CHAT</p>
      </div>

      {/* ── New Chat ── */}
      <div className="px-4 pt-3 pb-3 shrink-0">
        {/* New Chat */}
        <button
          onClick={() => { createNewTask(); onSelect("chat"); }}
          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border transition-all group"
          style={{ borderColor: "#4FC3F730", background: "#4FC3F70a" }}
          onMouseEnter={e => { e.currentTarget.style.background = "#4FC3F714"; e.currentTarget.style.borderColor = "#4FC3F750"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "#4FC3F70a"; e.currentTarget.style.borderColor = "#4FC3F730"; }}
        >
          <svg className="w-4 h-4 text-[#4FC3F7] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span className="font-mono text-xs text-[#4FC3F7] font-semibold flex-1">New chat</span>
          <span className="font-mono text-[9px] text-slate-700 group-hover:text-slate-500 transition-colors">⌘N</span>
        </button>
      </div>

      {/* ── Nav tabs — horizontal compact row ── */}
      <div className="px-3 pb-3 shrink-0">
        <div className="flex items-center gap-0.5 bg-[#0d0d12] rounded-xl p-1 border border-[#1A1A2E]">
          {NAV_TABS.map(tab => {
            const isActive = activeTab === tab.id;
            const hasBadge = tab.id === "cron" && activeCrons > 0;
            return (
              <button
                key={tab.id}
                onClick={() => onSelect(tab.id)}
                title={tab.label}
                className="relative flex-1 flex items-center justify-center py-1.5 rounded-lg transition-all"
                style={isActive
                  ? { background: "#4FC3F715", color: "#4FC3F7" }
                  : { color: "#475569" }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = "#94a3b8"; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = "#475569"; }}
              >
                {tab.icon}
                {hasBadge && (
                  <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-[#4FC3F7]" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Conversations ── */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0 border-t border-[#1A1A2E]">

        {/* List */}
        <div className="flex-1 overflow-y-auto pt-2">
          {groups.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <div className="w-10 h-10 rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] flex items-center justify-center mx-auto mb-3">
                <svg className="w-4 h-4 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p className="font-mono text-[11px] text-slate-600">Start your first chat</p>
            </div>
          ) : (
            groups.map(group => (
              <div key={group.key}>
                <p className="font-mono text-[9px] text-slate-700 tracking-widest uppercase px-4 pt-3 pb-1.5">
                  {group.label}
                </p>
                {group.items.map(task => {
                  const isActive = task.id === activeTaskId;
                  return (
                    <div
                      key={task.id}
                      onClick={() => { selectTask(task.id); onSelect("chat"); }}
                      className={`group relative w-full text-left px-4 py-2.5 transition-all cursor-pointer flex items-center gap-2 mx-0 ${
                        isActive
                          ? "bg-[#4FC3F7]/8"
                          : "hover:bg-[#ffffff05]"
                      }`}
                    >
                      {/* Active indicator */}
                      {isActive && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full bg-[#4FC3F7]" />
                      )}
                      <p className={`font-mono text-[12px] flex-1 truncate leading-snug ${
                        isActive ? "text-white" : "text-slate-500 group-hover:text-slate-300"
                      }`}>
                        {task.title || <span className="italic text-slate-700">New conversation</span>}
                      </p>
                      <span className="font-mono text-[9px] text-slate-700 shrink-0 group-hover:hidden">
                        {relativeTime(task.updatedAt)}
                      </span>
                      <button
                        onClick={e => { e.stopPropagation(); deleteTask(task.id); }}
                        className="hidden group-hover:flex shrink-0 p-0.5 text-slate-700 hover:text-red-400 transition-colors"
                        title="Delete"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Footer — credits ── */}
      <div className="px-4 py-3.5 border-t border-[#1A1A2E] shrink-0">
        <button
          className="w-full flex items-center gap-2.5 group"
          onClick={() => onSelect("settings")}
        >
          {/* Credit indicator dot */}
          <span
            className="w-2 h-2 rounded-full shrink-0 transition-all"
            style={{
              background: !walletReady ? "#1e293b" : isUnlimited ? holderTier.color : credits <= 20 ? "#EF4444" : "#334155",
              boxShadow: isUnlimited && walletReady ? `0 0 6px ${holderTier.color}` : undefined,
            }}
          />
          <span
            className="font-mono text-[11px] flex-1 text-left"
            style={{ color: !walletReady ? "#475569" : isUnlimited ? holderTier.color : credits <= 20 ? "#EF4444" : "#64748b" }}
          >
            {!walletReady ? "…"
              : isUnlimited ? `∞ credits · ${holderTier.tier}`
              : credits >= 10_000 ? `${(credits / 1000).toFixed(1)}k credits`
              : `${credits.toLocaleString()} credits`}
          </span>
          <span className="font-mono text-[9px] text-slate-700 group-hover:text-slate-500 transition-colors">⚙</span>
        </button>
      </div>
    </aside>
  );
}
