import type { Metadata } from "next";
import DashboardClient from "./DashboardClient";

export const metadata: Metadata = {
  title: "Dashboard — BlueAgent",
  description: "Your BlueAgent dashboard. Credits, usage, activity.",
};

export default function Page() {
  return <DashboardClient />;
}
