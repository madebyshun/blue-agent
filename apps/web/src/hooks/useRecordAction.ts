"use client";

/**
 * Record a signed trade as an action (G1, 2026-09-30) — client half.
 *
 * Every swap / send / bridge card calls this with its `txHash` state: the
 * moment a real hash appears, one record is written through POST /api/actions
 * (lib/actions.ts), with the chain verifying later that this wallet sent it.
 *
 * Deliberately silent and optional:
 *   • only when a SIWE session for THIS wallet already exists — a signing flow
 *     must never be interrupted by a second signature prompt for bookkeeping;
 *   • best-effort — a failed record never shows an error or blocks the card;
 *   • once per hash — re-renders and remounts do not duplicate it.
 */
import { useEffect, useRef } from "react";

export type RecordInput = {
  wallet: string | undefined;
  kind: "swap" | "send" | "bridge";
  chain: "base" | "robinhood";
  params: Record<string, string | number | null>;
  quote?: { expected_out?: string | null; min_out?: string | null; venue?: string | null };
  check?: { verdict: string; reasons: string[] } | null;
};

function sourceFromPath(): "chat" | "hood" | "wallet" {
  if (typeof window === "undefined") return "wallet";
  const p = window.location.pathname;
  return p.startsWith("/chat") ? "chat" : p.startsWith("/hood") ? "hood" : "wallet";
}

export async function recordAction(input: RecordInput & { txHash: string }): Promise<void> {
  const wallet = input.wallet?.toLowerCase();
  if (!wallet || !/^0x[0-9a-f]{40}$/.test(wallet)) return;
  try {
    const who = (await fetch("/api/auth/session", { cache: "no-store" }).then((r) => r.json()).catch(() => null)) as
      { status?: string; wallet?: string } | null;
    if (who?.status !== "active" || who.wallet?.toLowerCase() !== wallet) return;
    await fetch("/api/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: wallet,
        kind: input.kind,
        chain: input.chain,
        source: sourceFromPath(),
        params: input.params,
        quote: input.quote,
        check: input.check ?? null,
        tx_hash: input.txHash,
      }),
    });
  } catch { /* bookkeeping must never disturb a trade */ }
}

export function useRecordAction(txHash: string | undefined, build: () => RecordInput | null) {
  const done = useRef("");
  useEffect(() => {
    if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash) || done.current === txHash) return;
    done.current = txHash;
    const input = build();
    if (input) void recordAction({ ...input, txHash });
    // `build` reads the card's state at the moment the hash lands — exactly
    // the trade that produced it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txHash]);
}
