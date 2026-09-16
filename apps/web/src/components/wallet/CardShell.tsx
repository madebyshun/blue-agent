"use client";

/**
 * The frame the wallet's four money cards wear — Send, Deposit, Convert, Bridge.
 *
 * ─── Why this is a module and not four copies ────────────────────────────────
 *
 * Send was rebuilt first and got a shape the other three never did: a titled
 * card with the chain named in its own corner, dropdowns instead of segmented
 * button rows, boxed fields, one full-width confirm, one footnote. The other
 * three kept the shape they were born with — Deposit drew two rows of segmented
 * buttons straight into the modal with no card around them at all, Convert put
 * its chain selector OUTSIDE the card it belonged to, and Bridge opened with a
 * bare `<div className="font-mono text-[11px]">`.
 *
 * That is not only a cosmetic gap. Four panels reachable from four buttons that
 * sit side by side in one row, each drawn differently, read as four different
 * products — and the one thing a user must be able to do on a money screen is
 * recognise, instantly, which of them they are looking at and which chain it is
 * pointed at. A chain label rendered three different ways in three cards is
 * three chances to miss it.
 *
 * So the frame is defined ONCE, here, and all four import it. The rule this
 * file exists to enforce is the same one `pinnedAssets` enforces one layer down:
 * writing the literal twice is how the copies drift.
 *
 * ─── What this module is NOT ─────────────────────────────────────────────────
 *
 * It is chrome. It holds no address, reads no balance, signs nothing, and knows
 * nothing about what any card is about to do. Every fund-touching decision —
 * which chain a transaction is signed on, which token's decimals scale it, which
 * gate refuses an unread balance — stays in the card that makes it. A shared
 * shell must never become a place where a fund rule lives, because a rule in the
 * chrome is a rule that applies to whichever cards happen to render it, which is
 * not a set anyone can reason about.
 *
 * The one honesty rule that IS here: `ChainMark` refuses to draw a testnet the
 * same as mainnet. Base Sepolia is Base — same glyph — but never Base blue.
 */

import type React from "react";
import { WALLET_CHAINS, type WalletChain } from "@/lib/wallet/chains";
import { Picker, PickerRow } from "@/components/wallet/Picker";

// ── Chain marks ──────────────────────────────────────────────────────────────
//
// The Base wordmark path is the official brandmark. Robinhood Chain ships no
// asset in-repo, so its mark is a brand-green roundel — a chain-colour chip, not
// a claim to the trademark. Both are swappable for official SVGs later.

const BASE_PATH =
  "M54.921 110.034c30.438 0 55.113-24.632 55.113-55.017C110.034 24.632 85.359 0 54.921 0 26.043 0 2.353 22.171 0 50.392h72.847v9.25H0c2.353 28.22 26.043 50.392 54.921 50.392Z";

/**
 * A chain's mark, at any size. Covers every `WalletChain` key rather than the
 * two the Send card happened to offer, so a card that lists Base Sepolia (only
 * Deposit does) cannot reach a missing icon and render a blank.
 *
 * Sepolia is drawn in slate, NOT Base blue. A testnet chip that looks identical
 * to mainnet is the same class of mistake as an explorer link captioned
 * "Basescan" pointing at sepolia.basescan.org (see chains.ts `explorerName`) —
 * the glyph is the fastest-read thing in the header, and on a money card the
 * fastest-read thing must not be the one that lies about which money this is.
 */
export function ChainMark({ chain, size = 14 }: { chain: WalletChain; size?: number }) {
  if (chain === "robinhood") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden style={{ flexShrink: 0 }}>
        <circle cx="12" cy="12" r="12" fill="#00C805" />
        <path d="M6.5 16.5c2.6-6.2 7.6-8.4 11-8.4-3.2 1.7-5.8 4.8-6.9 8.4H6.5z" fill="#0a2e12" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 111 111" aria-hidden style={{ flexShrink: 0 }}>
      <path fill={chain === "baseSepolia" ? "#64748b" : "#0052FF"} d={BASE_PATH} />
    </svg>
  );
}

// ── The card ─────────────────────────────────────────────────────────────────

/**
 * Outer frame + the title row.
 *
 * `chain` is optional but the omission should be rare and deliberate: the chip
 * in the corner is how a user answers "which money is this?" without reading the
 * form. Pass `note` to add a qualifier BESIDE the chain (Convert's "via 0x"),
 * not to replace it.
 */
export function WalletCard({
  title, chain, note, children,
}: {
  /** Small-caps action word — SEND, DEPOSIT, CONVERT, BRIDGE. */
  title: React.ReactNode;
  chain?: WalletChain;
  /** Extra qualifier rendered after the chain's short name. */
  note?: React.ReactNode;
  children: React.ReactNode;
}) {
  // `font-mono` sits on the FRAME, not on each child. Every one of these cards
  // is monospaced throughout — figures that must line up column-wise, addresses,
  // tickers — and stating it once is what stops a card that forgets it from
  // rendering its amount in a proportional face beside three that don't.
  return (
    <div className="mt-2 font-mono rounded-xl border border-[#1A1A2E] bg-[#0a0a0f] p-3.5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="font-mono text-[10px] text-slate-500 tracking-widest font-bold">{title}</span>
        <span className="font-mono text-[9px] text-slate-600 flex items-center gap-1 shrink-0">
          {chain && <ChainMark chain={chain} size={11} />}
          {chain && WALLET_CHAINS[chain].short}
          {note && <span className="text-slate-700">· {note}</span>}
        </span>
      </div>
      {children}
    </div>
  );
}

/**
 * One boxed field — the darker inset every card uses for an amount, a
 * recipient, a quote. `label` is the small-caps caption; `right` is the
 * secondary fact that belongs on the same line (a balance, a Max button).
 */
export function Field({
  label, right, children, className = "",
}: {
  label?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border border-[#1A1A2E] bg-[#050508] p-2.5 mb-3 ${className}`}>
      {(label || right) && (
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="font-mono text-[9px] text-slate-600">{label}</span>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * The chain dropdown, over an EXPLICIT list of chains.
 *
 * The list is a parameter, not a constant, because the three cards genuinely
 * differ and the difference is a fund rule owned by the card: Send and Convert
 * offer Base + Robinhood and deliberately not Base Sepolia (the 0x router would
 * spend real mainnet funds under a "no value" label); Deposit adds Sepolia when
 * the user has unlocked testnet, because receiving on a testnet costs nothing.
 * A shared default here would quietly make that decision for all of them.
 *
 * What it is NOT is one button per chain. That shape encoded "there are exactly
 * two", and `WALLET_CHAINS` is built to grow — adding a chain should be a config
 * entry, not a layout change in four files.
 */
export function NetworkPicker({
  value, onChange, chains, disabled, label = "NETWORK",
}: {
  value: WalletChain;
  onChange: (c: WalletChain) => void;
  chains: readonly WalletChain[];
  disabled?: boolean;
  label?: string;
}) {
  return (
    <Picker label={label} disabled={disabled}
      summary={
        <span className="flex items-center gap-1.5 font-mono text-[12px] text-white">
          <ChainMark chain={value} size={13} />{WALLET_CHAINS[value].label}
        </span>
      }>
      {close => chains.map(k => (
        <PickerRow key={k} selected={value === k} onClick={() => { onChange(k); close(); }}>
          <ChainMark chain={k} size={14} />
          <span className="font-mono text-[12px] text-white flex-1">{WALLET_CHAINS[k].label}</span>
          <span className="font-mono text-[9px] text-slate-600">{WALLET_CHAINS[k].chainId}</span>
        </PickerRow>
      ))}
    </Picker>
  );
}

/**
 * The one full-width action at the bottom of a card.
 *
 * Two tones, and the split is semantic rather than decorative: green is money
 * LEAVING under the user's signature (send, bridge, convert), blue is
 * everything else. Both are the same geometry, because a card whose primary
 * button is a different size from its neighbour's reads as a different kind of
 * commitment.
 */
export function ConfirmButton({
  onClick, disabled, tone = "green", children,
}: {
  onClick: () => void;
  disabled?: boolean;
  tone?: "green" | "blue";
  children: React.ReactNode;
}) {
  const c = tone === "blue" ? "#4FC3F7" : "#34D399";
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="w-full font-mono text-[12px] font-bold py-2 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      style={{ background: `${c}15`, color: c, border: `1px solid ${c}40` }}>
      {children}
    </button>
  );
}

/** The line under the button: what this card is, who signs, what is final. */
export function CardNote({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-[9px] text-slate-700 mt-1.5 leading-relaxed">{children}</p>;
}
