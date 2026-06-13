import Link from "next/link";
import { DocHeader, H2, P, CardGrid, Card, PrevNext, Callout } from "../_ui";
import { CHAT_MODELS, CHAT_CAPABILITIES } from "../_data";
import { AGENT_SKILLS, SKILL_PROVIDERS, PROVIDER_COLORS, PROVIDER_ICONS } from "@/app/chat/agent-skills";
import { HUB_SKILLS, SKILL_CATEGORIES, CATEGORY_ICONS } from "@/app/chat/hub-skills";

export const metadata = { title: "Blue Chat — Blue Agent Docs" };

const SLASH = [
  { cmd: "/idea",   d: "Turn a concept into a fundable brief (also: market-fit check)." },
  { cmd: "/build",  d: "Architecture, stack, and folder structure for a Base project." },
  { cmd: "/audit",  d: "Security review + deep analysis — reentrancy, oracle, MEV." },
  { cmd: "/ship",   d: "Deployment checklist, verification, and go-to-market brief." },
  { cmd: "/raise",  d: "Pitch narrative + investor memo for a fundraise." },
  { cmd: "/pick",   d: "Token pick signal — an asymmetric setup with a thesis." },
  { cmd: "/scan",   d: "Honeypot / contract safety scan on a token address." },
  { cmd: "/wallet", d: "Full on-chain portfolio breakdown for a wallet." },
];

export default function BlueChatDoc() {
  return (
    <article>
      <DocHeader
        eyebrow="Products"
        title="Blue Chat"
        lead="Chat with an agent that knows Base. No install — pick a model, run slash commands, and call live skills and Hub tools right inside the conversation."
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

      <H2 id="slash">Slash commands</H2>
      <P>Type <code className="text-slate-300">/</code> in the composer to run a command inline — the same power as the CLI.</P>
      <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] overflow-hidden divide-y divide-[#1A1A2E] my-5">
        {SLASH.map((s) => (
          <div key={s.cmd} className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4 px-5 py-3">
            <code className="font-mono text-[13px] text-[#4FC3F7] shrink-0 sm:w-24">{s.cmd}</code>
            <span className="font-mono text-[11px] text-slate-500 leading-relaxed">{s.d}</span>
          </div>
        ))}
      </div>

      <H2 id="capabilities">In-chat capabilities</H2>
      <CardGrid cols={2}>
        {CHAT_CAPABILITIES.map((c) => (
          <Card key={c.t} title={c.t} color="#A78BFA">{c.d}</Card>
        ))}
      </CardGrid>

      <H2 id="skills">Agent skills</H2>
      <P>
        Beyond chat, the agent can action live skills from three providers — just ask in plain language. Active skills run now;
        <span className="text-slate-300"> soon</span> ones are wiring up.
      </P>
      {SKILL_PROVIDERS.map((provider) => {
        const skills = AGENT_SKILLS.filter((s) => s.provider === provider);
        const color = PROVIDER_COLORS[provider];
        return (
          <div key={provider} className="my-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base">{PROVIDER_ICONS[provider]}</span>
              <span className="font-mono text-[11px] tracking-widest uppercase" style={{ color }}>{provider}</span>
              <span className="font-mono text-[10px] text-slate-600">{skills.length} skills</span>
            </div>
            <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] overflow-hidden divide-y divide-[#1A1A2E]">
              {skills.map((s) => (
                <div key={s.id} className="px-5 py-3">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-mono text-[12px] font-bold text-slate-200">{s.name}</span>
                    {s.status === "soon" && <span className="font-mono text-[8px] text-slate-500 border border-[#1A1A2E] rounded px-1 py-0.5">SOON</span>}
                  </div>
                  <p className="font-mono text-[11px] text-slate-500 leading-relaxed">{s.description}</p>
                  {s.trigger && <code className="font-mono text-[10px] text-slate-700">try: {s.trigger.trim()}</code>}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <Callout color="#34D399" title="Launch & deploy a token">
        Token work lives in the <strong className="text-slate-200">Launch</strong> category below — readiness check, launch plan, and
        distribution design — plus the Base MCP <strong className="text-slate-200">Deploy to Base</strong> guide and the
        <strong className="text-slate-200"> Token Launch Pipeline</strong> (contract → Uniswap pool → list).
      </Callout>

      <H2 id="hub-tools">Hub tools in chat</H2>
      <P>The model can call {HUB_SKILLS.length} curated Hub tools for you, grouped by category:</P>
      <CardGrid cols={2}>
        {SKILL_CATEGORIES.map((cat) => {
          const tools = HUB_SKILLS.filter((s) => s.category === cat);
          return (
            <div key={cat} className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base">{CATEGORY_ICONS[cat]}</span>
                <span className="font-bold text-sm text-white">{cat}</span>
                <span className="font-mono text-[10px] text-slate-600">{tools.length}</span>
              </div>
              <div className="font-mono text-[10px] text-slate-500 leading-relaxed">
                {tools.slice(0, 4).map((t) => t.name).join(" · ")}{tools.length > 4 ? " · …" : ""}
              </div>
            </div>
          );
        })}
      </CardGrid>

      <P>
        See the full 72-tool catalog on the <Link href="/docs/blue-hub" className="text-[#4FC3F7] underline">Blue Hub</Link> page,
        with pricing in <Link href="/docs/x402" className="text-[#4FC3F7] underline">x402 Tools</Link>.
      </P>

      <PrevNext current="/docs/blue-chat" />
    </article>
  );
}
