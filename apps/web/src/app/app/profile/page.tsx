import type { Metadata } from "next";
import ProfileClient from "./ProfileClient";

export const metadata: Metadata = {
  title: "Profile — BlueAgent",
  description: "Your BlueAgent profile on Base.",
};

export default function Page() {
  return <ProfileClient />;
}
