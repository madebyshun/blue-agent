import { DocHeader, H2, H3, P, Callout, CodeBlock, CardGrid, Card, PrevNext } from "../_ui";

export const metadata = { title: "Blue Agent + Coinbase for Agents — Blue Agent Docs" };

// One agent, two MCP servers, two jobs (2026-10-29). Coinbase for Agents places
// the orders in the user's own Coinbase account; Blue Agent only reads Base and
// Robinhood Chain. Blue Agent never sees a Coinbase key or touches an order —
// keep it that way: holding a user's exchange key would be a custody change.
// Coinbase facts below are from docs.cdp.coinbase.com/coinbase-for-agents
// (read 2026-10-29); re-read them before changing this page.

export default function CoinbaseAgentsDoc() {
  return (
    <article>
      <DocHeader
        eyebrow="Guides"
        title="Blue Agent + Coinbase for Agents"
        lead="Give your AI agent both halves of a trade: Coinbase places the orders in your Coinbase account, Blue Agent reads the chain on Base and Robinhood Chain. Your agent keeps its own keys."
      />

      <CardGrid cols={2}>
        <Card title="Coinbase MCP: execution" color="#4FC3F7">
          Orders, portfolios and balances in your own Coinbase Advanced account: spot, US equities and, where eligible, derivatives. You sign in with OAuth and choose which portfolio the agent can use.
        </Card>
        <Card title="Blue Agent MCP: on-chain reads" color="#A78BFA">
          Token checks, safe trending, wallet risk and stock-token signals on Base 8453 and Robinhood Chain 4663. Blue Agent holds no key and places no order.
        </Card>
      </CardGrid>

      <H2 id="setup">Set up in Claude Code</H2>
      <P>Add both servers. Each one signs in on its own; nothing is shared between them.</P>
      <CodeBlock title="Terminal" badge="MCP">{`claude mcp add --transport http coinbase https://agents.coinbase.com/mcp
claude mcp add --transport http blue-agent https://blueagent.dev/api/mcp`}</CodeBlock>
      <P>Other clients (Claude Desktop, Cursor, ChatGPT) take the same two URLs. Coinbase also publishes a setup guide your agent can read: ask it to &quot;Set up coinbase.com/skill.md&quot;.</P>

      <Callout title="Fence the agent first" color="#F59E0B">
        Coinbase recommends a separate Advanced portfolio funded only with what you are willing to risk, with the agent scoped to it. Its keys can move funds between your portfolios but cannot withdraw to an outside address. You can revoke access any time in Coinbase: Security, Connections.
      </Callout>

      <H2 id="prompts">Prompts that use both</H2>
      <H3>Check before you buy</H3>
      <CodeBlock title="Prompt">{`Use blue-agent token_verdict on <token address> on Base (paid, $0.01).
If it is not a honeypot and exit liquidity is above $50k,
preview a $25 market buy in my agent portfolio on Coinbase. Do not place it until I say yes.`}</CodeBlock>
      <H3>Stocks on two venues</H3>
      <CodeBlock title="Prompt">{`Use blue-agent stock_signal for NVDA on Base and on Robinhood Chain.
Then show me NVDA on Coinbase and tell me where the prices differ.`}</CodeBlock>
      <H3>What is moving</H3>
      <CodeBlock title="Prompt">{`Use blue-agent trending_safe for Base. For the top three, show the tax and exit depth,
then list which of them Coinbase lists as a product.`}</CodeBlock>

      <H2 id="pay">What it costs</H2>
      <P>Some Blue Agent tools are free in any client: token_price, sign_check, approvals_audit, send_prepare, bridge_prepare. Five are paid: token_verdict, stock_signal, wallet_risk and swap_prepare at $0.01, trending_safe at $0.05, in USDC on Base over x402. A failed call is not charged. Coinbase trading fees are Coinbase&apos;s own.</P>
      <P>A plain MCP client shows the price of a paid tool and stops. To pay, use an x402-capable MCP client, or Blue Agent&apos;s local bridge, which signs the exact USDC authorization with a wallet you fund for it and never sends the key anywhere (see the x402 client in the Blue Agent repo, packages/x402-client).</P>

      <Callout title="Not advice">
        Blue Agent reports what the chain shows; it does not tell your agent what to buy. Every order is placed by your agent in your Coinbase account, under your limits.
      </Callout>

      <PrevNext current="/docs/coinbase-agents" />
    </article>
  );
}
