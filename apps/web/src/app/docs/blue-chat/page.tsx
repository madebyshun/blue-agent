import Link from "next/link";
import { DocHeader, H2, P, CardGrid, Card, PrevNext } from "../_ui";
import { CHAT_MODELS, CHAT_CAPABILITIES } from "../_data";

export const metadata = { title: "Blue Chat — Blue Agent Docs" };

export default function BlueChatDoc() {
  return (
    <article>
      <DocHeader
        eyebrow="Products"
        title="Blue Chat"
        lead="Chat with an agent that knows Base. No install — pick a model, run slash commands, and call live Hub tools right inside the conversation."
      />

      <P>
        Blue Chat is the fastest way in. Every message spends credits (see <Link href="/docs/credits" className="text-[#4FC3F7] underline">Credits &amp; Tiers</Link>),
        and you can start with no wallet. <Link href="/app/chat" className="text-[#4FC3F7] underline">Open Blue Chat →</Link>
      </P>

      <H2 id="models">Models — one preset per use-case</H2>
      <CardGrid cols={3}>
        {CHAT_MODELS.map((m) => (
          <div key={m.label} className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-4">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-base">{m.icon}</span>
                <span className="font-bold text-sm" style={{ color: m.color }}>{m.label}</span>
              </div>
              <span className="font-mono text-[10px] text-slate-600">{m.cr}/msg</span>
            </div>
            <div className="font-mono text-[11px] text-slate-400">{m.model}</div>
            <div className="font-mono text-[10px] text-slate-600 mt-0.5">{m.note}</div>
          </div>
        ))}
      </CardGrid>

      <H2 id="capabilities">In-chat capabilities</H2>
      <CardGrid cols={2}>
        {CHAT_CAPABILITIES.map((c) => (
          <Card key={c.t} title={c.t} color="#A78BFA">{c.d}</Card>
        ))}
      </CardGrid>

      <PrevNext current="/docs/blue-chat" />
    </article>
  );
}
