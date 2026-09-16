"use client";

// /app/skills — the Skills catalog promoted to a first-class Control page.
//
// Reuses the very same <SkillsPanel> the chat surface exposes. SkillsPanel now
// renders the handoff's own `// SKILLS` header bar, so this page does NOT wrap it
// in PanelHost — a PanelHost header would print a second title above it. We still
// mount a ChatProvider directly (the pattern /app/cron uses): SkillsPanel calls
// useChat() for setInput, so it must live inside the chat tree even though a
// standalone page routes picks to /chat via onUse instead of seeding a local
// composer. SkillsPanel's root is `flex flex-col h-full`, which fills the /app
// <main> flex column directly.

import { useRouter } from "next/navigation";
import { ChatProvider } from "@/app/chat/ChatContext";
import SkillsPanel from "@/app/chat/components/SkillsPanel";

export default function SkillsPage() {
  const router = useRouter();
  return (
    <ChatProvider>
      <SkillsPanel
        onUse={(trigger) =>
          router.push("/chat" + (trigger ? "?prefill=" + encodeURIComponent(trigger) : ""))
        }
      />
    </ChatProvider>
  );
}
