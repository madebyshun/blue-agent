import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy · Blue Hub",
  description: "What data Blue Agent collects, how we use it, who we share it with, and your rights.",
};

const LAST_UPDATED = "June 8, 2026";

export default function PrivacyPage() {
  return (
    <div className="px-5 sm:px-8 py-10 max-w-3xl mx-auto">

      <div className="mb-8">
        <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-2">LEGAL</p>
        <h1 className="font-mono text-3xl font-bold tracking-tight mb-2">Privacy Policy</h1>
        <p className="font-mono text-[11px] text-slate-500">Last updated: {LAST_UPDATED}</p>
      </div>

      <div className="rounded-xl border border-[#4FC3F7]/20 bg-[#4FC3F7]/5 p-4 mb-8">
        <p className="font-mono text-[11px] text-[#4FC3F7] font-bold mb-1">🔍 TL;DR</p>
        <p className="font-mono text-[11px] text-slate-400 leading-relaxed">
          We collect the minimum needed to operate the marketplace: wallet address (public),
          optional email/OAuth identifier, basic request logs for rate-limiting. We don&apos;t sell
          your data. We don&apos;t run ad trackers. Anything on Base mainnet (your wallet, your
          USDC, your API calls&apos; settlement) is <strong>public by design</strong>.
        </p>
      </div>

      <Section n="1" title="What we collect">

        <h3 className="font-mono text-sm font-bold mt-4 mb-2 text-slate-200">If you connect a wallet</h3>
        <List items={[
          "Public Base wallet address",
          "Signed messages (SIWE for sign-in, manifest signatures for API registration)",
          "Onchain transactions to/from your address — but these are public on Base anyway",
        ]} />

        <h3 className="font-mono text-sm font-bold mt-4 mb-2 text-slate-200">If you sign up with email / OAuth</h3>
        <List items={[
          "Email address (or hashed identifier from OAuth provider)",
          "OAuth profile basics (display name, avatar URL) — if you authorize them",
          "No password content — we use OAuth tokens or hashed passwords only",
        ]} />

        <h3 className="font-mono text-sm font-bold mt-4 mb-2 text-slate-200">If you call APIs (even anonymously)</h3>
        <List items={[
          "Request timestamp + endpoint called + status code (for rate-limit + analytics)",
          "Truncated IP address (last octet zeroed) — only for rate-limit / abuse prevention",
          "User-agent string",
          "No request body content is logged",
        ]} />

        <h3 className="font-mono text-sm font-bold mt-4 mb-2 text-slate-200">If you register an API</h3>
        <List items={[
          "Endpoint URL (public — listed in marketplace)",
          "Display name, description, provider handle, pricing, category",
          "Lifetime call count + cumulative USDC earned (public on the marketplace + your profile)",
        ]} />
      </Section>

      <Section n="2" title="What we don't collect">
        <List items={[
          "Private keys, seed phrases, or wallet passwords — we never see them",
          "API request payloads (the actual prompt / token / params you send)",
          "API response bodies",
          "Cross-site tracking pixels, ad attribution, fingerprinting",
          "Real-time location, contacts, or anything beyond the listed items",
        ]} />
      </Section>

      <Section n="3" title="How we use it">
        <List items={[
          "Operate the marketplace — list APIs, route calls, settle payments",
          "Rate-limit abuse — 100 req/min/IP on the public MCP endpoint",
          "Builder dashboard — show your registered APIs + accrued USDC",
          "Newsletter / alerts — only if you opted in",
          "Aggregate analytics — total marketplace volume, top APIs, etc. (de-identified)",
          "Detect fraud — wash-trading, fake review patterns, sanctioned wallets",
        ]} />
      </Section>

      <Section n="4" title="Who we share it with">
        <P>We share data with a small set of vendors needed to run the service:</P>
        <List items={[
          "Vercel — hosting and edge functions",
          "Upstash Redis (KV) — rate-limit counters, registry persistence",
          "Coinbase CDP — x402 facilitator for USDC settlement on Base",
          "Base mainnet (public blockchain) — anything settled on-chain is public",
          "Google / GitHub — only if you used their OAuth to sign in",
        ]} />
        <P>
          We don&apos;t sell data to advertisers, brokers, or third parties not listed above.
          If law-enforcement requests data with valid process, we&apos;ll comply while pushing back
          on overbroad requests where possible.
        </P>
      </Section>

      <Section n="5" title="Onchain transparency">
        <P>
          Everything that touches Base mainnet is <strong>public forever</strong>:
        </P>
        <List items={[
          "Your wallet address",
          "Every USDC transfer (calls you paid for, revenue you received)",
          "Stake / unstake transactions for $BLUEAGENT",
          "API registration manifests (signed message hash)",
        ]} />
        <P>
          We can&apos;t delete onchain history. If you want privacy from blockchain analytics,
          use a fresh wallet — that&apos;s the standard playbook.
        </P>
      </Section>

      <Section n="6" title="Cookies and local storage">
        <P>We use:</P>
        <List items={[
          "Session cookie (if you sign in with email/OAuth) — strictly necessary",
          "localStorage — for theme preference, sidebar collapse, cached results",
          "No third-party tracking cookies. No advertising cookies.",
        ]} />
      </Section>

      <Section n="7" title="Your rights">
        <P>
          Depending on where you live (GDPR, CCPA, etc.) you have rights to:
        </P>
        <List items={[
          "Access — request a copy of data we hold about you",
          "Delete — request removal of email/OAuth data; wallet + onchain history can&apos;t be deleted",
          "Object — opt out of newsletter or non-essential processing",
          "Portability — export your data (CSV) from the dashboard",
        ]} />
        <P>
          Request these by emailing the address in our GitHub README, or DM <a href="https://x.com/blueagent_" target="_blank" rel="noopener noreferrer" className="text-[#4FC3F7] hover:underline">@blueagent_</a> on X.
          We respond within 30 days.
        </P>
      </Section>

      <Section n="8" title="Children">
        <P>
          Blue Agent isn&apos;t designed for users under 13 (or under 16 in EEA). We don&apos;t
          knowingly collect data from minors. If you believe a minor has used the service, contact
          us and we&apos;ll delete the account.
        </P>
      </Section>

      <Section n="9" title="Data retention">
        <List items={[
          "Email / OAuth identifiers — until you delete your account",
          "Wallet manifest signatures — kept while APIs remain listed; archived 90 days after delist",
          "Request logs — 30 days rolling window for rate-limit / abuse review",
          "Aggregate analytics — kept indefinitely (de-identified)",
        ]} />
      </Section>

      <Section n="10" title="International transfers">
        <P>
          Data is processed in the United States (Vercel) and the region you connect from.
          If you&apos;re in the EEA / UK, we rely on Standard Contractual Clauses where applicable.
        </P>
      </Section>

      <Section n="11" title="Security">
        <P>
          We encrypt data in transit (HTTPS) and at rest (Upstash + Vercel defaults).
          We don&apos;t custody your funds — your wallet holds them.
          No system is perfectly secure; we&apos;ll notify users of breaches that affect them in line
          with applicable law.
        </P>
      </Section>

      <Section n="12" title="Changes to this policy">
        <P>
          We&apos;ll update this policy as the product evolves. Material changes ship with a
          <Link href="/blog" className="text-[#4FC3F7] hover:underline"> blog post</Link> and a
          banner on the site. You can always read the latest version here.
        </P>
      </Section>

      <Section n="13" title="Contact">
        <P>
          Privacy questions:{" "}
          <a href="https://x.com/blueagent_" target="_blank" rel="noopener noreferrer" className="text-[#4FC3F7] hover:underline">@blueagent_</a> on X{" "}
          or{" "}
          <a href="https://t.me/blueagent_hub" target="_blank" rel="noopener noreferrer" className="text-[#4FC3F7] hover:underline">Telegram</a>.
          Formal notices: see the registered entity disclosure in our{" "}
          <a href="https://github.com/madebyshun/blue-agent" target="_blank" rel="noopener noreferrer" className="text-[#4FC3F7] hover:underline">GitHub README</a>.
        </P>
      </Section>

      <p className="font-mono text-[10px] text-slate-700 text-center mt-12 pt-6 border-t border-[#1A1A2E]">
        Read the <Link href="/terms" className="text-slate-500 hover:text-slate-300 underline">Terms of Service</Link> next.
      </p>
    </div>
  );
}

// ─── Section helpers ──────────────────────────────────────────────────────────

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="font-mono text-lg font-bold tracking-tight mb-3">
        <span className="text-[#A78BFA] mr-2">{n}.</span>
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-[13px] text-slate-400 leading-relaxed">{children}</p>;
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="font-mono text-[13px] text-slate-400 leading-relaxed space-y-1.5 list-disc pl-5">
      {items.map((s, i) => <li key={i}>{s}</li>)}
    </ul>
  );
}
