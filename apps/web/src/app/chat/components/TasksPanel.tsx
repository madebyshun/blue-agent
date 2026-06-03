"use client";
import { useState } from "react";
import { useChat } from "../ChatContext";

function relativeGroup(ms: number): "today" | "yesterday" | "older" {
  const diff = Date.now() - ms;
  if (diff < 86_400_000)  return "today";
  if (diff < 172_800_000) return "yesterday";
  return "older";
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function msgPreview(content: string): string {
  return content.replace(/[#*`>_~[\]]/g, "").trim().slice(0, 72);
}

const GROUP_LABELS = { today: "Today", yesterday: "Yesterday", older: "Older" };

export default function TasksPanel() {
  const { tasks, activeTaskId, createNewTask, selectTask, deleteTask } = useChat();
  const [search, setSearch] = useState("");

  const sorted   = [...tasks].sort((a, b) => b.updatedAt - a.updatedAt);
  const filtered = search.trim()
    ? sorted.filter(t => t.title.toLowerCase().includes(search.toLowerCase()))
    : sorted;

  const groups = (["today", "yesterday", "older"] as const).map(g => ({
    key: g,
    label: GROUP_LABELS[g],
    items: filtered.filter(t => relativeGroup(t.updatedAt) === g),
  })).filter(g => g.items.length > 0);

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="px-4 pt-5 pb-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-mono text-sm font-bold text-white">Tasks</h2>
            <p className="font-mono text-[10px] text-slate-600 mt-0.5">
              {tasks.length} conversation{tasks.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={createNewTask}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-xs font-semibold transition-all"
            style={{ background: "#4FC3F715", color: "#4FC3F7", border: "1px solid #4FC3F730" }}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            New
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search tasks…"
            className="w-full bg-[#0D0D14] border border-[#1A1A2E] rounded-xl pl-9 pr-4 py-2 font-mono text-xs text-white placeholder:text-slate-700 outline-none focus:border-[#2A2A4E] transition-colors"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400 text-sm">×</button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center">
            <p className="font-mono text-xs text-slate-600">
              {search ? "No tasks match" : "No tasks yet"}
            </p>
            <p className="font-mono text-[10px] text-slate-700 mt-1">
              {!search && "Start a new conversation →"}
            </p>
          </div>
        ) : (
          groups.map(group => (
            <div key={group.key} className="mb-2">
              <p className="font-mono text-[9px] text-slate-700 tracking-widest px-1 pt-3 pb-2 uppercase">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map(task => {
                  const isActive  = task.id === activeTaskId;
                  const lastAsst  = task.messages.filter(m => m.role === "assistant").at(-1);
                  const userCount = task.messages.filter(m => m.role === "user").length;

                  return (
                    <div
                      key={task.id}
                      onClick={() => selectTask(task.id)}
                      className="group relative rounded-xl px-3 py-2.5 cursor-pointer transition-all select-none"
                      style={isActive
                        ? { background: "#4FC3F710", border: "1px solid #4FC3F725" }
                        : { border: "1px solid transparent" }}
                    >
                      {/* Active stripe */}
                      {isActive && (
                        <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full bg-[#4FC3F7]" />
                      )}

                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className={`font-mono text-xs font-medium truncate flex-1 leading-snug transition-colors ${
                          isActive ? "text-white" : "text-slate-400 group-hover:text-slate-200"
                        }`}>
                          {task.title || <span className="italic text-slate-700 font-normal">New conversation</span>}
                        </p>
                        <span className="font-mono text-[9px] text-slate-700 flex-shrink-0 mt-px">
                          {relativeTime(task.updatedAt)}
                        </span>
                      </div>

                      {lastAsst?.content && (
                        <p className="font-mono text-[10px] text-slate-600 leading-relaxed line-clamp-2">
                          {msgPreview(lastAsst.content)}
                        </p>
                      )}

                      <div className="flex items-center gap-2 mt-1.5">
                        {userCount > 0 && (
                          <span className="font-mono text-[9px] text-slate-700">
                            {userCount} msg{userCount !== 1 ? "s" : ""}
                          </span>
                        )}
                        {task.model && (
                          <span className="font-mono text-[9px] text-slate-700 opacity-50">
                            · {task.model}
                          </span>
                        )}
                        {task.persona && task.persona !== "blue-agent" && (
                          <span className="font-mono text-[9px] text-slate-700 opacity-50">
                            · {task.persona}
                          </span>
                        )}
                      </div>

                      {/* Delete on hover */}
                      <button
                        onClick={e => { e.stopPropagation(); deleteTask(task.id); }}
                        className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 p-1 text-slate-700 hover:text-red-400 transition-all rounded"
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
            </div>
          ))
        )}
      </div>
    </div>
  );
}
