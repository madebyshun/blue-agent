import Link from "next/link";
import type { Metadata } from "next";
import DocLayout from "../../_components/DocLayout";
import CodeBlock from "../../_components/CodeBlock";

export const metadata: Metadata = {
  title: "Builder dashboard · Docs · Blue Hub",
  description: "Track your APIs, call counts, and USDC revenue on Blue Agent's marketplace dashboard.",
};

export default function BuilderDashboardDoc() {
  return (
    <DocLayout
      title="Builder dashboard"
      intro="Where you monitor your APIs after registering. Tracks live calls, USDC accrued, and withdraw flow."
    >

      <h2 className="font-mono text-lg font-bold mt-6 mb-3">Open the dashboard</h2>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        Go to <Link href="/dashboard" className="text-[#4FC3F7] hover:underline">/dashboard</Link> and connect the
        Base wallet you used to sign the manifest at <Link href="/submit" className="text-[#4FC3F7] hover:underline">/submit</Link>.
        That wallet is your account — no email, no password.
      </p>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        The dashboard scopes everything to that address: APIs you own, calls those APIs received,
        USDC sitting in your balance. If you connect a different wallet you&apos;ll see a different view.
      </p>

      <h2 className="font-mono text-lg font-bold mt-8 mb-3">What you see</h2>

      <h3 className="font-mono text-sm font-bold mt-5 mb-2 text-slate-200">Stats row — 3 counters</h3>
      <ul className="font-mono text-[13px] text-slate-400 leading-relaxed space-y-1.5 list-disc pl-5">
        <li><strong>APIs</strong> — count of endpoints registered to this wallet.</li>
        <li><strong>Lifetime calls</strong> — total successful calls across every owned API.</li>
        <li><strong>USDC earned</strong> — 80% builder share, accrued since first registration.</li>
      </ul>

      <h3 className="font-mono text-sm font-bold mt-5 mb-2 text-slate-200">API table</h3>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        Each row is one of your APIs. Sortable columns:
      </p>
      <ul className="font-mono text-[13px] text-slate-400 leading-relaxed space-y-1.5 list-disc pl-5">
        <li><strong>Name + slug</strong> — click to open <code className="text-[#4FC3F7]">/marketplace/[slug]</code>.</li>
        <li><strong>Status</strong> — <code className="text-[#34D399]">live</code> / <code className="text-amber-400">pending review</code> / <code className="text-red-400">paused</code>.</li>
        <li><strong>Calls (24h / 7d / total)</strong> — usage breakdown.</li>
        <li><strong>USDC (24h / 7d / total)</strong> — revenue per API.</li>
        <li><strong>Last call</strong> — relative timestamp.</li>
      </ul>

      <h3 className="font-mono text-sm font-bold mt-5 mb-2 text-slate-200">Withdraw</h3>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        Right now USDC settles <em>directly to your wallet</em> on every call — no withdraw step needed.
        When the Phase 4 splitter contract ships, this section will show the running balance and a
        one-click withdraw to your connected wallet.
      </p>

      <h2 className="font-mono text-lg font-bold mt-8 mb-3">Edit a listing</h2>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        Click any of your APIs in the table → opens an edit panel. You can update:
      </p>
      <ul className="font-mono text-[13px] text-slate-400 leading-relaxed space-y-1.5 list-disc pl-5">
        <li><strong>Description</strong> — text shown on the marketplace card.</li>
        <li><strong>Price</strong> — USDC per call (re-signed by your wallet).</li>
        <li><strong>Endpoint URL</strong> — useful if you migrate domains.</li>
        <li><strong>Category</strong> — re-categorize without re-listing.</li>
      </ul>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        Each edit requires a fresh signed message — wallet pops a modal, no transaction, no gas.
      </p>

      <h2 className="font-mono text-lg font-bold mt-8 mb-3">Pause or delist</h2>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        Two destructive actions on the edit panel:
      </p>
      <ul className="font-mono text-[13px] text-slate-400 leading-relaxed space-y-1.5 list-disc pl-5">
        <li><strong>Pause</strong> — temporarily removes from <code className="text-[#4FC3F7]">tools/list</code> + marketplace browse.
            Existing call counts and earnings stay intact. Resume any time.</li>
        <li><strong>Delist</strong> — permanently removes. Slug is reserved for 90 days then released.
            Earnings up to that point remain in your wallet.</li>
      </ul>

      <h2 className="font-mono text-lg font-bold mt-8 mb-3">Public profile</h2>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        Each builder gets a public profile at <code className="text-[#4FC3F7]">/providers/[handle]</code> with:
      </p>
      <ul className="font-mono text-[13px] text-slate-400 leading-relaxed space-y-1.5 list-disc pl-5">
        <li>Avatar + display name + verified badge (if applicable)</li>
        <li>Aggregate stats: total APIs, total calls, USDC earned</li>
        <li>List of all live APIs you own</li>
        <li>Optional social links (X, GitHub, website)</li>
      </ul>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        Update profile metadata from the dashboard. Profile pages are server-rendered (SEO-friendly)
        and shareable on X with auto-generated OG previews.
      </p>

      <h2 className="font-mono text-lg font-bold mt-8 mb-3">Webhooks (planned)</h2>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        Subscribe to events so your backend reacts to marketplace activity:
      </p>
      <CodeBlock hint="Webhook event payload — example" code={`{
  "event":  "api.called",
  "api_id": "honeypot-check",
  "caller": "0x...",
  "amount": "50000",
  "tx":     "0x...",
  "ts":     1717843200
}`} />
      <ul className="font-mono text-[13px] text-slate-400 leading-relaxed space-y-1.5 list-disc pl-5">
        <li><code className="text-[#4FC3F7]">api.called</code> — every successful paid call</li>
        <li><code className="text-[#4FC3F7]">api.verified</code> — Blue Agent grants the ✓ Verified badge</li>
        <li><code className="text-[#4FC3F7]">api.review</code> — a user posts a star rating + review</li>
      </ul>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        Wire up at <code className="text-[#4FC3F7]">/dashboard/webhooks</code> when this ships.
      </p>

      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 my-6">
        <p className="font-mono text-sm font-bold text-amber-400 mb-2">📝 Preview mode</p>
        <p className="font-mono text-[12px] text-slate-400 leading-relaxed">
          The dashboard UI is live but data is empty until the backend wiring (Phase 4) ships.
          Once paid x402 calls flow through the splitter contract, every counter on the dashboard
          updates in real-time.
        </p>
      </div>

      <h2 className="font-mono text-lg font-bold mt-8 mb-3">Troubleshooting</h2>
      <div className="rounded-xl border border-[#1A1A2E] overflow-hidden my-4">
        <div className="grid grid-cols-[1fr_2fr] gap-3 px-4 py-2.5 border-b border-[#1A1A2E] bg-[#0d0d12] font-mono text-[10px] text-slate-600 tracking-widest">
          <span>SYMPTOM</span>
          <span>FIX</span>
        </div>
        {[
          { sym: "Empty dashboard after connecting wallet", fix: "Make sure you connected the SAME wallet you signed the submit manifest with — different address = different account." },
          { sym: "USDC earned shows $0 but my API has calls", fix: "Calls before the splitter contract launched are tracked but not yet settled. Backfill ships with Phase 4." },
          { sym: "Can't edit a listing", fix: "Edits require a fresh signature. Make sure your wallet has popups enabled and you're on Base mainnet." },
          { sym: "API paused but still showing in marketplace", fix: "MCP tools/list caches for 60s. Wait a minute and try again." },
        ].map(t => (
          <div key={t.sym} className="grid grid-cols-[1fr_2fr] gap-3 px-4 py-3 border-b border-[#1A1A2E] last:border-0 items-baseline">
            <p className="font-mono text-[11px] text-slate-300 leading-relaxed">{t.sym}</p>
            <p className="font-mono text-[11px] text-slate-500 leading-relaxed">{t.fix}</p>
          </div>
        ))}
      </div>

      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        Still stuck? Ping us in the <a href="https://t.me/blueagent_hub" target="_blank" rel="noopener noreferrer" className="text-[#4FC3F7] hover:underline">builder Telegram ↗</a>.
      </p>
    </DocLayout>
  );
}
