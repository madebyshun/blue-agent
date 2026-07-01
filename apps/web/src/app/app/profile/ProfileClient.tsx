"use client";

/**
 * /app/profile — Identity-focused page.
 *
 * Composes three layers:
 *   1. On-chain identity: address, tier, BLUE balance, builder score
 *      (wagmi reads + Bankr Builder Score API, same as Dashboard)
 *   2. Off-chain profile: displayName + bio + avatar URL + social links
 *      (loaded from /api/profile/[address], edits gated by EIP-191 signature)
 *   3. Edit flow: toggle into edit mode → form inputs → wallet.signMessage()
 *      authorises a PUT to /api/profile/[address]
 *
 * The dashboard handles wallet snapshot + stake + alerts; this page is for
 * "who I am" — and is meant to anchor the future X / Farcaster OAuth link
 * flows (added in a follow-up commit once Twitter dev creds land).
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAccount, useReadContracts, useSignMessage } from "wagmi";
import { formatUnits } from "viem";
import AppPageHeader from "@/components/app/AppPageHeader";
import AppConnectPrompt from "@/components/app/AppConnectPrompt";
import AppCard, { AppSectionLabel } from "@/components/app/AppCard";
import { useBasename } from "@/lib/useBasename"; // resolves wallet → shun.base

// ─── Contracts ───────────────────────────────────────────────────────────────

const STAKING_ADDRESS = (
  process.env.NEXT_PUBLIC_STAKING_CONTRACT ??
  "0x69e539684EE48F71eCDAd58618d8e8a2423E279d"
) as `0x${string}`;
const BLUE_ADDRESS = "0xf895783b2931c919955e18b5e3343e7c7c456ba3" as `0x${string}`;

const STAKING_ABI = [
  { name: "stakeInfo", type: "function", stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [
      { name: "amount", type: "uint256" }, { name: "stakedAt", type: "uint256" },
      { name: "dailyCredits", type: "uint256" }, { name: "cooldown", type: "uint256" },
      { name: "pendingUsdc", type: "uint256" },
    ] },
] as const;

const ERC20_ABI = [
  { name: "balanceOf", type: "function", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

const TIERS = [
  { name: "None",    min: 0,          color: "#475569" },
  { name: "Starter", min: 500_000,    color: "#4FC3F7" },
  { name: "Pro",     min: 2_000_000,  color: "#A78BFA" },
  { name: "Max",     min: 10_000_000, color: "#F59E0B" },
];
function getTier(n: number) {
  if (n >= 10_000_000) return TIERS[3];
  if (n >= 2_000_000)  return TIERS[2];
  if (n >= 500_000)    return TIERS[1];
  return TIERS[0];
}
function fmtBlue(wei: bigint) {
  const n = Number(formatUnits(wei, 18));
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + "K";
  return n.toFixed(0);
}

// ─── Profile schema (mirror of src/lib/profile.ts) ───────────────────────────

interface ProfileFields {
  displayName?: string;
  bio?:        string;
  avatarUrl?:  string;
  x?:         string;
  farcaster?: string;
  github?:    string;
  website?:   string;
}

interface ProfileResponse extends ProfileFields {
  address:    string;
  createdAt?: number;
  updatedAt?: number;
}

// Same string the server reconstructs in src/lib/profile.ts — must match
// byte-for-byte or verifyMessage rejects.
function buildSignMessage(address: string, nonce: string, issuedAt: string): string {
  return [
    `Blue Agent — Profile Update`,
    ``,
    `Wallet:    ${address.toLowerCase()}`,
    `Issued at: ${issuedAt}`,
    `Nonce:     ${nonce}`,
    ``,
    `Signing this message authorises a profile update for the wallet`,
    `above. It is not a transaction, has zero gas cost, and only saves`,
    `your bio + social links to Blue Agent's KV store. No wallet action`,
    `is taken.`,
  ].join("\n");
}

function randomNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

// Sign-in (kí ví) message — proves wallet ownership on app entry so the profile
// can render. Distinct from the profile-update message above; this is a free,
// gasless EIP-191 signature, NOT a transaction. The session-verify flag is UX
// only (display gating); profile *writes* are still signature-verified server
// side in /api/profile/[address].
function buildVerifyMessage(address: string, issuedAt: string): string {
  return [
    `Blue Agent — Verify Wallet`,
    ``,
    `Wallet:    ${address.toLowerCase()}`,
    `Issued at: ${issuedAt}`,
    ``,
    `Sign in to view your Blue Agent profile. This is a free,`,
    `gasless signature that proves you own this wallet. It is`,
    `not a transaction and moves no funds.`,
  ].join("\n");
}

// Session-scoped "verified" flag — re-asked once per browser session (cleared
// when the tab/app closes), so opening the app prompts the signature again.
const verifyStorageKey = (addr: string) => `blueagent:verify:${addr.toLowerCase()}`;

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync }     = useSignMessage();
  const { name: basename }       = useBasename(address); // shun.base — same source as chat + dashboard

  const [profile,       setProfile]      = useState<ProfileResponse | null>(null);
  const [profileLoad,   setProfileLoad]  = useState(false);
  const [edit,          setEdit]         = useState(false);
  const [draft,         setDraft]        = useState<ProfileFields>({});
  const [saving,        setSaving]       = useState(false);
  const [error,         setError]        = useState("");
  const [savedAt,       setSavedAt]      = useState<number | null>(null);

  const [builderScore,  setBuilderScore] = useState<number | null>(null);
  const [scoreLoad,     setScoreLoad]    = useState(false);

  // ── Wallet sign-in (kí ví) — verify ownership on entry before the profile ──
  // renders. Inside Base App / a Mini App host the host wallet auto-connects
  // with NO prompt, so without this the page would either show nothing useful
  // or claim "auto-verified" with nothing behind it. The signature is the real
  // verification step the user expects when opening the app on mobile.
  const [verified,    setVerified]    = useState(false);
  const [verifying,   setVerifying]   = useState(false);
  const [verifyError, setVerifyError] = useState("");
  const [isMiniApp,   setIsMiniApp]   = useState(false);
  const autoVerifyTried = useRef(false);

  // ── Auto-detect identity from the Farcaster / Base App Mini App context ────
  // When opened inside Base App / a Farcaster client, the SDK gives us the
  // user's displayName, username, and pfp — no form needed. No-op in a browser.
  const [fcUser, setFcUser] = useState<{ displayName?: string; username?: string; pfpUrl?: string } | null>(null);
  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const { sdk } = await import("@farcaster/miniapp-sdk");
        if (!(await sdk.isInMiniApp().catch(() => false))) return;
        if (!off) setIsMiniApp(true);
        const ctx = await sdk.context;
        if (!off && ctx?.user) {
          setFcUser({ displayName: ctx.user.displayName, username: ctx.user.username, pfpUrl: ctx.user.pfpUrl });
        }
      } catch { /* not in a Mini App host */ }
    })();
    return () => { off = true; };
  // Re-run once the wallet connects: inside Base App the host auto-connects
  // AFTER mount, so an empty-deps effect would capture fcUser before the
  // Mini App context (displayName/pfp) has hydrated and never retry.
  }, [isConnected, address]);

  // Hydrate the session verify-flag whenever the connected address changes.
  useEffect(() => {
    autoVerifyTried.current = false;
    setVerifyError("");
    if (!address) { setVerified(false); return; }
    try {
      setVerified(sessionStorage.getItem(verifyStorageKey(address)) === "1");
    } catch { setVerified(false); }
  }, [address]);

  // ── Load on-chain identity ───────────────────────────────────────────────

  const { data: contractData } = useReadContracts({
    contracts: [
      { address: STAKING_ADDRESS, abi: STAKING_ABI, functionName: "stakeInfo", args: address ? [address] : undefined },
      { address: BLUE_ADDRESS,    abi: ERC20_ABI,   functionName: "balanceOf", args: address ? [address] : undefined },
    ],
    query: { enabled: !!address },
  });
  const stakeInfo   = contractData?.[0]?.result as [bigint, bigint, bigint, bigint, bigint] | undefined;
  const blueBalance = contractData?.[1]?.result as bigint | undefined;
  const stakedWei   = stakeInfo?.[0] ?? 0n;
  const staked      = Number(formatUnits(stakedWei, 18));
  const tier        = getTier(staked);

  // ── Builder score ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!address) { setBuilderScore(null); return; }
    setScoreLoad(true);
    fetch(`/api/builder-score?handle=${address}`)
      .then(r => r.json())
      .then(d => setBuilderScore(d?.score ?? d?.builder_score ?? null))
      .catch(() => null)
      .finally(() => setScoreLoad(false));
  }, [address]);

  // ── Load saved profile ───────────────────────────────────────────────────

  useEffect(() => {
    if (!address) { setProfile(null); return; }
    setProfileLoad(true);
    fetch(`/api/profile/${address}`)
      .then(r => r.json())
      .then((p: ProfileResponse) => {
        setProfile(p);
        setDraft({
          displayName: p.displayName ?? "",
          bio:         p.bio         ?? "",
          avatarUrl:   p.avatarUrl   ?? "",
          x:           p.x           ?? "",
          farcaster:   p.farcaster   ?? "",
          github:      p.github      ?? "",
          website:     p.website     ?? "",
        });
      })
      .catch(() => null)
      .finally(() => setProfileLoad(false));
  }, [address]);

  // ── Verify (kí ví) ─────────────────────────────────────────────────────────
  // Ask the wallet to sign the canonical verify message. On success we mark the
  // wallet verified for this session and the profile renders.
  async function handleVerify() {
    if (!address || verifying) return;
    setVerifying(true);
    setVerifyError("");
    const issuedAt = new Date().toISOString();
    const message  = buildVerifyMessage(address, issuedAt);
    try {
      await signMessageAsync({ message });
      try { sessionStorage.setItem(verifyStorageKey(address), "1"); } catch { /* private mode */ }
      setVerified(true);
    } catch (e) {
      const msg = (e as Error)?.message ?? "Signature cancelled";
      setVerifyError(/user rejected|denied|cancel/i.test(msg)
        ? "Signature cancelled — tap Sign to verify when you're ready."
        : msg);
    } finally {
      setVerifying(false);
    }
  }

  // Inside Base App / a Mini App host the wallet auto-connects silently, so we
  // auto-surface the signature once on entry (the "kí ví" the user expects on
  // mobile). In a normal browser the user taps the Sign button instead.
  useEffect(() => {
    if (!isConnected || !address || verified || verifying) return;
    if (!isMiniApp || autoVerifyTried.current) return;
    autoVerifyTried.current = true;
    void handleVerify();
    // handleVerify is stable for our purposes; deps below are the real triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, address, verified, verifying, isMiniApp]);

  // ── Save ─────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!address) return;
    setSaving(true);
    setError("");

    // Build the canonical message + ask wallet to sign.
    const nonce    = randomNonce();
    const issuedAt = new Date().toISOString();
    const message  = buildSignMessage(address, nonce, issuedAt);

    let signature: `0x${string}`;
    try {
      signature = await signMessageAsync({ message });
    } catch (e) {
      // User rejected in wallet, or wallet errored. Don't burn the nonce.
      const msg = (e as Error)?.message ?? "Wallet signature was cancelled";
      setError(/user rejected|denied|cancel/i.test(msg) ? "Signature cancelled — nothing was saved. Sign when you're ready." : msg);
      setSaving(false);
      return;
    }

    // PUT the signed update.
    try {
      const res = await fetch(`/api/profile/${address}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ fields: draft, nonce, issuedAt, signature }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? `Save failed (${res.status})`);
      } else {
        setProfile(data as ProfileResponse);
        setEdit(false);
        setSavedAt(Date.now());
        setTimeout(() => setSavedAt(null), 3000);
      }
    } catch (e) {
      setError((e as Error).message || "Network error");
    } finally {
      setSaving(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  // Identity prefers the live Mini App context, then a saved profile, then the
  // wallet's Basename (shun.base — same source chat + dashboard use), then the
  // short 0x… form. Without the Basename step a Base App user with no Farcaster
  // profile and no saved displayName only ever saw the raw address.
  const displayName = fcUser?.displayName?.trim() || profile?.displayName?.trim() || basename || (address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "");
  const avatarSrc   = fcUser?.pfpUrl || profile?.avatarUrl || "";
  const avatarInitial = address?.slice(2, 4).toUpperCase();

  return (
    <div className="flex flex-col h-full bg-[#050508] text-white font-mono overflow-hidden">

      <AppPageHeader label="PROFILE" subtitle="Identity · bio · social links" accent="#A78BFA" />

      <div className="flex-1 overflow-y-auto relative">
        <div className="pointer-events-none overflow-hidden absolute inset-x-0 top-0 h-[260px]">
          <div className="absolute inset-0"
            style={{ background: `radial-gradient(ellipse 80% 50% at 50% -10%, ${tier.color}10 0%, transparent 70%)` }} />
        </div>

        <div className="relative px-4 sm:px-6 py-6 max-w-2xl mx-auto">

          {!isConnected ? (
            <AppConnectPrompt
              accent={tier.color}
              title="Connect to view your profile"
              subtitle="Identity, bio, social links — all attached to your wallet."
              icon={
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                </svg>
              }
            />
          ) : !verified ? (
            // ── Wallet sign-in (kí ví) gate ──────────────────────────────────
            // Connected but not yet verified this session. Inside Base App this
            // signature is auto-prompted on entry; elsewhere the user taps Sign.
            <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-12 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
                style={{ background: `${tier.color}10`, border: `1px solid ${tier.color}20` }}>
                <svg className="w-7 h-7" style={{ color: tier.color }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
              </div>
              <h2 className="font-mono text-lg font-bold text-white mb-2">Verify your wallet</h2>
              <p className="font-mono text-slate-500 text-sm mb-2 max-w-xs mx-auto">
                {address?.slice(0, 6)}…{address?.slice(-4)} is connected. Sign a free, gasless message to confirm you own it and open your profile.
              </p>
              <p className="font-mono text-[10px] text-slate-700 mb-7 max-w-xs mx-auto">
                Not a transaction · no gas · moves no funds
              </p>
              <button onClick={handleVerify} disabled={verifying}
                className="px-6 py-2.5 rounded-xl text-[13px] font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: tier.color, color: "#050508" }}>
                {verifying ? "Check your wallet…" : "Sign to verify"}
              </button>
              {verifyError && (
                <div className={`mt-5 mx-auto max-w-xs rounded-xl border px-4 py-2.5 ${/cancel/i.test(verifyError) ? "border-amber-500/25 bg-amber-500/5" : "border-red-500/30 bg-red-500/5"}`}>
                  <p className={`text-[11px] ${/cancel/i.test(verifyError) ? "text-amber-300/90" : "text-red-400"}`}>{verifyError}</p>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* ── Identity strip ────────────────────────────────────────── */}
              <AppCard className="p-6 mb-4" accent={tier.color}>
                <div className="flex items-start gap-4 mb-5">
                  {avatarSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarSrc} alt="" loading="lazy"
                      className="w-16 h-16 rounded-2xl object-cover shrink-0 border border-[#1A1A2E]"
                      onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                  ) : (
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold shrink-0"
                      style={{ background: `${tier.color}18`, border: `1px solid ${tier.color}30`, color: tier.color }}>
                      {avatarInitial}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <h1 className="text-lg font-bold text-white truncate">{displayName}</h1>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">
                      {address?.slice(0, 10)}…{address?.slice(-6)}
                    </p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                        style={{ color: tier.color, background: `${tier.color}18`, border: `1px solid ${tier.color}30` }}>
                        {tier.name === "None" ? "No Tier" : tier.name}
                      </span>
                      <span className="text-[10px] text-slate-600">
                        {blueBalance !== undefined ? fmtBlue(blueBalance) : "—"} BLUE
                      </span>
                      {builderScore !== null && !scoreLoad && (
                        <span className="text-[10px]"
                          style={{ color: builderScore >= 70 ? "#34D399" : builderScore >= 40 ? "#4FC3F7" : "#F59E0B" }}>
                          Builder {builderScore}
                        </span>
                      )}
                    </div>
                  </div>

                  {!edit && (
                    <button onClick={() => setEdit(true)}
                      className="shrink-0 text-[11px] px-3 py-1.5 rounded-lg border border-[#A78BFA]/30 text-[#A78BFA] bg-[#A78BFA]/5 hover:bg-[#A78BFA]/10 transition-colors">
                      Edit
                    </button>
                  )}
                </div>

                {/* Bio (read-only display) */}
                {!edit && profile?.bio && (
                  <p className="text-[13px] text-slate-300 leading-relaxed whitespace-pre-wrap">{profile.bio}</p>
                )}
                {!edit && !profile?.bio && !profileLoad && (
                  <p className="text-[11px] text-slate-700 italic">No bio yet — click Edit to add one.</p>
                )}
              </AppCard>

              {/* ── Social links (read-only display) ─────────────────────── */}
              {!edit && (
                <AppCard className="mb-4">
                  <AppSectionLabel>SOCIAL LINKS</AppSectionLabel>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { key: "x" as const,         label: "X / Twitter", color: "#fff",     val: profile?.x,         url: (h: string) => `https://x.com/${h}` },
                      { key: "farcaster" as const, label: "Farcaster",   color: "#8a63d2",  val: profile?.farcaster, url: (h: string) => `https://warpcast.com/${h}` },
                      { key: "github" as const,    label: "GitHub",      color: "#94a3b8",  val: profile?.github,    url: (h: string) => `https://github.com/${h}` },
                      { key: "website" as const,   label: "Website",     color: "#4FC3F7",  val: profile?.website,   url: (h: string) => h },
                    ].map(s => (
                      <div key={s.key} className={`rounded-xl border p-3 ${s.val ? "border-[#1A1A2E] bg-[#0a0a0f]" : "border-[#1A1A2E]/50 bg-[#0a0a0f] opacity-50"}`}>
                        <div className="text-[9px] tracking-widest mb-1" style={{ color: s.color }}>{s.label}</div>
                        {s.val ? (
                          <a href={s.url(s.val)} target="_blank" rel="noopener noreferrer"
                            className="text-[12px] font-bold text-white truncate block hover:text-[#4FC3F7] transition-colors">
                            {s.key === "website" ? new URL(s.val).host : s.val}
                          </a>
                        ) : (
                          <span className="text-[11px] text-slate-700">—</span>
                        )}
                      </div>
                    ))}
                  </div>
                </AppCard>
              )}

              {/* ── Edit form ────────────────────────────────────────────── */}
              {edit && (
                <AppCard className="mb-4">
                  <div className="flex items-center justify-between mb-4">
                    <AppSectionLabel>EDIT PROFILE</AppSectionLabel>
                    <button onClick={() => { setEdit(false); setError(""); }}
                      className="text-[11px] text-slate-600 hover:text-slate-400 transition-colors">
                      Cancel
                    </button>
                  </div>

                  <div className="space-y-4">
                    {/* Name + avatar are auto-detected from Base App / Farcaster —
                        only the self-attested bio + X handle are editable. */}
                    <Field label="BIO" multiline hint="280 chars. Markdown links not parsed."
                      value={draft.bio ?? ""} max={280}
                      onChange={v => setDraft(d => ({ ...d, bio: v }))} />

                    <Field label="X / TWITTER" prefix="@"
                      value={draft.x ?? ""}
                      onChange={v => setDraft(d => ({ ...d, x: v }))}
                      placeholder="blueagent_" />
                  </div>

                  {error && (
                    /cancel/i.test(error)
                      ? (
                        <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-2.5">
                          <p className="text-[11px] text-amber-300/90">{error}</p>
                        </div>
                      ) : (
                        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-2.5">
                          <p className="text-[11px] text-red-400">{error}</p>
                        </div>
                      )
                  )}

                  <div className="mt-5 flex items-center justify-between gap-3">
                    <p className="text-[10px] text-slate-700 flex-1">
                      Save asks for one wallet signature — no transaction, no gas.
                    </p>
                    <button onClick={handleSave} disabled={saving}
                      className="px-5 py-2 rounded-xl text-[12px] font-bold bg-[#A78BFA] text-[#050508] hover:bg-[#8B5CF6] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                      {saving ? "Signing…" : "Sign & save"}
                    </button>
                  </div>
                </AppCard>
              )}

              {savedAt && !edit && (
                <div className="mb-4 rounded-xl border border-[#22C55E]/30 bg-[#22C55E]/5 px-4 py-2.5">
                  <p className="text-[11px] text-[#22C55E]">✓ Profile saved.</p>
                </div>
              )}

              {/* ── Linked accounts ──────────────────────────────────────── */}
              <AppCard className="mb-4">
                <AppSectionLabel>LINKED ACCOUNTS</AppSectionLabel>
                <div className="space-y-2 text-[11px]">
                  <LinkedRow label="X / Twitter" icon="𝕏" status="Self-attest" />
                  <LinkedRow label="Farcaster"   icon="◌" status={fcUser?.username ? `@${fcUser.username}` : "Self-attest"} />
                  <LinkedRow label="Wallet"      icon="⬡" status="Signature-verified" />
                </div>
                <p className="mt-3 text-[10px] text-slate-700 leading-relaxed">
                  Social handles are self-attested — type them in the form above. Your wallet was verified by signature this session{isMiniApp ? " (auto-prompted in Base App)" : ""}; opening the app again re-asks for the signature.
                </p>
              </AppCard>

              {/* Footer */}
              <div className="flex flex-wrap gap-3 text-[10px] text-slate-700 justify-center">
                <a href={`https://basescan.org/address/${address}`} target="_blank" rel="noopener noreferrer"
                  className="hover:text-slate-500 transition-colors">Basescan ↗</a>
                <Link href="/dashboard" className="hover:text-slate-500 transition-colors">Dashboard →</Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Form components ─────────────────────────────────────────────────────────

interface FieldProps {
  label:        string;
  value:        string;
  onChange:     (v: string) => void;
  hint?:        string;
  placeholder?: string;
  prefix?:      string;
  max?:         number;
  multiline?:   boolean;
}

function Field({ label, value, onChange, hint, placeholder, prefix, max, multiline }: FieldProps) {
  return (
    <div>
      <label className="block text-[9px] text-slate-600 tracking-widest mb-1.5">{label}</label>
      <div className="flex items-center rounded-xl border border-[#1A1A2E] bg-[#0a0a0f] focus-within:border-[#A78BFA]/40 transition-colors">
        {prefix && (
          <span className="pl-3 pr-1 text-[12px] text-slate-700 select-none shrink-0">{prefix}</span>
        )}
        {multiline ? (
          <textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            maxLength={max}
            rows={3}
            className="w-full bg-transparent px-3 py-2.5 text-[12px] text-white placeholder-slate-700 outline-none resize-none"
          />
        ) : (
          <input
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            maxLength={max}
            className={`w-full bg-transparent ${prefix ? "pl-0" : "pl-3"} pr-3 py-2.5 text-[12px] text-white placeholder-slate-700 outline-none`}
          />
        )}
      </div>
      {hint && <p className="text-[9px] text-slate-700 mt-1">{hint}</p>}
    </div>
  );
}

function LinkedRow({ label, icon, status }: { label: string; icon: string; status: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-[#1A1A2E] bg-[#0a0a0f] px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <span className="text-base w-5 text-center">{icon}</span>
        <span className="text-slate-400">{label}</span>
      </div>
      <span className="text-[10px] text-slate-700">{status}</span>
    </div>
  );
}
