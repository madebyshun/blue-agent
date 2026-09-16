"use client";

/**
 * /app/dashboard — wallet identity, balances, activity.
 *
 * Was a two-tab shell (overview + stake). The stake tab was retired with the
 * $BLUEAGENT relaunch: the old token is no longer sold, and the tab was the
 * only surface still advertising a stake→credits ladder that `lib/credits.ts`
 * had already stopped honouring. Overview is now the whole page, so the
 * segmented control and the ?tab= router are gone with it.
 *
 * /app/rewards and /app/alerts still redirect here so existing links resolve.
 *
 * OverviewView owns its own `// OVERVIEW` header bar and scroll region now (the
 * design-handoff pattern every app screen follows), so this wrapper is just the
 * page background + flex column — the old shared AppPageHeader would have
 * printed a second title above it.
 */

import OverviewView from "./_views/OverviewView";

export default function DashboardPage() {
  return (
    <div className="flex flex-col h-full bg-[#050508] text-white font-mono overflow-hidden">
      <OverviewView />
    </div>
  );
}
