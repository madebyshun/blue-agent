"use client";

import { useState, useEffect, useCallback } from "react";
import Navbar from "@/components/Navbar";
import { MicroTaskCard } from "@/components/micro/MicroTaskCard";
import { MicroTaskFilters } from "@/components/micro/MicroTaskFilters";
import type { MicroTask } from "@/lib/micro-types";

const GRID_BG = {
  backgroundImage:
    "linear-gradient(rgba(79,195,247,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(79,195,247,0.03) 1px,transparent 1px)",
  backgroundSize: "40px 40px",
};

interface FilterState { platform: string; proof: string; sort: string; }

export default function MicroPage() {
  const [tasks, setTasks] = useState<MicroTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>({ platform: "", proof: "", sort: "created_at" });
  const [accepting, setAccepting] = useState<string | null>(null);
  const [handle, setHandle] = useState("");
  const [showHandleFor, setShowHandleFor] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (filters.platform) qs.set("platform", filters.platform);
    if (filters.proof) qs.set("proof", filters.proof);
    qs.set("sort", filters.sort);
    const res = await fetch(`/api/microtasks?${qs}`);
    const data = await res.json();
    setTasks(data.tasks ?? []);
    setLoading(false);
  }, [filters]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  async function acceptTask(taskId: string) {
    if (!handle.trim()) { setShowHandleFor(taskId); return; }
    setAccepting(taskId);
    setShowHandleFor(null);
    try {
      const res = await fetch(`/api/microtasks/${taskId}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`✅ Slot accepted! Go to /micro/${taskId} to submit proof.`);
        fetchTasks();
      } else {
        showToast(`❌ ${data.error}`);
      }
    } catch {
      showToast("❌ Network error");
    } finally {
      setAccepting(null);
    }
  }

  const totalBudget = tasks.reduce((s, t) => s + t.escrow.amount_locked, 0);

  return (
    <>
      <Navbar />
      <main className="bg-[#050508] font-mono min-h-screen pt-16" style={GRID_BG}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">

          {/* Header */}
          <div className="mb-8">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="glow-dot" />
                  <span className="font-mono text-[10px] text-slate-600 tracking-widest uppercase">
                    x402 microtask marketplace
                  </span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-mono font-bold text-white">
                  Micro<span className="text-[#4FC3F7]">tasks</span>
                </h1>
                <p className="font-mono text-xs text-slate-500 mt-1">
                  Small tasks. Fast payment. On-chain reputation.
                </p>
              </div>
              <div className="flex gap-3 text-right">
                <div>
                  <div className="font-mono text-lg font-bold text-white">{tasks.length}</div>
                  <div className="font-mono text-[10px] text-slate-600">open tasks</div>
                </div>
                <div className="border-l border-[#1A1A2E] pl-3">
                  <div className="font-mono text-lg font-bold text-[#4FC3F7]">${totalBudget.toFixed(0)}</div>
                  <div className="font-mono text-[10px] text-slate-600">in escrow</div>
                </div>
              </div>
            </div>

            {/* Handle + Post button row */}
            <div className="flex flex-wrap items-center gap-3 mt-6">
              <div className="flex items-center gap-2 bg-[#0D0D14] border border-[#1A1A2E] rounded-lg px-3 py-2">
                <span className="font-mono text-[10px] text-slate-600">@</span>
                <input
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  placeholder="yourhandle"
                  className="bg-transparent font-mono text-xs text-white w-28 focus:outline-none placeholder-slate-700"
                />
              </div>
              <a
                href="/micro/post"
                className="font-mono text-xs px-4 py-2 rounded-lg bg-[#4FC3F7]/10 text-[#4FC3F7] border border-[#4FC3F7]/30 hover:bg-[#4FC3F7]/20 transition-all"
              >
                + Post task
              </a>
            </div>
          </div>

          {/* Filters */}
          <div className="mb-6">
            <MicroTaskFilters filters={filters} onChange={setFilters} />
          </div>

          {/* Handle prompt dialog */}
          {showHandleFor && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
              <div className="card-surface rounded-xl border border-[#1A1A2E] w-full max-w-sm p-6">
                <h2 className="font-mono text-sm text-white mb-3">Enter your handle to accept</h2>
                <input
                  autoFocus
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && showHandleFor) acceptTask(showHandleFor); }}
                  placeholder="yourhandle (no @)"
                  className="w-full bg-[#050508] border border-[#1A1A2E] rounded-lg px-3 py-2 font-mono text-xs text-white mb-4 focus:outline-none focus:border-[#4FC3F7]/50"
                />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowHandleFor(null)} className="font-mono text-xs px-3 py-2 text-slate-500 hover:text-white">Cancel</button>
                  <button
                    onClick={() => showHandleFor && acceptTask(showHandleFor)}
                    className="font-mono text-xs px-4 py-2 rounded-lg bg-[#4FC3F7]/10 text-[#4FC3F7] border border-[#4FC3F7]/30 hover:bg-[#4FC3F7]/20"
                  >
                    Accept Slot
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Task grid */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="card-surface rounded-xl p-4 h-44 animate-pulse-slow border border-[#1A1A2E]" />
              ))}
            </div>
          ) : tasks.length === 0 ? (
            <div className="card-surface rounded-xl p-10 text-center border border-[#1A1A2E]">
              <div className="font-mono text-slate-600 text-2xl mb-3">○</div>
              <p className="font-mono text-sm text-slate-500 mb-2">No microtasks found</p>
              <p className="font-mono text-[11px] text-slate-700">Try clearing filters or post the first task</p>
              <a href="/micro/post" className="inline-block mt-4 font-mono text-xs px-4 py-2 rounded-lg bg-[#4FC3F7]/10 text-[#4FC3F7] border border-[#4FC3F7]/30 hover:bg-[#4FC3F7]/20">
                + Post a task
              </a>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {tasks.map((task) => (
                <MicroTaskCard
                  key={task.id}
                  task={task}
                  onAccept={(id) => { setShowHandleFor(id); }}
                  accepting={accepting === task.id}
                />
              ))}
            </div>
          )}

          {/* Footer nudge */}
          {!loading && tasks.length > 0 && (
            <div className="mt-8 pt-6 border-t border-[#1A1A2E] flex flex-wrap gap-4 justify-between items-center">
              <p className="font-mono text-[11px] text-slate-700">
                Payments in USDC on Base · 5% platform fee · Auto or manual approval
              </p>
              <a href="/micro/post" className="font-mono text-[11px] text-[#4FC3F7] hover:underline">
                Post your own task →
              </a>
            </div>
          )}
        </div>
      </main>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#0D0D14] border border-[#1A1A2E] rounded-lg px-4 py-3 font-mono text-xs text-white max-w-sm text-center shadow-lg">
          {toast}
        </div>
      )}
    </>
  );
}
