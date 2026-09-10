"use client";

// Unified Send — one non-custodial transfer card spanning TWO chains, with the
// network chosen INSIDE the card instead of by a wallet-wide switcher.
//
// Why this supersedes the old `network === "robinhood" ? <RhSendCard> :
// <SendCard>` split in BankClient: those were two cards behind a top switcher,
// and the switcher is going away (the wallet is moving to showing both chains at
// once). Send therefore has to carry its OWN chain, and it has to do so without
// the trap the split existed to avoid — the Base `SendCard` types its network as
// `YieldNetwork` (base | baseSepolia) and renders a Base Sepolia form when handed
// "robinhood", i.e. the wrong funds on the wrong chain. See the `can.send` note
// in lib/wallet/chains.ts.
//
// This card does not reinterpret either money path. It ports both VERBATIM from
// the two proven cards:
//   • Base       → user signs a plain ERC-20 `transfer` (cash) or a native send,
//                  exactly SendCard's EOA path. (The chat card's EIP-5792 gasless
//                  / builder-code path is intentionally NOT carried here — it is
//                  a Coinbase-Smart-Wallet nicety, not correctness, and a v1
//                  wallet card is better off on the one path every wallet signs.)
//   • Robinhood  → POST /api/robinhood/router/send-prepare (server builds
//                  calldata; user signs from their own wallet), exactly
//                  RhSendCard. No keys server-side, no funds touched.
//
// Every spend goes through the SAME fail-closed gate as every other surface
// (useSpendableBalance + resolveSpend): a balance that is merely UNREAD refuses
// to sign, it does not read as zero. Decimals are read on-chain, never assumed —
// USDG is 6, native is 18, and a guessed exponent is the exact bug the shared
// hook was written to kill.
//
// Scope note (v1): the Token selector offers the chain's cash (USDC / USDG) and
// its native ETH. The `ASSETS` list below is the seam where held-token sends
// would be added later — each would carry its own on-chain-read decimals, so the
// fail-closed gate already covers them.

import { useEffect, useState } from "react";
import {
  useAccount, useSwitchChain, useSendTransaction, useWriteContract, useWaitForTransactionReceipt, useReadContract,
} from "wagmi";
import { isAddress, parseUnits, formatUnits, namehash } from "viem";
import { WALLET_CHAINS } from "@/lib/wallet/chains";
import { ERC20_ABI } from "@/lib/yield-execution";
import { useSpendableBalance } from "@/lib/wallet/useSpendableBalance";
import { resolveSpend } from "@/lib/wallet/read-state";
import { UnverifiedBalance } from "@/components/wallet/UnverifiedBalance";

type SendNet = "base" | "robinhood";
type AssetKind = "cash" | "native";

const BASE = WALLET_CHAINS.base;
const RH = WALLET_CHAINS.robinhood;

// Forward Basename resolution, read straight off the verified Base L2 Resolver
// (OnchainKit's forward lookup returned "not found" for live names). Copied from
// the chat SendCard so this card holds no import into a 2,600-line chat file.
// Basenames are a BASE concept; they are only offered when network === "base".
const BASENAME_L2_RESOLVER = "0xC6d566A56A1aFf6508b41f6c90ff131615583BCD" as const;
const RESOLVER_ADDR_ABI = [
  { name: "addr", type: "function", stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }], outputs: [{ type: "address" }] },
] as const;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
function basenameToEns(input: string): string | null {
  const n = input.trim().toLowerCase();
  if (!n) return null;
  if (n.endsWith(".base")) return `${n}.eth`;
  if (n.endsWith(".base.eth") || n.endsWith(".eth")) return n;
  return null;
}
function safeNamehash(name: string | null): `0x${string}` | undefined {
  if (!name) return undefined;
  try { return namehash(name); } catch { return undefined; }
}

const truncAddr = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 6 });

// The send-prepare shape (mirrors RhSendCard / the chat card's PrepareResponse).
type PrepareResponse = {
  ok?: boolean;
  error?: string;
  tx?: { to: `0x${string}`; data: `0x${string}`; value: string; chainId: number };
};

// ── Chain marks ───────────────────────────────────────────────────────────────
// The Base wordmark path is the official brandmark. Robinhood Chain ships no
// asset in-repo, so its mark is a brand-green roundel — a chain-colour chip, not
// a claim to the trademark. Both are swappable for official SVGs later.
function BaseMark({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 111 111" aria-hidden style={{ flexShrink: 0 }}>
      <path fill="#0052FF" d="M54.921 110.034c30.438 0 55.113-24.632 55.113-55.017C110.034 24.632 85.359 0 54.921 0 26.043 0 2.353 22.171 0 50.392h72.847v9.25H0c2.353 28.22 26.043 50.392 54.921 50.392Z" />
    </svg>
  );
}
function RhMark({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="12" fill="#00C805" />
      <path d="M6.5 16.5c2.6-6.2 7.6-8.4 11-8.4-3.2 1.7-5.8 4.8-6.9 8.4H6.5z" fill="#0a2e12" />
    </svg>
  );
}
const MARK: Record<SendNet, (p: { size?: number }) => React.ReactElement> = { base: BaseMark, robinhood: RhMark };

const NETWORKS: { key: SendNet; label: string }[] = [
  { key: "base", label: "Base" },
  { key: "robinhood", label: "Robinhood" },
];

export default function WalletSendCard({
  account, initialNetwork = "base", initialTo, initialAmount, initialAsset = "cash",
}: {
  account?: `0x${string}`;
  initialNetwork?: SendNet;
  initialTo?: string;
  initialAmount?: string | number;
  initialAsset?: AssetKind;
}) {
  const { isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();
  const { writeContractAsync } = useWriteContract();

  const [network, setNetwork] = useState<SendNet>(initialNetwork);
  const [assetKind, setAssetKind] = useState<AssetKind>(initialAsset);
  const [recipient, setRecipient] = useState<string>(initialTo ?? "");
  const [amount, setAmount] = useState<string>(initialAmount != null ? String(initialAmount) : "");
  const [step, setStep] = useState<
    "idle" | "preparing" | "switching" | "signing" | "broadcasting" | "done" | "error"
  >("idle");
  const [err, setErr] = useState("");
  const [txHash, setTxHash] = useState<`0x${string}` | "">("");

  const cfg = WALLET_CHAINS[network];
  const chainId = cfg.chainId;
  const isNative = assetKind === "native";
  const symbol = isNative ? "ETH" : cfg.stableSymbol;
  const cashAddr = cfg.stable;

  // Balance of the sending asset WITH its on-chain scale, through the one hook —
  // so "still reading" and "could not read" stay distinct and the gate fails
  // closed. Re-reads when the network or asset changes.
  const bal = useSpendableBalance({
    holder: account, native: isNative, token: isNative ? undefined : cashAddr, chainId,
  });
  const balance = bal.balance;

  // Recipient. Base accepts a 0x address OR a Basename (name.base / name.eth);
  // Robinhood accepts a 0x address only (Basenames are a Base concept — resolving
  // one for a 4663 send would introduce a cross-chain dependency this card avoids).
  const recip = recipient.trim();
  const recipIsAddr = isAddress(recip);
  const namesAllowed = network === "base";
  const recipIsName = namesAllowed && /\.(base|eth)$/i.test(recip);
  const node = recipIsName ? safeNamehash(basenameToEns(recip)) : undefined;
  const { data: resolvedRaw, isLoading: resolving } = useReadContract({
    address: BASENAME_L2_RESOLVER, abi: RESOLVER_ADDR_ABI, functionName: "addr",
    args: node ? [node] : undefined, chainId: BASE.chainId,
    query: { enabled: !!node },
  });
  const resolvedAddr = resolvedRaw && resolvedRaw !== ZERO_ADDR ? (resolvedRaw as `0x${string}`) : undefined;
  const toAddress = (recipIsAddr ? recip : (recipIsName ? resolvedAddr : undefined)) as `0x${string}` | undefined;

  const amt = parseFloat(amount);

  // FAIL-CLOSED. `over` alone is false on an unread balance; resolveSpend supplies
  // the half that refuses to sign when the balance is merely unknown.
  const gate = resolveSpend({
    loading: bal.loading, received: bal.received, failed: bal.failed,
    over: balance != null && amt > balance,
  });
  const overBalance = gate === "insufficient";
  const valid = !!toAddress && amt > 0 && gate === "ok" && bal.decimals != null;
  const busy = step === "preparing" || step === "switching" || step === "signing" || step === "broadcasting";

  // 25 / 50 / 100% presets computed in BASE UNITS (raw * bps / 10000n) so the
  // string handed to parseUnits can never carry more decimals than the token has,
  // and "send 100%" can never round a hair over the real balance. Native leaves a
  // small gas reserve at 100% only.
  function setPct(bps: number) {
    if (bal.raw == null || bal.decimals == null) return;
    let part = (bal.raw * BigInt(bps)) / 10000n;
    if (isNative && bps === 10000) {
      const reserve = parseUnits("0.00005", bal.decimals);
      part = part > reserve ? part - reserve : 0n;
    }
    setAmount(formatUnits(part, bal.decimals));
  }

  // Watch the tx on the selected chain until it mines.
  const { isSuccess: mined, isError: minedErr } = useWaitForTransactionReceipt({
    hash: txHash || undefined, chainId, query: { enabled: !!txHash },
  });
  useEffect(() => {
    if (mined && step === "broadcasting") setStep("done");
    if (minedErr && step === "broadcasting") { setStep("error"); setErr("Transaction reverted on-chain."); }
  }, [mined, minedErr, step]);

  function pickNetwork(n: SendNet) {
    if (n === network) return;
    setNetwork(n); setAssetKind("cash"); setAmount(""); setErr(""); setTxHash("");
    if (step !== "idle") setStep("idle");
  }
  function pickAsset(a: AssetKind) { setAssetKind(a); setAmount(""); }

  async function send() {
    if (!account) { setErr("Connect your wallet"); setStep("error"); return; }
    if (!toAddress) {
      setErr(recipIsName ? "Couldn't resolve that name" : "Enter a valid 0x address"); setStep("error"); return;
    }
    if (!(amt > 0)) { setErr("Enter an amount"); setStep("error"); return; }
    // `valid` guards the CLICK; this guards the SIGNATURE. Same gate on purpose —
    // a stale render or keyboard submit must not reach a wallet prompt on an
    // unread or insufficient balance.
    if (gate !== "ok" || bal.decimals == null) {
      setErr(gate === "insufficient" ? `Amount exceeds your ${symbol} balance`
        : gate === "reading" ? "Still reading your balance — one moment"
        : "Couldn't read your balance — refusing to sign a transfer that may not settle");
      setStep("error"); return;
    }
    const dec = bal.decimals;
    setErr(""); setTxHash("");
    try {
      if (network === "robinhood") {
        // Server builds the calldata; the user signs. Identical to RhSendCard.
        setStep("preparing");
        const r = await fetch("/api/robinhood/router/send-prepare", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fromAddress: account, toAddress, token: isNative ? "ETH" : cashAddr, amount: String(amount),
          }),
        });
        const j = (await r.json()) as PrepareResponse;
        if (!r.ok || !j.ok || !j.tx) throw new Error(j.error || `Prepare failed (${r.status})`);
        setStep("switching");
        try { await switchChainAsync({ chainId }); }
        catch { throw new Error("Switch to Robinhood Chain (4663) and try again"); }
        setStep("signing");
        const hash = await sendTransactionAsync({
          to: j.tx.to, data: j.tx.data, value: BigInt(j.tx.value), chainId,
        });
        setTxHash(hash); setStep("broadcasting");
      } else {
        // Base — the user signs a plain transfer (cash) or a native send.
        setStep("switching");
        try { await switchChainAsync({ chainId }); }
        catch { throw new Error("Switch to Base and try again"); }
        setStep("signing");
        const hash = isNative
          ? await sendTransactionAsync({ to: toAddress, value: parseUnits(amount, dec), chainId })
          : await writeContractAsync({
              address: cashAddr, abi: ERC20_ABI, functionName: "transfer",
              args: [toAddress, parseUnits(amount, dec)], chainId,
            });
        setTxHash(hash); setStep("broadcasting");
      }
    } catch (e) {
      const m = (e as Error).message || String(e);
      const cancelled = /user rejected|denied|cancell?ed/i.test(m);
      setErr(cancelled ? "Send cancelled." : m.slice(0, 200));
      setStep("error");
    }
  }

  if (step === "done") {
    return (
      <div className="mt-2 rounded-xl border p-3.5" style={{ borderColor: "#22C55E40", background: "#22C55E08" }}>
        <div className="font-mono text-[11px] font-bold mb-1" style={{ color: "#22C55E" }}>
          ✓ Sent {fmt(amt)} {symbol} · {cfg.short}
        </div>
        <div className="font-mono text-[10px] text-slate-400 mb-2 break-all">
          to {recipIsName ? recip : truncAddr(toAddress ?? "")}
        </div>
        {txHash && (
          <a href={`${cfg.explorer}/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
             className="font-mono text-[10px] px-2.5 py-1 rounded-lg border border-[#4FC3F730] text-[#4FC3F7] inline-block mt-1">View tx ↗</a>
        )}
        <button onClick={() => { setStep("idle"); setAmount(""); setRecipient(""); setTxHash(""); }}
          className="font-mono text-[10px] text-slate-500 hover:text-slate-300 ml-3">Send again</button>
      </div>
    );
  }

  const NetIcon = MARK[network];

  return (
    <div className="mt-2 rounded-xl border border-[#1A1A2E] bg-[#0a0a0f] p-3.5">
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-[10px] text-slate-500 tracking-widest font-bold">SEND</span>
        <span className="font-mono text-[9px] text-slate-600 flex items-center gap-1"><NetIcon size={11} />{cfg.short}</span>
      </div>

      {/* Network — chosen in-card. Base + Robinhood only; no Base Sepolia. */}
      <div className="font-mono text-[9px] text-slate-600 mb-1">NETWORK</div>
      <div className="flex gap-1.5 mb-3">
        {NETWORKS.map(({ key, label }) => {
          const Icon = MARK[key];
          const active = network === key;
          return (
            <button key={key} onClick={() => pickNetwork(key)} disabled={busy}
              className="flex-1 flex items-center justify-center gap-1.5 font-mono text-[11px] py-1.5 rounded-lg transition-colors disabled:opacity-50"
              style={active
                ? { background: "#4FC3F712", color: "#4FC3F7", border: "1px solid #4FC3F730" }
                : { color: "#94a3b8", border: "1px solid #1A1A2E" }}>
              <Icon size={13} />{label}
            </button>
          );
        })}
      </div>

      {/* Token — the chain's cash (USDC/USDG) or its gas token (ETH). */}
      <div className="font-mono text-[9px] text-slate-600 mb-1">TOKEN</div>
      <div className="flex gap-1.5 mb-3">
        {(["cash", "native"] as const).map(a => {
          const active = assetKind === a;
          const lbl = a === "cash" ? cfg.stableSymbol : "ETH";
          return (
            <button key={a} onClick={() => pickAsset(a)} disabled={busy}
              className="flex-1 font-mono text-[11px] py-1.5 rounded-lg transition-colors disabled:opacity-50"
              style={active
                ? { background: "#4FC3F712", color: "#4FC3F7", border: "1px solid #4FC3F730" }
                : { color: "#94a3b8", border: "1px solid #1A1A2E" }}>
              {lbl}
            </button>
          );
        })}
      </div>

      {/* Amount + balance-aware presets */}
      <div className="rounded-lg border border-[#1A1A2E] bg-[#050508] p-2.5 mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="font-mono text-[9px] text-slate-600">YOU SEND</span>
          {balance != null && (
            <span className="font-mono text-[9px] text-slate-600">Bal {balance.toFixed(isNative ? 5 : 2)} {symbol}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input type="number" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.0"
            className="flex-1 bg-transparent font-mono text-[16px] text-white outline-none placeholder:text-slate-700 w-0" />
          <span className="font-mono text-[11px] text-slate-300 px-2 py-1.5 rounded-lg border border-[#1A1A2E]">{symbol}</span>
        </div>
        {/* 25 / 50 / 100% — shown only once a balance is actually established, so a
            preset can never be computed off an unread balance. */}
        {balance != null && (
          <div className="flex gap-1.5 mt-2">
            {([["25%", 2500], ["50%", 5000], ["Max", 10000]] as const).map(([lbl, bps]) => (
              <button key={lbl} type="button" onClick={() => setPct(bps)}
                className="flex-1 font-mono text-[9px] py-1 rounded-md border border-[#1A1A2E] text-slate-400 hover:text-[#4FC3F7] hover:border-[#4FC3F730] transition-colors">
                {lbl}
              </button>
            ))}
          </div>
        )}
        {overBalance && <div className="font-mono text-[9px] text-red-500 mt-1.5">Exceeds your {symbol} balance</div>}
      </div>

      {/* Recipient */}
      <div className="rounded-lg border border-[#1A1A2E] bg-[#050508] p-2.5 mb-3">
        <div className="font-mono text-[9px] text-slate-600 mb-1">RECIPIENT</div>
        <input value={recipient} onChange={e => setRecipient(e.target.value)}
          placeholder={namesAllowed ? "0x…, name.base or name.eth" : "0x… address"}
          spellCheck={false} autoCapitalize="none" autoCorrect="off"
          className="w-full bg-transparent font-mono text-[12px] text-white outline-none placeholder:text-slate-700" />
        {/* Resolution status — honest about what actually resolves on this chain. */}
        <div className="font-mono text-[9px] mt-1 h-3">
          {recipIsName && resolving ? <span className="text-slate-500">resolving {recip}…</span>
            : recipIsName && toAddress ? <span className="text-[#22C55E]">→ {truncAddr(toAddress)}</span>
            : recipIsName && recip.length > 3 ? <span className="text-red-500">name not found on Base</span>
            : recipIsAddr ? <span className="text-[#22C55E]">✓ valid address</span>
            : recip.length > 0 ? (
                <span className="text-amber-400">
                  {namesAllowed ? "Enter a 0x address or a name.base / name.eth" : "Enter a valid 0x address on Robinhood Chain"}
                </span>
              )
            : <span className="text-slate-600">{namesAllowed ? "Address or Basename (name.base / name.eth)" : "Address only — Basenames are a Base concept"}</span>}
        </div>
      </div>

      {gate === "unverified" && (
        <UnverifiedBalance symbol={symbol} onRetry={() => { void bal.refetch(); }} busy={bal.refetching} />
      )}
      {step === "broadcasting" && <p className="font-mono text-[10px] text-slate-400 mb-2">Broadcasting… waiting for the block.</p>}
      {step === "error" && <p className="font-mono text-[10px] text-amber-400 mb-2">{err}</p>}

      <button onClick={send} disabled={!valid || busy || !isConnected}
        className="w-full font-mono text-[12px] font-bold py-2 rounded-lg transition-all disabled:opacity-50"
        style={{ background: "#34D39915", color: "#34D399", border: "1px solid #34D39940" }}>
        {!isConnected ? "Connect your wallet"
          : busy
            ? (step === "preparing" ? "Preparing…"
              : step === "switching" ? "Switch network…"
              : step === "signing" ? "Confirm in wallet…"
              : "Broadcasting…")
            : gate === "unverified" ? "Balance unread — held"
            : overBalance ? "Insufficient balance"
            : `Send ${amt > 0 ? fmt(amt) : ""} ${symbol}${toAddress ? ` → ${recipIsName ? recip : truncAddr(toAddress)}` : ""}`}
      </button>
      <p className="font-mono text-[9px] text-slate-700 mt-1.5">
        {cfg.short} · you sign every transaction · non-custodial · sends are final.
      </p>
    </div>
  );
}
