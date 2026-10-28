"use client";

// Signed-in views of the Agents mode (R2): Sell services, My Usage, Following,
// and the Follow button on seller profiles. Each reads the wallet's own SIWE
// session through /api/exchange/*; nothing here moves money.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { ConnectButton } from "@/components/ConnectModal";
import { useEnsureSession } from "@/hooks/useEnsureSession";
import { sessionFetch } from "@/lib/session-client";

const card = "rounded-[14px] border border-[#1A1A2E] bg-[#0D0D14]";
const input = "w-full rounded-lg border border-[#1A1A2E] bg-[#050508] px-3 py-2 text-[11px] text-[#E2E8F0] outline-none focus:border-[#4FC3F7]/40";
const btn = "text-[10.5px] font-semibold text-[#050508] bg-[#4FC3F7] hover:bg-[#29ABE2] disabled:opacity-50 rounded-[8px] px-[13px] py-2";
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const usd = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(3)}`);
const H = ({ t, s }: { t: string; s?: string }) => (
  <div className="flex items-baseline gap-2.5 mt-[22px] mb-3 flex-wrap">
    <span className="text-[9.5px] font-medium tracking-[0.14em] text-[#64748B]">{t}</span>
    {s && <span className="text-[10px] text-[#475569]">{s}</span>}
  </div>
);

/** Loads a session-gated JSON endpoint for the connected wallet; signs in on demand. */
function useSessionJson<T>(path: string) {
  const { address } = useAccount();
  const { fetchWithSession } = useEnsureSession();
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!address) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetchWithSession(address, path, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      setData(d as T);
    } catch (e) { setErr((e as Error).message.slice(0, 200)); } finally { setBusy(false); }
  }, [address, fetchWithSession, path]);
  return { address, data, err, busy, load, setData, fetchWithSession };
}

function Gate({ label, children, onLoad, loaded, busy, err }: { label: string; children: React.ReactNode; onLoad: () => void; loaded: boolean; busy: boolean; err: string | null }) {
  const { isConnected } = useAccount();
  if (!isConnected) return <div className={`${card} p-4 flex items-center gap-3 flex-wrap`}><span className="text-[11px] text-[#94A3B8] flex-1">Connect the wallet you use on Base.</span><ConnectButton label={label} /></div>;
  if (!loaded) return (
    <div className={`${card} p-4 flex items-center gap-3 flex-wrap`}>
      <span className="text-[11px] text-[#94A3B8] flex-1">{err ?? "Sign one message (no gas, no payment) so we know this wallet is yours."}</span>
      <button className={btn} disabled={busy} onClick={onLoad}>{busy ? "Signing in…" : "Sign in & load"}</button>
    </div>
  );
  return <>{children}</>;
}

// ── Sell services ────────────────────────────────────────────────────────────

interface Listing { payTo: string; domain: string; name: string; description: string; services: { url: string; priceUsd: number | null; description: string; probe: string }[]; verifiedAt: string }

export function SellView() {
  const s = useSessionJson<{ wallet: string; listing: Listing | null }>("/api/exchange/listing");
  const [domain, setDomain] = useState("");
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [claim, setClaim] = useState<{ domain: string; token: string; file: object } | null>(null);
  const [st, setSt] = useState<{ busy: boolean; msg?: string; ok?: boolean }>({ busy: false });

  async function post(body: object) {
    if (!s.address) return null;
    setSt({ busy: true });
    try {
      const r = await s.fetchWithSession(s.address, "/api/exchange/listing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      setSt({ busy: false });
      return d;
    } catch (e) { setSt({ busy: false, msg: (e as Error).message.slice(0, 240) }); return null; }
  }

  const listing = s.data?.listing ?? null;
  return (
    <Gate label="Connect your payTo wallet" onLoad={s.load} loaded={!!s.data} busy={s.busy} err={s.err}>
      {listing ? (
        <div className={`${card} p-4`}>
          <p className="text-[12px] font-semibold text-[#E2E8F0]">{listing.name} <span className="ml-1.5 text-[8.5px] rounded-full border border-[#34D399]/30 px-[7px] py-[2px] text-[#34D399]">✓ listed</span></p>
          <p className="mt-1 text-[10.5px] text-[#94A3B8]">{listing.domain} · payTo {short(listing.payTo)} · verified {listing.verifiedAt.slice(0, 10)}</p>
          <ul className="mt-3 space-y-1">
            {listing.services.map((x) => (
              <li key={x.url} className="flex gap-2 text-[10.5px]">
                <span className={x.probe === "live" ? "text-[#34D399]" : "text-[#F59E0B]"}>{x.probe === "live" ? "✓ live 402" : x.probe}</span>
                <span className="truncate text-[#94A3B8]">{x.url}</span>
                {x.priceUsd !== null && <span className="ml-auto text-[#E2E8F0]">${x.priceUsd}</span>}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <Link className="text-[10.5px] text-[#4FC3F7]" href={`/exchange/${listing.payTo}`}>Your public page →</Link>
            <button className="ml-auto text-[10.5px] text-[#94A3B8] hover:text-[#F87171]" disabled={st.busy}
              onClick={async () => { if (await post({ action: "unlist" })) s.setData({ wallet: s.data!.wallet, listing: null }); }}>Unlist</button>
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className={`${card} p-4`}>
            <p className="text-[10px] tracking-[0.12em] text-[#64748B]">STEP 1 · YOUR DOMAIN</p>
            <p className="mt-1 text-[10.5px] text-[#94A3B8]">The domain your x402 services run on. The signed-in wallet {s.data ? short(s.data.wallet) : ""} must be the payTo they ask to be paid at.</p>
            <div className="mt-2.5 flex gap-2">
              <input className={input} placeholder="api.example.com" value={domain} onChange={(e) => setDomain(e.target.value)} />
              <button className={btn} disabled={st.busy || !domain.trim()} onClick={async () => { const d = await post({ action: "start", domain }); if (d) setClaim(d); }}>Get proof file</button>
            </div>
          </div>
          {claim && (
            <div className={`${card} p-4`}>
              <p className="text-[10px] tracking-[0.12em] text-[#64748B]">STEP 2 · PUBLISH THE PROOF</p>
              <p className="mt-1 text-[10.5px] text-[#94A3B8]">Serve this JSON at <span className="text-[#E2E8F0]">https://{claim.domain}/.well-known/blueagent-agent.json</span>. It is valid for 2 days.</p>
              <pre className="mt-2 rounded-lg border border-[#1A1A2E] bg-[#050508] p-3 text-[10.5px] text-[#cbd5e1] whitespace-pre-wrap break-all">{JSON.stringify(claim.file, null, 2)}</pre>
              <p className="mt-3 text-[10px] tracking-[0.12em] text-[#64748B]">STEP 3 · VERIFY</p>
              <p className="mt-1 text-[10.5px] text-[#94A3B8]">We read your proof, import https://{claim.domain}/.well-known/x402 and call each Base service unpaid. A service passes when its 402 asks for USDC on Base to your wallet.</p>
              <div className="mt-2.5 grid gap-2 md:grid-cols-2">
                <input className={input} placeholder="Agent name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
                <input className={input} placeholder="One line: what it does" maxLength={400} value={desc} onChange={(e) => setDesc(e.target.value)} />
              </div>
              <button className={`${btn} mt-2.5`} disabled={st.busy} onClick={async () => { const d = await post({ action: "verify", name, description: desc }); if (d) s.setData({ wallet: s.data!.wallet, listing: d.listing }); }}>
                {st.busy ? "Checking…" : "Verify & list"}
              </button>
            </div>
          )}
        </div>
      )}
      {st.msg && <p className="mt-2 text-[10.5px] text-[#F87171]">{st.msg}</p>}
    </Gate>
  );
}

// ── My Usage ─────────────────────────────────────────────────────────────────

interface Usage {
  wallet: string;
  blueAgent: { ts: number; tool: string; units: number; tx?: string; src?: string }[] | null;
  hires: { at: string; payTo: string; url: string; status: number; tx: string | null; units: string | null }[];
  jobsPosted: { id: string; title: string; budgetUnits: number; status: string; createdAt: string; deliveries: unknown[] }[];
  jobsDelivered: { jobId: string; title: string; priceUnits: number; unlocked: boolean; tx: string | null }[];
}

const Tx = ({ tx }: { tx: string | null | undefined }) => tx ? <a className="text-[#4FC3F7]" href={`https://basescan.org/tx/${tx}`} target="_blank" rel="noreferrer">{short(tx)} ↗</a> : <span className="text-[#475569]">no tx</span>;

export function UsageView() {
  const s = useSessionJson<Usage>("/api/exchange/usage");
  const u = s.data;
  const blueTotal = (u?.blueAgent ?? []).reduce((a, r) => a + r.units, 0) / 1e6;
  const hireTotal = (u?.hires ?? []).reduce((a, r) => a + (r.status === 200 && r.units ? Number(r.units) : 0), 0) / 1e6;
  return (
    <Gate label="Connect wallet to see usage" onLoad={s.load} loaded={!!u} busy={s.busy} err={s.err}>
      {u && (
        <>
          <div className="grid gap-2.5 grid-cols-2 md:grid-cols-4">
            {[
              ["BLUE AGENT TOOLS", u.blueAgent === null ? "—" : usd(blueTotal), `${u.blueAgent?.length ?? 0} paid calls · Base`],
              ["HIRED SELLERS", usd(hireTotal), `${u.hires.length} hires · Base`],
              ["JOBS POSTED", String(u.jobsPosted.length), "on /jobs"],
              ["JOBS DELIVERED", String(u.jobsDelivered.length), `${u.jobsDelivered.filter((d) => d.unlocked).length} paid`],
            ].map(([l, v, sub]) => (
              <div key={l} className={`${card} p-[14px]`}>
                <p className="text-[9.5px] tracking-[0.12em] text-[#64748B]">{l}</p>
                <p className="mt-1.5 text-[18px] font-semibold text-[#E2E8F0] tabular-nums">{v}</p>
                <p className="mt-0.5 text-[9.5px] text-[#475569]">{sub}</p>
              </div>
            ))}
          </div>
          <H t="HIRED THROUGH BLUE AGENT" s="paid straight to each seller; their answer as they gave it" />
          {u.hires.length === 0 ? <p className="text-[10.5px] text-[#64748B]">No hires yet. Open any seller on <Link className="text-[#4FC3F7]" href="/exchange">Agents</Link> and press Hire.</p> : (
            <ul className={`${card} overflow-hidden`}>
              {u.hires.map((h, i) => (
                <li key={i} className="flex flex-wrap items-center gap-3 border-t border-[#1A1A2E] px-4 py-2.5 text-[10.5px] first:border-t-0">
                  <span className={h.status === 200 ? "text-[#34D399]" : "text-[#F59E0B]"}>{h.status === 200 ? `paid ${h.units ? usd(Number(h.units) / 1e6) : ""}` : `HTTP ${h.status}`}</span>
                  <Link className="truncate max-w-[340px] text-[#94A3B8] hover:text-[#E2E8F0]" href={`/exchange/${h.payTo}`}>{h.url}</Link>
                  <span className="text-[#64748B]">{h.at.slice(0, 16).replace("T", " ")}Z</span>
                  <span className="ml-auto"><Tx tx={h.tx} /></span>
                </li>
              ))}
            </ul>
          )}
          <H t="BLUE AGENT TOOLS" s="x402 and MCP calls this wallet paid for" />
          {u.blueAgent === null ? <p className="text-[10.5px] text-[#64748B]">Receipts unreadable right now.</p> : u.blueAgent.length === 0 ? <p className="text-[10.5px] text-[#64748B]">No paid tool calls yet.</p> : (
            <ul className={`${card} overflow-hidden`}>
              {u.blueAgent.map((r, i) => (
                <li key={i} className="flex flex-wrap items-center gap-3 border-t border-[#1A1A2E] px-4 py-2.5 text-[10.5px] first:border-t-0">
                  <span className="text-[#E2E8F0]">{r.tool}</span>
                  <span className="text-[#34D399]">{usd(r.units / 1e6)}</span>
                  <span className="text-[#64748B]">{new Date(r.ts).toISOString().slice(0, 16).replace("T", " ")}Z</span>
                  <span className="ml-auto"><Tx tx={r.tx} /></span>
                </li>
              ))}
            </ul>
          )}
          <H t="JOBS" />
          {u.jobsPosted.length + u.jobsDelivered.length === 0 ? <p className="text-[10.5px] text-[#64748B]">None yet. <Link className="text-[#4FC3F7]" href="/jobs">Open the job board</Link>.</p> : (
            <ul className={`${card} overflow-hidden`}>
              {u.jobsPosted.map((j) => (
                <li key={j.id} className="flex flex-wrap items-center gap-3 border-t border-[#1A1A2E] px-4 py-2.5 text-[10.5px] first:border-t-0">
                  <span className="text-[#64748B]">posted</span>
                  <Link className="truncate text-[#E2E8F0] hover:text-[#4FC3F7]" href={`/jobs/${j.id}`}>{j.title}</Link>
                  <span className="ml-auto text-[#94A3B8]">{usd(j.budgetUnits / 1e6)} · {j.deliveries.length} deliveries</span>
                </li>
              ))}
              {u.jobsDelivered.map((d, i) => (
                <li key={`d${i}`} className="flex flex-wrap items-center gap-3 border-t border-[#1A1A2E] px-4 py-2.5 text-[10.5px] first:border-t-0">
                  <span className="text-[#64748B]">delivered</span>
                  <Link className="truncate text-[#E2E8F0] hover:text-[#4FC3F7]" href={`/jobs/${d.jobId}`}>{d.title}</Link>
                  <span className="ml-auto">{d.unlocked ? <Tx tx={d.tx} /> : <span className="text-[#94A3B8]">{usd(d.priceUnits / 1e6)} · not unlocked</span>}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Gate>
  );
}

// ── Following ────────────────────────────────────────────────────────────────

interface Followed { payTo: string; host: string | null; title: string; usd: number; paidCalls: number; payers: number; series: number[] }

function Spark({ v }: { v: number[] }) {
  const m = Math.max(...v, 1e-9);
  const pts = v.map((x, i) => `${(i / Math.max(v.length - 1, 1)) * 80},${20 - (x / m) * 18}`).join(" ");
  return <svg width="80" height="20" className="shrink-0"><polyline points={pts} fill="none" stroke="#4FC3F7" strokeWidth="1.2" /></svg>;
}

export function FollowingView() {
  const s = useSessionJson<{ follows: string[]; sellers: Followed[]; daysCovered: number; readable: boolean }>("/api/exchange/follow?detail=1");
  const d = s.data;
  return (
    <Gate label="Connect wallet to see who you follow" onLoad={s.load} loaded={!!d} busy={s.busy} err={s.err}>
      {d && (d.sellers.length === 0 ? (
        <p className="text-[10.5px] text-[#64748B]">You follow nobody yet. Press Follow on any seller page from <Link className="text-[#4FC3F7]" href="/exchange">Agents</Link>.</p>
      ) : (
        <div className="space-y-1.5">
          {d.sellers.map((x) => (
            <Link key={x.payTo} href={`/exchange/${x.payTo}`} className={`${card} flex items-center gap-3 px-4 py-2.5 hover:border-[#4FC3F7]/45`}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-semibold text-[#E2E8F0]">{x.host ?? short(x.payTo)}</p>
                <p className="truncate text-[10.5px] text-[#94A3B8]">{x.title || "—"}</p>
                <p className="text-[9px] text-[#475569]">{x.paidCalls.toLocaleString("en-US")} paid calls · {x.payers} wallets · {short(x.payTo)}</p>
              </div>
              <Spark v={x.series} />
              <div className="w-[100px] shrink-0 text-right">
                <p className="text-[12px] font-semibold text-[#E2E8F0] tabular-nums">{d.readable ? usd(x.usd) : "—"}</p>
                <p className="text-[9px] text-[#475569]">{d.daysCovered}d · Base</p>
              </div>
            </Link>
          ))}
        </div>
      ))}
    </Gate>
  );
}

/** Follow/unfollow a seller from its profile. Reads state only once signed in. */
export function FollowButton({ payTo }: { payTo: string }) {
  const { address, isConnected } = useAccount();
  const { fetchWithSession } = useEnsureSession();
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const p = payTo.toLowerCase();
  // Existing session only: never prompts a signature just to paint the button.
  useEffect(() => {
    setOn(null);
    if (!address) return;
    sessionFetch("/api/exchange/follow", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setOn((d.follows as string[]).includes(p)); }).catch(() => {});
  }, [address, p]);
  if (!isConnected || !address) return null;
  async function toggle() {
    setBusy(true);
    try {
      const next = on === null ? true : !on;
      const r = await fetchWithSession(address!, "/api/exchange/follow", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ payTo: p, on: next }) });
      const d = await r.json();
      if (r.ok) setOn((d.follows as string[]).includes(p));
    } finally { setBusy(false); }
  }
  return (
    <button type="button" onClick={toggle} disabled={busy}
      className={`text-[10.5px] rounded-[7px] px-2.5 py-[5px] border transition-colors ${on ? "border-[#4FC3F7]/50 text-[#4FC3F7]" : "border-[#1A1A2E] text-[#94A3B8] hover:text-[#E2E8F0]"}`}>
      {busy ? "…" : on ? "✓ Following" : "+ Follow"}
    </button>
  );
}
