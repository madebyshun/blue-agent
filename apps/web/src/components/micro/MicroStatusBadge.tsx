import type { MicroStatus, MicroApproval, MicroClaim } from "@/lib/micro-types";
import { STATUS_COLORS, PLATFORM_LABELS, PROOF_LABELS } from "@/lib/micro-types";
import type { MicroPlatform, MicroProof } from "@/lib/micro-types";

export function MicroStatusBadge({ status }: { status: MicroStatus }) {
  const label = { open: "open", active: "active", submitted: "pending", approved: "approved",
    completed: "done", expired: "expired", cancelled: "cancelled" }[status] ?? status;
  return (
    <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded border ${STATUS_COLORS[status]}`}>
      {label}
    </span>
  );
}

export function MicroApprovalBadge({ mode }: { mode: MicroApproval }) {
  const colors: Record<MicroApproval, string> = {
    auto: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
    manual: "text-yellow-400 border-yellow-400/30 bg-yellow-400/10",
    hybrid: "text-purple-400 border-purple-400/30 bg-purple-400/10",
  };
  const label = { auto: "auto ✓", manual: "manual", hybrid: "hybrid" }[mode];
  return (
    <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded border ${colors[mode]}`}>
      {label}
    </span>
  );
}

export function MicroEscrowBadge({ status }: { status: string }) {
  const funded = status === "funded" || status === "released";
  return (
    <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded border ${
      funded
        ? "text-[#4FC3F7] border-[#4FC3F7]/30 bg-[#4FC3F7]/10"
        : "text-slate-500 border-slate-700 bg-transparent"
    }`}>
      {funded ? "escrow ✓" : "no escrow"}
    </span>
  );
}

export function MicroPlatformBadge({ platform }: { platform: MicroPlatform }) {
  const colors: Record<MicroPlatform, string> = {
    x: "text-white border-white/20 bg-white/5",
    farcaster: "text-purple-400 border-purple-400/30 bg-purple-400/10",
    telegram: "text-[#29ABE2] border-[#29ABE2]/30 bg-[#29ABE2]/10",
    web: "text-slate-400 border-slate-700 bg-transparent",
  };
  return (
    <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded border ${colors[platform]}`}>
      {PLATFORM_LABELS[platform]}
    </span>
  );
}

export function MicroProofBadge({ proof }: { proof: MicroProof }) {
  return (
    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border text-slate-400 border-slate-700">
      {PROOF_LABELS[proof]}
    </span>
  );
}

export function MicroSlotsBadge({ remaining, total }: { remaining: number; total: number }) {
  const pct = remaining / total;
  const color = pct > 0.5
    ? "text-[#4FC3F7] border-[#4FC3F7]/30 bg-[#4FC3F7]/10"
    : pct > 0
    ? "text-yellow-400 border-yellow-400/30 bg-yellow-400/10"
    : "text-red-400 border-red-400/30 bg-red-400/10";
  return (
    <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded border ${color}`}>
      {remaining}/{total} slots
    </span>
  );
}
