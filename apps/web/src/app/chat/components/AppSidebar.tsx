"use client";

import type { ActiveTab } from "../page";

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

const GROUP_LABELS = { today: "Today", yesterday: "Yesterday", older: "Older" };

// ── Nav items ─────────────────────────────────────────────────────────────────
const NAV_ITEMS: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
  {
    id: "chat",
    label: "Chat",
    icon: (
      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
  {
    id: "tools",
    label: "Tools",
    icon: (
      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
      </svg>
    ),
  },
  {
    id: "skills",
    label: "Skills",
    icon: (
      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    id: "cron",
    label: "Cron",
    icon: (
      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    id: "settings",
    label: "Settings",
    icon: (
      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
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
    crons, credits, isUnlimited, holderTier,
  } = useChat();

  const activeCrons = crons.filter(c => c.active).length;

  function badge(id: ActiveTab): number | null {
    if (id === "cron" && activeCrons > 0) return activeCrons;
    return null;
  }

  const sorted = [...tasks].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 40);
  const groups = (["today", "yesterday", "older"] as const)
    .map(g => ({ key: g, label: GROUP_LABELS[g], items: sorted.filter(t => relativeGroup(t.updatedAt) === g) }))
    .filter(g => g.items.length > 0);

  return (
    <aside className="hidden lg:flex flex-col w-72 shrink-0 sticky top-16 h-[calc(100vh-4rem)] border-r border-[#1A1A2E]">

      {/* ── Header ── */}
      <div className="px-5 pt-5 pb-4 border-b border-[#1A1A2E] flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <p className="font-mono text-xs text-[#4FC3F7] tracking-widest">// BLUE CHAT</p>
          <p className="font-mono text-[10px] text-slate-700">
            {tasks.length} conv{activeCrons > 0 ? ` · ${activeCrons} cron` : ""}
          </p>
        </div>
        {/* New Chat button — prominent like Claude */}
        <button
          onClick={() => { createNewTask(); onSelect("chat"); }}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all text-left group"
          style={{ borderColor: "#4FC3F730", background: "#4FC3F708" }}
        >
          <svg className="w-3.5 h-3.5 text-[#4FC3F7] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span className="font-mono text-xs text-[#4FC3F7] font-semibold">New chat</span>
          <span className="ml-auto font-mono text-[9px] text-slate-700 group-hover:text-slate-500">⌘N</span>
        </button>
      </div>

      {/* ── Nav ── */}
      <nav className="flex-shrink-0 py-2">
        {NAV_ITEMS.map(item => {
          const isActive = activeTab === item.id;
          const b = badge(item.id);
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={`w-full text-left px-4 py-2.5 transition-all border-l-2 flex items-center gap-3 ${
                isActive
                  ? "border-[#4FC3F7] bg-[#4FC3F7]/5 text-white"
                  : "border-transparent text-slate-500 hover:text-slate-300 hover:bg-[#1A1A2E]/50"
              }`}
            >
              {item.icon}
              <span className="font-mono text-sm flex-1">{item.label}</span>
              {b !== null && (
                <span
                  className="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: "#4FC3F715", color: "#4FC3F7", border: "1px solid #4FC3F730" }}
                >
                  {b > 9 ? "9+" : b}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* ── Divider ── */}
      <div className="border-t border-[#1A1A2E]" />

      {/* ── Conversations ── */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">

        {/* Section header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2 flex-shrink-0">
          <p className="font-mono text-[10px] text-slate-600 tracking-widest">// CONVERSATIONS</p>
          <button
            onClick={createNewTask}
            className="text-slate-600 hover:text-[#4FC3F7] transition-colors"
            title="New conversation"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {groups.length === 0 ? (
            <p className="font-mono text-[10px] text-slate-700 px-5 py-2">No conversations yet</p>
          ) : (
            groups.map(group => (
              <div key={group.key}>
                <p className="font-mono text-[9px] text-slate-700 tracking-widest uppercase px-5 pt-3 pb-1">
                  {group.label}
                </p>
                {group.items.map(task => {
                  const isActive = task.id === activeTaskId;
                  return (
                    <div
                      key={task.id}
                      onClick={() => { selectTask(task.id); onSelect("chat"); }}
                      className={`group relative w-full text-left px-4 py-2 transition-all border-l-2 cursor-pointer flex items-center gap-2 ${
                        isActive
                          ? "border-[#4FC3F7] bg-[#4FC3F7]/5"
                          : "border-transparent hover:bg-[#1A1A2E]/50"
                      }`}
                    >
                      <p className={`font-mono text-xs flex-1 truncate leading-snug ${
                        isActive ? "text-white" : "text-slate-500 group-hover:text-slate-300"
                      }`}>
                        {task.title || <span className="italic text-slate-700">New conversation</span>}
                      </p>
                      <span className="font-mono text-[9px] text-slate-700 shrink-0 group-hover:hidden">
                        {relativeTime(task.updatedAt)}
                      </span>
                      {/* Delete on hover */}
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

      {/* ── Footer ── */}
      <div className="px-5 py-4 border-t border-[#1A1A2E] flex-shrink-0">
        <div
          className="flex items-center gap-2 cursor-pointer"
          onClick={() => onSelect("settings")}
        >
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{
              background: isUnlimited ? holderTier.color : credits <= 20 ? "#EF4444" : "#475569",
              boxShadow: isUnlimited ? `0 0 5px ${holderTier.color}` : undefined,
            }}
          />
          <span
            className="font-mono text-[10px]"
            style={{ color: isUnlimited ? holderTier.color : credits <= 20 ? "#EF4444" : "#64748b" }}
          >
            {isUnlimited ? "∞" : credits > 999 ? `${Math.floor(credits / 1000)}k` : credits} credits
          </span>
          {isUnlimited && (
            <span
              className="font-mono text-[9px] ml-auto px-1.5 py-0.5 rounded"
              style={{ background: `${holderTier.color}20`, color: holderTier.color }}
            >
              {holderTier.tier}
            </span>
          )}
          {!isUnlimited && (
            <span className="font-mono text-[10px] text-slate-700 ml-auto">→ settings</span>
          )}
        </div>
      </div>
    </aside>
  );
}
