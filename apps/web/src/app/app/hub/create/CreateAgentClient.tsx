"use client";

import { useState } from "react";
import Link from "next/link";
import { useAccount, useSendTransaction, useSwitchChain } from "wagmi";
import { base } from "wagmi/chains";
import { createPublicClient, encodeFunctionData, http, parseEventLogs, isAddress } from "viem";
import { ConnectButton } from "@/components/ConnectModal";
import {
  ERC8004_IDENTITY_ADDRESS as REGISTRY, ERC8004_MANAGE_ABI as ABI,
  draftProblem, draftDataUri, draftRegistration, type AgentDraft,
} from "@/lib/erc8004-draft";

const pub = createPublicClient({ chain: base, transport: http() });
const EXPLORER = (id: string) => `https://erc-8004.quicknode.com/agents/base-mainnet/${id}`;
const input = "w-full rounded-lg border border-[#1A1A2E] bg-[#07080C] px-3 py-2 text-[12px] text-[#E2E8F0] outline-none focus:border-[#2a3350]";
const label = "text-[11px] text-[#94A3B8]";

type Step = { state: "idle" | "busy" | "done" | "error"; msg?: string; tx?: string };

export default function CreateAgentClient() {
  const { address, chainId, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();
  const [d, setD] = useState<AgentDraft>({ name: "", description: "", image: "", web: "", mcp: "", a2a: "", x402: false });
  const [mint, setMint] = useState<Step & { agentId?: string }>({ state: "idle" });
  const [mid, setMid] = useState("");
  const [owner, setOwner] = useState<string | null>(null);
  const [manage, setManage] = useState<Step>({ state: "idle" });
  const [to, setTo] = useState("");
  const set = (k: keyof AgentDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setD({ ...d, [k]: k === "x402" ? (e.target as HTMLInputElement).checked : e.target.value });
  const clean: AgentDraft = { ...d, image: d.image || undefined, web: d.web || undefined, mcp: d.mcp || undefined, a2a: d.a2a || undefined };
  const problem = draftProblem(clean);

  async function send(data: `0x${string}`) {
    if (chainId !== base.id) await switchChainAsync({ chainId: base.id });
    const hash = await sendTransactionAsync({ to: REGISTRY, data, chainId: base.id });
    const rc = await pub.waitForTransactionReceipt({ hash });
    if (rc.status !== "success") throw new Error(`transaction reverted (${hash})`);
    return rc;
  }

  async function onMint() {
    setMint({ state: "busy", msg: "Confirm in your wallet…" });
    try {
      const rc = await send(encodeFunctionData({ abi: ABI, functionName: "register", args: [draftDataUri(clean)] }));
      const ev = parseEventLogs({ abi: ABI, logs: rc.logs, eventName: "Registered" })[0];
      const id = ev ? ev.args.agentId.toString() : undefined;
      setMint({ state: "done", tx: rc.transactionHash, agentId: id, msg: id ? `Agent #${id} is yours.` : "Minted. Read the agent id from the transaction." });
      if (id) setMid(id);
    } catch (e) {
      setMint({ state: "error", msg: (e as Error).message.split("\n")[0].slice(0, 200) });
    }
  }

  async function lookup() {
    setOwner(null); setManage({ state: "idle" });
    if (!/^\d+$/.test(mid)) return setManage({ state: "error", msg: "Agent id is a number." });
    try {
      setOwner(String(await pub.readContract({ address: REGISTRY, abi: ABI, functionName: "ownerOf", args: [BigInt(mid)] })).toLowerCase());
    } catch {
      setManage({ state: "error", msg: `No agent #${mid} on Base.` });
    }
  }
  const mine = !!owner && !!address && owner === address.toLowerCase();

  async function onUpdate() {
    setManage({ state: "busy", msg: "Confirm in your wallet…" });
    try {
      const rc = await send(encodeFunctionData({ abi: ABI, functionName: "setAgentURI", args: [BigInt(mid), draftDataUri(clean)] }));
      setManage({ state: "done", tx: rc.transactionHash, msg: `Agent #${mid} now points at the file above.` });
    } catch (e) { setManage({ state: "error", msg: (e as Error).message.split("\n")[0].slice(0, 200) }); }
  }

  async function onTransfer() {
    if (!isAddress(to)) return setManage({ state: "error", msg: "Not an address." });
    setManage({ state: "busy", msg: "Confirm in your wallet…" });
    try {
      const rc = await send(encodeFunctionData({ abi: ABI, functionName: "transferFrom", args: [address!, to, BigInt(mid)] }));
      setManage({ state: "done", tx: rc.transactionHash, msg: `Agent #${mid} moved to ${to}.` });
      setOwner(to.toLowerCase());
    } catch (e) { setManage({ state: "error", msg: (e as Error).message.split("\n")[0].slice(0, 200) }); }
  }

  const Status = ({ s }: { s: Step }) => s.state === "idle" ? null : (
    <p className={`text-[11px] ${s.state === "error" ? "text-[#F87171]" : s.state === "done" ? "text-[#34D399]" : "text-[#94A3B8]"}`}>
      {s.msg}{s.tx && <> · <a className="text-[#4FC3F7]" href={`https://basescan.org/tx/${s.tx}`} target="_blank" rel="noreferrer">Basescan ↗</a></>}
    </p>
  );

  return (
    <div className="h-full overflow-y-auto font-mono [&_button]:font-mono [&_a]:font-mono [&_input]:font-mono [&_textarea]:font-mono">
      <div className="mx-auto max-w-[1100px] px-6 py-6 lg:px-8 grid gap-5">
        <div>
          <Link href="/app/hub/agents" className="text-[11px] tracking-[.14em] text-[#64748B] hover:text-[#4FC3F7]">// AGENT EXCHANGE</Link>
          <h1 className="mt-1 text-[20px] font-semibold text-[#E2E8F0]">Create an agent</h1>
          <p className="mt-1.5 max-w-[860px] text-[12px] leading-[1.7] text-[#94A3B8]">
            Your agent as an ERC-8004 identity on Base 8453: an NFT that 8004scan, QuickNode&apos;s explorer and any agent directory can read.
            The file describing it lives inside the NFT, so nobody hosts it, us included. Free: you only pay a few cents of gas, from your own wallet.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] items-start">
          <section className="rounded-xl border border-[#1A1A2E] bg-[#0B0D12] px-4 py-4 grid gap-3">
            <h2 className="text-[13px] font-semibold text-[#E2E8F0]">Your agent</h2>
            <label className="grid gap-1"><span className={label}>Name *</span><input className={input} value={d.name} onChange={set("name")} maxLength={60} /></label>
            <label className="grid gap-1"><span className={label}>What it does</span><textarea className={`${input} min-h-[90px]`} value={d.description} onChange={set("description")} maxLength={600} /></label>
            <label className="grid gap-1"><span className={label}>Image URL (https)</span><input className={input} value={d.image} onChange={set("image")} placeholder="https://…/logo.png" /></label>
            <label className="grid gap-1"><span className={label}>Website</span><input className={input} value={d.web} onChange={set("web")} placeholder="https://" /></label>
            <label className="grid gap-1"><span className={label}>MCP endpoint</span><input className={input} value={d.mcp} onChange={set("mcp")} placeholder="https://…/mcp" /></label>
            <label className="grid gap-1"><span className={label}>A2A agent card</span><input className={input} value={d.a2a} onChange={set("a2a")} placeholder="https://…/.well-known/agent-card.json" /></label>
            <label className="flex items-center gap-2 text-[11px] text-[#94A3B8]">
              <input type="checkbox" checked={d.x402} onChange={set("x402")} /> Takes x402 payments. Paid calls to its payTo show up on the Agent Exchange, measured on chain.
            </label>
            {problem && d.name && <p className="text-[11px] text-[#F87171]">{problem}</p>}
          </section>

          <div className="grid gap-5">
            <section className="rounded-xl border border-[#1A1A2E] bg-[#0B0D12] px-4 py-4 grid gap-3">
              <h2 className="text-[13px] font-semibold text-[#E2E8F0]">Create</h2>
              <ol className="grid list-decimal gap-1 pl-4 text-[11px] text-[#94A3B8]">
                <li>Connect a wallet on Base.</li>
                <li>Mint: one transaction, <code>register()</code> on the ERC-8004 registry <a className="text-[#4FC3F7]" href={`https://basescan.org/address/${REGISTRY}`} target="_blank" rel="noreferrer">0x8004…a432</a>.</li>
                <li>The wallet that signs owns the agent. Whoever holds the NFT controls it, so keep it in a wallet you keep.</li>
              </ol>
              {!isConnected ? <ConnectButton label="Connect wallet" /> : (
                <button type="button" disabled={!!problem || mint.state === "busy"} onClick={onMint}
                  className="rounded-md bg-[#4FC3F7] px-3 py-2 text-[12px] font-semibold text-[#03131c] disabled:opacity-40">
                  {mint.state === "busy" ? "Minting…" : "Create agent"}
                </button>
              )}
              <Status s={mint} />
              {mint.agentId && <a className="text-[11px] text-[#4FC3F7]" href={EXPLORER(mint.agentId)} target="_blank" rel="noreferrer">View agent #{mint.agentId} in an explorer ↗</a>}
            </section>

            <section className="rounded-xl border border-[#1A1A2E] bg-[#0B0D12] px-4 py-4 grid gap-3">
              <h2 className="text-[13px] font-semibold text-[#E2E8F0]">Manage an agent you own</h2>
              <div className="flex gap-2">
                <input className={input} value={mid} onChange={(e) => setMid(e.target.value.trim())} placeholder="Agent id, e.g. 1137821" />
                <button type="button" onClick={lookup} className="rounded-md border border-[#1A1A2E] bg-[#0F121A] px-3 text-[12px] text-[#E2E8F0]">Look up</button>
              </div>
              {owner && <p className="text-[11px] text-[#94A3B8]">Owner {owner.slice(0, 6)}…{owner.slice(-4)}{mine ? " · that is you" : " · not the connected wallet, read only"}</p>}
              {mine && (
                <>
                  <button type="button" disabled={!!problem || manage.state === "busy"} onClick={onUpdate}
                    className="rounded-md border border-[#1A1A2E] bg-[#0F121A] px-3 py-2 text-[12px] text-[#E2E8F0] disabled:opacity-40">
                    Replace its file with the form on the left
                  </button>
                  <div className="grid gap-1.5">
                    <input className={input} value={to} onChange={(e) => setTo(e.target.value.trim())} placeholder="Move to wallet 0x…" />
                    <button type="button" disabled={manage.state === "busy" || !to} onClick={onTransfer}
                      className="rounded-md border border-[#3a1f24] bg-[#0F121A] px-3 py-2 text-[12px] text-[#F87171] disabled:opacity-40">
                      Transfer agent (the new wallet controls it)
                    </button>
                  </div>
                </>
              )}
              <Status s={manage} />
            </section>

            <section className="rounded-xl border border-[#1A1A2E] bg-[#0B0D12] px-4 py-3.5">
              <h2 className="mb-2 text-[13px] font-semibold text-[#E2E8F0]">File preview</h2>
              <pre className="max-h-[220px] overflow-auto whitespace-pre-wrap break-all text-[10.5px] text-[#cbd5e1]">{JSON.stringify(draftRegistration(clean), null, 2)}</pre>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
