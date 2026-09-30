import { ARROWS_FROZEN_NOTE } from "@/lib/blue-hood/arrow-freeze";

/**
 * Shown on both track-record pages (/track and /hood/arrows) while
 * ARROWS_FROZEN is on. The receipts stay up — they are the honest record of
 * what was published — but a record that silently stops growing reads as a
 * desk that stopped working. Say it stopped on purpose, and since when. The
 * sentence is the same one the public APIs return in `meta.publishing.note`.
 */
export default function ArrowsFrozenNotice() {
  return (
    <div
      role="status"
      className="mb-6 rounded-lg border px-4 py-3 text-[12px] leading-relaxed"
      style={{ borderColor: "#334155", background: "#0b0f17", color: "#9aa1ac" }}
    >
      <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "#F59E0B" }}>
        Signals paused
      </span>
      <span className="mx-2" style={{ color: "#334155" }}>·</span>
      {ARROWS_FROZEN_NOTE}
    </div>
  );
}
