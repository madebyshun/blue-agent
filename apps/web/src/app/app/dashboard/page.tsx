"use client";

/**
 * /app/dashboard — unified shell with 3 tabs.
 *
 *   ?tab=overview  Wallet identity, balances, stake summary, alerts, activity
 *   ?tab=stake     Full staking flow (approve → stake → cooldown → claim)
 *   ?tab=alerts    Alert CRUD + Sentinel deep-link
 *
 * URL is the source of truth — deep-links from elsewhere can land directly
 * on the right tab. /app/rewards and /app/alerts redirect into here so
 * existing links keep working.
 */

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import AppPageHeader from "@/components/app/AppPageHeader";
import OverviewView from "./_views/OverviewView";
import StakeView    from "./_views/StakeView";
import AlertsView   from "./_views/AlertsView";

const TABS = ["overview", "stake", "alerts"] as const;
type Tab = (typeof TABS)[number];

const TAB_META: Record<Tab, { label: string; accent: string; subtitle: string }> = {
  overview: { label: "Overview", accent: "#4FC3F7", subtitle: "Wallet · balances · stake · alerts" },
  stake:    { label: "Stake",    accent: "#A78BFA", subtitle: "Stake $BLUEAGENT · earn credits · share x402 revenue" },
  alerts:   { label: "Alerts",   accent: "#F59E0B", subtitle: "Price thresholds · whale moves · onchain events" },
};

function DashboardShell() {
  const sp       = useSearchParams();
  const router   = useRouter();
  const pathname = usePathname();
  const initial  = (sp.get("tab") ?? "").toLowerCase();
  const [tab, setTab] = useState<Tab>(
    (TABS as readonly string[]).includes(initial) ? (initial as Tab) : "overview"
  );

  // Keep URL in sync when the user switches tabs in-page. replace() avoids
  // pushing a history entry per tab toggle.
  useEffect(() => {
    const want = tab === "overview" ? null : tab;
    const have = (sp.get("tab") ?? "").toLowerCase();
    if (want === null && have === "") return;
    if (want === have) return;
    const qs = want ? `?tab=${want}` : "";
    router.replace(`${pathname}${qs}`, { scroll: false });
  }, [tab, pathname, router, sp]);

  // React to back/forward navigation that changes ?tab=
  useEffect(() => {
    const next = (sp.get("tab") ?? "").toLowerCase();
    const norm = (TABS as readonly string[]).includes(next) ? (next as Tab) : "overview";
    if (norm !== tab) setTab(norm);
  }, [sp]); // eslint-disable-line react-hooks/exhaustive-deps

  const meta = TAB_META[tab];

  return (
    <div className="flex flex-col h-full bg-[#050508] text-white font-mono overflow-hidden">

      <AppPageHeader label="DASHBOARD" subtitle={meta.subtitle} accent={meta.accent} />

      {/* Tab bar */}
      <div className="border-b border-[#1A1A2E] shrink-0 bg-[#050508]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 flex">
          {TABS.map(t => {
            const active = tab === t;
            const accent = TAB_META[t].accent;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="flex-1 sm:flex-none sm:px-6 py-3 font-mono text-[11px] sm:text-xs tracking-widest transition-all border-b-2 relative"
                style={active
                  ? { color: accent, borderBottomColor: accent, background: `${accent}06` }
                  : { color: "#475569", borderBottomColor: "transparent" }}
              >
                {TAB_META[t].label.toUpperCase()}
                {active && (
                  <span className="hidden sm:block absolute -top-px left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                        style={{ background: accent, boxShadow: `0 0 6px ${accent}80` }} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "overview" && <OverviewView onSwitchTab={setTab} />}
        {tab === "stake"    && <StakeView />}
        {tab === "alerts"   && <AlertsView />}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  // useSearchParams() must be wrapped in Suspense for static rendering.
  return (
    <Suspense fallback={<div className="h-full bg-[#050508]" />}>
      <DashboardShell />
    </Suspense>
  );
}
