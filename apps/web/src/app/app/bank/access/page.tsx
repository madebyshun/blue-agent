"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function BankAccessPage() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  function unlock() {
    if (!code.trim() || loading) return;
    setLoading(true);
    router.push(`/app/bank?key=${encodeURIComponent(code.trim())}`);
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-[#050508] text-slate-200 p-4">
      <div className="w-full max-w-sm">

        <div className="text-center mb-8">
          <div className="font-mono text-[13px] text-[#4FC3F7] tracking-widest mb-2">// BLUEBANK</div>
          <div className="font-mono text-[28px] font-bold text-white mb-1">
            Early Access
          </div>
          <div className="font-mono text-[11px] text-slate-500">
            The wallet layer of BlueAgent OS
          </div>
        </div>

        <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-6 mb-4">
          <div className="font-mono text-[10px] text-slate-500 tracking-widest mb-3">ENTER ACCESS CODE</div>
          <input
            value={code}
            onChange={e => setCode(e.target.value)}
            onKeyDown={e => e.key === "Enter" && unlock()}
            placeholder="Enter your code..."
            type="password"
            autoFocus
            className="w-full bg-[#050508] border border-[#1A1A2E] focus:border-[#4FC3F7]/40 rounded-xl px-4 py-3 font-mono text-[13px] text-slate-200 placeholder:text-slate-700 outline-none mb-3 transition-colors"
          />
          <button
            onClick={unlock}
            disabled={loading || !code.trim()}
            className="w-full font-mono text-[13px] font-bold py-3 rounded-xl disabled:opacity-40 transition-opacity hover:opacity-90"
            style={{ background: "#4FC3F7", color: "#050508" }}
          >
            {loading ? "Unlocking…" : "Unlock Blue Bank →"}
          </button>
        </div>

        <div className="text-center space-y-2">
          <div>
            <span className="font-mono text-[10px] text-slate-600">Don&apos;t have a code?{" "}</span>
            <a
              href="https://t.me/madebyshun"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[10px] text-[#4FC3F7] hover:opacity-80 transition-opacity"
            >
              Request early access →
            </a>
          </div>
          <div>
            <a href="/app/chat" className="font-mono text-[9px] text-slate-600 hover:text-slate-400 transition-colors">
              ← Back to Blue Chat
            </a>
          </div>
        </div>

      </div>
    </div>
  );
}
