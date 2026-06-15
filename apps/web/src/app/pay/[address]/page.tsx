"use client";

// Public payment-request page — the shareable surface of BlueBank scan-to-pay.
// A payee turns a Receive request into a link (/pay/<address>?amount=&asset=&network=)
// and sends it over Telegram/Zalo/etc. The payer lands here, connects their own
// wallet, and signs the transfer through the same non-custodial SendCard the
// dashboard uses. No amount editing of the payee — the link fixes who gets paid.

import { Suspense, useState, type ReactNode } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useAccount, useConnect } from "wagmi";
import { isAddress } from "viem";
import { QRCodeSVG } from "qrcode.react";
import { SendCard } from "@/app/chat/components/ToolCards";
import { useBasename, shortAddr } from "@/lib/useBasename";
import { buildPaymentUri } from "@/lib/payment-qr";
import { YIELD_NETWORKS, type YieldNetwork } from "@/lib/yield-execution";

const isName = (s: string) => /^[a-z0-9-]+(\.[a-z0-9-]+)*\.(base|eth)$/i.test(s);

export default function PayPage() {
  return (
    <Suspense fallback={<PayShell><div className="font-mono text-[11px] text-slate-600 text-center">Loading payment request…</div></PayShell>}>
      <PayInner />
    </Suspense>
  );
}

function PayInner() {
  const params = useParams<{ address: string }>();
  const search = useSearchParams();

  const to = decodeURIComponent(params?.address ?? "").trim();
  const valid = isAddress(to) || isName(to);
  const toAddr = isAddress(to) ? (to as `0x${string}`) : undefined;

  const amount = search.get("amount") ?? undefined;
  const asset: "USDC" | "ETH" = (search.get("asset") ?? "USDC").toUpperCase() === "ETH" ? "ETH" : "USDC";
  const network: YieldNetwork = search.get("network") === "baseSepolia" ? "baseSepolia" : "base";
  const label = search.get("label") ?? search.get("for") ?? undefined;

  // Reverse-resolve a Basename for a nicer "you're paying" header (address links).
  const { name } = useBasename(toAddr);
  const payeeLabel = isName(to) ? to : (name || shortAddr(to));

  const { address, isConnected } = useAccount();
  const payer = address as `0x${string}` | undefined;

  const net = YIELD_NETWORKS[network];
  const hasAmount = !!amount && parseFloat(amount) > 0;

  // EIP-681 URI for the QR / "open in wallet" path. Only address links produce a
  // valid URI; name links fall back to the connect-and-pay path (SendCard resolves).
  const uri = toAddr ? buildPaymentUri({ to: toAddr, amount: amount ?? "", asset, network }) : "";
  const isDeepLink = uri.startsWith("ethereum:");

  const [copied, setCopied] = useState(false);
  function copyAddr() {
    navigator.clipboard?.writeText(to).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }

  if (!valid) {
    return (
      <PayShell>
        <div className="text-center">
          <div className="font-mono text-[13px] text-red-400 mb-1">Invalid payment link</div>
          <div className="font-mono text-[10px] text-slate-600 break-all">&ldquo;{to || "(empty)"}&rdquo; isn&apos;t a Base address or name.base.</div>
        </div>
      </PayShell>
    );
  }

  return (
    <PayShell>
      {/* Payee + requested amount */}
      <div className="text-center mb-5">
        <div className="font-mono text-[10px] text-slate-500 tracking-widest mb-1">YOU&apos;RE PAYING</div>
        <div className="font-mono text-[18px] font-bold text-white">{payeeLabel}</div>
        {hasAmount && (
          <div className="font-mono text-[26px] font-bold text-[#34D399] mt-1.5">{amount} <span className="text-base text-slate-500">{asset}</span></div>
        )}
        {label && <div className="font-mono text-[11px] text-slate-400 mt-1.5">for &ldquo;{label}&rdquo;</div>}
        <div className="font-mono text-[9px] text-slate-600 mt-2 break-all px-2">{to}</div>
      </div>

      {/* Primary — connect & pay in-page (non-custodial; payer signs) */}
      {isConnected && payer
        ? <SendCard result={{ to, amount, asset, network }} account={payer} />
        : <PayConnect />}

      {/* Secondary — scan / open in any EIP-681 wallet (address links only) */}
      {uri && (
        <div className="mt-5 pt-4 border-t border-[#1A1A2E]">
          <div className="font-mono text-[9px] text-slate-600 tracking-widest mb-3 text-center">OR PAY WITH ANY WALLET</div>
          <div className="flex flex-col items-center">
            <div className="bg-white p-2.5 rounded-xl">
              <QRCodeSVG value={uri} size={150} bgColor="#ffffff" fgColor="#0a0a0f" level="M" />
            </div>
            <div className="flex items-center gap-2 mt-3">
              {isDeepLink && (
                <a href={uri} className="font-mono text-[11px] px-4 py-2 rounded-lg" style={{ background: "#4FC3F710", color: "#4FC3F7", border: "1px solid #4FC3F730" }}>
                  Open in wallet ↗
                </a>
              )}
              <button onClick={copyAddr} className="font-mono text-[11px] px-4 py-2 rounded-lg" style={{ background: "#0d0d12", color: "#94a3b8", border: "1px solid #1A1A2E" }}>
                {copied ? "✓ Copied" : "Copy address"}
              </button>
            </div>
            <div className="font-mono text-[9px] text-slate-600 mt-2">{net.label} · USDC / ETH on Base</div>
          </div>
        </div>
      )}
    </PayShell>
  );
}

// Compact connect control — Coinbase Smart Wallet first, EIP-6963 injected second.
function PayConnect() {
  const { connectors, connect, isPending } = useConnect();
  const coinbase = connectors.find(c => c.id === "coinbaseWalletSDK" || c.name.toLowerCase().includes("coinbase"));
  const others = connectors.filter(c => c !== coinbase);
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-[#1A1A2E] bg-[#0a0a0f] p-4">
      <div className="font-mono text-[11px] text-slate-300 mb-3 text-center">Connect a wallet to pay — you sign, non-custodial.</div>
      {coinbase && (
        <button onClick={() => connect({ connector: coinbase })} disabled={isPending}
          className="w-full font-mono text-[12px] font-bold py-2.5 rounded-xl disabled:opacity-60 flex items-center justify-center gap-2"
          style={{ background: "#4FC3F7", color: "#050508" }}>
          {isPending ? "Connecting…" : <>🔵 Coinbase / Smart Wallet</>}
        </button>
      )}
      <button onClick={() => setOpen(o => !o)} disabled={isPending}
        className="w-full font-mono text-[11px] text-slate-400 hover:text-slate-200 py-2 mt-2 rounded-xl border border-[#1A1A2E] transition-colors disabled:opacity-60">
        I have another wallet
      </button>
      {open && (
        <div className="mt-2 rounded-xl border border-[#1A1A2E] overflow-hidden">
          {others.length ? others.map(c => (
            <button key={c.uid} onClick={() => { connect({ connector: c }); setOpen(false); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[#1A1A2E] transition-colors">
              <span className="font-mono text-xs text-slate-200">{c.name}</span>
            </button>
          )) : <div className="px-3 py-2.5 font-mono text-[10px] text-slate-600">No other wallet detected</div>}
        </div>
      )}
    </div>
  );
}

// Page chrome — centered card with BlueBank branding + non-custodial footer.
function PayShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#050508] text-slate-200 flex items-center justify-center p-5">
      <div className="w-full max-w-sm">
        <div className="text-center mb-4">
          <div className="font-mono text-[13px] tracking-widest text-[#4FC3F7] font-bold">🔵 BLUEBANK</div>
          <div className="font-mono text-[9px] text-slate-600 mt-0.5">Non-custodial payments on Base</div>
        </div>
        <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-5 shadow-2xl">
          {children}
        </div>
        <div className="text-center mt-4 font-mono text-[9px] text-slate-700 leading-relaxed">
          You sign from your own wallet · BlueBank never holds your funds
        </div>
      </div>
    </div>
  );
}
