"use client";
// Chat card for the `blue_dca` tool — EXIT ONLY since 2026-09-30.
//
// Recurring buys are retired (docs/rebuild-5-tang-2026-09-30.md §1: execution
// is swap / send / bridge only). The offer was already withdrawn on 2026-09-06
// (#92); what was left was worse than nothing. This card still rendered its
// CREATE flow wherever an old chat held a `blue_dca` result, so reopening that
// chat offered a fresh `approve(keeper, total)` — a standing USDC allowance for
// a keeper whose cron has never been scheduled. The comment beside it said the
// card was kept "so live allowances stay revocable", but it had no revoke
// control at all.
//
// So it now does only the exit: read this wallet's schedules, read each live
// allowance ON-CHAIN, and offer `approve(keeper, 0)` — signed by the user, in
// their own wallet. An unread allowance is never shown as zero.
//
// The keeper address comes from the stored schedule (via /api/dca/list), not
// from KEEPER_MASTER_KEY, so this exit keeps working after that env is unset.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, useReadContracts, useSwitchChain, useWriteContract } from "wagmi";
import { formatUnits, isAddress } from "viem";
import { ConnectButton } from "@/components/ConnectModal";

const BASE_CHAIN_ID = 8453;

const ERC20_ALLOWANCE_ABI = [
  { name: "approve", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { name: "allowance", type: "function", stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

/** Marker shape emitted by the /api/chat handler for `blue_dca`. Kept as-is so
 *  old stored chat messages still type-check; nothing here is used to create. */
export interface DcaResult {
  kind:             "blue_dca";
  chainId?:         number;
  sellToken?:       string;
  buyToken?:        string;
  sellAmountPerRun?: string;
  frequency?:       "hourly" | "6h" | "12h" | "daily" | "weekly";
  totalRuns?:       number;
  slippageBps?:     number;
  error?:           string;
}

interface ScheduleRow {
  id: string;
  chainId: number;
  keeperAddress?: string;
  sellToken: string;
  sellTokenSymbol: string;
  sellTokenDecimals: number;
  buyTokenSymbol: string;
  status: string;
}

interface Grant {
  token: `0x${string}`;
  keeper: `0x${string}`;
  symbol: string;
  decimals: number;
  schedules: number;
}

type Load =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ok"; grants: Grant[] }
  | { state: "error"; message: string };

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function DcaCard({ data: _data }: { data: DcaResult }) {
  const { address, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [load, setLoad] = useState<Load>({ state: "idle" });
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const fetchGrants = useCallback(async () => {
    if (!address) return;
    setLoad({ state: "loading" });
    try {
      const res = await fetch(`/api/dca/list?address=${address}`);
      const j = (await res.json()) as { ok?: boolean; schedules?: ScheduleRow[]; error?: string };
      if (!res.ok || !j.ok) {
        setLoad({ state: "error", message: j.error ?? `could not read your schedules (${res.status})` });
        return;
      }
      // One allowance per (token, keeper) pair, however many schedules share it.
      const byPair = new Map<string, Grant>();
      for (const s of j.schedules ?? []) {
        if (s.chainId !== BASE_CHAIN_ID) continue;
        if (!s.keeperAddress || !isAddress(s.keeperAddress) || !isAddress(s.sellToken)) continue;
        const key = `${s.sellToken.toLowerCase()}:${s.keeperAddress.toLowerCase()}`;
        const g = byPair.get(key);
        if (g) g.schedules += 1;
        else byPair.set(key, {
          token: s.sellToken as `0x${string}`,
          keeper: s.keeperAddress as `0x${string}`,
          symbol: s.sellTokenSymbol || short(s.sellToken),
          decimals: s.sellTokenDecimals,
          schedules: 1,
        });
      }
      setLoad({ state: "ok", grants: [...byPair.values()] });
    } catch (e) {
      setLoad({ state: "error", message: (e as Error).message || "could not read your schedules" });
    }
  }, [address]);

  useEffect(() => { void fetchGrants(); }, [fetchGrants]);

  const grants = load.state === "ok" ? load.grants : [];
  const reads = useReadContracts({
    contracts: grants.map((g) => ({
      address: g.token,
      abi: ERC20_ALLOWANCE_ABI,
      functionName: "allowance" as const,
      args: [address as `0x${string}`, g.keeper] as const,
      chainId: BASE_CHAIN_ID,
    })),
    query: { enabled: !!address && grants.length > 0 },
  });

  const rows = useMemo(() => grants.map((g, i) => {
    const r = reads.data?.[i];
    const value = r?.status === "success" ? (r.result as bigint) : null;
    return { g, value, failed: r?.status === "failure" };
  }), [grants, reads.data]);

  async function revoke(g: Grant) {
    setBusy(g.keeper + g.token);
    setNote(null);
    try {
      await switchChainAsync({ chainId: BASE_CHAIN_ID });
      await writeContractAsync({
        address: g.token,
        abi: ERC20_ALLOWANCE_ABI,
        functionName: "approve",
        args: [g.keeper, 0n],
        chainId: BASE_CHAIN_ID,
      });
      setNote(`Revoke sent for ${g.symbol}. It shows as 0 once the transaction confirms.`);
      setTimeout(() => { void reads.refetch(); }, 4000);
    } catch (e) {
      const m = (e as Error).message || String(e);
      setNote(/user rejected|denied|cancell?ed/i.test(m) ? "Revoke cancelled." : m.slice(0, 160));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-2 rounded-xl border border-[#1A1A2E] bg-[#0a0a0f] p-3.5">
      <div className="font-mono text-[10px] text-slate-500 tracking-widest font-bold mb-2">RECURRING BUY · RETIRED</div>
      <p className="font-mono text-[11px] text-slate-300 leading-relaxed mb-3">
        Recurring buys are no longer offered and no schedule will run. If you approved a keeper
        earlier, that approval is still live on Base — revoke it below.
      </p>

      {!isConnected || !address ? (
        <ConnectButton />
      ) : load.state === "loading" || load.state === "idle" ? (
        <div className="font-mono text-[10px] text-slate-500">Reading your approvals…</div>
      ) : load.state === "error" ? (
        <div className="font-mono text-[10px] text-amber-400">
          Couldn&apos;t read your schedules — this is NOT the same as having none. {load.message}{" "}
          <button className="underline" onClick={() => void fetchGrants()}>Retry</button>
        </div>
      ) : rows.length === 0 ? (
        <div className="font-mono text-[10px] text-slate-500">No recurring-buy approval found for this wallet.</div>
      ) : (
        <div className="space-y-2">
          {rows.map(({ g, value, failed }) => (
            <div key={g.token + g.keeper} className="flex items-center gap-2 rounded-lg border border-[#1A1A2E] px-2.5 py-2">
              <div className="flex-1 min-w-0 font-mono text-[10px]">
                <div className="text-slate-300">{g.symbol} → keeper {short(g.keeper)}</div>
                <div className="text-slate-500">
                  {value === null
                    ? (failed ? "allowance unreadable right now" : "reading allowance…")
                    : value === 0n
                    ? "allowance 0 — nothing to revoke"
                    : `allowance ${formatUnits(value, g.decimals)} ${g.symbol}`}
                </div>
              </div>
              {value !== null && value > 0n && (
                <button
                  onClick={() => void revoke(g)}
                  disabled={busy !== null}
                  className="font-mono text-[10px] font-bold px-3 py-1.5 rounded-lg disabled:opacity-40"
                  style={{ background: "#EF444412", color: "#fca5a5", border: "1px solid #EF444440" }}
                >
                  {busy === g.keeper + g.token ? "Confirm in wallet…" : "Revoke"}
                </button>
              )}
              {failed && (
                <button className="font-mono text-[10px] underline text-slate-400" onClick={() => void reads.refetch()}>Retry</button>
              )}
            </div>
          ))}
        </div>
      )}
      {note && <div className="font-mono text-[10px] text-slate-400 mt-2">{note}</div>}
    </div>
  );
}
