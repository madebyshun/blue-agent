"use client";

import { useState } from "react";
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
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
  {
    id: "tasks",
    label: "Tasks",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
  },
  {
    id: "skills",
    label: "Skills",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    id: "cron",
    label: "Cron",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    id: "settings",
    label: "Settings",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
  collapsed,
  onToggleCollapse,
}: {
  activeTab: ActiveTab;
  onSelect: (id: ActiveTab) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const {
    tasks, activeTaskId, createNewTask, selectTask, deleteTask,
    crons, credits, isUnlimited, holderTier,
  } = useChat();

  const [convsOpen, setConvsOpen] = useState(true);

  const sorted = [...tasks].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 30);
  const groups = (["today", "yesterday", "older"] as const)
    .map(g => ({ key: g, label: GROUP_LABELS[g], items: sorted.filter(t => relativeGroup(t.updatedAt) === g) }))
    .filter(g => g.items.length > 0);

  const activeCrons = crons.filter(c => c.active).length;

  function badge(id: ActiveTab): number | null {
    if (id === "tasks" && tasks.length > 1) return tasks.length;
    if (id === "cron"  && activeCrons > 0)  return activeCrons;
    return null;
  }

  return (
    <aside
      className={`hidden lg:flex flex-col h-full bg-[#050508] border-r border-[#1A1A2E] flex-shrink-0 transition-all duration-200 overflow-hidden ${
        collapsed ? "w-14" : "w-56"
      }`}
    >
      {/* ── Logo ── */}
      <div className="flex items-center h-14 border-b border-[#1A1A2E] flex-shrink-0 px-3 gap-2.5">
        <div className="w-7 h-7 rounded-xl bg-[#4FC3F7] flex items-center justify-center flex-shrink-0">
          <span className="font-mono text-[10px] font-black text-[#050508]">B</span>
        </div>
        {!collapsed && (
          <span className="font-mono text-sm font-bold text-white truncate">Blue Agent</span>
        )}
        {!collapsed && (
          <button
            onClick={onToggleCollapse}
            className="ml-auto text-slate-600 hover:text-slate-400 transition-colors"
            title="Collapse sidebar"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 19l-7-7 7-7M18 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        {collapsed && (
          <button
            onClick={onToggleCollapse}
            className="ml-auto text-slate-600 hover:text-slate-400 transition-colors"
            title="Expand sidebar"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 5l7 7-7 7M6 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>

      {/* ── Nav items ── */}
      <div className="flex flex-col gap-0.5 px-2 pt-3 pb-2 flex-shrink-0">
        {NAV_ITEMS.map(item => {
          const isActive = activeTab === item.id;
          const b = badge(item.id);
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              title={collapsed ? item.label : undefined}
              className={`relative flex items-center gap-3 rounded-lg px-2.5 py-2 transition-all w-full text-left ${
                isActive
                  ? "bg-white/5 text-white"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]"
              }`}
            >
              <span className="flex-shrink-0">{item.icon}</span>
              {!collapsed && (
                <span className="font-mono text-xs flex-1 truncate">{item.label}</span>
              )}
              {b !== null && !collapsed && (
                <span className="font-mono text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-[#4FC3F715] text-[#4FC3F7] border border-[#4FC3F730]">
                  {b > 9 ? "9+" : b}
                </span>
              )}
              {b !== null && collapsed && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 rounded-full bg-[#4FC3F7] text-[#050508] font-mono font-bold text-[7px] flex items-center justify-center px-0.5">
                  {b > 9 ? "9+" : b}
                </span>
              )}
              {isActive && (
                <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-[#4FC3F7]" />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Divider ── */}
      <div className="mx-3 border-t border-[#1A1A2E]" />

      {/* ── Conversations ── */}
      {!collapsed && (
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {/* Section header */}
          <div className="flex items-center justify-between px-3 pt-3 pb-1.5 flex-shrink-0">
            <button
              onClick={() => setConvsOpen(v => !v)}
              className="flex items-center gap-1.5 text-slate-600 hover:text-slate-400 transition-colors"
            >
              <svg
                className="w-3 h-3 transition-transform"
                style={{ transform: convsOpen ? "rotate(90deg)" : "rotate(0deg)" }}
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span className="font-mono text-[9px] tracking-widest uppercase">Conversations</span>
            </button>
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

          {convsOpen && (
            <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
              {groups.length === 0 ? (
                <p className="font-mono text-[10px] text-slate-700 px-2 py-2">No conversations yet</p>
              ) : (
                groups.map(group => (
                  <div key={group.key}>
                    <p className="font-mono text-[8px] text-slate-700 tracking-widest uppercase px-2 pt-2 pb-1">
                      {group.label}
                    </p>
                    {group.items.map(task => {
                      const isActive = task.id === activeTaskId;
                      return (
                        <div
                          key={task.id}
                          onClick={() => { selectTask(task.id); onSelect("chat"); }}
                          className="group relative flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-pointer transition-all"
                          style={isActive
                            ? { background: "#4FC3F710", color: "white" }
                            : { color: "#64748b" }
                          }
                        >
                          {isActive && (
                            <span className="absolute left-0 top-2 bottom-2 w-[2px] rounded-r-full bg-[#4FC3F7]" />
                          )}
                          <p className={`font-mono text-[10px] truncate flex-1 leading-snug ${
                            isActive ? "text-slate-200" : "text-slate-500 group-hover:text-slate-300"
                          }`}>
                            {task.title || <span className="italic text-slate-700">New conversation</span>}
                          </p>
                          <span className="font-mono text-[8px] text-slate-700 flex-shrink-0">
                            {relativeTime(task.updatedAt)}
                          </span>
                          {/* Delete */}
                          <button
                            onClick={e => { e.stopPropagation(); deleteTask(task.id); }}
                            className="absolute right-1 opacity-0 group-hover:opacity-100 p-0.5 text-slate-700 hover:text-red-400 transition-all"
                          >
                            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
          )}
        </div>
      )}

      {/* Collapsed: spacer */}
      {collapsed && <div className="flex-1" />}

      {/* ── Bottom: credits + settings shortcut ── */}
      <div className={`flex-shrink-0 border-t border-[#1A1A2E] px-2 py-3 ${collapsed ? "flex flex-col items-center gap-2" : "flex items-center justify-between gap-2"}`}>
        {collapsed ? (
          <>
            <div
              className="flex flex-col items-center gap-0.5 cursor-pointer"
              onClick={() => onSelect("settings")}
              title="Credits"
            >
              <span className="font-mono text-[9px] font-bold"
                style={{ color: isUnlimited ? holderTier.color : credits <= 20 ? "#EF4444" : "#64748b" }}>
                {isUnlimited ? "∞" : credits > 999 ? `${Math.floor(credits/1000)}k` : credits}
              </span>
              <span className="font-mono text-[7px] text-slate-700">cr</span>
            </div>
          </>
        ) : (
          <>
            {/* Credits pill */}
            <button
              onClick={() => onSelect("settings")}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg transition-all hover:bg-white/5"
              title="Credits"
            >
              <div
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: isUnlimited ? holderTier.color : credits <= 20 ? "#EF4444" : "#4FC3F7" }}
              />
              <span className="font-mono text-[10px]"
                style={{ color: isUnlimited ? holderTier.color : credits <= 20 ? "#EF4444" : "#64748b" }}>
                {isUnlimited ? "∞" : credits > 999 ? `${Math.floor(credits/1000)}k` : credits}
                <span className="text-slate-700 ml-0.5">cr</span>
              </span>
              {isUnlimited && (
                <span
                  className="font-mono text-[7px] px-1 py-0.5 rounded border"
                  style={{ color: holderTier.color, borderColor: `${holderTier.color}40`, background: `${holderTier.color}12` }}
                >
                  {holderTier.tier}
                </span>
              )}
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
