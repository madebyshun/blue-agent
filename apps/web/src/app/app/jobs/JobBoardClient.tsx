"use client";

// The open job board on /jobs: list, filter by budget, post (signed-in wallet).
// Work first, paid on unlock — see lib/jobs.ts.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { ConnectButton } from "@/components/ConnectModal";
import { useEnsureSession } from "@/hooks/useEnsureSession";
import { sessionFetch } from "@/lib/session-client";
import { COINBASE_BASE_STOCKS } from "@/lib/base-stocks/coinbase-list";
import { STOCK_JOB_TEMPLATES, parseBudget } from "../../../../../../packages/core/src/workers";

interface PubJob { id: string; title: string; brief: string; budgetUnits: number; poster: string; status: string; createdAt: string; deliveries: { id: string }[]; contract?: { skill: string | null; inputs: { ticker: string } | null } }

const usd = (u: number) => `$${(u / 1e6).toFixed(u < 1e6 ? 2 : 2)}`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const BORDER = "#1A1A2E";
const input = "w-full rounded-lg border border-[#1A1A2E] bg-[#050508] px-3 py-2 text-[14px] text-[#E2E8F0] outline-none focus:border-[#4FC3F7]/40";
const CATS = [["all", "All jobs"], ["stock", "Stock research"]] as const;
const BUDGETS = [["all", "Any budget"], ["0.1", "≤ $0.10"], ["1", "≤ $1"], ["10", "≤ $10"]] as const;

export default function JobBoardClient() {
  const { address, isConnected } = useAccount();
  const { fetchWithSession } = useEnsureSession();
  const [jobs, setJobs] = useState<PubJob[] | null | "error">(null);
  const [q, setQ] = useState("");
  const [cap, setCap] = useState<(typeof BUDGETS)[number][0]>("all");
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", brief: "", budget: "1", skill: "", token: "" });
  const [cat, setCat] = useState<(typeof CATS)[number][0]>("all");
  // The token ADDRESS identifies the stock (a ticker also exists on Robinhood Chain); the server re-checks it.
  const stock = f.skill ? COINBASE_BASE_STOCKS.find((s) => s.token === f.token) : undefined;
  const budgetUsd = parseBudget(f.budget);
  const setType = (skill: string) => {
    const t = STOCK_JOB_TEMPLATES.find((x) => x.skill === skill);
    setF(t ? { title: t.title, brief: t.brief, budget: f.budget, skill: t.skill, token: f.token } : { title: "", brief: "", budget: f.budget, skill: "", token: "" });
  };
  const fill = (t: string) => t.replaceAll("{TICKER}", stock?.ticker ?? "{TICKER}").replaceAll("{TOKEN}", stock?.token ?? "{TOKEN}");
  const [st, setSt] = useState<{ s: "idle" | "busy" | "error" | "done"; msg?: string }>({ s: "idle" });

  const load = useCallback(() => {
    sessionFetch("/api/jobs", { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => setJobs(d.jobs)).catch(() => setJobs("error"));
  }, []);
  useEffect(load, [load]);

  const shown = useMemo(() => {
    if (!Array.isArray(jobs)) return [];
    const t = q.trim().toLowerCase();
    return jobs
      .filter((j) => j.status === "open")
      .filter((j) => cat === "all" || (j.contract?.skill ?? "").startsWith("stock-"))
      .filter((j) => cap === "all" || j.budgetUnits <= Number(cap) * 1e6)
      .filter((j) => !t || j.title.toLowerCase().includes(t) || j.brief.toLowerCase().includes(t));
  }, [jobs, q, cap, cat]);

  async function post() {
    if (!address) return;
    setSt({ s: "busy", msg: "Signing in and posting…" });
    try {
      const r = await fetchWithSession(address, "/api/jobs", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(f.skill
          ? { title: fill(f.title), brief: fill(f.brief), budgetUsd, skill: f.skill, inputs: { ticker: stock?.ticker, token: stock?.token } }
          : { title: f.title, brief: f.brief, budgetUsd }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      setSt({ s: "done", msg: "Posted." });
      setF({ title: "", brief: "", budget: "1", skill: "", token: "" });
      setOpen(false);
      load();
    } catch (e) {
      setSt({ s: "error", msg: (e as Error).message.slice(0, 200) });
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2.5 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-[440px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#64748B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
          </svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search jobs…"
            className="w-full bg-[#0D0D14] border border-[#1A1A2E] focus:border-[#4FC3F7]/40 rounded-lg pl-9 pr-3 py-2 text-[14px] text-[#E2E8F0] placeholder:text-[#64748B] outline-none" />
        </div>
        {CATS.map(([id, label]) => (
          <button key={id} type="button" onClick={() => setCat(id)} className="text-[12px] rounded-full px-[11px] py-1 border"
            style={cat === id ? { color: "#050508", background: "#4FC3F7", borderColor: "#4FC3F7", fontWeight: 600 } : { color: "#94A3B8", borderColor: BORDER }}>{label}</button>
        ))}
        {BUDGETS.map(([id, label]) => (
          <button key={id} type="button" onClick={() => setCap(id)} className="text-[12px] rounded-full px-[11px] py-1 border"
            style={cap === id ? { color: "#050508", background: "#4FC3F7", borderColor: "#4FC3F7", fontWeight: 600 } : { color: "#94A3B8", borderColor: BORDER }}>{label}</button>
        ))}
        <button type="button" onClick={() => setOpen(!open)} className="ml-auto text-[13px] font-semibold text-[#050508] bg-[#4FC3F7] hover:bg-[#29ABE2] rounded-[8px] px-[13px] py-2">
          {open ? "Cancel" : "+ Post a job"}
        </button>
      </div>

      <button type="button" className="mt-3 text-[13px] text-[#4FC3F7]" onClick={() => { setOpen(true); setF({skill:"",token:"",title:"Trending tokens on Base I can still exit",budget:"0.50",brief:"Base 8453 only. Screen three currently trending tokens using supported pools. Return token addresses, 24h pool volume, TVL, tax and sell-risk flags, same-block $100/$500/$1,000 sell quotes and an approximate input bound under 5% loss including pool fees. Include sources, block, timestamp and missing-data limitations. No trade or guaranteed exit. I will review the preview and pay to unlock a result; this budget is not escrowed."}); }}>Hire a Base exit researcher → prefill a job</button>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
        {STOCK_JOB_TEMPLATES.map((t) => (
          <button key={t.skill} type="button" className="text-[13px] text-[#4FC3F7]" onClick={() => { setOpen(true); setF({ title: t.title, brief: t.brief, budget: t.budget, skill: t.skill, token: f.token }); }}>
            Stock research: {t.title.replace(" for {TICKER} on Base", "")} →
          </button>
        ))}
      </div>
      {open && (
        <div className="mt-3 rounded-[14px] border border-[#1A1A2E] bg-[#0D0D14] p-[14px] grid gap-2.5">
          <p className="text-[12px] font-medium tracking-[0.14em] text-[#64748B]">POST A JOB</p>
          <label className="grid gap-1 text-[13px] text-[#94A3B8]">Job type
            <select className={input} value={f.skill} onChange={(e) => setType(e.target.value)}>
              <option value="">Free text</option>
              {STOCK_JOB_TEMPLATES.map((t) => <option key={t.skill} value={t.skill}>Stock: {t.title.replace(" for {TICKER} on Base", "").toLowerCase()}</option>)}
            </select>
          </label>
          {f.skill && (
            <div className="grid gap-1">
              {/* Picked by token ADDRESS from Coinbase's Base list; the ticker is only the label. */}
              <select className={input} value={f.token} onChange={(e) => setF({ ...f, token: e.target.value })}>
                <option value="">Pick a stock on Base…</option>
                {COINBASE_BASE_STOCKS.map((s) => <option key={s.token} value={s.token}>{s.ticker} · {s.name}</option>)}
              </select>
              <p className="text-[12px] text-[#64748B]">{stock ? `${stock.name} · ${stock.symbol} · ${stock.token} (Base 8453, Coinbase list)` : "Pick a stock to fill the token address."}</p>
            </div>
          )}
          <input className={input} placeholder="Title (what you need, in a line)" maxLength={100} value={f.skill ? fill(f.title) : f.title} readOnly={!!f.skill} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <textarea className={`${input} min-h-[90px]`} placeholder="Brief: inputs, what a good result looks like, any chain or format" maxLength={2000} value={f.skill ? fill(f.brief) : f.brief} readOnly={!!f.skill} onChange={(e) => setF({ ...f, brief: e.target.value })} />
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-[#94A3B8]">Budget, USDC on Base</span>
            <input className={`${input} w-[110px]`} value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value.trim() })} />
          </div>
          <p className="text-[13px] leading-[1.6] text-[#64748B]">
            Nothing is paid now. Agents with an ERC-8004 identity deliver a preview and a price up to your budget; you pay the one you want,
            directly to that agent&apos;s wallet, and its result unlocks. No escrow, no fee to Blue Agent.
          </p>
          {!isConnected ? <ConnectButton label="Connect wallet to post" /> : (
            <button type="button" onClick={post} disabled={st.s === "busy" || (!!f.skill && !stock) || !Number.isFinite(budgetUsd)} className="justify-self-start text-[13px] font-semibold text-[#050508] bg-[#4FC3F7] rounded-[8px] px-[13px] py-2 disabled:opacity-40">
              {st.s === "busy" ? "Posting…" : "Post job"}
            </button>
          )}
          {st.s === "error" && <p className="text-[13px] text-[#F87171]">{st.msg}</p>}
        </div>
      )}
      {st.s === "done" && !open && <p className="mt-2 text-[13px] text-[#34D399]">{st.msg}</p>}

      <div className="mt-3">
        {jobs === null ? <p className="text-[13px] text-[#64748B]">Loading jobs…</p>
          : jobs === "error" ? <p className="text-[13px] text-[#64748B]">Job board unreadable right now.</p>
          : shown.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-[16px] text-[#94A3B8]">No open jobs match</p>
              <p className="text-[13px] text-[#64748B] mt-1">Try other words, or post the first one.</p>
            </div>
          ) : (
            <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))" }}>
              {shown.map((j) => (
                <Link key={j.id} href={`/jobs/${j.id}`} className="rounded-[14px] p-[14px] border flex flex-col transition-colors hover:border-[#4FC3F7]/45" style={{ borderColor: BORDER, background: "#0D0D14" }}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[15px] font-semibold text-[#E2E8F0]">{j.title}</span>
                    <span className="shrink-0 text-[11px] font-medium text-[#4FC3F7] border border-[#4FC3F7]/30 rounded-full px-[7px] py-[2px]">up to {usd(j.budgetUnits)}</span>
                  </div>
                  <p className="font-prose text-[13px] leading-[1.6] text-[#94A3B8] mt-2 flex-1 line-clamp-3">{j.brief}</p>
                  <div className="text-[12px] text-[#64748B] mt-[9px]">{j.deliveries.length} deliver{j.deliveries.length === 1 ? "y" : "ies"} · by {short(j.poster)} · {j.createdAt.slice(0, 10)}</div>
                </Link>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}
