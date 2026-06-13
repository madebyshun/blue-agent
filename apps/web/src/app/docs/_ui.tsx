// Shared presentational kit for the Blue Agent docs. Server-component friendly
// (no hooks) so each docs page can stay a simple async/server component.

import Link from "next/link";
import type { ReactNode } from "react";
import { DOC_ORDER } from "./_nav";

export function DocHeader({ eyebrow, title, lead }: { eyebrow?: string; title: string; lead?: ReactNode }) {
  return (
    <header className="mb-10">
      {eyebrow && <div className="font-mono text-[11px] text-[#4FC3F7] tracking-[0.2em] uppercase mb-3">{eyebrow}</div>}
      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">{title}</h1>
      {lead && <p className="text-slate-400 text-base leading-relaxed max-w-2xl">{lead}</p>}
    </header>
  );
}

export function H2({ id, children }: { id?: string; children: ReactNode }) {
  return <h2 id={id} className="text-xl font-bold text-white mt-12 mb-4 scroll-mt-24">{children}</h2>;
}

export function P({ children }: { children: ReactNode }) {
  return <p className="text-slate-400 text-sm leading-relaxed mb-4">{children}</p>;
}

export function Callout({ color = "#4FC3F7", title, children }: { color?: string; title?: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border p-4 my-5" style={{ borderColor: `${color}30`, background: `${color}08` }}>
      {title && <div className="font-mono text-[11px] font-bold mb-1.5" style={{ color }}>{title}</div>}
      <div className="font-mono text-[12px] text-slate-400 leading-relaxed">{children}</div>
    </div>
  );
}

export function CodeBlock({ title, badge, children }: { title?: string; badge?: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] overflow-hidden my-5">
      {(title || badge) && (
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#1A1A2E] bg-[#0a0a0f]">
          <span className="font-mono text-[11px] text-slate-500">{title}</span>
          {badge && <span className="font-mono text-[9px] text-[#4FC3F7] border border-[#4FC3F7]/30 px-1.5 py-0.5 rounded">{badge}</span>}
        </div>
      )}
      <pre className="p-5 font-mono text-[13px] leading-relaxed overflow-x-auto text-slate-200">{children}</pre>
    </div>
  );
}

export function CardGrid({ cols = 2, children }: { cols?: 2 | 3 | 4; children: ReactNode }) {
  const c = cols === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : cols === 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2";
  return <div className={`grid ${c} gap-3 my-5`}>{children}</div>;
}

export function Card({ title, color = "#4FC3F7", children, href }: { title: ReactNode; color?: string; children: ReactNode; href?: string }) {
  const inner = (
    <>
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
        <span className="font-bold text-sm" style={{ color }}>{title}</span>
      </div>
      <div className="font-mono text-[11px] text-slate-500 leading-relaxed">{children}</div>
    </>
  );
  const cls = "rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-5 block transition-colors hover:border-[#2a2a3e]";
  return href
    ? (href.startsWith("http")
        ? <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>{inner}</a>
        : <Link href={href} className={cls}>{inner}</Link>)
    : <div className={cls}>{inner}</div>;
}

export function PrevNext({ current }: { current: string }) {
  const i = DOC_ORDER.findIndex((d) => d.href === current);
  const prev = i > 0 ? DOC_ORDER[i - 1] : null;
  const next = i >= 0 && i < DOC_ORDER.length - 1 ? DOC_ORDER[i + 1] : null;
  return (
    <div className="grid grid-cols-2 gap-4 mt-16 pt-8 border-t border-[#1A1A2E]">
      {prev ? (
        <Link href={prev.href} className="rounded-xl border border-[#1A1A2E] bg-[#0d0d12] p-4 hover:border-[#4FC3F740] transition-colors">
          <div className="font-mono text-[10px] text-slate-600 mb-1">← Previous</div>
          <div className="font-mono text-sm text-slate-200">{prev.title}</div>
        </Link>
      ) : <div />}
      {next ? (
        <Link href={next.href} className="rounded-xl border border-[#1A1A2E] bg-[#0d0d12] p-4 hover:border-[#4FC3F740] transition-colors text-right">
          <div className="font-mono text-[10px] text-slate-600 mb-1">Next →</div>
          <div className="font-mono text-sm text-slate-200">{next.title}</div>
        </Link>
      ) : <div />}
    </div>
  );
}
