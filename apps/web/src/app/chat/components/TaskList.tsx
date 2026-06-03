"use client";
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

export default function TaskList() {
  const { tasks, activeTaskId, createNewTask, selectTask, deleteTask } = useChat();

  return (
    <div className="flex flex-col h-full">
      {/* New task button */}
      <button
        onClick={createNewTask}
        className="mx-3 mb-2 flex items-center gap-2 px-3 py-2 rounded-lg font-mono text-xs text-slate-400 hover:text-white hover:bg-[#1A1A2E] transition-all border border-dashed border-[#1A1A2E] hover:border-[#2A2A4E]"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        New task
      </button>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
        {tasks.length === 0 ? (
          <p className="font-mono text-[10px] text-slate-700 text-center py-4 px-3">
            No tasks yet — start a conversation
          </p>
        ) : (
          tasks
            .slice()
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map(task => {
              const isActive = task.id === activeTaskId;
              return (
                <div
                  key={task.id}
                  className="group flex items-center gap-2 rounded-lg px-2 py-2 cursor-pointer transition-all"
                  style={isActive
                    ? { background: "#4FC3F710", borderLeft: "2px solid #4FC3F7" }
                    : { borderLeft: "2px solid transparent" }}
                  onClick={() => selectTask(task.id)}
                >
                  <div className="flex-1 min-w-0">
                    <p className={`font-mono text-xs truncate ${isActive ? "text-white" : "text-slate-400 group-hover:text-slate-200"}`}>
                      {task.title || <span className="italic text-slate-600">New conversation</span>}
                    </p>
                    <p className="font-mono text-[9px] text-slate-700 mt-0.5">
                      {relativeTime(task.updatedAt)}
                      {task.messages.length > 0 && (
                        <span className="ml-1.5">{Math.floor(task.messages.length / 2)} msgs</span>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-600 hover:text-red-400 transition-all"
                    title="Delete"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              );
            })
        )}
      </div>
    </div>
  );
}
