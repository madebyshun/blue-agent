import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service · Blue Hub",
  description: "Terms governing use of the Blue Hub API marketplace, MCP server, and $BLUEAGENT staking.",
};

const LAST_UPDATED = "June 8, 2026";

export default function TermsPage() {
  return (
    <div className="px-5 sm:px-8 py-10 max-w-3xl mx-auto">

      <div className="mb-8">
        <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-2">LEGAL</p>
        <h1 className="font-mono text-3xl font-bold tracking-tight mb-2">Terms of Service</h1>
        <p className="font-mono text-[11px] text-slate-500">Last updated: {LAST_UPDATED}</p>
      </div>

      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 mb-8">
        <p className="font-mono text-[11px] text-amber-400 font-bold mb-1">⚠️ Not legal advice</p>
        <p className="font-mono text-[11px] text-slate-400 leading-relaxed">
          These terms describe how Blue Agent works in plain language. They&apos;re a starting framework
          — not a substitute for advice from a lawyer in your jurisdiction. Operating a wallet on
          Base, paying in USDC, and earning revenue may have tax / regulatory implications specific to you.
        </p>
      </div>

      <Section n="1" title="What Blue Agent is">
        <P>
          Blue Agent operates two surfaces under one project:
        </P>
        <List items={[
          "blueagent.dev — Blue Chat / Hub for end users calling first-party AI tools",
          "api.blueagent.dev — open API marketplace where any developer registers an API on the Blue Agent MCP server",
        ]} />
        <P>
          These Terms govern your use of <strong>api.blueagent.dev</strong> and the public Blue Agent MCP
          endpoint at <code className="text-[#4FC3F7]">https://blueagent.dev/api/mcp</code>.
        </P>
      </Section>

      <Section n="2" title="Accepting these terms">
        <P>
          By creating an account, connecting a wallet, registering an API, or calling the MCP endpoint,
          you agree to these Terms. If you don&apos;t agree, don&apos;t use the service.
        </P>
        <P>
          You must be old enough to enter a contract in your jurisdiction (16+ in most places, 18+ in
          some). Don&apos;t use the service if you&apos;re sanctioned or operating from a jurisdiction
          subject to comprehensive sanctions.
        </P>
      </Section>

      <Section n="3" title="Accounts and wallets">
        <P>
          You can use Blue Agent in three ways:
        </P>
        <List items={[
          "Anonymous — call free APIs via MCP without any signup (rate-limited per IP)",
          "Email / OAuth — Google or GitHub for newsletter, alerts, public profile",
          "Wallet — connect a Base wallet to register APIs, claim USDC revenue, stake $BLUEAGENT",
        ]} />
        <P>
          Your wallet is your account. If you lose access to your seed phrase, we can&apos;t recover
          your account, claim wallet, registered APIs, or accrued USDC. Keep your seed phrase safe.
        </P>
      </Section>

      <Section n="4" title="Registering an API (for providers)">
        <P>
          To list an API on the marketplace:
        </P>
        <List items={[
          "The endpoint must be HTTPS, return JSON, and respond within 30 seconds.",
          "You attest you have rights to operate the endpoint (no impersonating other services).",
          "You sign a manifest with your Base wallet — this address receives revenue.",
          "Blue Agent may probe your endpoint periodically to verify it works.",
          "You set the price (free up to $100 per call, USDC base units).",
        ]} />
        <P>
          You can edit, pause, or delist anytime by re-signing the manifest from the same wallet.
          Calls and earnings up to that point remain in your wallet.
        </P>
      </Section>

      <Section n="5" title="Revenue split">
        <P>
          Every paid call to a registered API splits USDC on Base mainnet as follows:
        </P>
        <List items={[
          "80% — API provider (your revenue wallet)",
          "10% — $BLUEAGENT stakers (fee-share)",
          "10% — Hub treasury (ops + ecosystem grants + insurance)",
        ]} />
        <P>
          The split executes on-chain via the splitter contract (shipping with Phase 4). Until then
          calls flow 100% to providers; the staker / treasury portion is reserved and backfilled
          when the contract goes live.
        </P>
        <P>
          No minimum payout. No subscription fees. No hidden charges. Refunds are at the
          provider&apos;s discretion — we don&apos;t mediate.
        </P>
      </Section>

      <Section n="6" title="Calling APIs (for consumers)">
        <P>
          When you call a paid API, you sign an EIP-3009 USDC TransferWithAuthorization — see the{" "}
          <Link href="/docs/x402" className="text-[#4FC3F7] hover:underline">x402 payment flow</Link> docs.
          The signature is single-use and expires within ~5 minutes.
        </P>
        <P>
          The provider&apos;s endpoint is responsible for the response quality, accuracy, and uptime.
          Blue Agent verifies APIs at registration but does not guarantee output. <strong>You call
          third-party endpoints at your own risk.</strong>
        </P>
      </Section>

      <Section n="7" title="Prohibited use">
        <P>You can&apos;t use Blue Agent to:</P>
        <List items={[
          "Register an API that violates law or third-party rights (IP, privacy, sanctions, etc.)",
          "Impersonate another service, agent, or person",
          "Manipulate marketplace rankings via fake calls or self-payments",
          "Reverse-engineer rate limits or attempt to defraud the splitter contract",
          "Use the service to launder money, evade taxes, or facilitate illegal payments",
          "Send malware, exploit vulnerabilities, or DDoS the MCP server or registered endpoints",
        ]} />
        <P>
          Violations may result in your wallet being blocked from registering, APIs being delisted,
          and (where lawful) reporting to authorities.
        </P>
      </Section>

      <Section n="8" title="$BLUEAGENT staking">
        <P>
          Staking $BLUEAGENT is voluntary. It entitles you to a proportional share of the 10% staker
          pool from marketplace fees. There&apos;s a 7-day cooldown to unstake.
        </P>
        <P>
          Staking is not an investment contract; you don&apos;t acquire equity, voting rights (yet),
          or a guarantee of returns. Your yield depends on marketplace volume, which may be zero.
          $BLUEAGENT price may go down.
        </P>
      </Section>

      <Section n="9" title="No warranty">
        <P>
          Blue Agent is provided <strong>&quot;as is&quot;</strong> with no warranty of any kind.
          We don&apos;t guarantee uptime, accuracy, or fitness for any particular purpose. We aim
          for high availability but ship updates that may temporarily disrupt the service.
        </P>
      </Section>

      <Section n="10" title="Limitation of liability">
        <P>
          To the maximum extent permitted by law, Blue Agent and its operators are not liable for
          indirect, incidental, special, consequential, or punitive damages — including lost
          revenue, lost USDC, or damages arising from third-party API responses.
        </P>
        <P>
          Our total liability is capped at the greater of: (a) USDC fees you&apos;ve paid to us in
          the last 30 days, or (b) $100 USDC.
        </P>
      </Section>

      <Section n="11" title="Termination">
        <P>
          You can stop using the service anytime. You can delist your APIs and unstake $BLUEAGENT
          (subject to cooldown). Your wallet remains yours — we don&apos;t hold custody.
        </P>
        <P>
          We may suspend or terminate accounts that violate these Terms, with or without notice.
        </P>
      </Section>

      <Section n="12" title="Changes to these terms">
        <P>
          We&apos;ll update these Terms as the product evolves. Material changes get announced via
          the <Link href="/blog" className="text-[#4FC3F7] hover:underline">blog</Link> and the X account.
          Continued use after an update means you accept the new version.
        </P>
      </Section>

      <Section n="13" title="Governing law">
        <P>
          These Terms are interpreted under the laws of the operating entity&apos;s jurisdiction.
          Disputes will be resolved through binding arbitration where lawful — full details ship with
          the registered entity public disclosure.
        </P>
      </Section>

      <Section n="14" title="Contact">
        <P>
          Reach us on{" "}
          <a href="https://x.com/blueagent_" target="_blank" rel="noopener noreferrer" className="text-[#4FC3F7] hover:underline">X</a>,{" "}
          <a href="https://t.me/blueagent_hub" target="_blank" rel="noopener noreferrer" className="text-[#4FC3F7] hover:underline">Telegram</a>, or{" "}
          <a href="https://github.com/madebyshun/blue-agent" target="_blank" rel="noopener noreferrer" className="text-[#4FC3F7] hover:underline">GitHub</a>.
          For legal notices, see the registered entity disclosure in our GitHub README.
        </P>
      </Section>

      <p className="font-mono text-[10px] text-slate-700 text-center mt-12 pt-6 border-t border-[#1A1A2E]">
        Read the <Link href="/privacy" className="text-slate-500 hover:text-slate-300 underline">Privacy Policy</Link> next.
      </p>
    </div>
  );
}

// ─── Section helpers ──────────────────────────────────────────────────────────

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="font-mono text-lg font-bold tracking-tight mb-3">
        <span className="text-[#4FC3F7] mr-2">{n}.</span>
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
