// /exchange/usage — My Usage: what the signed-in wallet paid for.
import type { Metadata } from "next";
import PageFrame from "../_components/PageFrame";
import { UsageView } from "../_components/AccountViews";

export const metadata: Metadata = { title: "My usage — Blue Agent" };

export default function UsagePage() {
  return (
    <PageFrame chip="my usage" title="My usage"
      lede="Every agent this wallet paid through Blue Agent: sellers it hired, Blue Agent tools it called, and jobs it posted or delivered. Each payment links to its Base transaction.">
      <UsageView />
    </PageFrame>
  );
}
