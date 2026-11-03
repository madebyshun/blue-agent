import { DocHeader, H2, P, Callout, CodeBlock, PrevNext } from "../_ui";

export const metadata = { title: "Connect your agent — Blue Agent Docs" };

// Setup prompts per client (2026-11-03, after Argus and TOLLY's pages). Two
// doors: the remote MCP (no install, free tools, paid tools show their price)
// and the local x402 bridge from @blueagent/x402 (pays from a wallet the user
// funds, under caps checked before any signature). Read-only is the default.

const PROMPT = `Connect Blue Agent as an MCP server, read-only first.
Server: https://blueagent.dev/api/mcp
Then call blue_doctor to confirm it works, and blue_registry to list what it can do.
Do not pay for any tool until I say so. Every number Blue Agent returns names its chain (Base 8453 or Robinhood Chain 4663).`;

export default function AgentSetupDoc() {
  return (
    <article>
      <DocHeader
        eyebrow="Guides"
        title="Connect your agent"
        lead="Paste one prompt into Claude Code, Codex, Cursor or any MCP client. It starts read-only: free tools run, paid tools show their price, nothing is signed."
      />

      <H2 id="prompt">The setup prompt</H2>
      <CodeBlock title="Paste into your agent">{PROMPT}</CodeBlock>

      <H2 id="clients">Or add it yourself</H2>
      <CodeBlock title="Claude Code" badge="remote">{`claude mcp add --transport http blue-agent https://blueagent.dev/api/mcp`}</CodeBlock>
      <CodeBlock title="Codex · Cursor · Claude Desktop" badge="remote">{`{
  "mcpServers": {
    "blue-agent": { "url": "https://blueagent.dev/api/mcp" }
  }
}`}</CodeBlock>

      <H2 id="pay">When you want it to pay</H2>
      <P>Most clients cannot pay an x402 tool by themselves. The local bridge from @blueagent/x402 does: it signs the exact USDC authorization on Base with a wallet you fund only for this, and refuses any payment above your caps before it signs.</P>
      <CodeBlock title="Claude Code" badge="paid">{`claude mcp add blue-agent \\
  -e BUYER_PRIVATE_KEY=0x... -e BLUEAGENT_MAX_PER_CALL=0.05 -e BLUEAGENT_BUDGET=1.00 \\
  -- npx -y --package @blueagent/x402 blueagent-x402-mcp`}</CodeBlock>
      <Callout title="Keep the key small" color="#F59E0B">
        Use a fresh wallet holding only what the agent may spend. The key stays on your machine; Blue Agent never sees it. Paid tools cost $0.01 to $0.05 a call in USDC on Base, and a failed call is not charged.
      </Callout>

      <H2 id="do">What to ask first</H2>
      <CodeBlock title="Prompts">{`Is 0x940181a94A35A4569E4529A3CDfB74e38FD98631 safe to swap on Base?
Compare NVDA on Base and on Robinhood Chain.
What is trending on Base that I could still exit?
List open jobs on Blue Agent I could deliver.`}</CodeBlock>

      <PrevNext current="/docs/agent-setup" />
    </article>
  );
}
