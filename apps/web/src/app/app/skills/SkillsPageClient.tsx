"use client";

// Client half of /app/skills — see page.tsx. A standalone page has no local
// composer, so a pick routes to /chat?prefill=<trigger>; SkillsPanel calls
// useChat() for setInput, so it still mounts inside a ChatProvider.
import { useRouter } from "next/navigation";
import { ChatProvider } from "@/app/chat/ChatContext";
import SkillsPanel from "@/app/chat/components/SkillsPanel";

export default function SkillsPageClient({ costs }: { costs: Record<string, number> }) {
  const router = useRouter();
  return (
    <ChatProvider>
      <SkillsPanel
        costs={costs}
        onUse={(trigger) =>
          router.push("/chat" + (trigger ? "?prefill=" + encodeURIComponent(trigger) : ""))
        }
      />
    </ChatProvider>
  );
}
