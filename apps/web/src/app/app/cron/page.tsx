"use client";

// /app/cron — Scheduled tasks promoted to a Control page. Reuses the same
// <CronPanel> the chat surface renders as a tab.
//
// CronPanel now renders the handoff's own `// SCHEDULED` header bar (title +
// sub-line + "+ Add task"), so this page does NOT wrap it in PanelHost — a
// PanelHost header would print a second title above it. We still need the
// ChatProvider PanelHost used to supply (CronPanel calls useChat() for the
// wallet's cron CRUD and the background scheduler), so we mount one directly,
// the same pattern /app/models uses. The panel resolves the connected wallet
// via useWallet() inside the wagmi tree, so no hidden WalletBar detector is
// needed. CronPanel's root is `flex flex-col h-full`, which fills the /app
// <main> flex column directly.

import { ChatProvider } from "@/app/chat/ChatContext";
import CronPanel from "@/app/chat/components/CronPanel";

export default function CronPage() {
  return (
    <ChatProvider>
      <CronPanel />
    </ChatProvider>
  );
}
