"use client";
import { useState } from "react";
import { useChat } from "../ChatContext";
import { nextRunLabel } from "../storage";
import type { CronSchedule } from "../types";

const SCHEDULES: { value: CronSchedule; label: string }[] = [
  { value: "daily",  label: "Every day" },
  { value: "weekly", label: "Every week" },
];

const CRON_PRESETS = [
  { label: "Daily token pick",        prompt: "/pick",                                    schedule: "daily"  as CronSchedule, time: "09:00" },
  { label: "Weekly Base digest",      prompt: "What happened on Base this week?",          schedule: "weekly" as CronSchedule, time: "09:00" },
  { label: "Daily narrative scan",    prompt: "What narratives are running on Base now?",  schedule: "daily"  as CronSchedule, time: "08:00" },
];

// ── Status dot ─────────────────────────────────────────────────────────────────
function StatusDot({ active }: { active: boolean }) {
  return (
    <span
      className="inline-block w-1.5 h-1.5 rounded-full shrink-0 transition-all"
      style={{
        background: active ? "#34D399" : "#374151",
        boxShadow: active ? "0 0 5px #34D399" : "none",
      }}
    />
  );
}

// ── Toggle switch ──────────────────────────────────────────────────────────────
function Toggle({ active, onChange }: { active: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className="relative w-8 h-[18px] rounded-full transition-colors flex-shrink-0"
      style={{ background: active ? "#34D399" : "#1E293B", border: `1px solid ${active ? "#34D399" : "#2A2A4E"}` }}
      title={active ? "Disable" : "Enable"}
    >
      <span
        className="absolute top-[2px] w-3 h-3 rounded-full bg-white transition-transform"
        style={{ transform: active ? "translateX(15px)" : "translateX(2px)" }}
      />
    </button>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function CronPanel() {
  const { crons, addCron, updateCron, deleteCron, runCron, cronRunning } = useChat();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    label: "", schedule: "daily" as CronSchedule, time: "09:00", prompt: "",
  });

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.label.trim() || !form.prompt.trim()) return;
    addCron({ ...form, active: true });
    setForm({ label: "", schedule: "daily", time: "09:00", prompt: "" });
    setShowForm(false);
  }

  function usePreset(p: typeof CRON_PRESETS[number]) {
    setForm({ label: p.label, schedule: p.schedule, time: p.time, prompt: p.prompt });
    setShowForm(true);
  }

  const active   = crons.filter(c => c.active).length;
  const inactive = crons.length - active;

  return (
    <div className="flex flex-col h-full bg-[#050508] overflow-y-auto">

      {/* ── Header ── */}
      <div className="px-6 py-5 border-b border-[#1A1A2E] flex-shrink-0">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-mono text-xs text-white tracking-widest">// SCHEDULED TASKS</h2>
          <div className="flex items-center gap-3">
            {crons.length > 0 && (
              <span className="font-mono text-[10px] text-slate-600">
                {active} active{inactive > 0 ? ` · ${inactive} paused` : ""}
              </span>
            )}
            <button
              onClick={() => setShowForm(v => !v)}
              className="flex items-center gap-1.5 font-mono text-[11px] px-3 py-1.5 rounded-lg transition-all"
              style={showForm
                ? { color: "#EF4444", background: "#EF444415", border: "1px solid #EF444430" }
                : { color: "#4FC3F7", background: "#4FC3F710", border: "1px solid #4FC3F730" }}
            >
              {showForm ? (
                <>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Cancel
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add task
                </>
              )}
            </button>
          </div>
        </div>
        <p className="font-mono text-[10px] text-slate-700">Run prompts on a schedule. Auto-executes in chat.</p>
      </div>

      {/* ── Add form ── */}
      {showForm && (
        <div className="px-6 py-5 border-b border-[#1A1A2E] bg-[#0A0A12] flex-shrink-0">
          <form onSubmit={handleAdd} className="space-y-3">
            {/* Task name */}
            <div>
              <label className="font-mono text-[10px] text-slate-500 block mb-1.5">TASK NAME</label>
              <input
                value={form.label}
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                placeholder="e.g. Daily token pick"
                className="w-full bg-[#050508] border border-[#1A1A2E] focus:border-[#4FC3F7]/40 rounded-xl px-3 py-2.5 font-mono text-sm text-white placeholder:text-slate-700 outline-none transition-colors"
              />
            </div>

            {/* Schedule + Time */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-mono text-[10px] text-slate-500 block mb-1.5">SCHEDULE</label>
                <select
                  value={form.schedule}
                  onChange={e => setForm(f => ({ ...f, schedule: e.target.value as CronSchedule }))}
                  className="w-full bg-[#050508] border border-[#1A1A2E] rounded-xl px-3 py-2.5 font-mono text-sm text-white outline-none appearance-none cursor-pointer"
                >
                  {SCHEDULES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="font-mono text-[10px] text-slate-500 block mb-1.5">TIME</label>
                <input
                  type="time"
                  value={form.time}
                  onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
                  className="w-full bg-[#050508] border border-[#1A1A2E] rounded-xl px-3 py-2.5 font-mono text-sm text-white outline-none"
                />
              </div>
            </div>

            {/* Prompt */}
            <div>
              <label className="font-mono text-[10px] text-slate-500 block mb-1.5">PROMPT</label>
              <textarea
                value={form.prompt}
                onChange={e => setForm(f => ({ ...f, prompt: e.target.value }))}
                placeholder="The prompt to run… e.g. /pick"
                rows={3}
                className="w-full bg-[#050508] border border-[#1A1A2E] focus:border-[#4FC3F7]/40 rounded-xl px-3 py-2.5 font-mono text-sm text-white placeholder:text-slate-700 outline-none transition-colors resize-none"
              />
            </div>

            {/* Presets */}
            <div>
              <p className="font-mono text-[10px] text-slate-600 mb-2">Quick presets:</p>
              <div className="flex flex-wrap gap-1.5">
                {CRON_PRESETS.map(p => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => usePreset(p)}
                    className="font-mono text-[10px] px-2.5 py-1 rounded-lg border border-[#1A1A2E] hover:border-[#4FC3F7]/30 text-slate-500 hover:text-[#4FC3F7] transition-all"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl font-mono text-sm font-bold transition-all hover:opacity-90 active:scale-[0.98]"
              style={{ background: "#4FC3F7", color: "#050508" }}
            >
              Save task
            </button>
          </form>
        </div>
      )}

      {/* ── Task list ── */}
      <div className="flex-1 px-6 py-5">
        {crons.length === 0 && !showForm && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-2xl border border-[#1A1A2E] flex items-center justify-center mb-4 text-2xl">
              ⏱
            </div>
            <p className="font-mono text-sm text-slate-500 mb-1">No scheduled tasks</p>
            <p className="font-mono text-[10px] text-slate-700">Create a task to run prompts automatically</p>
          </div>
        )}

        <div className="space-y-3">
          {crons.map(cron => {
            const isRunning = cronRunning === cron.id;
            return (
              <div
                key={cron.id}
                className="rounded-2xl border transition-all"
                style={{
                  borderColor: cron.active ? "#1E293B" : "#0F172A",
                  background: cron.active ? "#0A0A12" : "#070710",
                }}
              >
                {/* Card header */}
                <div className="flex items-center gap-3 px-4 pt-4 pb-3">
                  {/* Toggle */}
                  <Toggle active={cron.active} onChange={() => updateCron(cron.id, { active: !cron.active })} />

                  {/* Name */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <StatusDot active={cron.active} />
                      <span className={`font-mono text-sm font-medium truncate ${cron.active ? "text-white" : "text-slate-500"}`}>
                        {cron.label}
                      </span>
                    </div>
                    <p className="font-mono text-[10px] text-slate-600 mt-0.5 truncate pl-3.5">
                      {cron.schedule} · {cron.time}
                      {cron.active && (
                        <span className="ml-1.5 text-slate-700">· next {nextRunLabel(cron)}</span>
                      )}
                    </p>
                  </div>

                  {/* Delete */}
                  <button
                    onClick={() => deleteCron(cron.id)}
                    className="p-1.5 rounded-lg text-slate-700 hover:text-red-400 hover:bg-red-400/10 transition-all"
                    title="Delete"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>

                {/* Prompt preview */}
                <div className="mx-4 mb-3 px-3 py-2 rounded-xl bg-[#050508] border border-[#1A1A2E]">
                  <p className="font-mono text-[10px] text-slate-500 truncate">{cron.prompt}</p>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-4 pb-3">
                  {cron.lastResult ? (
                    <p className="font-mono text-[9px] text-slate-700 truncate flex-1 mr-3">
                      Last: {cron.lastResult}
                    </p>
                  ) : (
                    <span />
                  )}
                  <button
                    onClick={() => runCron(cron.id)}
                    disabled={isRunning}
                    className="flex items-center gap-1.5 font-mono text-[10px] px-3 py-1.5 rounded-lg border transition-all disabled:opacity-40"
                    style={isRunning
                      ? { color: "#34D399", borderColor: "#34D39930", background: "#34D39910" }
                      : { color: "#64748b", borderColor: "#1A1A2E", background: "transparent" }}
                  >
                    {isRunning ? (
                      <>
                        <span className="w-2.5 h-2.5 border border-current border-t-transparent rounded-full animate-spin" />
                        running…
                      </>
                    ) : (
                      <>
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Run now
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
