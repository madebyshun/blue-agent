import type { Metadata } from "next";
import Link from "next/link";
import { DocHeader, H2, H3, P, Callout, Card, CardGrid, PrevNext } from "../_ui";

export const metadata: Metadata = {
  title: "BlueAgent on Robinhood — Blue Agent Docs",
  description:
    "How BlueAgent is launching a second $BLUEAGENT token on Robinhood Chain via Virtuals Protocol — two independent contracts sharing one name — and how the new Robinhood Chain chat skills (bridge, send, swap) slot in beside it.",
};

export default function BlueAgentOnRobinhoodDoc() {
  return (
    <article>
      <DocHeader
        eyebrow="Launch · Robinhood Chain"
        title="BlueAgent on Robinhood — via Virtuals"
        lead={
          <>
            BlueAgent is the AI copilot for Base builders. We&apos;re launching
            a second, Robinhood-side <strong className="text-slate-200">$BLUEAGENT</strong>{" "}
            token via Virtuals Protocol — a separate contract from Base&apos;s
            $BLUEAGENT, on a separate chain, but sharing the same name. Two
            tokens, one agent. Alongside the launch, chat gets new
            Robinhood Chain skills — bridge, send, swap — so users can
            operate on the chain without leaving the conversation.
          </>
        }
      />

      <Callout color="#4FC3F7" title="TL;DR">
        <strong>Two tokens, one name.</strong> Base{" "}
        <strong>$BLUEAGENT</strong> (<code>0xf895…6ba3</code>) is the
        internal utility unit — you spend it on x402 tool calls and stake
        it for credits. Robinhood <strong>$BLUEAGENT</strong> is a new
        Virtuals launch — 1B supply, bonding curve, LP locked 10 years at
        42K VIRTUAL graduation, 1% swap fee (70% creator / 30% Virtuals
        Treasury). Independent contracts, no bridge between them. Chat
        gets new Robinhood Chain skills (bridge / send / swap) to work
        with any token on the chain.
      </Callout>

      <H2 id="why">Why a second token</H2>
      <P>
        BlueAgent already has a live token on Base:{" "}
        <code className="text-slate-300">$BLUEAGENT</code> at{" "}
        <code className="text-slate-300">0xf895…6ba3</code>, with a mature
        Uniswap V4 pool and holders using it for x402 payments and staked
        credits. That token is doing its job — but it&apos;s a utility unit
        first, not a distribution instrument, and it&apos;s immutable with no
        mint. Any new tokenomics needs a new contract.
      </P>
      <P>
        Virtuals Protocol is now the dominant launchpad for agent tokens,
        and Virtuals went live on Robinhood Chain (chainId 4663) with an
        active cohort (Project VEX, Clawbank, others). Launching a second
        $BLUEAGENT token there gives us:
      </P>
      <ul className="space-y-2.5 my-5">
        {[
          "Distribution via the Virtuals bonding curve — no bootstrap needed.",
          "A fresh venue that doesn't fragment liquidity with the existing Base $BLUEAGENT pool.",
          "Alignment with an active agent-token cohort on Robinhood, not a lonely start.",
          "A clean economic instrument — buyback flywheels can target it without disturbing x402 payment UX.",
        ].map((t, i) => (
          <li key={i} className="flex gap-3 font-mono text-[12px] text-slate-400 leading-relaxed">
            <span className="text-[#4FC3F7] shrink-0">·</span>
            <span>{t}</span>
          </li>
        ))}
      </ul>

      <Callout color="#F59E0B" title="What this is not">
        This is <strong>not</strong> a migration and <strong>not</strong> a
        bridge. The two $BLUEAGENT tokens are fully independent contracts.
        Existing Base $BLUEAGENT holders keep everything. There is no
        forced conversion and no cross-chain plumbing between the two.
        Same name is deliberate; same asset it is not.
      </Callout>

      <H2 id="two-tokens">The two-token model</H2>
      <CardGrid cols={2}>
        <Card title="Base $BLUEAGENT" color="#0052FF">
          <div className="space-y-1.5">
            <div><strong className="text-slate-300">Role:</strong> x402 payments + staked credits</div>
            <div><strong className="text-slate-300">Address:</strong> 0xf895…6ba3</div>
            <div><strong className="text-slate-300">Venue:</strong> Uniswap V4 on Base</div>
            <div><strong className="text-slate-300">Status:</strong> Live, immutable, no mint</div>
            <div className="pt-1 text-slate-500">
              Used to pay for <code>/api/x402/*</code> tool calls, tips, and
              staking for credits. Non-tradeable at the product level, but
              freely DEX-tradeable via the existing V4 pool. Not affected
              by this launch.
            </div>
          </div>
        </Card>
        <Card title="Robinhood $BLUEAGENT" color="#0AC18E">
          <div className="space-y-1.5">
            <div><strong className="text-slate-300">Role:</strong> Agent-economy — fee buybacks + governance signal</div>
            <div><strong className="text-slate-300">Address:</strong> TBD (post-launch)</div>
            <div><strong className="text-slate-300">Venue:</strong> Virtuals bonding curve → AMM at graduation</div>
            <div><strong className="text-slate-300">Chain:</strong> Robinhood Chain (chainId 4663)</div>
            <div className="pt-1 text-slate-500">
              1B fixed supply. Launched via Virtuals Protocol. Bonding
              curve until 42K VIRTUAL raised; then auto-migrates to an AMM
              pool with LP locked 10 years. 1% swap fee, split 70% creator
              / 30% Virtuals Treasury.
            </div>
          </div>
        </Card>
      </CardGrid>

      <P>
        The mental model: <strong>Base $BLUEAGENT is the currency of the
        product</strong> (users pay it, agents earn it, stakers lock it);{" "}
        <strong>Robinhood $BLUEAGENT is the equity of the agent</strong>{" "}
        (its bonding-curve price aggregates market conviction and it soaks
        up buybacks). Merging them would force one of two bad outcomes —
        either x402 payers would need to bridge across chains for every
        tool call (broken UX), or traders would be stuck on a Uniswap V4
        pool without Virtuals&apos; distribution engine (broken launch).
        Splitting the roles keeps both clean.
      </P>

      <H2 id="virtuals">How Virtuals works</H2>
      <P>
        Virtuals is an agent-tokenization launchpad. A creator pays{" "}
        <strong>100 VIRTUAL</strong> to open a bonding curve for a fixed
        1B token supply. Anyone can trade during the bonding phase. When
        cumulative buys hit <strong>42K VIRTUAL</strong>, Virtuals
        auto-creates a Uniswap-style AMM pool, seeds it with the
        accumulated liquidity, and{" "}
        <strong>locks the LP for 10 years</strong>. The token is now
        permanently liquid.
      </P>
      <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] overflow-hidden divide-y divide-[#1A1A2E] my-5">
        {[
          { k: "Entry cost",       v: "100 VIRTUAL (creator pays to open the curve)" },
          { k: "Fixed supply",     v: "1,000,000,000 tokens (no mint after)" },
          { k: "Graduation target",v: "42,000 VIRTUAL raised on the curve" },
          { k: "Post-grad venue",  v: "Auto-seeded AMM pool, LP locked 10 years" },
          { k: "Swap fee",         v: "1% on every trade" },
          { k: "Fee split",        v: "70% creator (BlueAgent) / 30% Virtuals Treasury" },
          { k: "Anti-sniper tax",  v: "Starts at 99% and decays to 1% over the first minutes" },
        ].map(({ k, v }) => (
          <div key={k} className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4 px-5 py-3">
            <code className="font-mono text-[11px] text-[#4FC3F7] shrink-0 sm:w-40">{k}</code>
            <span className="font-mono text-[11px] text-slate-500 leading-relaxed">{v}</span>
          </div>
        ))}
      </div>

      <Callout color="#22C55E" title="Why the LP lock matters">
        The 10-year LP lock is what makes the graduation event honest — no
        rug via LP withdrawal is possible. It also means everyone (creator
        included) has to earn liquidity by holding, not by yanking it.
      </Callout>

      <H2 id="robinhood-chain">Why Robinhood Chain, not Base again</H2>
      <P>
        Base is the primary chain for the product — the console, x402
        tools, MCP server, and B20HUB launchpad all sit on Base and will
        keep sitting on Base. Doing a second launch on Base would fragment
        liquidity with the existing $BLUEAGENT V4 pool for no distribution
        benefit.
      </P>
      <P>
        Robinhood Chain is the opposite: fresh, low-fragmentation, and
        hosts the currently-hot Virtuals cohort. It also has a real user
        base coming in from Robinhood&apos;s consumer app, which is a
        distribution channel we can&apos;t match on Base today.
        blueagent.dev already integrates Robinhood Chain end-to-end (see
        the{" "}
        <Link href="/app/launches" className="text-[#4FC3F7] underline">
          launches feed
        </Link>{" "}
        — Robinhood tab) so the operational cost of running a second chain
        is near zero.
      </P>

      <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] overflow-hidden divide-y divide-[#1A1A2E] my-5">
        {[
          { k: "Chain ID",   v: "4663" },
          { k: "RPC",        v: "https://rpc.mainnet.chain.robinhood.com" },
          { k: "Explorer",   v: "https://explorer.chain.robinhood.com" },
          { k: "$VIRTUAL",   v: "0xc6911796042b15d7Fa4F6CDe69e245DdCd3d9c31" },
          { k: "Currency",   v: "Native token gas; Virtuals launches priced in $VIRTUAL" },
        ].map(({ k, v }) => (
          <div key={k} className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4 px-5 py-3">
            <code className="font-mono text-[11px] text-[#0AC18E] shrink-0 sm:w-32">{k}</code>
            <code className="font-mono text-[11px] text-slate-500 break-all">{v}</code>
          </div>
        ))}
      </div>

      <H2 id="chat-skills">Robinhood Chain skills in Blue Chat</H2>
      <P>
        The launch ships alongside a set of chat-native Robinhood Chain
        skills. These are <strong>generic RH capabilities</strong>, not
        specific to $BLUEAGENT — they work with any ERC-20 on the chain
        (including $VEX, $CLAWBANK, $VIRTUAL, and the new Robinhood
        $BLUEAGENT after launch). All skills are{" "}
        <strong>non-custodial</strong>: the server builds calldata; the
        user signs in their own wallet.
      </P>
      <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] overflow-hidden divide-y divide-[#1A1A2E] my-5">
        {[
          {
            k: "hub_rh_bridge",
            color: "#4FC3F7",
            status: "Building",
            v: "Move any token between Base and Robinhood. Ask: \"bridge 100 USDC to Robinhood\" — three-step signed card (Approve → Send → Delivery) with LayerZero Scan tracker link. UI pattern borrowed from bridge.clawbank.co.",
          },
          {
            k: "hub_rh_send",
            color: "#22C55E",
            status: "Building",
            v: "Transfer any RH ERC-20 (or native gas) to any address. \"Send 25 VIRTUAL to 0x…\" → signed card in chat. Shipping first — no new contracts needed.",
          },
          {
            k: "robinhood_swap",
            color: "#F59E0B",
            status: "Live · expanding",
            v: "Buy/sell against the Virtuals cohort. Existing card handles ETH↔token via the on-chain RobinhoodSwapRouter (0x3bb0…d23D). Extending to token↔token so you can trade VEX ↔ VIRTUAL ↔ RH $BLUEAGENT directly.",
          },
          {
            k: "hub_robinhood_launch",
            color: "#0AC18E",
            status: "Live",
            v: "Deploy your own RH token via Bankr — 95/5 split, auto UniV3 pool at 0x1f7d…2EfA. Ask: \"launch a token called X on Robinhood\".",
          },
        ].map(({ k, color, status, v }) => (
          <div key={k} className="px-5 py-3">
            <div className="flex items-center justify-between mb-1.5">
              <code className="font-mono text-[11px] font-bold" style={{ color }}>{k}</code>
              <span className="font-mono text-[9px] text-slate-500 uppercase tracking-widest">{status}</span>
            </div>
            <p className="font-mono text-[11px] text-slate-500 leading-relaxed">{v}</p>
          </div>
        ))}
      </div>
      <P>
        Under the hood these reuse{" "}
        <code className="text-slate-300">/api/robinhood/router/swap-prepare</code>{" "}
        — the existing non-custodial calldata pattern. New endpoints:{" "}
        <code className="text-slate-300">bridge-prepare</code>,{" "}
        <code className="text-slate-300">send-prepare</code>. The chat
        client renders a card that mirrors{" "}
        <code className="text-slate-300">RobinhoodSwapCard</code>: quote /
        fee line-item, one-click sign, tx hash + explorer link on success.
      </P>

      <H2 id="timeline">Launch timeline</H2>
      <P>
        Six phases. Chat-skill build starts immediately and runs in
        parallel with the announce window. Virtuals submission waits until
        the announce phase has seeded a cohort.
      </P>
      <ol className="space-y-3 my-5">
        {[
          {
            phase: "Now — announce",
            text: "This doc + the /blueagent-on-robinhood landing page ship. Agent metadata drafted for the Virtuals form. Virtuals submission paused so the announcement can seed the initial cohort before the curve opens.",
          },
          {
            phase: "Ship chat skills",
            text: "hub_rh_send + robinhood_swap token↔token first (no new contracts needed), then hub_rh_bridge behind them. All non-custodial calldata via server, user signs in wallet.",
          },
          {
            phase: "T-day — create on Virtuals",
            text: "Submit the agent at app.virtuals.io on Robinhood Chain. Pay 100 VIRTUAL entry. Sign with the deployer wallet. Bonding curve for the new Robinhood $BLUEAGENT opens instantly.",
          },
          {
            phase: "Bonding phase",
            text: "Anyone can trade RH $BLUEAGENT on the curve. 1% fee per swap (70% creator / 30% Virtuals Treasury). Anti-sniper tax decays 99% → 1% over the first few minutes.",
          },
          {
            phase: "42K VIRTUAL — graduation",
            text: "Virtuals auto-creates the AMM pool, seeds LP from the accumulated curve, and locks LP for 10 years. RH $BLUEAGENT is now permanently liquid on Robinhood.",
          },
          {
            phase: "Post-grad integration on blueagent.dev",
            text: "RH $BLUEAGENT gets added to /app/launches (Robinhood tab) with a token detail page. Swap-fee revenue is routed into a buyback contract that accrues for Base $BLUEAGENT stakers — the two tokens stay separate but the flywheel connects them.",
          },
        ].map(({ phase, text }, i) => (
          <li key={i} className="rounded-xl border border-[#1A1A2E] bg-[#0d0d12] p-4 flex gap-4">
            <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 font-mono text-[10px] font-bold bg-[#4FC3F715] text-[#4FC3F7] border border-[#4FC3F740]">
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-mono text-sm font-bold text-slate-200">{phase}</div>
              <div className="font-mono text-[12px] text-slate-500 mt-1 leading-relaxed">{text}</div>
            </div>
          </li>
        ))}
      </ol>

      <H2 id="post-grad">Post-graduation integration plan</H2>
      <P>
        Graduation is the start, not the finish. The Virtuals AMM pool
        provides a floor — the product needs to give RH $BLUEAGENT reasons
        to keep appreciating beyond speculation. Three levers:
      </P>

      <H3 id="lever-buybacks">1. Fee-driven buybacks</H3>
      <P>
        blueagent.dev already runs a{" "}
        <code className="text-slate-300">BlueBuyBack</code> contract on
        Base (used by B20HUB — 15% of B20HUB pool fees buy Base $BLUEAGENT
        for stakers). We&apos;ll deploy a Robinhood-side equivalent that
        routes a portion of Virtuals swap-fee revenue (the 70% creator
        share) into RH $BLUEAGENT buybacks. The bought RH $BLUEAGENT feeds
        into a mechanism that ultimately accrues for Base $BLUEAGENT
        stakers — connecting the two economies without merging the
        tokens.
      </P>

      <H3 id="lever-visibility">2. Visibility inside the console</H3>
      <P>
        RH $BLUEAGENT gets first-class treatment in{" "}
        <Link href="/app/launches" className="text-[#4FC3F7] underline">
          /app/launches
        </Link>{" "}
        — dedicated token detail page, live curve/pool data, holder
        distribution, and the same market grid the other Robinhood
        launches already use. No special-case UI; it&apos;s just a token in
        the feed, with the agent-metadata badge because it&apos;s the
        flagship.
      </P>

      <H3 id="lever-governance">3. Governance signal</H3>
      <P>
        RH $BLUEAGENT holder weight becomes a soft input into product
        decisions we already put to the community — which x402 tools to
        prioritize, which hub agents to feature, which grants to co-fund.
        Not on-chain governance at launch; that comes only if there&apos;s
        clear demand and a real question worth voting on.
      </P>

      <H2 id="bridge-question">Can I bridge between the two $BLUEAGENTs?</H2>
      <P>
        <strong>No.</strong> The two tokens are independent contracts on
        independent chains. There is no bridge that turns Base $BLUEAGENT
        into RH $BLUEAGENT or vice versa — attempting to do so via a
        third-party bridge would just move a Base ERC-20 to a chain where
        it has no economic weight.
      </P>
      <P>
        What the <code className="text-slate-300">hub_rh_bridge</code>{" "}
        chat skill does is different: it lets you bridge{" "}
        <em>other</em> tokens (USDC, ETH, VIRTUAL, VEX) between Base and
        Robinhood via LayerZero, so you can move liquidity onto Robinhood
        Chain and then buy RH $BLUEAGENT (or anything else) from there.
      </P>

      <H2 id="risks">Risks and things to watch</H2>
      <ul className="space-y-2.5 my-5">
        {[
          "Curve dynamics: Virtuals bonding curves can graduate fast or stall — the anti-sniper tax helps with the first minute but doesn't guarantee a smooth curve. Expect volatility.",
          "Same-name confusion: two tokens named $BLUEAGENT on two chains creates lookup risk. Always verify the address matches the chain — Base = 0xf895…6ba3, Robinhood = TBD-post-launch, and any address that doesn't match is not us.",
          "Robinhood Chain maturity: fewer indexers, thinner infra than Base. blueagent.dev has direct RPC + DexScreener integration, but third-party tools may lag.",
          "Virtuals dependency: creator-share fees + LP lock are enforced by Virtuals contracts. Auditing that surface is part of our launch checklist.",
          "Regulatory posture: agent tokens sit in a live regulatory conversation. Neither $BLUEAGENT is equity, neither is a security, and neither is marketed as an investment — they're signal + fee-flywheel units for the agent economy.",
        ].map((t, i) => (
          <li key={i} className="flex gap-3 font-mono text-[12px] text-slate-400 leading-relaxed">
            <span className="text-slate-600 shrink-0">—</span>
            <span>{t}</span>
          </li>
        ))}
      </ul>

      <H2 id="links">Links</H2>
      <CardGrid cols={2}>
        <Card title="Landing (announce)" color="#4FC3F7" href="/blueagent-on-robinhood">
          The public /blueagent-on-robinhood page — the shareable version.
        </Card>
        <Card title="Virtuals Protocol" color="#0AC18E" href="https://app.virtuals.io">
          Where the launch happens on T-day.
        </Card>
        <Card title="Robinhood Explorer" color="#0AC18E" href="https://explorer.chain.robinhood.com">
          Verify chain activity live.
        </Card>
        <Card title="@blueagent_" color="#4FC3F7" href="https://x.com/blueagent_">
          Follow for the T-day address drop.
        </Card>
      </CardGrid>

      <PrevNext current="/docs/blueagent-on-robinhood" />
    </article>
  );
}
