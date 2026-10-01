"use client";
/**
 * Scheduled → Price alerts. Left: what is being watched, one card each, with
 * the same live reading the 5-minute tick uses. Right: what fired. Every
 * number on a card names nothing it did not read — an unread price is "—".
 */
import Link from "next/link";
import { describeRule, describeTrade, describeCheck, MAX_WATCHES_PER_WALLET, type Watch, type WatchAlert, type WatchReading } from "@/lib/watches/types";
import type { useWatches } from "../../use-watches";
import { C, ChainBadge, SectionLabel } from "./ui";

const EXAMPLES = [
  "Alert me when ETH on Base goes above $3,000",
  "Every day at 9:00, if ETH on Base is below $2,500, buy $50",
  "Báo tôi khi NVDA trên Robinhood xuống dưới $220 rồi bán một nửa",
];

function price(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1000) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toPrecision(3)}`;
}
function pct(n: number | null | undefined) {
  if (n == null) return <span style={{ color: C.faint }}>—</span>;
  return <span style={{ color: n > 0 ? C.green : n < 0 ? C.red : C.sub }}>{n > 0 ? "+" : ""}{n.toFixed(2)}%</span>;
}
const chainName = (c: string) => (c === "base" ? "Base" : "Robinhood Chain");
const ago = (at: number) => {
  const m = Math.round((Date.now() - at) / 60_000);
  return m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : new Date(at).toLocaleDateString();
};

function WatchCard({ w, r, onToggle, onDelete }: { w: Watch; r?: WatchReading; onToggle: () => void; onDelete: () => void }) {
  const status = w.active && w.checkAt ? { t: "scheduled", c: C.green }
    : w.active ? (w.armed ? { t: "watching", c: C.green } : { t: "fired · waiting to re-arm", c: C.amber })
    : w.lastTriggeredAt ? { t: "fired", c: C.accent } : { t: "paused", c: C.dim };
  const src = r?.priceSource === "chainlink" ? (r.stale ? "Chainlink · market closed" : "Chainlink oracle")
    : r?.priceSource === "dexscreener" ? "DexScreener" : r?.priceSource === "geckoterminal" ? "GeckoTerminal" : null;
  return (
    <div className="rounded-2xl border border-[#1A1A2E] bg-[#0D0D14] px-4 py-3.5">
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-mono text-[14px] font-semibold text-[#E2E8F0] truncate">{w.symbol}</span>
        <ChainBadge chain={w.chain} />
        <span className="ml-auto flex items-center gap-1.5 font-mono text-[9.5px] shrink-0" style={{ color: status.c }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: status.c, boxShadow: w.active && w.armed ? `0 0 5px ${status.c}` : "none" }} />
          {status.t}
        </span>
      </div>
      <p className="text-[12.5px] text-[#94A3B8] mt-1.5 leading-snug">{w.checkAt ? "If " : "When "}{describeRule(w)}{!w.checkAt && w.repeat ? " · repeats" : ""}</p>
      {(w.trade || w.checkAt) && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {w.checkAt && (
            <span className="font-mono text-[9.5px] rounded-md px-1.5 py-[2px]" style={{ color: C.sub, background: "#ffffff0a" }}>
              ⏱ {describeCheck(w.checkAt)}{w.active && w.nextCheckAt ? ` · next ${new Date(w.nextCheckAt).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}` : ""}
            </span>
          )}
          {w.trade && (
            <span className="font-mono text-[9.5px] rounded-md px-1.5 py-[2px]" style={{ color: C.accent, background: "#4FC3F714" }}>
              ⚙ {describeTrade(w.trade, w.symbol, w.chain)} · you sign
            </span>
          )}
        </div>
      )}
      <div className="flex items-end gap-4 mt-3">
        <div>
          <p className="font-mono text-[9px] tracking-[0.12em] text-[#475569]">NOW</p>
          <p className="font-mono text-[15px] text-[#E2E8F0]">{price(r?.priceUsd)}</p>
        </div>
        <div>
          <p className="font-mono text-[9px] tracking-[0.12em] text-[#475569]">1H</p>
          <p className="font-mono text-[12px]">{pct(r?.change1h)}</p>
        </div>
        <div>
          <p className="font-mono text-[9px] tracking-[0.12em] text-[#475569]">24H</p>
          <p className="font-mono text-[12px]">{pct(r?.change24h)}</p>
        </div>
        <div className="ml-auto flex gap-1.5">
          <button onClick={onToggle} className="font-mono text-[10px] whitespace-nowrap px-2.5 py-1.5 rounded-lg border border-[#1A1A2E] text-[#94A3B8] hover:text-white hover:border-[#2A2A4E]">
            {w.active ? "Pause" : "Re-arm"}
          </button>
          <button onClick={onDelete} title="Delete" className="p-1.5 rounded-lg text-[#475569] hover:text-[#F87171] hover:bg-[#F87171]/10">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>
      </div>
      {src && <p className="font-mono text-[9px] text-[#475569] mt-2">price: {src}</p>}
    </div>
  );
}

function AlertRow({ a, unread }: { a: WatchAlert; unread: boolean }) {
  return (
    <li className="relative pl-4">
      <span className="absolute left-0 top-[7px] w-1.5 h-1.5 rounded-full" style={{ background: unread ? C.accent : "#2A2A3E", boxShadow: unread ? `0 0 6px ${C.accent}` : "none" }} />
      <p className={`text-[12.5px] leading-snug ${unread ? "text-[#E2E8F0]" : "text-[#94A3B8]"}`}>{a.text}</p>
      <p className="font-mono text-[9.5px] text-[#475569] mt-1 flex items-center gap-2">
        <span>{ago(a.at)}</span>
        {a.trade
          ? <Link className="text-[#4FC3F7] hover:underline" href="/chat?alerts=1">Review &amp; sign the prepared trade →</Link>
          : <Link className="hover:text-[#4FC3F7]" href={`/chat?prefill=${encodeURIComponent(`Check ${a.token} on ${chainName(a.chain)}`)}`}>Open in chat →</Link>}
      </p>
    </li>
  );
}

export default function AlertsTab({ w, onNew }: { w: ReturnType<typeof useWatches>; onNew: () => void }) {
  const st = w.state;
  if (st.s === "no-wallet") return <Empty title="Connect your wallet" body="Price alerts belong to a wallet — connect one to set and see them." />;
  if (st.s === "signed-out") return (
    <Empty title="Sign in to see your alerts" body="One signature proves the wallet is yours. Alerts are free and checked every 5 minutes.">
      <button onClick={() => void w.signIn()} className="font-mono text-[11px] font-semibold rounded-lg px-3.5 py-2" style={{ color: C.page, background: C.accent }}>Sign in</button>
    </Empty>
  );
  if (st.s === "loading") return <p className="font-mono text-[11px] text-slate-600 py-8 text-center">Loading alerts…</p>;
  if (st.s === "error") return <Empty title="Could not load alerts" body={st.msg}><button onClick={() => void w.refresh(true)} className="font-mono text-[11px] underline text-slate-400">Retry</button></Empty>;

  if (st.watches.length === 0 && st.alerts.length === 0) {
    return (
      <Empty title="No alerts or automations yet" body="Watch a token or stock token for a price level or a % move — and optionally prepare a buy or sell for when it happens. You always sign; nothing executes on its own. Free, up to 20.">
        <button onClick={onNew} className="font-mono text-[11px] font-semibold rounded-lg px-3.5 py-2" style={{ color: C.page, background: C.accent }}>+ Price alert</button>
        <div className="flex flex-wrap justify-center gap-1.5 mt-4">
          {EXAMPLES.map((e) => (
            <Link key={e} href={`/chat?prefill=${encodeURIComponent(e)}`}
              className="font-mono text-[10px] px-2.5 py-1 rounded-lg border border-[#1A1A2E] text-slate-500 hover:text-[#4FC3F7] hover:border-[#4FC3F7]/30">
              “{e}”
            </Link>
          ))}
        </div>
        <p className="font-mono text-[9.5px] text-[#475569] mt-2">…or just say it in chat.</p>
      </Empty>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <section>
        <SectionLabel right={`${st.watches.length}/${MAX_WATCHES_PER_WALLET} · free`}>ALERTS &amp; AUTOMATIONS</SectionLabel>
        {st.watches.length === 0 ? (
          <button onClick={onNew} className="w-full border border-dashed border-[#1A1A2E] rounded-2xl px-4 py-6 font-mono text-[11px] text-[#64748B] hover:border-[#4FC3F7]/30">+ Add a price alert</button>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {st.watches.map((x) => (
              <WatchCard key={x.id} w={x} r={st.readings[x.id]}
                onToggle={() => void w.setActive(x.id, !x.active)}
                onDelete={() => void w.remove(x.id)} />
            ))}
          </div>
        )}
      </section>
      <section>
        <SectionLabel right={st.unread > 0 ? `${st.unread} new` : undefined}>FIRED</SectionLabel>
        <div className="rounded-2xl border border-[#1A1A2E] bg-[#0D0D14] px-4 py-4">
          {st.alerts.length === 0 ? (
            <p className="font-mono text-[11px] text-[#475569]">Nothing has fired yet. When one does it lands here and in the “🔔 Price alerts” chat.</p>
          ) : (
            <ul className="space-y-3.5 max-h-[520px] overflow-y-auto pr-1">
              {st.alerts.map((a) => <AlertRow key={a.id} a={a} unread={a.at > st.seenAt} />)}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function Empty({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="border border-[#1A1A2E] bg-[#0D0D14] rounded-2xl px-6 py-12 flex flex-col items-center text-center">
      <div className="w-10 h-10 rounded-xl border border-[#1A1A2E] flex items-center justify-center mb-3 text-lg">🔔</div>
      <p className="font-mono text-[13px] text-[#94A3B8] mb-1">{title}</p>
      <p className="font-mono text-[10.5px] text-[#64748B] max-w-md leading-relaxed mb-4">{body}</p>
      {children}
    </div>
  );
}
