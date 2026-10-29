"use client";

/**
 * Discovery → action (G0, 2026-09-30 — docs/rebuild-5-tang-2026-09-30.md §0b).
 *
 * The six discovery tools Chat gained (five Robinhood Chain ones and
 * safe-trending on Base) return lists of tokens. Before this card the model
 * restated them as prose and the user had to copy a contract into a new
 * message to trade one. Now each row carries a Swap button that opens the swap
 * card for THAT row: its chain, its contract. Never a ticker — a ticker does
 * not identify a token, and on these two chains the same ticker exists twice.
 *
 * What a row may NOT do is look like advice. Rows state facts from the tool;
 * the Swap button is the same neutral control the wallet has. A token the tool
 * itself measured as a honeypot gets no Swap button, nor one safe-trending
 * flagged as wearing a pinned token's symbol (IMPERSONATION_CHECK — the same
 * `classifyToken` rule the pre-trade check BLOCKs on), and a factory deployment
 * our registry has not admitted yet gets none either (the pre-trade check, G2,
 * refuses stock tokens outside the registry — offering the button would only
 * lead to that refusal).
 */
import { useState, type ReactNode } from "react";

export { discoveryRows, type DiscoveryRow } from "@/lib/chat/discovery-rows";
import type { DiscoveryRow } from "@/lib/chat/discovery-rows";

export function DiscoveryCard({
  title, rows, more, note, renderSwap,
}: {
  title: string;
  rows: DiscoveryRow[];
  more: number;
  note?: string;
  /** The swap card for one row — supplied by ToolCards, which owns them. */
  renderSwap: (row: DiscoveryRow) => ReactNode;
}) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="mt-2 rounded-xl border border-[#1A1A2E] bg-[#0a0a0f] p-3.5">
      <div className="font-mono text-[13px] text-slate-500 tracking-widest font-bold mb-2 uppercase">{title}</div>
      {rows.length === 0 ? (
        <p className="font-mono text-[14px] text-slate-500">{note ?? "Nothing to show right now."}</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((row) => (
            <div key={row.key} className="rounded-lg border border-[#1A1A2E] px-2.5 py-2">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-[14px] text-slate-200">
                    <span className="font-bold">{row.symbol}</span>
                    <span className="text-slate-600"> · {row.chain === "base" ? "Base" : "Robinhood Chain"}</span>
                  </div>
                  {row.label && <div className="font-mono text-[12px] text-slate-500">{row.label}</div>}
                  {row.facts.length > 0 && <div className="font-mono text-[13px] text-slate-400 mt-0.5">{row.facts.join(" · ")}</div>}
                </div>
                {row.swappable ? (
                  <button
                    type="button"
                    onClick={() => setOpen(open === row.key ? null : row.key)}
                    className="font-mono text-[13px] font-bold px-2.5 py-1 rounded-lg shrink-0"
                    style={{ background: "#4FC3F712", color: "#4FC3F7", border: "1px solid #4FC3F740" }}
                  >
                    {open === row.key ? "Close" : "Trade"}
                  </button>
                ) : (
                  <span className="font-mono text-[12px] text-slate-600 shrink-0" title={row.noSwapReason}>no trade</span>
                )}
              </div>
              {open === row.key && row.swappable && <div className="mt-2">{renderSwap(row)}</div>}
            </div>
          ))}
        </div>
      )}
      {more > 0 && <p className="font-mono text-[13px] text-slate-600 mt-2">…and {more} more — search by name to find one.</p>}
      <p className="font-mono text-[12px] text-slate-600 mt-2">Facts from the tool, not a buy signal · each Trade opens with that row&apos;s chain and contract; you review and sign.</p>
    </div>
  );
}
