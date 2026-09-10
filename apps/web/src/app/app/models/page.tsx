"use client";

// /app/models — the model catalog promoted to a first-class Control page.
//
// Reuses the very same <ModelsPanel> that renders as a tab inside Blue Chat, so
// the list is identical (no fork, no mock). What differs is what "picking"
// means here: `chatTier` is in-memory state (ChatContext's useState, never
// persisted) owned by the chat surface's own ChatProvider, and this page mounts
// a *separate* provider via PanelHost. Setting the tier locally would therefore
// be silently discarded the moment the user navigates to /chat.
//
// So a pick routes through /chat?preset=<id>, which ChatContext already reads
// and validates against the live preset ids — the same shape as /app/skills
// routing its pick to /chat?prefill=<trigger> because a standalone page has no
// local chat session to configure.
//
// This page does NOT use PanelHost. ModelsPanel renders the handoff's own
// `// MODELS` header bar (title + live sub-line + Presets/All toggle), so a
// PanelHost header would print a second title above it. We still need the
// ChatProvider PanelHost used to supply (ModelsPanel calls useChat() for the
// tier and the live credit balance), so we mount one directly. ModelsPanel's
// root is `flex flex-col h-full`, which fills the /app <main> flex column.

import { useRouter } from "next/navigation";
import { ChatProvider } from "@/app/chat/ChatContext";
import ModelsPanel from "@/app/chat/components/ModelsPanel";

export default function ModelsPage() {
  const router = useRouter();
  return (
    <ChatProvider>
      <ModelsPanel onPick={(id) => router.push("/chat?preset=" + encodeURIComponent(id))} />
    </ChatProvider>
  );
}
