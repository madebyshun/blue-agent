"use client";
import { useState, useEffect } from "react";
import { useChat } from "../ChatContext";
import { isBackground, nextRunLabel } from "../storage";
import { localTz, nextFireAt } from "@/lib/cron-schedule";
import { creditCost } from "@/lib/credits";
import { VIRTUALS_PRESETS_V1 } from "./presets";
import { MarkdownRenderer } from "./ChatMessages";
import type { CronSchedule, CronTask } from "../types";

// Strip markdown to a clean single-line preview for the card. The stored
// result is full markdown (tables, headings, links) which is unreadable when
// crammed onto one line — this reduces it to plain prose for the snippet.
function plainPreview(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")           // fenced code blocks
    .replace(/`([^`]+)`/g, "$1")               // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")      // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")   // links → text
    .replace(/^#{1,6}\s+/gm, "")               // headings
    .replace(/^[\s>*-]+/gm, " ")               // bullets / quotes
    .replace(/[|*_#>]+/g, " ")                 // residual markdown
    .replace(/\s+/g, " ")
    .trim();
}

const SCHEDULES: { value: CronSchedule; label: string }[] = [
  { value: "daily",  label: "Every day" },
  { value: "weekly", label: "Every week" },
];

const CRON_PRESETS = [
  { label: "Daily token pick",        prompt: "/pick",                                    schedule: "daily"  as CronSchedule, time: "09:00" },
  { label: "Weekly Base digest",      prompt: "What happened on Base this week?",          schedule: "weekly" as CronSchedule, time: "09:00" },
  { label: "Daily narrative scan",    prompt: "What narratives are running on Base now?",  schedule: "daily"  as CronSchedule, time: "08:00" },
];

// Grid geometry shared by the header row and every data row — one string so the
// columns cannot drift apart. Mirrors the handoff's TASKS table.
const GRID = "1fr 130px 150px 120px 110px 70px";

/**
 * The human name of the model a task runs on.
 *
 * A task stamps `tier` at creation and keeps it (see `CronTask.tier`), so this
 * has to survive ids that are no longer in the catalog — an older build's
 * `venice-kimi`, say. Falling back to the raw id is deliberate: showing a
 * catalog name that isn't what the run will use would be the same defect as
 * pricing the card off the live composer instead of the stored tier.
 */
function presetLabel(tier?: string): string {
  if (!tier) return "Balanced";
  return VIRTUALS_PRESETS_V1.find(p => p.id === tier)?.label ?? tier;
}

/**
 * The SCHEDULE column text. The time is appended ONLY for a background task,
 * because only a background task fires at it. On a foreground task "Every day ·
 * 09:00" would read as "fires daily at 09:00" — the wall-clock promise #169
 * removed, since a foreground task runs whenever you next open Blue Chat.
 */
function scheduleLabel(cron: CronTask): string {
  const base = cron.schedule === "weekly" ? "Every week" : "Every day";
  return isBackground(cron) ? `${base} · ${cron.time}` : base;
}

/**
 * The LAST RESULT column — a real status word, never a fabricated duration.
 *
 * The handoff mock printed "ok · 2.1s", but no run duration is stored anywhere,
 * so a time here would be invented. These four states are the only ones a task
 * can actually be in, read straight off the record.
 */
function lastResultStatus(cron: CronTask): { label: string; color: string } {
  if (cron.pausedReason) return { label: "paused",  color: "#F59E0B" };
  if (cron.lastError)    return { label: "failed",  color: "#F87171" };
  if (cron.lastResult)   return { label: "ok",      color: "#34D399" };
  return { label: "not run", color: "#64748B" };
}

function fmtRan(ms: number): string {
  return new Date(ms).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

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
  const { crons, addCron, updateCron, deleteCron, runCron, cronRunning, schedule, holderTier } = useChat();
  // The zone the TIME field is written in — shown next to the label so "09:00"
  // is 09:00 somewhere in particular. `addCron` stamps this same value onto the
  // task, so what the form says and what the server fires on are one string.
  const tzLabel = localTz();
  const [showForm, setShowForm] = useState(false);
  const [viewing,  setViewing]  = useState<CronTask | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
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

  // ── NEXT 24 HOURS ────────────────────────────────────────────────────────────
  // Only a background + active task has a wall-clock instant to plot — a
  // foreground task fires "when you next open Blue Chat", which is not a time.
  // `nextFireAt` is the SAME function the server tick executes on, so a dot on
  // this axis marks a moment the scheduler will actually honour. Each cadence
  // fires at most once in any 24h window (daily = 24h, weekly = 7d), so tasks
  // and runs are one and the same here.
  const now = Date.now();
  const HORIZON = 24 * 60 * 60 * 1000;
  const upcoming = crons
    .filter(c => c.active && isBackground(c))
    .map(c => ({ cron: c, at: nextFireAt({ schedule: c.schedule, time: c.time, tz: c.tz, lastRun: c.lastRun }, now) }))
    .filter(x => x.at - now <= HORIZON)
    .sort((a, b) => a.at - b.at);
  // Upper bound: a run that produces nothing is not charged (#193), so the sum
  // is what these tasks would cost if every one produced output — hence "~".
  const upcomingCredits = upcoming.reduce((n, x) => n + creditCost(x.cron.tier ?? "pro", holderTier), 0);

  return (
    <>
    <div className="flex flex-col h-full bg-[#050508] overflow-y-auto">

      {/* ── Header — desktop only. Below lg the app shell's MobileTopBar already
           prints "// SCHEDULED", so rendering this too would duplicate it. ─── */}
      <div className="hidden lg:flex items-center gap-3.5 flex-wrap shrink-0 min-h-[48px] px-5 py-2 border-b border-[#1A1A2E]">
        <span className="font-mono text-[11px] font-semibold tracking-[0.16em] text-[#E2E8F0]">// SCHEDULED</span>
        <span className="font-mono text-[10.5px] text-[#64748B]">recurring agent runs · background tasks fire with the tab closed</span>
        <button
          onClick={() => setShowForm(v => !v)}
          className="ml-auto font-mono text-[10.5px] font-semibold rounded-[7px] px-[11px] py-[5px] transition-all"
          style={showForm
            ? { color: "#F87171", background: "rgba(248,113,113,.1)", border: "1px solid rgba(248,113,113,.3)" }
            : { color: "#050508", background: "#4FC3F7" }}
        >
          {showForm ? "✕ Cancel" : "+ Add task"}
        </button>
      </div>

      {/* ── Background scheduler state — honest about what keeps it running. ─── */}
      {(schedule.state.phase === "signed-out" || schedule.state.phase === "error") && (
        <div className="shrink-0 px-5 py-2 border-b border-[#1A1A2E]">
          <p className="font-mono text-[10px] text-[#64748B]">
            {schedule.state.phase === "signed-out"
              ? "Sign in with your wallet to keep background tasks running while this tab is closed."
              : schedule.state.message}
          </p>
        </div>
      )}

      {/* ── Add form — same wiring as before, restyled shell. ─── */}
      {showForm && (
        <div className="px-5 py-5 border-b border-[#1A1A2E] bg-[#0A0A12] shrink-0">
          <form onSubmit={handleAdd} className="space-y-3 max-w-2xl">
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
                {/* The picker decides something now: the server tick reads it
                    through `lib/cron-schedule.ts`, in the zone shown below. It
                    is still ignored for a foreground task — hence the two-line
                    explanation under the grid rather than a bare label. */}
                <label className="font-mono text-[10px] text-slate-500 block mb-1.5">
                  TIME <span className="text-slate-700">· {tzLabel}</span>
                </label>
                <input
                  type="time"
                  value={form.time}
                  onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
                  className="w-full bg-[#050508] border border-[#1A1A2E] rounded-xl px-3 py-2.5 font-mono text-sm text-white outline-none"
                />
              </div>
            </div>

            <p className="font-mono text-[10px] text-slate-700 leading-relaxed">
              The time is used once you switch the task to Background. Until then
              a daily task runs the first time you open Blue Chat after 24h have
              passed.
            </p>

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

      {/* ── Body ─── */}
      <div className="px-5 py-[18px] max-w-5xl">
        {crons.length > 0 ? (
          <>
            {/* ── NEXT 24 HOURS ─── */}
            <div className="border border-[#1A1A2E] bg-[#0D0D14] rounded-2xl px-[18px] py-4">
              <div className="flex justify-between items-baseline gap-3">
                <span className="font-mono text-[9.5px] font-medium tracking-[0.14em] text-[#64748B]">NEXT 24 HOURS</span>
                <span className="font-mono text-[10px] text-[#64748B] text-right">
                  {upcoming.length > 0
                    ? `${upcoming.length} scheduled · ~${upcomingCredits} cr est.`
                    : "no background runs due"}
                </span>
              </div>
              {upcoming.length > 0 ? (
                <>
                  <div className="relative h-14 mt-4 border-l border-r border-[#1A1A2E]">
                    <div className="absolute inset-0 flex">
                      {[0, 1, 2, 3, 4].map(i => (
                        <span key={i} className="flex-1 border-r" style={{ borderColor: "rgba(26,26,46,.6)" }} />
                      ))}
                      <span className="flex-1" />
                    </div>
                    {upcoming.map(({ cron, at }) => {
                      const pct = Math.max(0, Math.min(100, ((at - now) / HORIZON) * 100));
                      const clock = new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                      const shift = pct > 80 ? -44 : -6;
                      return (
                        <div key={cron.id}>
                          <span
                            className="absolute w-2 h-2 rounded-full"
                            style={{ left: `${pct}%`, top: 6, background: "#4FC3F7", boxShadow: "0 0 10px #4FC3F7" }}
                          />
                          <span
                            className="absolute font-mono text-[9.5px] text-[#94A3B8] whitespace-nowrap overflow-hidden"
                            style={{ left: `${pct}%`, top: 20, transform: `translateX(${shift}px)`, maxWidth: 150, textOverflow: "ellipsis" }}
                          >
                            {clock} {cron.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between mt-1.5 font-mono text-[9px] text-[#475569]">
                    <span>now</span><span>+6h</span><span>+12h</span><span>+18h</span><span>+24h</span>
                  </div>
                </>
              ) : (
                <div className="h-14 mt-4 flex items-center justify-center text-center border border-dashed border-[#1A1A2E] rounded-xl px-4">
                  <p className="font-mono text-[10px] text-[#475569] leading-relaxed">
                    No background task fires in the next 24 hours — switch a task to Background to plot it here.
                  </p>
                </div>
              )}
            </div>

            {/* ── TASKS ─── */}
            <div className="flex justify-between items-baseline gap-3 mt-6">
              <span className="font-mono text-[9.5px] font-medium tracking-[0.14em] text-[#64748B]">TASKS · {crons.length}</span>
              <span className="hidden sm:block font-mono text-[10px] text-[#64748B] text-right">Background tasks run server-side and post results into Blue Chat.</span>
            </div>

            <div className="overflow-x-auto mt-3">
              <div style={{ minWidth: 800 }}>
                {/* header row */}
                <div
                  className="grid items-center px-3.5 py-2.5 border-b border-[#1A1A2E] font-mono text-[9.5px] tracking-[0.06em] text-[#64748B]"
                  style={{ gridTemplateColumns: GRID, gap: "0 14px" }}
                >
                  <span>TASK</span><span>SCHEDULE</span><span>NEXT RUN</span><span>LAST RESULT</span><span>MODE</span>
                  <span className="text-right">COST</span>
                </div>

                {crons.map(cron => {
                  const bg   = isBackground(cron);
                  const st   = lastResultStatus(cron);
                  const cost = creditCost(cron.tier ?? "pro", holderTier);
                  const isOpen    = expanded === cron.id;
                  const isRunning = cronRunning === cron.id;
                  return (
                    <div key={cron.id}>
                      {/* ── Summary row — click to expand the controls ── */}
                      <div
                        onClick={() => setExpanded(isOpen ? null : cron.id)}
                        className="grid items-center px-3.5 py-3 border-b cursor-pointer transition-colors hover:bg-white/[0.02]"
                        style={{ gridTemplateColumns: GRID, gap: "0 14px", borderColor: "rgba(26,26,46,.55)" }}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <svg
                            className="w-3 h-3 shrink-0 transition-transform"
                            style={{ transform: isOpen ? "rotate(90deg)" : "none", color: "#475569" }}
                            viewBox="0 0 24 24" fill="none" stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                          <span className="min-w-0">
                            <span className="flex items-center gap-1.5">
                              <StatusDot active={cron.active} />
                              <span className={`font-mono text-[12px] font-medium truncate ${cron.active ? "text-[#E2E8F0]" : "text-[#64748B]"}`}>
                                {cron.label}
                              </span>
                            </span>
                            <span className="block font-mono text-[9.5px] text-[#64748B] mt-[3px] truncate">{cron.prompt}</span>
                          </span>
                        </span>
                        <span className="font-mono text-[10.5px] text-[#94A3B8]">{scheduleLabel(cron)}</span>
                        <span className="font-mono text-[10.5px] text-[#E2E8F0]">{nextRunLabel(cron)}</span>
                        <span className="font-mono text-[10.5px] font-medium" style={{ color: st.color }}>{st.label}</span>
                        <span>
                          {bg ? (
                            <span className="font-mono text-[9.5px] font-medium rounded-[5px] px-2 py-[3px]" style={{ color: "#4FC3F7", background: "rgba(79,195,247,.12)" }}>
                              Background
                            </span>
                          ) : (
                            <span className="font-mono text-[9.5px] font-medium rounded-[5px] px-2 py-[3px] border" style={{ color: "#94A3B8", borderColor: "#1A1A2E" }}>
                              On open
                            </span>
                          )}
                        </span>
                        <span className="font-mono text-[10.5px] font-medium text-[#E2E8F0] text-right">{cost} cr</span>
                      </div>

                      {/* ── Expanded controls — every real interaction the summary
                           row cannot hold: the prompt, the background switch that
                           asks for a signature, why it paused, the last error,
                           the last result, run-now, pause, delete. ── */}
                      {isOpen && (
                        <div className="border-b px-3.5 py-4 bg-[#08080E]" style={{ borderColor: "rgba(26,26,46,.55)" }}>
                          {/* model + per-run cost */}
                          <div className="flex flex-wrap items-center gap-1.5 mb-3">
                            <span className="font-mono text-[10px] px-2 py-1 rounded-md bg-[#11111A] text-[#94A3B8]">🗓 {scheduleLabel(cron)}</span>
                            <span className="font-mono text-[10px] px-2 py-1 rounded-md bg-[#11111A] text-[#64748B]">
                              {presetLabel(cron.tier)} · {cost} cr/run
                            </span>
                          </div>

                          {/* prompt */}
                          <div className="rounded-xl bg-[#050508] border border-[#1A1A2E] px-3 py-2.5 mb-3">
                            <p className="font-mono text-[8px] text-[#475569] tracking-widest mb-1">PROMPT</p>
                            <p className="font-mono text-[11px] text-[#94A3B8] leading-relaxed">{cron.prompt}</p>
                          </div>

                          {/* ── Background switch — per task, not global. Flipping
                               this on is what asks for a signature. ── */}
                          <button
                            onClick={() => (bg ? schedule.disable(cron.id) : schedule.enable(cron.id))}
                            className="w-full flex items-center justify-between rounded-xl border px-3 py-2.5 mb-3 transition-colors text-left"
                            style={{ borderColor: bg ? "#4FC3F730" : "#1A1A2E", background: bg ? "#4FC3F708" : "#050508" }}
                          >
                            <span className="min-w-0">
                              <span className="font-mono text-[11px] block" style={{ color: bg ? "#4FC3F7" : "#64748B" }}>
                                {bg ? "Runs in the background" : "Run in the background"}
                              </span>
                              <span className="font-mono text-[9px] text-[#475569] block mt-0.5">
                                {bg
                                  ? `Fires at ${cron.time} ${cron.tz ?? ""} with this tab closed`
                                  : "Switching this on asks for a signature, then it fires at its set time with the tab closed"}
                              </span>
                            </span>
                            <Toggle active={bg} onChange={() => (bg ? schedule.disable(cron.id) : schedule.enable(cron.id))} />
                          </button>

                          {/* why the scheduler switched this off */}
                          {cron.pausedReason && (
                            <div className="rounded-xl border px-3 py-2.5 mb-3" style={{ borderColor: "#F59E0B30", background: "#F59E0B08" }}>
                              <p className="font-mono text-[8px] tracking-widest mb-1" style={{ color: "#F59E0B" }}>PAUSED</p>
                              <p className="font-mono text-[11px] text-[#94A3B8] leading-relaxed">{cron.pausedReason}</p>
                            </div>
                          )}

                          {/* a run that produced nothing says so */}
                          {cron.lastError && !cron.pausedReason && (
                            <div className="rounded-xl border border-[#1A1A2E] bg-[#070710] px-3 py-2.5 mb-3">
                              <p className="font-mono text-[8px] text-[#475569] tracking-widest mb-1">LAST RUN FAILED</p>
                              <p className="font-mono text-[11px] text-[#64748B] leading-relaxed line-clamp-2">{cron.lastError}</p>
                            </div>
                          )}

                          {/* last result preview → full modal */}
                          {cron.lastResult && (
                            <button
                              onClick={() => setViewing(cron)}
                              className="w-full text-left rounded-xl bg-[#070710] border border-[#15151F] hover:border-[#4FC3F730] px-3 py-2.5 mb-3 transition-colors group"
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-mono text-[8px] text-[#475569] tracking-widest">LAST RESULT</span>
                                <span className="font-mono text-[9px] text-[#64748B] group-hover:text-[#4FC3F7] transition-colors">View full →</span>
                              </div>
                              <p className="font-mono text-[11px] text-[#94A3B8] leading-relaxed line-clamp-2">{plainPreview(cron.lastResult)}</p>
                            </button>
                          )}

                          {/* footer: last run + pause/resume + run-now + delete */}
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <p className="font-mono text-[10px] text-[#475569]">
                              {cron.lastRun ? `Ran ${fmtRan(cron.lastRun)}` : "Not run yet"}
                            </p>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => updateCron(cron.id, { active: !cron.active })}
                                className="font-mono text-[10px] px-2.5 py-1.5 rounded-lg border transition-colors"
                                style={cron.active
                                  ? { color: "#64748B", borderColor: "#1A1A2E" }
                                  : { color: "#34D399", borderColor: "#34D39930", background: "#34D39910" }}
                              >
                                {cron.active ? "Pause" : "Resume"}
                              </button>
                              <button
                                onClick={() => runCron(cron.id)}
                                disabled={isRunning}
                                className="flex items-center gap-1.5 font-mono text-[11px] font-semibold px-3 py-1.5 rounded-lg border transition-all disabled:opacity-40 shrink-0"
                                style={isRunning
                                  ? { color: "#34D399", borderColor: "#34D39930", background: "#34D39910" }
                                  : { color: "#4FC3F7", borderColor: "#4FC3F730", background: "#4FC3F710" }}
                              >
                                {isRunning ? (
                                  <>
                                    <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                                    Running
                                  </>
                                ) : (
                                  <>▶ Run now</>
                                )}
                              </button>
                              <button
                                onClick={() => deleteCron(cron.id)}
                                className="p-1.5 rounded-lg text-[#475569] hover:text-[#F87171] hover:bg-[#F87171]/10 transition-colors shrink-0"
                                title="Delete"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Composer — opens the structured form. It is a button, not a
                 text field: Blue Chat has no natural-language task parser, so a
                 "describe it in plain words" input would promise a feature that
                 isn't there. ── */}
            {!showForm && (
              <button
                onClick={() => setShowForm(true)}
                className="w-full mt-6 border border-dashed border-[#1A1A2E] rounded-2xl px-[18px] py-4 flex items-center gap-3.5 text-left hover:border-[#4FC3F7]/30 transition-colors"
              >
                <span className="font-mono text-[11px] text-[#4FC3F7]">›</span>
                <span className="flex-1 font-mono text-[11.5px] text-[#64748B]">Set up a recurring task — a prompt, a cadence, and the time it runs.</span>
                <span className="font-mono text-[10.5px] font-semibold rounded-lg px-[13px] py-2" style={{ color: "#050508", background: "#4FC3F7" }}>New task</span>
              </button>
            )}
          </>
        ) : !showForm ? (
          <div className="border border-[#1A1A2E] bg-[#0D0D14] rounded-2xl px-6 py-12 flex flex-col items-center text-center">
            <div className="w-10 h-10 rounded-xl border border-[#1A1A2E] flex items-center justify-center mb-3 text-lg">⏱</div>
            <p className="font-mono text-[13px] text-[#94A3B8] mb-1">No scheduled tasks yet</p>
            <p className="font-mono text-[10.5px] text-[#64748B] max-w-sm leading-relaxed mb-4">
              Add a recurring prompt to run daily or weekly. It runs next time you open Blue Chat, or in the background once you switch it on.
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="font-mono text-[11px] font-semibold rounded-lg px-3.5 py-2 transition-all"
              style={{ color: "#050508", background: "#4FC3F7" }}
            >
              + Add task
            </button>
          </div>
        ) : null}
      </div>
    </div>

    {/* ── Result modal — full markdown report ── */}
    {viewing && <ResultModal cron={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}

// ── Result modal ────────────────────────────────────────────────────────────────
function ResultModal({ cron, onClose }: { cron: CronTask; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-[#1A1A2E] bg-[#050508] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 h-14 border-b border-[#1A1A2E] shrink-0">
          <div className="min-w-0">
            <p className="font-mono text-[11px] text-[#4FC3F7] tracking-widest truncate">// {cron.label.toUpperCase()}</p>
            <p className="font-mono text-[9px] text-slate-600 mt-0.5">
              {/* Same rule as the card chip: the time is shown only when a
                  background task actually fires at it. `ran` is a real observed
                  timestamp (stamped by the run), so it always stays. */}
              {cron.schedule}{isBackground(cron) ? ` · ${cron.time}` : ""}
              {cron.lastRun && ` · ran ${new Date(cron.lastRun).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-600 hover:text-slate-300 hover:bg-[#1A1A2E] transition-colors shrink-0"
            title="Close (Esc)"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {/* Body — full markdown */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 font-mono text-[13px] text-slate-300 leading-relaxed">
          {cron.lastResult
            ? <MarkdownRenderer content={cron.lastResult} />
            : <p className="text-slate-600">No result yet.</p>}
        </div>
      </div>
    </div>
  );
}
