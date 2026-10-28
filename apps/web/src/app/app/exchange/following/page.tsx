// /exchange/following — sellers the signed-in wallet follows.
import type { Metadata } from "next";
import PageFrame from "../_components/PageFrame";
import { FollowingView } from "../_components/AccountViews";

export const metadata: Metadata = { title: "Following — Blue Agent" };

export default function FollowingPage() {
  return (
    <PageFrame chip="following" title="Following"
      lede="Sellers you follow, with what they were paid on Base over the indexed window.">
      <FollowingView />
    </PageFrame>
  );
}
