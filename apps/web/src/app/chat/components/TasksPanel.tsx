"use client";
import { useState } from "react";
import { useChat } from "../ChatContext";

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function msgPreview(content: string): string {
  return content.replace(/[#*`>_~\[\]]/g, "").trim().slice(0, 80);
}

export default function TasksPanel() {
  const { tasks, activeTaskId, createNewTask, selectTask, deleteTask, setSidebarTab } = useChat();
  const [search, setSearch] = useState("");

  const sorted = [...tasks].sort((a, b) => b.updatedAt - a.updatedAt);
  const filtered = search.trim()
    ? sorted.filter(t => t.title.toLowerCase().includes(search.toLowerCase()))
    : sorted;

  function handleSelect(id: string) {
    selectTask(id);
    // setSidebarTab not needed — sidebar stays open on desktop
  }

  function handleNew() {
    createNewTask();
  }

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-[#1A1A2E] flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-mono text-xs font-bold text-white tracking-widest">TASKS</h2>
            <p className="font-mono text-[9px] text-slate-600 mt-0.5">{tasks.length} conversation{tasks.length !== 1 ? "s" : ""}</p>
          </div>
          <button
            onClick={handleNew}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-[10px] font-semibold transition-all"
            style={{ background: "#4FC3F715", color: "#4FC3F7", border: "1px solid #4FC3F730" }}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New
          </button>
        </div>

        {/* Search */}
        {tasks.length > 3 && (
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search tasks…"
              className="w-full bg-[#0D0D14] border border-[#1A1A2E] rounded-lg pl-7 pr-3 py-1.5 font-mono text-xs text-white placeholder:text-slate-700 outline-none focus:border-[#2A2A4E] transition-colors"
            />
          </div>
        )}
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto py-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
            <div className="w-10 h-10 rounded-full bg-[#1A1A2E] flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="font-mono text-xs text-slate-500">
              {search ? "No tasks match" : "No tasks yet"}
            </p>
            <p className="font-mono text-[10px] text-slate-700 mt-1">
              {search ? "Try a different search" : "Start a conversation below"}
            </p>
          </div>
        ) : (
          <div className="px-2 space-y-1">
            {filtered.map(task => {
              const isActive  = task.id === activeTaskId;
              const lastMsg   = task.messages.filter(m => m.role === "assistant").at(-1);
              const userMsgs  = task.messages.filter(m => m.role === "user").length;
              const hasTitle  = !!task.title;

              return (
                <div
                  key={task.id}
                  onClick={() => handleSelect(task.id)}
                  className="group relative rounded-xl px-3 py-2.5 cursor-pointer transition-all"
                  style={isActive
                    ? { background: "#4FC3F710", border: "1px solid #4FC3F730" }
                    : { background: "transparent", border: "1px solid transparent" }}
                >
                  {/* Active indicator dot */}
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-[1px] w-0.5 h-8 rounded-r bg-[#4FC3F7]" />
                  )}

                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className={`font-mono text-xs font-medium truncate flex-1 ${
                      isActive ? "text-white" : "text-slate-300 group-hover:text-white"
                    } transition-colors`}>
                      {hasTitle ? task.title : <span className="italic text-slate-600">New conversation</span>}
                    </p>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {userMsgs > 0 && (
                        <span className="font-mono text-[8px] text-slate-600">{userMsgs} msg{userMsgs !== 1 ? "s" : ""}</span>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); deleteTask(task.id); }}
                        className="opacity-0 group-hover:opacity-100 text-slate-700 hover:text-red-400 transition-all p-0.5"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Preview */}
                  {lastMsg?.content && (
                    <p className="font-mono text-[9px] text-slate-600 line-clamp-2 leading-relaxed">
                      {msgPreview(lastMsg.content)}
                    </p>
                  )}

                  {/* Footer: time + model */}
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="font-mono text-[8px] text-slate-700">{relativeTime(task.updatedAt)}</span>
                    {task.model && (
                      <span className="font-mono text-[8px] text-slate-700 opacity-60">· {task.model}</span>
                    )}
                    {task.persona && task.persona !== "blue-agent" && (
                      <span className="font-mono text-[8px] text-slate-700 opacity-60">· {task.persona}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
