import Link from "next/link";
import type { Metadata } from "next";
import DocLayout from "../_components/DocLayout";
import CodeBlock from "../_components/CodeBlock";

export const metadata: Metadata = {
  title: "Core concepts · Docs · Blue Hub",
  description: "Tools, providers, MCP, x402, credits — the vocabulary of the Blue Hub API marketplace.",
};

export default function Concepts() {
  return (
    <DocLayout
      title="Core concepts"
      intro="Five terms you'll see everywhere. Skim this once — the rest of the docs assumes you know them."
    >

      <h2 className="font-mono text-lg font-bold mt-6 mb-3">API (a.k.a. tool)</h2>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        A single HTTP endpoint registered on Blue Agent. Each one has:
      </p>
      <ul className="font-mono text-[13px] text-slate-400 leading-relaxed space-y-1.5 list-disc pl-5">
        <li>A unique <strong>slug</strong> (e.g. <code className="text-[#4FC3F7]">honeypot-check</code>) — how it appears in URLs and code.</li>
        <li>An <strong>input schema</strong> — the JSON fields the endpoint expects.</li>
        <li>A <strong>price in USDC</strong> per call (0 = free, max $100).</li>
        <li>A <strong>provider</strong> — the wallet/agent that owns it and receives 80% of revenue.</li>
        <li>A <strong>verified</strong> badge (Blue Agent reviewed) and an <strong>AI Ready</strong> badge (returns structured JSON).</li>
      </ul>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        You&apos;ll see them called &quot;APIs&quot; on the marketplace and &quot;tools&quot; from the MCP perspective —
        same thing, different framing depending on whether you&apos;re a human browsing or an AI calling.
      </p>

      <h2 className="font-mono text-lg font-bold mt-8 mb-3">Provider</h2>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        The agent, team, or solo developer who registered an API. Identified by a Base wallet address
        and a public handle. Providers see their APIs, lifetime calls, and accrued USDC in the{" "}
        <Link href="/dashboard" className="text-[#4FC3F7] hover:underline">dashboard</Link>.
      </p>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        Today: <strong>Blue Agent</strong> is the seed provider (50 first-party APIs). <strong>Aeon</strong> and{" "}
        <strong>MiroShark</strong> have reserved slots. Anyone else can{" "}
        <Link href="/submit" className="text-[#4FC3F7] hover:underline">register</Link> and become a provider.
      </p>

      <h2 className="font-mono text-lg font-bold mt-8 mb-3">MCP — Model Context Protocol</h2>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        The open standard that lets AI clients (Claude Desktop, Cursor, Cline, custom agents) discover and call
        external tools. Blue Agent runs one MCP server at:
      </p>
      <CodeBlock hint="MCP endpoint" code={`https://blueagent.dev/api/mcp`} />
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        Add that URL to your client config (see{" "}
        <Link href="/docs/mcp" className="text-[#4FC3F7] hover:underline">Install MCP</Link>) and every API
        in the marketplace appears as a callable tool. <code className="text-[#4FC3F7]">tools/list</code> returns
        them all — including community-submitted ones, automatically.
      </p>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        Protocol: <strong>JSON-RPC 2.0 over Streamable HTTP</strong> (MCP spec 2025-03-26).
        Supports both <code className="text-[#4FC3F7]">application/json</code> and SSE response shapes via
        the <code className="text-[#4FC3F7]">Accept</code> header.
      </p>

      <h2 className="font-mono text-lg font-bold mt-8 mb-3">x402 — pay-per-call HTTP</h2>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        The payment protocol. Server returns <code className="text-amber-400">HTTP 402 Payment Required</code> with
        USDC instructions, client signs an EIP-3009 <code className="text-[#4FC3F7]">TransferWithAuthorization</code>{" "}
        once, retries with the <code className="text-[#4FC3F7]">X-Payment</code> header — done in sub-second.
      </p>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        Why it matters: no accounts, no API keys, no minimum balance. Autonomous AI agents can call APIs without
        a human approving each transaction — the wallet just signs the payment as part of the request.
      </p>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        Full walkthrough: <Link href="/docs/x402" className="text-[#4FC3F7] hover:underline">x402 payment flow</Link>.
      </p>

      <h2 className="font-mono text-lg font-bold mt-8 mb-3">Credits</h2>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        Free-tier allowance for calling APIs without paying USDC per call. Two ways to earn:
      </p>
      <ul className="font-mono text-[13px] text-slate-400 leading-relaxed space-y-1.5 list-disc pl-5">
        <li><strong>Guest</strong> — 30 credits/day, no wallet needed (IP-rate-limited).</li>
        <li><strong>Holder</strong> — hold or stake $BLUEAGENT for tiered allowance (500 / 2,000 / ∞ per day).</li>
      </ul>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        Credits cover one call to most tools — heavier tools may cost multiple credits.
        For high-volume use, paying x402 USDC per call removes the daily cap entirely.
      </p>

      <h2 className="font-mono text-lg font-bold mt-8 mb-3">Putting it together</h2>
      <p className="font-mono text-[13px] text-slate-400 leading-relaxed">
        The simplest flow, end-to-end: a provider registers an <strong>API</strong> →
        any AI client speaking <strong>MCP</strong> discovers it via <code className="text-[#4FC3F7]">tools/list</code> →
        calls it → server returns <strong>x402</strong> 402 → client signs USDC payment →
        provider gets paid (80% builder, 20% Hub).
      </p>

      <div className="rounded-xl border border-[#4FC3F7]/20 bg-[#4FC3F7]/5 p-4 my-6">
        <p className="font-mono text-sm font-bold text-[#4FC3F7] mb-2">Ready to dive in?</p>
        <p className="font-mono text-[12px] text-slate-400 leading-relaxed">
          Builder path: <Link href="/docs/builders/submit" className="text-[#4FC3F7] hover:underline">Register your API</Link>.{" "}
          Agent dev path: <Link href="/docs/quickstart" className="text-[#4FC3F7] hover:underline">Quickstart</Link>.{" "}
          Protocol nerds: <Link href="/docs/x402" className="text-[#4FC3F7] hover:underline">x402 flow</Link>.
        </p>
      </div>
    </DocLayout>
  );
}
