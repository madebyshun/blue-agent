import Link from "next/link";
import { DocHeader, H2, P, Callout, PrevNext } from "../_ui";

export const metadata = {
  title: "Blue Feed — BlueAgent Docs",
  description: "Live Base intelligence feed — 8 tools running every hour.",
};

const AGENTS = [
  { icon: "⭐", name: "Aeon",      color: "#FB923C", role: "senses Base chain",         tools: "base-pulse · narrative-pulse · whale-tracker · new-pools · blue-stream" },
  { icon: "🟦", name: "BlueAgent", color: "#4FC3F7", role: "orchestrates + synthesizes", tools: "base-alpha" },
  { icon: "🦈", name: "MiroShark", color: "#A78BFA", role: "validates signals",          tools: "token-alpha · token-momentum-scanner" },
];

const HOURLY = [
  { id: "base-pulse",       a: "⭐",     d: "ecosystem snapshot (TVL, DEX vol, sentiment)" },
  { id: "narrative-pulse",  a: "⭐",     d: "trending narratives + entry windows" },
  { id: "token-alpha",      a: "🦈",     d: "trade signal (BUY / SKIP / STRONG_BUY)" },
  { id: "whale-tracker",    a: "⭐",     d: "smart money accumulation / distribution" },
  { id: "base-alpha",       a: "⭐🟦🦈", d: "daily digest + momentum picks" },
  { id: "ecosystem-digest", a: "⭐🟦🦈", d: "Base ecosystem digest" },
  { id: "new-pools",        a: "⭐",     d: "new Base pools + honeypot flags" },
  { id: "blue-stream",      a: "⭐",     d: "live onchain activity" },
];

const DAILY = [
  { id: "token-momentum-scanner", a: "🦈",     d: "pre-pump momentum plays" },
  { id: "narrative-position",     a: "⭐🟦🦈", d: "FRONT-RUN / RIDE / FADE / IGNORE" },
  { id: "defi-opportunity",       a: "🦈",     d: "Base DeFi yield opportunities" },
];

function ToolList({ items }: { items: { id: string; a: string; d: string }[] }) {
  return (
    <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] overflow-hidden divide-y divide-[#1A1A2E] my-5">
      {items.map((t) => (
        <div key={t.id} className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4 px-5 py-3">
          <code className="font-mono text-[13px] text-[#FB923C] shrink-0 sm:w-56">{t.a} {t.id}</code>
          <span className="font-mono text-[11px] text-slate-500 leading-relaxed">{t.d}</span>
        </div>
      ))}
    </div>
  );
}

export default function BlueFeedDoc() {
  return (
    <article>
      <DocHeader
        eyebrow="Products"
        title="Blue Feed"
        lead="Live Base intelligence. 24/7."
      />

      <H2 id="what">What is Blue Feed?</H2>
      <P>
        BlueAgent&apos;s autonomous intelligence feed. 8 tools run every hour via GitHub Actions —
        no prompts, no clicks. Results appear live at{" "}
        <Link href="/app/feed" className="text-[#4FC3F7] underline">/app/feed</Link>.
      </P>

      <H2 id="agents">Three agents</H2>
      <div className="grid sm:grid-cols-3 gap-3 my-5">
        {AGENTS.map((ag) => (
          <div key={ag.name} className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">{ag.icon}</span>
              <span className="font-bold text-sm" style={{ color: ag.color }}>{ag.name}</span>
            </div>
            <div className="font-mono text-[11px] text-slate-400">{ag.role}</div>
            <div className="font-mono text-[10px] text-slate-600 mt-1.5 leading-relaxed">{ag.tools}</div>
          </div>
        ))}
      </div>

      <H2 id="hourly">Hourly tools (8)</H2>
      <ToolList items={HOURLY} />

      <H2 id="daily">Daily tools (3 · 9AM UTC)</H2>
      <ToolList items={DAILY} />

      <H2 id="share">Share</H2>
      <P>
        Every feed item has a shareable link with an OG image. Share to X or Cast to Farcaster
        directly from the feed.
      </P>

      <Callout color="#FB923C" title="Open the live feed">
        <Link href="/app/feed" className="text-[#FB923C] underline">Open Blue Feed →</Link>
      </Callout>

      <PrevNext current="/docs/blue-feed" />
    </article>
  );
}
