"use client";

/**
 * The wallet's one dropdown.
 *
 * Send used to choose its network and its token with two rows of segmented
 * buttons — one button per option, all of them always on screen. That shape
 * only works while the option count is fixed and tiny: it was `Base | Robinhood`
 * and `USDC | ETH`, and it silently encoded "there are exactly two of each".
 * Neither is true — the wallet is built to grow past two chains, and the token
 * list is whatever the address actually holds.
 *
 * So both become this: a closed bar showing the CURRENT choice, and a panel
 * listing the rest. It is deliberately ONE component rather than a network one
 * and a token one, because the two sit directly above each other and any visual
 * difference between them would read as a difference in kind.
 *
 * Not a native `<select>`: the token panel carries a paste-an-address field and
 * per-row balances and trust badges, none of which fit in an `<option>`. The
 * cost of that choice is that the keyboard and outside-click behaviour has to
 * be written by hand, which is what the effect below is.
 */

import { useEffect, useRef, useState } from "react";

export function Picker({
  label, summary, disabled, onClose, inline, children,
}: {
  /** Rendered above the bar, in the same small-caps style as the card's other
   *  field labels. Omitted when `inline` — an inline picker sits inside a field
   *  that already has one, and a second label would name the same thing twice. */
  label?: string;
  /** What the closed bar shows — the CURRENT value, never a placeholder when a
   *  value exists. A picker that reads "Select asset" while an asset is armed
   *  is a picker that can send the wrong token. */
  summary: React.ReactNode;
  disabled?: boolean;
  /** Fired on EVERY dismissal — row click, Escape, outside click, re-clicking
   *  the bar, or going disabled mid-send. It exists so a panel holding input
   *  state can clear it in one place: the token panel's filter used to survive
   *  an Escape, so reopening showed a list narrowed by a search the user had
   *  already abandoned — a wallet appearing to have lost tokens it is holding. */
  onClose?: () => void;
  /**
   * Chip mode: a content-width bar that lives INSIDE a field, beside an amount
   * input, with its panel hung off the right edge.
   *
   * It exists so Convert's two token selectors are the same control as every
   * other choice in the wallet. They were native `<select>`s — which on a dark
   * card open an OS-styled light popup and cannot show a balance, an address or
   * a trust badge. Rather than let one card keep a second dropdown
   * implementation, the one dropdown grew a second size.
   */
  inline?: boolean;
  /** The open panel. Receives `close` so a row can commit and dismiss. */
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  // Watched as a TRANSITION rather than called from each `setOpen(false)` site:
  // there are five of those and the next one added would silently skip the
  // reset. `onClose` is deliberately not in the dep array — it is typically an
  // inline arrow, so depending on it would re-run this effect every render; the
  // `was` guard is what decides, and it only flips on a real close.
  const was = useRef(false);
  useEffect(() => {
    if (was.current && !open) onClose?.();
    was.current = open;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Outside-click and Escape. Bound only while open, so a page with several
  // pickers carries at most one pair of listeners.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // A disabled picker must not stay open — `busy` flips mid-send.
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);

  return (
    <div className={inline ? "relative shrink-0" : "relative mb-3"} ref={wrap}>
      {label && !inline && <div className="font-mono text-[9px] text-slate-600 mb-1">{label}</div>}
      <button
        type="button" disabled={disabled}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox" aria-expanded={open} aria-label={label}
        className={`flex items-center justify-between gap-1.5 rounded-lg border border-[#1A1A2E] bg-[#050508] text-left transition-colors hover:border-[#4FC3F730] disabled:opacity-50 disabled:hover:border-[#1A1A2E] ${
          inline ? "px-2 py-1.5" : "w-full px-2.5 py-2"}`}>
        <span className={inline ? "min-w-0" : "min-w-0 flex-1"}>{summary}</span>
        <span className={`font-mono text-[10px] text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}>⌄</span>
      </button>
      {open && (
        <div
          role="listbox"
          className={`absolute z-30 mt-1 rounded-lg border border-[#1A1A2E] bg-[#0a0a0f] shadow-xl shadow-black/60 overflow-hidden ${
            inline ? "right-0 min-w-[11rem]" : "left-0 right-0"}`}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/** One selectable row. Shared so every panel's hit area and selected state
 *  match — including the token rows, which carry more than a label. */
export function PickerRow({
  onClick, selected, children,
}: {
  onClick: () => void;
  selected?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button" role="option" aria-selected={!!selected} onClick={onClick}
      className="w-full flex items-center gap-2 px-2.5 py-2 text-left transition-colors hover:bg-[#13131f]"
      style={selected ? { background: "#4FC3F70D" } : undefined}>
      {children}
    </button>
  );
}
