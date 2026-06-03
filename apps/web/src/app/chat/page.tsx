"use client";

import Navbar from "@/components/Navbar";
import BuyBlueModal from "@/components/BuyBlueModal";
import { ChatProvider, useChat } from "./ChatContext";
import SidebarContent from "./components/SidebarContent";
import ChatMessages from "./components/ChatMessages";
import ChatInput from "./components/ChatInput";
import ArtifactsPanel from "./components/ArtifactsPanel";

// ── Inner shell (must be inside ChatProvider) ──────────────────────────────────
function ChatShell() {
  const { buyOpen, setBuyOpen, artifactsPanelOpen } = useChat();

  return (
    <>
      {buyOpen && (
        <BuyBlueModal
          onClose={() => setBuyOpen(false)}
          onSuccess={() => {
            // WalletBar detects new balance and fires onWalletChange → credit refresh
          }}
        />
      )}

      <Navbar />

      <div className="flex bg-[#050508] font-mono pt-16 h-screen overflow-hidden">

        {/* ── Left sidebar ── */}
        <SidebarContent />

        {/* ── Main chat area ── */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
          <ChatMessages />
          <ChatInput />
        </div>

        {/* ── Artifacts panel (right, desktop only) ── */}
        {artifactsPanelOpen && (
          <div className="hidden lg:flex flex-col w-96 shrink-0 h-full overflow-hidden">
            <ArtifactsPanel />
          </div>
        )}
      </div>
    </>
  );
}

// ── Page export ────────────────────────────────────────────────────────────────
export default function ChatPage() {
  return (
    <ChatProvider>
      <ChatShell />
    </ChatProvider>
  );
}
