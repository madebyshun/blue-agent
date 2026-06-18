"use client";

/**
 * /app/dashboard — unified shell with 2 tabs.
 *
 *   ?tab=overview  Wallet identity, balances, stake summary, activity
 *   ?tab=stake     Full staking flow (approve → stake → cooldown → claim)
 *
 * URL is the source of truth — deep-links from elsewhere can land directly
 * on the right tab. /app/rewards and /app/alerts redirect into here so
 * existing links keep working. (Alerts CRUD is deferred — the legacy
 * /app/alerts route now lands on overview.)
 */

import { Suspense, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import AppPageHeader from "@/components/app/AppPageHeader";
import OverviewView from "./_views/OverviewView";
import StakeView    from "./_views/StakeView";

const TABS = ["overview", "stake"] as const;
type Tab = (typeof TABS)[number];

const TAB_META: Record<Tab, { label: string; accent: string; subtitle: string }> = {
  overview: { label: "Overview", accent: "#4FC3F7", subtitle: "Wallet · balances · stake" },
  stake:    { label: "Stake",    accent: "#A78BFA", subtitle: "Stake $BLUEAGENT · earn credits · share x402 revenue" },
};

function DashboardShell() {
  const sp       = useSearchParams();
  const router   = useRouter();
  const pathname = usePathname();

  // URL is the single source of truth — derive the active tab from ?tab=
  // directly. (The previous two-way state↔URL sync could ping-pong between
  // stake and overview because writing the URL re-fired the read effect.)
  const tab: Tab = useMemo(() => {
    const t = (sp.get("tab") ?? "").toLowerCase();
    return (TABS as readonly string[]).includes(t) ? (t as Tab) : "overview";
  }, [sp]);

  const setTab = (t: Tab) => {
    router.replace(`${pathname}${t === "overview" ? "" : `?tab=${t}`}`, { scroll: false });
  };

  const meta = TAB_META[tab];

  return (
    <div className="flex flex-col h-full bg-[#050508] text-white font-mono overflow-hidden">

      {/* Header + tab switch on one row — the tabs ride in the header's right
          slot as a compact segmented control, so there's a single top bar
          instead of a header band stacked above a separate tab strip. */}
      <AppPageHeader
        label="DASHBOARD"
        subtitle={meta.subtitle}
        accent={meta.accent}
        right={
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-[#0D0D14] border border-[#1A1A2E]">
            {TABS.map(t => {
              const active = tab === t;
              const accent = TAB_META[t].accent;
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className="px-3 sm:px-4 py-1.5 rounded-md font-mono text-[10px] tracking-widest transition-all"
                  style={active
                    ? { color: accent, background: `${accent}18` }
                    : { color: "#475569" }}
                >
                  {TAB_META[t].label.toUpperCase()}
                </button>
              );
            })}
          </div>
        }
      />

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "overview" && <OverviewView onSwitchTab={setTab} />}
        {tab === "stake"    && <StakeView />}
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
