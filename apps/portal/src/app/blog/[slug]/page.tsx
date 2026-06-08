import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { POSTS } from "../_data";

export async function generateStaticParams() {
  return POSTS.map(p => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = POSTS.find(p => p.slug === slug);
  if (!post) return { title: "Post not found · Blue Hub" };
  return {
    title:       `${post.title} · Blue Agent`,
    description: post.excerpt,
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = POSTS.find(p => p.slug === slug);
  if (!post) notFound();

  const idx = POSTS.findIndex(p => p.slug === slug);
  const prev = POSTS[idx - 1];
  const next = POSTS[idx + 1];

  return (
    <article className="px-5 sm:px-8 py-6 max-w-3xl mx-auto">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6 text-[11px]">
        <Link href="/blog" className="font-mono text-slate-500 hover:text-white transition-colors">
          ← Blog
        </Link>
      </div>

      {/* Header */}
      <header className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <span className="font-mono text-[9px] px-1.5 py-0.5 rounded border tracking-widest"
                style={{ borderColor: `${post.color}30`, color: post.color, background: `${post.color}05` }}>
            {post.tag}
          </span>
          <span className="font-mono text-[10px] text-slate-700">{post.date}</span>
          <span className="font-mono text-[10px] text-slate-700">·</span>
          <span className="font-mono text-[10px] text-slate-700">{post.read}</span>
        </div>
        <h1 className="font-mono text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight leading-tight mb-3">
          {post.title}
        </h1>
        <p className="font-mono text-sm text-slate-400 leading-relaxed">{post.excerpt}</p>
      </header>

      {/* Body */}
      <div className="space-y-5 mb-12">
        {post.body.map((p, i) => (
          <p key={i} className="font-mono text-sm text-slate-300 leading-relaxed">
            {p}
          </p>
        ))}
      </div>

      {/* Author */}
      <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-5 flex items-center justify-between gap-4 mb-10">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[#4FC3F7]/15 border border-[#4FC3F7]/30 flex items-center justify-center font-bold text-sm text-[#4FC3F7] shrink-0">
            BA
          </div>
          <div className="min-w-0">
            <p className="font-mono text-sm font-bold text-white">{post.author}</p>
            <p className="font-mono text-[10px] text-slate-600">Follow updates on X · join the builder Telegram</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a href="https://x.com/blueagent_" target="_blank" rel="noopener noreferrer"
             className="font-mono text-[11px] px-2.5 py-1 rounded-lg border border-[#1A1A2E] text-slate-400 hover:text-white hover:border-slate-700 transition-all">
            X ↗
          </a>
          <a href="https://t.me/blueagent_hub" target="_blank" rel="noopener noreferrer"
             className="font-mono text-[11px] px-2.5 py-1 rounded-lg border border-[#1A1A2E] text-slate-400 hover:text-white hover:border-slate-700 transition-all">
            Telegram ↗
          </a>
        </div>
      </div>

      {/* Prev/Next */}
      {(prev || next) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-[#1A1A2E] pt-6">
          {prev ? (
            <Link href={`/blog/${prev.slug}`} className="block rounded-xl border border-[#1A1A2E] bg-[#0d0d12] p-4 card-hover group">
              <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-1">← PREVIOUS</p>
              <p className="font-mono text-sm font-bold group-hover:text-[#4FC3F7] transition-colors line-clamp-2">{prev.title}</p>
            </Link>
          ) : <div />}
          {next && (
            <Link href={`/blog/${next.slug}`} className="block rounded-xl border border-[#1A1A2E] bg-[#0d0d12] p-4 card-hover group text-right">
              <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-1">NEXT →</p>
              <p className="font-mono text-sm font-bold group-hover:text-[#4FC3F7] transition-colors line-clamp-2">{next.title}</p>
            </Link>
          )}
        </div>
      )}
    </article>
  );
}
