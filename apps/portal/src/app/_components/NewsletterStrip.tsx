"use client";

import { useState } from "react";

export default function NewsletterStrip() {
  const [email, setEmail] = useState("");
  const [done,  setDone]  = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) return;
    // UI-only — wire to ConvertKit / Buttondown / Resend when ready.
    setDone(true);
  }

  return (
    <section className="border-t border-[#1A1A2E] mt-12">
      <div className="max-w-4xl mx-auto px-5 sm:px-8 py-10">
        <div className="rounded-2xl border border-[#A78BFA]/20 bg-gradient-to-r from-[#4FC3F7]/[0.06] via-transparent to-[#A78BFA]/[0.06] p-6 sm:p-8">
          <div className="grid grid-cols-1 md:grid-cols-[1.3fr_1fr] gap-6 items-center">
            <div>
              <p className="font-mono text-[10px] text-[#A78BFA] tracking-widest mb-2">📬 STAY POSTED</p>
              <h3 className="font-mono text-lg sm:text-xl font-bold tracking-tight mb-2">New APIs, ecosystem analysis, builder notes</h3>
              <p className="font-mono text-[11px] text-slate-500 leading-relaxed">
                Low-volume newsletter, ~1 per week. Or follow{" "}
                <a href="https://x.com/blueagent_" target="_blank" rel="noopener noreferrer" className="text-[#4FC3F7] hover:underline">@blueagent_</a>{" "}
                on X for live updates.
              </p>
            </div>

            {done ? (
              <div className="rounded-xl border border-[#34D399]/30 bg-[#34D399]/5 p-4 text-center">
                <p className="font-mono text-sm font-bold text-[#34D399] mb-1">✓ You&apos;re in</p>
                <p className="font-mono text-[10px] text-slate-600">We&apos;ll be in touch when the next batch ships.</p>
              </div>
            ) : (
              <form onSubmit={submit} className="flex gap-2">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@domain.com"
                  className="flex-1 bg-[#0d0d12] border border-[#1A1A2E] rounded-lg px-3 py-2.5 font-mono text-sm text-white placeholder-slate-700 focus:outline-none focus:border-[#A78BFA]/40 transition-colors"
                />
                <button type="submit"
                  className="font-mono text-sm font-semibold px-4 py-2.5 rounded-lg bg-[#A78BFA] text-[#050508] hover:bg-[#9d7ef0] transition-colors shrink-0">
                  Subscribe →
                </button>
              </form>
            )}
          </div>

          {/* Social row */}
          <div className="mt-6 pt-5 border-t border-[#1A1A2E] flex items-center justify-center gap-4 flex-wrap">
            <a href="https://x.com/blueagent_" target="_blank" rel="noopener noreferrer"
              className="font-mono text-[11px] text-slate-500 hover:text-white transition-colors">X / Twitter ↗</a>
            <span className="text-slate-700">·</span>
            <a href="https://t.me/blueagent_hub" target="_blank" rel="noopener noreferrer"
              className="font-mono text-[11px] text-slate-500 hover:text-white transition-colors">Telegram ↗</a>
            <span className="text-slate-700">·</span>
            <a href="https://github.com/madebyshun/blue-agent" target="_blank" rel="noopener noreferrer"
              className="font-mono text-[11px] text-slate-500 hover:text-white transition-colors">GitHub ↗</a>
          </div>
        </div>
      </div>
    </section>
  );
}
