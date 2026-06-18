import type { Metadata } from "next";
import HubView from "@/app/hub/HubView";

export const metadata: Metadata = {
  title: "Blue Hub — 74 AI Tools on Base",
  description: "74 x402 AI tools for Base. Pay per call. No API key. No subscription.",
};

export default function AppHubPage() {
  return <HubView inShell />;
}
