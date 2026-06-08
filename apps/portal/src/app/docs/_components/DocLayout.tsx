"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

interface DocItem  { href: string; label: string }
interface DocGroup { label: string; items: DocItem[] }

const DOCS_NAV: DocGroup[] = [
  {
    label: "GET STARTED",
    items: [
      { href: "/docs/quickstart", label: "Quickstart" },
      { href: "/docs/mcp",        label: "Install MCP" },
      { href: "/docs/concepts",   label: "Core concepts" },
    ],
  },
  {
    label: "BUILD",
    items: [
      { href: "/docs/x402",        label: "x402 payment flow" },
      { href: "/docs/rest-api",    label: "REST API reference" },
      { href: "/docs/mcp-protocol",label: "MCP protocol details" },
    ],
  },
  {
    label: "FOR BUILDERS",
    items: [
      { href: "/docs/builders/submit",    label: "Register your API" },
      { href: "/docs/builders/dashboard", label: "Builder dashboard" },
    ],
  },
];

export default function DocLayout({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  const path = usePathname();
  const isActive = (href: string) => path === href;

  // Build prev/next from flat list
  const flat = DOCS_NAV.flatMap(g => g.items);
  const idx  = flat.findIndex(i => i.href === path);
  const prev = idx > 0 ? flat[idx - 1] : null;
  const next = idx >= 0 && idx < flat.length - 1 ? flat[idx + 1] : null;

  return (
    <div className="px-5 sm:px-8 py-6">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-8">

        {/* Side nav */}
        <aside className="lg:sticky lg:top-20 lg:self-start space-y-6">
          <Link href="/docs" className="block font-mono text-[11px] text-slate-500 hover:text-white transition-colors mb-2">
            ← All docs
          </Link>
          {DOCS_NAV.map(group => (
            <div key={group.label}>
              <p className="font-mono text-[10px] text-slate-700 tracking-widest mb-2">{group.label}</p>
              <ul className="space-y-0.5">
                {group.items.map(item => (
                  <li key={item.href}>
                    <Link href={item.href}
                      className={`block py-1 font-mono text-[12px] transition-colors ${
                        isActive(item.href)
                          ? "text-[#4FC3F7] font-semibold"
                          : "text-slate-500 hover:text-white"
                      }`}>
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </aside>

        {/* Content */}
        <article className="min-w-0">
          <header className="mb-8">
            <h1 className="font-mono text-2xl sm:text-3xl font-bold tracking-tight mb-2">{title}</h1>
            {intro && <p className="font-mono text-sm text-slate-400 leading-relaxed max-w-2xl">{intro}</p>}
          </header>

          <div className="prose-doc space-y-5 max-w-2xl">{children}</div>

          {/* Prev/Next */}
          {(prev || next) && (
            <div className="mt-12 pt-6 border-t border-[#1A1A2E] grid grid-cols-1 sm:grid-cols-2 gap-3">
              {prev ? (
                <Link href={prev.href}
                  className="block rounded-xl border border-[#1A1A2E] bg-[#0d0d12] p-4 card-hover group">
                  <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-1">← PREVIOUS</p>
                  <p className="font-mono text-sm font-bold group-hover:text-[#4FC3F7] transition-colors">{prev.label}</p>
                </Link>
              ) : <div />}
              {next && (
                <Link href={next.href}
                  className="block rounded-xl border border-[#1A1A2E] bg-[#0d0d12] p-4 card-hover group text-right">
                  <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-1">NEXT →</p>
                  <p className="font-mono text-sm font-bold group-hover:text-[#4FC3F7] transition-colors">{next.label}</p>
                </Link>
              )}
            </div>
          )}
        </article>
      </div>
    </div>
  );
}
