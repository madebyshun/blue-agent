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
  { label: "Daily token pick",     prompt: "/pick",                           schedule: "daily"  as CronSchedule, time: "09:00" },
  { label: "Weekly ecosystem digest", prompt: "What happened on Base this week?", schedule: "weekly" as CronSchedule, time: "09:00" },
  { label: "Daily narrative scan", prompt: "What narratives are running on Base right now?", schedule: "daily" as CronSchedule, time: "08:00" },
];

export default function CronPanel() {
  const { crons, addCron, updateCron, deleteCron, runCron, cronRunning } = useChat();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ label: "", schedule: "daily" as CronSchedule, time: "09:00", prompt: "" });

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.label || !form.prompt) return;
    addCron({ ...form, active: true });
    setForm({ label: "", schedule: "daily", time: "09:00", prompt: "" });
    setShowForm(false);
  }

  function usePreset(p: typeof CRON_PRESETS[number]) {
    setForm({ label: p.label, schedule: p.schedule, time: p.time, prompt: p.prompt });
    setShowForm(true);
  }

  return (
    <div className="flex flex-col h-full px-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <p className="font-mono text-[9px] text-slate-600 tracking-widest">SCHEDULED TASKS</p>
        <button
          onClick={() => setShowForm(v => !v)}
          className="font-mono text-[10px] text-[#4FC3F7] hover:underline"
        >
          {showForm ? "cancel" : "+ add"}
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <form onSubmit={handleAdd} className="mb-3 p-3 rounded-xl border border-[#2A2A4E] bg-[#050508] space-y-2">
          <input
            value={form.label}
            onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
            placeholder="Task name…"
            className="w-full bg-[#0D0D14] border border-[#1A1A2E] rounded-lg px-2 py-1.5 font-mono text-xs text-white placeholder:text-slate-700 outline-none"
          />
          <div className="flex gap-2">
            <select
              value={form.schedule}
              onChange={e => setForm(f => ({ ...f, schedule: e.target.value as CronSchedule }))}
              className="flex-1 bg-[#0D0D14] border border-[#1A1A2E] rounded-lg px-2 py-1.5 font-mono text-xs text-white outline-none"
            >
              {SCHEDULES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <input
              type="time"
              value={form.time}
              onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
              className="w-24 bg-[#0D0D14] border border-[#1A1A2E] rounded-lg px-2 py-1.5 font-mono text-xs text-white outline-none"
            />
          </div>
          <textarea
            value={form.prompt}
            onChange={e => setForm(f => ({ ...f, prompt: e.target.value }))}
            placeholder="Prompt to run… (e.g. /pick)"
            rows={2}
            className="w-full bg-[#0D0D14] border border-[#1A1A2E] rounded-lg px-2 py-1.5 font-mono text-xs text-white placeholder:text-slate-700 outline-none resize-none"
          />
          {/* Presets */}
          <div>
            <p className="font-mono text-[9px] text-slate-700 mb-1">Presets:</p>
            <div className="flex flex-wrap gap-1">
              {CRON_PRESETS.map(p => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => usePreset(p)}
                  className="font-mono text-[9px] px-2 py-0.5 rounded border border-[#1A1A2E] text-slate-600 hover:text-[#4FC3F7] hover:border-[#4FC3F7]/30 transition-all"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <button
            type="submit"
            className="w-full py-1.5 rounded-lg font-mono text-xs font-bold bg-[#4FC3F7] text-[#050508]"
          >
            Save task
          </button>
        </form>
      )}

      {/* Cron list */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {crons.length === 0 && !showForm && (
          <p className="font-mono text-[10px] text-slate-700 text-center py-4">
            No scheduled tasks yet
          </p>
        )}
        {crons.map(cron => {
          const isRunning = cronRunning === cron.id;
          return (
            <div key={cron.id} className="p-3 rounded-xl border border-[#1A1A2E] bg-[#050508]">
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  {/* Toggle */}
                  <button
                    onClick={() => updateCron(cron.id, { active: !cron.active })}
                    className={`w-6 h-3.5 rounded-full transition-colors relative ${cron.active ? "bg-[#4FC3F7]" : "bg-[#2A2A4E]"}`}
                  >
                    <span className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-transform ${cron.active ? "translate-x-3" : "translate-x-0.5"}`} />
                  </button>
                  <span className="font-mono text-xs text-white">{cron.label}</span>
                </div>
                <button
                  onClick={() => deleteCron(cron.id)}
                  className="text-slate-700 hover:text-red-400 transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div className="font-mono text-[9px] text-slate-600">
                  {cron.schedule} · {cron.time}
                  {cron.active && (
                    <span className="ml-1.5 text-slate-700">· next {nextRunLabel(cron)}</span>
                  )}
                </div>
                <button
                  onClick={() => runCron(cron.id)}
                  disabled={isRunning}
                  className="font-mono text-[9px] px-2 py-0.5 rounded border border-[#2A2A4E] text-slate-500 hover:text-[#4FC3F7] hover:border-[#4FC3F7]/30 transition-all disabled:opacity-40 flex items-center gap-1"
                >
                  {isRunning && <span className="w-2 h-2 border border-current border-t-transparent rounded-full animate-spin" />}
                  {isRunning ? "running…" : "run now"}
                </button>
              </div>

              {cron.lastResult && (
                <p className="font-mono text-[9px] text-slate-700 mt-1.5 truncate">
                  Last: {cron.lastResult}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
