import Link from "next/link";
import type { Metadata } from "next";
import { POSTS } from "./_data";

export const metadata: Metadata = {
  title: "Blog — Blue Agent",
  description: "Updates from the Blue Agent team: shipping notes, deep-dives, ecosystem analysis, Base AI.",
};

export default function BlogIndex() {
  return (
    <>
      <section className="relative overflow-hidden border-b border-[#1A1A2E]">
        <div className="absolute inset-0 hero-glow pointer-events-none" />
        <div className="relative max-w-4xl mx-auto px-6 py-16">
          <p className="font-mono text-[10px] text-[#4FC3F7] tracking-widest mb-2">📝 BLOG</p>
          <h1 className="font-mono text-3xl sm:text-4xl font-bold tracking-tight mb-3">Notes from the build</h1>
          <p className="font-mono text-sm text-slate-400 max-w-2xl leading-relaxed">
            Shipping updates, deep-dives, and ecosystem analysis from the Blue Agent team.
          </p>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 py-12">
        <div className="space-y-4">
          {POSTS.map(post => (
            <Link key={post.slug} href={`/blog/${post.slug}`}
                  className="block rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-6 card-hover group">
              <div className="flex items-center gap-3 mb-3">
                <span className="font-mono text-[9px] px-1.5 py-0.5 rounded border tracking-widest"
                      style={{ borderColor: `${post.color}30`, color: post.color, background: `${post.color}05` }}>
                  {post.tag}
                </span>
                <span className="font-mono text-[10px] text-slate-700">{post.date}</span>
                <span className="font-mono text-[10px] text-slate-700">·</span>
                <span className="font-mono text-[10px] text-slate-700">{post.read}</span>
              </div>
              <h2 className="font-mono text-lg sm:text-xl font-bold mb-2 group-hover:text-[#4FC3F7] transition-colors">
                {post.title}
              </h2>
              <p className="font-mono text-xs text-slate-500 leading-relaxed">{post.excerpt}</p>
              <p className="font-mono text-[11px] mt-3 opacity-70 group-hover:opacity-100 transition-opacity" style={{ color: post.color }}>
                Read post →
              </p>
            </Link>
          ))}
        </div>

        {/* Subscribe */}
        <div className="mt-10 rounded-2xl border border-[#A78BFA]/20 bg-[#A78BFA]/5 p-5 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="font-mono text-sm font-bold mb-0.5">Follow updates</p>
            <p className="font-mono text-[11px] text-slate-500">Best place: @blueagent_ on X · plus Telegram for builder chat.</p>
          </div>
          <div className="flex items-center gap-2">
            <a href="https://x.com/blueagent_" target="_blank" rel="noopener noreferrer"
               className="font-mono text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#A78BFA]/30 text-[#A78BFA] hover:bg-[#A78BFA]/10 transition-colors">
              Follow on X ↗
            </a>
            <a href="https://t.me/blueagent_hub" target="_blank" rel="noopener noreferrer"
               className="font-mono text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#A78BFA]/30 text-[#A78BFA] hover:bg-[#A78BFA]/10 transition-colors">
              Join Telegram ↗
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
