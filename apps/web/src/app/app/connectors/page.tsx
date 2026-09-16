"use client";

// /app/connectors — the MCP Servers / Connectors gallery promoted to a Control
// page. Reuses the same <ConnectorsPanel> the chat surface renders as a tab.
//
// ConnectorsPanel now renders the handoff's own `// CONNECTORS` header bar
// (title + "N attached · M tools" chip + "+ Custom MCP"), so this page does NOT
// wrap it in PanelHost — a PanelHost header would print a second title above it.
// The panel reads its connector store from localStorage (via useConnectors) and
// has no ChatContext dependency, so it needs no ChatProvider either. Its root is
// `flex flex-col h-full`, which fills the /app <main> flex column directly.

import ConnectorsPanel from "@/app/chat/components/ConnectorsPanel";

export default function ConnectorsPage() {
  return <ConnectorsPanel />;
}
