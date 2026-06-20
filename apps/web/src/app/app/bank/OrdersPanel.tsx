"use client";

// Blue Bank — Orders & Invoices. Create a payment request (USDC), share a
// /pay/<id> link, and track pending → paid. Settlement runs in B20 USDC via
// transferWithMemo once B20 mainnet is live (NEXT_PUBLIC_B20_ENABLED).
import { useState } from "react";
import {
  B20_ENABLED, type OrderKind,
  loadOrders, createOrder, removeOrder, payLink, ordersToCsv,
} from "@/lib/orders";

const input =
  "w-full bg-[#050508] border border-[#1A1A2E] focus:border-[#4FC3F7]/40 rounded-lg px-2.5 py-1.5 font-mono text-[11px] text-slate-200 placeholder:text-slate-700 outline-none transition-colors";

export default function OrdersPanel() {
  const [, force] = useState(0);
  const refresh = () => force((n) => n + 1);
  const [kind, setKind] = useState<OrderKind>("order");
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [client, setClient] = useState("");
  const [due, setDue] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const orders = loadOrders();

  function create() {
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    createOrder({
      kind, amount: amt, description: desc,
      client: kind === "invoice" ? client : undefined,
      dueDate: kind === "invoice" ? due : undefined,
    });
    setAmount(""); setDesc(""); setClient(""); setDue("");
    refresh();
  }
  function copy(id: string) {
    navigator.clipboard?.writeText(payLink(id)).then(() => {
      setCopied(id); setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
    });
  }
  function exportCsv() {
    const blob = new Blob([ordersToCsv(orders)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "blueagent-orders.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      {/* Order | Invoice */}
      <div className="flex gap-1 mb-3">
        {(["order", "invoice"] as const).map((k) => (
          <button key={k} onClick={() => setKind(k)}
            className="flex-1 font-mono text-[10px] py-1.5 rounded-md transition-colors"
            style={kind === k ? { background: "#4FC3F712", color: "#4FC3F7", border: "1px solid #4FC3F730" } : { color: "#64748b", border: "1px solid #1A1A2E" }}>
            {k === "order" ? "Order" : "Invoice"}
          </button>
        ))}
      </div>

      {/* Create */}
      <div className="flex flex-col gap-2 mb-3">
        <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="Amount (USDC)" className={input} />
        <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description (optional)" className={input} />
        {kind === "invoice" && (
          <>
            <input value={client} onChange={(e) => setClient(e.target.value)} placeholder="Client name (optional)" className={input} />
            <input value={due} onChange={(e) => setDue(e.target.value)} type="date" className={input} />
          </>
        )}
        <button onClick={create} disabled={!(parseFloat(amount) > 0)}
          className="font-mono text-[12px] font-bold py-2 rounded-lg disabled:opacity-50"
          style={{ background: "#34D39915", color: "#34D399", border: "1px solid #34D39940" }}>
          + New {kind === "invoice" ? "Invoice" : "Order"}
        </button>
      </div>

      {!B20_ENABLED && (
        <div className="rounded-lg px-2.5 py-2 mb-3" style={{ border: "1px solid #F59E0B30", background: "#F59E0B0d" }}>
          <p className="font-mono text-[9px] text-[#F59E0B] leading-relaxed">
            Payment links work now. B20 USDC auto-settlement + paid-status detection go live at B20 mainnet (June 25).
          </p>
        </div>
      )}

      {/* List */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-mono text-[9px] text-slate-600 tracking-widest">{orders.length} REQUEST{orders.length !== 1 ? "S" : ""}</span>
        {orders.length > 0 && <button onClick={exportCsv} className="font-mono text-[9px] text-slate-500 hover:text-[#4FC3F7]">Export CSV ↓</button>}
      </div>
      <div className="flex flex-col gap-1.5">
        {orders.length === 0 && <p className="font-mono text-[10px] text-slate-700">No requests yet. Create an order or invoice above.</p>}
        {orders.map((o) => (
          <div key={o.id} className="rounded-lg border border-[#1A1A2E] bg-[#0d0d12] px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-slate-200 flex-1 truncate">#{o.id}</span>
              <span className="font-mono text-[11px] text-slate-300">${o.amount.toLocaleString()} USDC</span>
              <span className="font-mono text-[9px] px-1.5 py-0.5 rounded shrink-0"
                style={o.status === "paid" ? { color: "#34D399", background: "#34D39915" } : { color: "#F59E0B", background: "#F59E0B15" }}>
                {o.status === "paid" ? "✅ Paid" : "⏳ Pending"}
              </span>
            </div>
            {o.description && <div className="font-mono text-[10px] text-slate-600 mt-0.5 truncate">{o.description}</div>}
            <div className="flex items-center gap-3 mt-1">
              <button onClick={() => copy(o.id)} className="font-mono text-[9px] text-[#4FC3F7]">{copied === o.id ? "link copied ✓" : "copy pay link"}</button>
              {o.txHash && <a href={`https://basescan.org/tx/${o.txHash}`} target="_blank" rel="noopener noreferrer" className="font-mono text-[9px] text-slate-500 hover:text-[#4FC3F7]">tx ↗</a>}
              <button onClick={() => { removeOrder(o.id); refresh(); }} className="font-mono text-[9px] text-slate-700 hover:text-red-400 ml-auto">remove</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
