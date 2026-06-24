import type { Metadata } from "next";
import { DocHeader, H2, P, CodeBlock, Callout, Card, CardGrid, PrevNext } from "../_ui";

export const metadata: Metadata = {
  title: "Beryl / B20 — Blue Agent Docs",
  description:
    "Beryl is the Base network upgrade that introduces B20 — a Rust precompile for compliant tokenized assets. Learn the policy system, roles, and key addresses.",
};

export default function BerylDoc() {
  return (
    <article>
      <DocHeader
        eyebrow="Base Protocol"
        title="Beryl / B20"
        lead="B20 is Base's native standard for compliant tokenized assets — enforced by a Rust precompile in the node, not EVM bytecode. Activated by the Beryl upgrade on June 25, 2026."
      />

      <H2 id="what-is-b20">What is B20?</H2>
      <P>
        <strong>B20</strong> (Base Standard 20) is a tokenization primitive built directly into the Base node
        as a <strong>Rust precompile</strong>. This means compliance rules — pause, policy gating, supply
        caps — are enforced at the node level and cannot be bypassed by EVM bytecode.
      </P>
      <P>
        B20 is not a smart contract standard like ERC-20. It is an extension of the Base execution
        environment itself, activated by the <strong>Beryl</strong> network upgrade.
      </P>

      <Callout color="#4FC3F7" title="Beryl Activation">
        Mainnet: June 25, 2026 at 18:00 UTC.
        {" "}Base Sepolia: already active.
        {" "}Use the <a href="/app/b20" className="underline">B20 Hub</a> to inspect tokens, check roles,
        and browse the on-chain registry.
      </Callout>

      <H2 id="variants">Two Variants</H2>
      <CardGrid cols={2}>
        <Card title="ASSET" color="#4FC3F7">
          For tokenized real-world assets — stocks, commodities, real estate. Supports rebase via a{" "}
          <code className="text-slate-300">multiplier()</code> view function.
        </Card>
        <Card title="STABLECOIN" color="#22C55E">
          For fiat-backed stable assets. Has a{" "}
          <code className="text-slate-300">currency()</code> field (e.g. <code className="text-slate-300">"USD"</code>)
          to declare the peg.
        </Card>
      </CardGrid>

      <H2 id="addresses">Key Addresses</H2>
      <P>All precompile addresses are the same on both mainnet and Sepolia.</P>
      <CodeBlock title="Base precompile addresses">
{`B20Factory        0xB20f000000000000000000000000000000000000
PolicyRegistry    0x8453000000000000000000000000000000000002
ActivationRegistry 0x8453000000000000000000000000000000000001`}
      </CodeBlock>

      <H2 id="deploying">Deploying a B20 Token</H2>
      <P>
        Tokens are created through the B20Factory. The factory emits a{" "}
        <code className="text-slate-300">B20Created</code> event for each deploy.
      </P>
      <CodeBlock title="Create a B20 token" badge="Solidity">
{`// ASSET variant (variant = 0)
IB20Factory factory = IB20Factory(0xB20f000000000000000000000000000000000000);
address token = factory.createB20(
  "My Token",     // name
  "MTK",          // symbol
  18,             // decimals
  0,              // variant: 0 = ASSET, 1 = STABLECOIN
  ""              // variantParams (abi-encoded extra data)
);`}
      </CodeBlock>

      <H2 id="policies">Policy System</H2>
      <P>
        B20 supports <strong>exactly two</strong> policy types: <code className="text-slate-300">ALLOWLIST</code>{" "}
        and <code className="text-slate-300">BLOCKLIST</code>. Policies are managed through the
        PolicyRegistry precompile and assigned to one of four scopes per token.
      </P>

      <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] overflow-hidden divide-y divide-[#1A1A2E] my-5">
        {[
          { scope: "TRANSFER_SENDER_POLICY",   desc: "Governs who can send tokens."          },
          { scope: "TRANSFER_RECEIVER_POLICY", desc: "Governs who can receive tokens."        },
          { scope: "TRANSFER_EXECUTOR_POLICY", desc: "Governs who can call transferFrom()."   },
          { scope: "MINT_RECEIVER_POLICY",     desc: "Governs who can receive newly minted tokens." },
        ].map(({ scope, desc }) => (
          <div key={scope} className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4 px-5 py-3">
            <code className="font-mono text-[11px] text-[#4FC3F7] shrink-0 sm:w-64">{scope}</code>
            <span className="font-mono text-[11px] text-slate-500">{desc}</span>
          </div>
        ))}
      </div>

      <P>policyId = 0 means <em>ALWAYS_ALLOW</em> (no restriction). To restrict a scope:</P>
      <CodeBlock title="Create + apply a policy" badge="Solidity">
{`IPolicyRegistry pReg = IPolicyRegistry(0x8453000000000000000000000000000000000002);

// 1. Create the policy (returns a uint64 policyId)
uint64 id = pReg.createPolicy(adminAddress, IPolicyRegistry.PolicyType.ALLOWLIST);

// 2. Add authorized addresses
pReg.addToPolicy(id, allowedAddress);

// 3. Apply it to the token scope
token.updatePolicy(token.TRANSFER_RECEIVER_POLICY(), id);`}
      </CodeBlock>

      <Callout color="#F59E0B" title="Common mistakes">
        There is <strong>no registerPolicy()</strong> function. Call{" "}
        <code className="text-slate-300">createPolicy(admin, PolicyType)</code> on the PolicyRegistry to
        get a policyId, then apply it with <code className="text-slate-300">token.updatePolicy(scope, policyId)</code>.
        Freeze-seize (<code className="text-slate-300">burnBlocked()</code>) and supply caps
        (<code className="text-slate-300">updateSupplyCap()</code>) are role-gated, not policy types.
      </Callout>

      <H2 id="roles">7 Core Roles</H2>
      <P>
        B20 uses OpenZeppelin AccessControl internally but omits{" "}
        <code className="text-slate-300">AccessControlEnumerable</code> — role holders cannot be
        enumerated. Use <code className="text-slate-300">hasRole(role, address)</code> to check specific
        accounts (see the <a href="/app/b20" className="text-[#4FC3F7] underline">B20 Hub → Roles tab</a>).
      </P>

      <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] overflow-hidden divide-y divide-[#1A1A2E] my-5">
        {[
          { role: "DEFAULT_ADMIN_ROLE", desc: "Manages all other roles. Sets supply cap via updateSupplyCap()." },
          { role: "MINT_ROLE",          desc: "Can mint new tokens to any address."  },
          { role: "BURN_ROLE",          desc: "Can burn tokens (holder must approve or consent)." },
          { role: "BURN_BLOCKED_ROLE",  desc: "Freeze-seize: can call burnBlocked(from, amount) to confiscate and burn tokens." },
          { role: "PAUSE_ROLE",         desc: "Can pause TRANSFER, MINT, or BURN features independently." },
          { role: "UNPAUSE_ROLE",       desc: "Can unpause any paused feature." },
          { role: "METADATA_ROLE",      desc: "Can update token name, symbol, and other metadata." },
        ].map(({ role, desc }) => (
          <div key={role} className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4 px-5 py-3">
            <code className="font-mono text-[11px] text-[#4FC3F7] shrink-0 sm:w-56">{role}</code>
            <span className="font-mono text-[11px] text-slate-500">{desc}</span>
          </div>
        ))}
      </div>

      <H2 id="supply-cap">Supply Cap</H2>
      <P>
        B20 tokens have an on-chain supply cap enforced at the node level. The sentinel value{" "}
        <code className="text-slate-300">type(uint128).max</code> means uncapped.
        Call <code className="text-slate-300">token.supplyCap()</code> to read the current cap.
        Update it with <code className="text-slate-300">token.updateSupplyCap(newCap)</code> —
        requires <code className="text-slate-300">DEFAULT_ADMIN_ROLE</code>.
      </P>

      <H2 id="pause">Pause / Unpause</H2>
      <P>
        Transfers, minting, and burns can each be paused independently.
        Call <code className="text-slate-300">token.isPaused(PausableFeature.TRANSFER)</code> to check.
        The Scanner tab in the B20 Hub shows live pause status for any token.
      </P>

      <H2 id="freeze-seize">Freeze-Seize (burnBlocked)</H2>
      <P>
        The BURN_BLOCKED_ROLE grants the ability to forcibly confiscate and burn tokens from any address.
        This is distinct from policy blocking (which prevents transfers) — burnBlocked permanently removes
        tokens from circulation. It requires explicit regulatory authority and is designed for asset
        recovery in regulated markets.
      </P>
      <CodeBlock title="Freeze-seize" badge="Solidity">
{`// Requires BURN_BLOCKED_ROLE
token.burnBlocked(holderAddress, amount);`}
      </CodeBlock>

      <H2 id="inspector">On-Chain Inspector</H2>
      <P>
        Use the <a href="/app/b20" className="text-[#4FC3F7] underline">B20 Hub</a> to inspect any token
        live — zero LLM, all data from multicall. Check scanner results, role holders, the on-chain
        registry, and simulate transfers before they happen.
      </P>

      <Callout color="#22C55E" title="Deploy B20 via Blue Chat">
        In Blue Chat, type{" "}
        <code className="text-slate-300">deploy a B20 asset token named "My Token" symbol "MTK"</code> —
        the agent will generate and sign a createB20 Factory transaction directly.
      </Callout>

      <PrevNext current="/docs/beryl" />
    </article>
  );
}
