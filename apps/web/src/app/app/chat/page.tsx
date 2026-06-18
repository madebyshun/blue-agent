import type { Metadata } from "next";
import ChatClient from "./ChatClient";

export const metadata: Metadata = {
  title: "Blue Chat — BlueAgent",
  description: "AI agent chat for Base builders. Multi-model, skill-based, x402 native.",
};

export default function Page() {
  return <ChatClient />;
}
