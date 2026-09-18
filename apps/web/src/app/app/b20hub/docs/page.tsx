/**
 * B20HUB public docs.
 *
 * ⚠ THIS PAGE IS PUBLIC — it is not behind the app shell's auth and has no
 * middleware entry. Treat every sentence here as marketing copy a stranger
 * reads, not as an internal note.
 *
 * HONESTY (#272): this page used to render a "$BLUE buyback flywheel" section
 * promising "constant BUY pressure on $BLUE", plus a contract table listing the
 * pre-migration token as the current reward token and the retired treasury
 * wallet as the "5% recipient multisig". Meanwhile /pledge told the same
 * visitor that liquidity behind the old token is NOT planned to be maintained.
 * One public page promised buy pressure on a token the other said was being
 * drained. The mechanism is real and still running, so the fix is not to hide
 * it — it is to say what it actually buys and where the 5% actually lands.
 *
 * Addresses are IMPORTED, never retyped. The old table hardcoded hex literals
 * and drifted three deployments behind; a literal cannot tell you it has been
 * superseded. Everything below resolves through `lib/b20hub/constants.ts`.
 */
import type { Metadata } from "next";
import {
  B20_FACTORY,
  B20HUB_BUYBACK,
  B20HUB_FEE_RECIPIENT,
  B20HUB_HOOK,
  PERMIT2_BASE,
  V4_POOL_MANAGER,
  V4_POSITION_MANAGER,
} from "@/lib/b20hub/constants";
// The pledge module is the migration's source of truth for what the OLD token
// is. Importing it here means this page cannot keep calling that address "the
// reward token" after the migration reassigns the name.
import { CHAINS } from "@/lib/pledge/config";

const OLD_BLUE = CHAINS.base.token.address;

export const metadata: Metadata = {
  title: "B20HUB Docs — Tokenomics & Mechanics",
  description:
    "How B20HUB launches work: 100B fixed supply, hardcoded opening price, permanent LP lock, 80/15/5 fee split, and where the buyback share actually goes.",
};

const Section = ({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) => (
  <section id={id} className="mb-12 scroll-mt-16">
    <h2 className="font-mono text-lg font-bold mb-3">{title}</h2>
    <div className="prose-invert font-mono text-sm text-slate-300 leading-relaxed space-y-3">
      {children}
    </div>
  </section>
);

const Code = ({ children }: { children: React.ReactNode }) => (
  <code className="text-[#4FC3F7] bg-[#0a0a12] border border-[#1A1A2E] px-1.5 py-0.5 rounded text-[11px]">
    {children}
  </code>
);

const Block = ({ children }: { children: React.ReactNode }) => (
  <pre className="rounded-xl border border-[#1A1A2E] bg-[#0a0a12] p-4 overflow-x-auto font-mono text-[10px] text-slate-300 leading-relaxed">
    {children}
  </pre>
);

/**
 * Amber, not red: these are facts about immutable bytecode a reader needs
 * before drawing a conclusion, not an error and not a security warning.
 */
const Warn = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-4 my-4">
    <p className="font-mono text-[11px] font-bold text-amber-300 tracking-wide uppercase mb-2">
      ⚠ {title}
    </p>
    <div className="font-mono text-[12px] text-slate-300 leading-relaxed">
      {children}
    </div>
  </div>
);

export default function B20HUBDocsPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <p className="font-mono text-[9px] text-slate-600 tracking-widest uppercase mb-2">
        docs · b20hub
      </p>
      <h1 className="font-mono text-3xl font-bold mb-3">How B20HUB works</h1>
      <p className="font-mono text-sm text-slate-400 leading-relaxed mb-10">
        Every launch through B20HUB is a real{" "}
        <a
          href="https://docs.base.org/get-started/launch-b20-token"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#4FC3F7] underline"
        >
          B20 token
        </a>{" "}
        on Base, paired with a Uniswap V4 pool whose LP NFT is locked in a
        custom hook. The hook enforces the fee split at the protocol level.
        None of this is a UX convention — every rule below is enforced by
        contract bytecode you can verify on Basescan.
      </p>

      <TableOfContents />

      <Section id="one-tx" title="Everything in one signature">
        <p>
          A single call to{" "}
          <Code>launcher.launch(name, symbol, variant, decimals, totalSupply, feeTier, creator, salt)</Code>{" "}
          executes 10 steps atomically. If any step reverts, the whole tx
          unwinds — no partial state, no orphan tokens, no leaked custody.
        </p>
        <ol className="list-decimal ml-5 space-y-1 text-slate-400">
          <li>Deploy the B20 token via the 0xB20f factory precompile</li>
          <li>Approve V4 PositionManager (dual: ERC20 → Permit2 → PosMgr)</li>
          <li>Build PoolKey with canonical currency ordering</li>
          <li>Compute tick geometry (Position A wide, Position B narrow)</li>
          <li>Compute liquidity for both positions from token amounts</li>
          <li>Pre-write creator + Position A tokenId to hook via setPending</li>
          <li>Initialize V4 pool at OPENING_SQRT_PRICE_X96 (constant)</li>
          <li>Mint both LP positions in a batched modifyLiquidities call</li>
          <li>safeTransferFrom LP NFTs → hook (permanent lock)</li>
          <li>Renounce DEFAULT_ADMIN_ROLE on the B20 token</li>
        </ol>
      </Section>

      <Section id="supply" title="Fixed 100B supply per launch">
        <p>
          Every B20HUB launch mints{" "}
          <Code>100_000_000_000e18</Code> — 100 billion tokens, all seeded
          into the V4 pool. The creator holds{" "}
          <span className="text-[#EF4444] font-bold">zero</span> tokens.
          Their upside is 80% of swap fees, not held supply.
        </p>
        <p>
          Custom supply is disabled by design. Small pools (e.g. 420 tokens)
          starve the AMM of depth, so router simulators refuse to quote
          real trades against them. Uniform supply keeps every pool
          liquid on the same terms.
        </p>
      </Section>

      <Section id="opening-price" title="Hardcoded opening price">
        <p>
          The launcher uses a protocol-level constant for the initial pool
          price:
        </p>
        <Block>
{`uint160 public constant OPENING_SQRT_PRICE_X96 =
    21697525899373897447157608931207664;
// ≈ $4,000 market cap at $3,000/ETH, for 100B supply`}
        </Block>
        <p>
          Every launch opens at the same sqrt price. USD market cap floats
          with ETH's spot: 2× ETH → 2× USD mcap. Matches the pump.fun /{" "}
          <a href="https://launch.o1.exchange/" target="_blank" rel="noopener noreferrer" className="text-[#4FC3F7] underline">
            o1.exchange
          </a>{" "}
          pattern where every launch shows the same headline mcap because
          the parameter is baked into the contract, not user-picked.
        </p>
      </Section>

      <Section id="fee-split" title="80 / 15 / 5 fee split">
        <p>
          Every swap on a B20HUB pool routes its fee (0.3%, 1%, or 3%
          depending on tier) through the hook. Fees accrue inside the LP
          position until someone triggers{" "}
          <Code>hook.claimFees(poolId, key)</Code> (permissionless — anyone
          can call, recipients are hard-coded).
        </p>
        <Block>
{`uint16 public constant CREATOR_BPS  = 8000; // 80 %
uint16 public constant BUYBACK_BPS  = 1500; // 15 %
uint16 public constant TREASURY_BPS =  500; //  5 %`}
        </Block>
        <p>
          Creator address is locked at launch via{" "}
          <Code>setPending(creator, lpTokenId)</Code> — it cannot be
          reassigned. BuyBack and Treasury are hook immutables.
        </p>
        <p>
          The 80% is the part that concerns a creator, and it is unqualified:
          it pays the launch address, permissionlessly, forever. The other two
          legs both currently land on a wallet Blue Agent has retired — read
          the next section before reading them as a token thesis.
        </p>
      </Section>

      <Section id="buyback" title="Where the 15% buyback share goes">
        <p>
          The 15% share lands as WETH in a dedicated{" "}
          <Code>BlueBuyBack</Code> contract. Once its balance clears{" "}
          <Code>minDistributeThreshold</Code> (default 0.001 WETH),{" "}
          <em>anyone</em> can call <Code>distribute()</Code>. The contract:
        </p>
        <ol className="list-decimal ml-5 space-y-1 text-slate-400">
          <li>Swaps its entire WETH balance for $BLUEAGENT via the V4 pool</li>
          <li>Skims 0.1% keeper reward → sends to <Code>msg.sender</Code></li>
          <li>Sends the remaining 99.9% → the recipient set at deploy time</li>
        </ol>
        <Warn title="Read this before treating the buyback as a reason to hold">
          <p>
            Both facts below are properties of{" "}
            <em>already-deployed, immutable bytecode</em>. Neither can be
            changed without redeploying, and redeploying the V4 hook changes
            its address — which would require a new pool. We are publishing
            them rather than working around them.
          </p>
          <ol className="list-decimal ml-5 space-y-2 mt-3">
            <li>
              <strong>The token it buys is the pre-migration one.</strong>{" "}
              $BLUEAGENT is mid-relaunch. Our own{" "}
              <a href="/pledge" className="text-[#4FC3F7] underline">
                pledge page
              </a>{" "}
              states that liquidity behind the old token is{" "}
              <em>not planned to be maintained</em> after the migration. So
              this contract does keep buying — it just buys the asset being
              migrated away from. Do not read it as support for a price.
            </li>
            <li>
              <strong>
                The 99.9% goes to a wallet we have since retired.
              </strong>{" "}
              <Code>payoutRecipient</Code> was fixed in the constructor and has
              no setter — deliberately, so that a compromised owner could never
              redirect it. The address it points at is the old Blue Agent
              treasury, not the current one. Re-read on-chain 2026-09-18.
            </li>
          </ol>
          <p className="mt-3">
            The keeper reward in step 2 is unaffected: it pays{" "}
            <Code>msg.sender</Code>, so if you trigger{" "}
            <Code>distribute()</Code> you receive it.
          </p>
        </Warn>
      </Section>

      <Section id="lp-lock" title="Permanent LP lock">
        <p>
          Position NFTs are transferred to the hook after mint and never
          leave.{" "}
          <Code>beforeRemoveLiquidity</Code> reverts on any{" "}
          <Code>liquidityDelta != 0</Code>. Fee-only collection
          (delta = 0) is allowed through so the split can execute — that&apos;s
          the entire attack surface.
        </p>
        <p>
          Creators cannot rug. Even the launcher cannot rug — it doesn&apos;t
          have owner-controlled transfer of the NFT out of the hook, and{" "}
          <Code>renounceRole(DEFAULT_ADMIN_ROLE, launcher)</Code> is
          called in the same tx.
        </p>
      </Section>

      <Section id="contracts" title="Deployed contracts (Base mainnet)">
        <p className="text-slate-400 text-[12px]">
          Every launch touches these addresses. All verified source on
          Basescan — check them there rather than trusting this table.
        </p>
        <ContractRow label="B20 Factory" hint="Rust precompile, protocol built-in" addr={B20_FACTORY} />
        <ContractRow label="V4 PoolManager" hint="Uniswap V4 singleton"   addr={V4_POOL_MANAGER} />
        <ContractRow label="V4 PositionManager" hint="LP NFT contract"    addr={V4_POSITION_MANAGER} />
        <ContractRow label="Permit2" hint="V4's approval router"          addr={PERMIT2_BASE} />
        <ContractRow label="B20HUB Hook" hint="Holds the LP NFT, enforces the 80/15/5 split" addr={B20HUB_HOOK} />
        <ContractRow label="BlueBuyBack" hint="Receives the 15% share as WETH" addr={B20HUB_BUYBACK} />
        <ContractRow label="Fee recipient" hint="Retired wallet — receives BOTH the 5% and the buyback's 99.9%" addr={B20HUB_FEE_RECIPIENT} />
        <ContractRow label="$BLUEAGENT" hint="Pre-migration token — see the buyback note above" addr={OLD_BLUE} />
      </Section>

      <Section id="fees-in-usd" title="What does creator take home?">
        <p>
          At 0.3% fee tier and a $1,000 daily volume:
        </p>
        <Block>
{`Daily gross fee:  $1,000 × 0.3%      = $3
  Creator 80%:                        = $2.40
  BuyBack 15%:                        = $0.45
  Treasury 5%:                        = $0.15

Yearly (constant $1K/day volume):
  Creator:                            ≈ $876
  BuyBack pumping $BLUE:              ≈ $164`}
        </Block>
        <p>
          Volume compounds hard — a pool at $10K/day daily volume returns{" "}
          ~$8.7K/year to the creator, pump-and-dump-ing $1.6K/year of $BLUE
          buys. Because the LP is locked and fees are protocol-enforced,
          the creator can walk away and still earn — the pool works on
          autopilot for the life of the contract.
        </p>
      </Section>

      <Section id="split-plans" title="Roadmap: standalone domain">
        <p>
          B20HUB may move to its own domain (e.g. <Code>b20hub.blue</Code>).
          The pages under <Code>/app/b20hub/*</Code> are structured to
          split cleanly: strip the prefix, keep the layout, and every
          internal Link works verbatim. No page depends on the parent
          BlueAgent shell.
        </p>
      </Section>
    </div>
  );
}

function TableOfContents() {
  const items = [
    ["one-tx",       "Everything in one signature"],
    ["supply",       "Fixed 100B supply"],
    ["opening-price","Hardcoded opening price"],
    ["fee-split",    "80/15/5 fee split"],
    ["buyback",      "$BLUE buyback flywheel"],
    ["lp-lock",      "Permanent LP lock"],
    ["contracts",    "Deployed contracts"],
    ["fees-in-usd",  "Creator take-home math"],
    ["split-plans",  "Standalone domain roadmap"],
  ];
  return (
    <nav className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-4 mb-10 grid sm:grid-cols-2 gap-2">
      {items.map(([id, title]) => (
        <a
          key={id}
          href={`#${id}`}
          className="font-mono text-[11px] text-slate-400 hover:text-[#4FC3F7] transition-colors"
        >
          → {title}
        </a>
      ))}
    </nav>
  );
}

function ContractRow({ label, hint, addr }: { label: string; hint: string; addr: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[#1A1A2E] bg-[#0a0a12] px-3 py-2.5">
      <div>
        <div className="font-mono text-xs text-slate-200 font-bold">{label}</div>
        <div className="font-mono text-[9px] text-slate-500">{hint}</div>
      </div>
      <a
        href={`https://basescan.org/address/${addr}`}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-[10px] text-[#4FC3F7] hover:underline"
      >
        {addr.slice(0, 8)}…{addr.slice(-6)} ↗
      </a>
    </div>
  );
}
