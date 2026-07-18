/**
 * /hood/inbox — Blue Hood alert inbox (T-D D1).
 *
 * Source of truth for every arrow the engine has fired. Unlike /hood
 * (live board) and /hood/arrows (public track record), this is the
 * per-user inbox: unread badging + "mark all read" bookmark writes.
 */
import type { Metadata } from "next";
import InboxClient from "./InboxClient";

export const metadata: Metadata = {
  title: "Blue Hood · Inbox",
  description: "Every arrow Blue Hood has fired for you. Read/unread.",
};

export const revalidate = 0;
export const dynamic = "force-dynamic";

export default function InboxPage() {
  return <InboxClient />;
}
