import type { Metadata } from "next";
import DashboardClient from "./DashboardClient";

export const metadata: Metadata = {
  title: "Dashboard · Blue Hub",
  description: "Manage your registered APIs, track calls, and withdraw USDC revenue.",
};

export default function DashboardPage() {
  return <DashboardClient />;
}
