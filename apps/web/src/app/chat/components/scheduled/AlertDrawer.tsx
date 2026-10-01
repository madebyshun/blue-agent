"use client";
/**
 * "+ Price alert" drawer. The preview sentence is the same `describeRule` the
 * server, the chat card and the watch cards print, so what the user reads
 * here is exactly what gets armed. The server still resolves the token and
 * its price source — this form only says what to watch.
 */
import { useState } from "react";
import { describeWatch, CASH, type WatchTrade, type WatchCheckAt } from "@/lib/watches/types";
import { localTz } from "@/lib/cron-schedule";
import { QUANTITY_WORD_RE, wordToBps } from "@/lib/wallet/amount";
import { Drawer, Field, Segmented, inputCls, C } from "./ui";

type Kind = "price" | "change";

export default function AlertDrawer({ open, onClose, create }: {
  open: boolean;
  onClose: () => void;
  create: (body: Record<string, unknown>) => Promise<{ ok: boolean; error?: string; data?: { rule?: string } }>;
}) {
  const [chain, setChain] = useState<"base" | "robinhood">("base");
  const [kind, setKind] = useState<Kind>("price");
  const [dir, setDir] = useState<"up" | "down">("up");
  const [token, setToken] = useState("");
  const [threshold, setThreshold] = useState("");
  const [window, setWindow] = useState<"1h" | "24h">("24h");
  const [repeat, setRepeat] = useState(false);
  const [onFire, setOnFire] = useState<"alert" | "buy" | "sell">("alert");
  const [tradeAmt, setTradeAmt] = useState("");
  const [when, setWhen] = useState<"continuous" | "scheduled">("continuous");
  const [sched, setSched] = useState<"daily" | "weekly">("daily");
  const [time, setTime] = useState("09:00");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const n = Number(threshold);
  const direction = kind === "price" ? (dir === "up" ? "above" : "below") : dir;
  const tradeOk = onFire === "alert"
    || (onFire === "buy" && Number(tradeAmt) > 0)
    || (onFire === "sell" && ((QUANTITY_WORD_RE.test(tradeAmt.trim()) && wordToBps(tradeAmt.trim()) != null) || Number(tradeAmt) > 0));
  const trade: WatchTrade | undefined = onFire === "alert" ? undefined : { side: onFire, amount: tradeAmt.trim().replace(/^\$/, "") };
  const checkAt: WatchCheckAt | undefined = when === "scheduled" ? { schedule: sched, time } : undefined;
  const valid = token.trim().length > 0 && Number.isFinite(n) && n > 0 && (kind === "price" || (n >= 1 && n <= 1000)) && tradeOk;
  const symbol = token.trim().length > 14 ? `${token.trim().slice(0, 6)}…${token.trim().slice(-4)}` : token.trim().toUpperCase();
  const preview = valid
    ? describeWatch({ kind, direction, threshold: n, window: kind === "change" ? window : undefined, symbol, chain, trade, checkAt })
    : null;
  const automation = !!(trade || checkAt);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true); setMsg(null);
    const r = await create({
      chain, token: token.trim(), kind, direction, threshold: n, window: kind === "change" ? window : undefined,
      repeat: checkAt ? true : repeat,
      ...(trade ? { trade } : {}),
      ...(checkAt ? { check_at: { ...checkAt, tz: localTz() } } : {}),
    });
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: r.error ?? "Could not arm." }); return; }
    setMsg({ ok: true, text: `Armed: ${r.data?.rule ?? preview}.` });
    setToken(""); setThreshold(""); setTradeAmt("");
  }

  return (
    <Drawer open={open} title="// NEW ALERT OR AUTOMATION" onClose={() => { setMsg(null); onClose(); }}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="CHAIN">
          <Segmented value={chain} onChange={setChain} options={[{ value: "base", label: "Base" }, { value: "robinhood", label: "Robinhood Chain" }]} />
        </Field>
        <Field label="TOKEN" hint="0x address, stock ticker, or ETH / USDC">
          <input className={inputCls} value={token} onChange={(e) => setToken(e.target.value)} placeholder={chain === "base" ? "ETH · NVDA · 0x…" : "NVDA · TSLA · 0x…"} />
        </Field>
        <Field label="ALERT WHEN">
          <Segmented value={kind} onChange={setKind} options={[{ value: "price", label: "Price crosses a level" }, { value: "change", label: "Moves by %" }]} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="DIRECTION">
            <Segmented value={dir} onChange={setDir} options={kind === "price"
              ? [{ value: "up", label: "Above" }, { value: "down", label: "Below" }]
              : [{ value: "up", label: "Up" }, { value: "down", label: "Down" }]} />
          </Field>
          <Field label={kind === "price" ? "LEVEL (USD)" : "MOVE (%)"}>
            <input className={inputCls} inputMode="decimal" value={threshold} onChange={(e) => setThreshold(e.target.value.replace(/[^0-9.]/g, ""))} placeholder={kind === "price" ? "3000" : "20"} />
          </Field>
        </div>
        {kind === "change" && (
          <Field label="OVER">
            <Segmented value={window} onChange={setWindow} options={[{ value: "1h", label: "1 hour" }, { value: "24h", label: "24 hours" }]} />
          </Field>
        )}
        <Field label="CHECK">
          <Segmented value={when} onChange={setWhen} options={[{ value: "continuous", label: "Every 5 minutes" }, { value: "scheduled", label: "At a set time" }]} />
        </Field>
        {when === "scheduled" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="EVERY">
              <Segmented value={sched} onChange={setSched} options={[{ value: "daily", label: "Day" }, { value: "weekly", label: "Week" }]} />
            </Field>
            <Field label="AT" hint={localTz()}>
              <input type="time" className={inputCls} value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
          </div>
        )}

        <Field label="WHEN IT FIRES">
          <Segmented value={onFire} onChange={setOnFire} options={[{ value: "alert", label: "Just alert me" }, { value: "buy", label: "Prepare a buy" }, { value: "sell", label: "Prepare a sell" }]} />
        </Field>
        {onFire !== "alert" && (
          <Field label={onFire === "buy" ? `SPEND (${CASH[chain]})` : "SELL AMOUNT"} hint={onFire === "buy" ? "dollars" : "token amount, all, half or N%"}>
            <input className={inputCls} value={tradeAmt} onChange={(e) => setTradeAmt(e.target.value)} placeholder={onFire === "buy" ? "50" : "all"} />
          </Field>
        )}

        {when === "continuous" && (
        <label className="flex items-center justify-between rounded-xl border border-[#1A1A2E] bg-[#050508] px-3 py-2.5 cursor-pointer">
          <span>
            <span className="font-mono text-[11px] text-[#94A3B8] block">Repeat</span>
            <span className="font-mono text-[9.5px] text-[#475569] block mt-0.5">Off: alert once, then stop. On: alert again after it re-crosses.</span>
          </span>
          <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} className="accent-[#4FC3F7] w-4 h-4" />
        </label>
        )}

        <div className="rounded-xl border px-3 py-3" style={{ borderColor: preview ? "#4FC3F730" : C.line, background: preview ? "#4FC3F708" : "transparent" }}>
          <p className="font-mono text-[9px] tracking-[0.12em] text-[#475569] mb-1">PREVIEW</p>
          <p className="text-[13px]" style={{ color: preview ? C.text : C.faint }}>{preview ? `${preview.charAt(0).toUpperCase()}${preview.slice(1)}.` : "Fill in a token, a level and (for a trade) an amount."}</p>
          <p className="font-mono text-[9.5px] text-[#475569] mt-1.5">
            {when === "scheduled" ? "Checked once at that time — every check lands in Activity, met or not." : "Checked every 5 minutes."} Free. Stock tokens use their Chainlink oracle, which does not move while the US market is closed.
            {trade ? " When it fires, the trade card waits in the Price alerts chat for your signature — nothing executes on its own." : ""}
          </p>
        </div>

        <button type="submit" disabled={!valid || busy}
          className="w-full py-2.5 rounded-xl font-mono text-[13px] font-bold disabled:opacity-40" style={{ background: C.accent, color: C.page }}>
          {busy ? "Arming…" : automation ? "Arm automation" : "Arm alert"}
        </button>
        {msg && <p className="font-mono text-[11px]" style={{ color: msg.ok ? C.green : C.amber }}>{msg.text}</p>}
        <p className="font-mono text-[9.5px] text-[#475569] leading-relaxed">Blue Agent never signs, holds keys or trades on its own — an automation only prepares the card. Tip: you can also just say it in chat, e.g. “every day at 9:00, if ETH on Base is below $2,500, buy $50”.</p>
      </form>
    </Drawer>
  );
}
