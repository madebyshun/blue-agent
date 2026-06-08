"use client";

import { useState } from "react";

interface Client {
  id:        string;
  label:     string;
  hint:      string;
  config:    string;
  language:  "json" | "bash";
}

const CLIENTS: Client[] = [
  {
    id:    "claude-desktop",
    label: "Claude Desktop",
    hint:  "~/Library/Application Support/Claude/claude_desktop_config.json",
    language: "json",
    config: `{
  "mcpServers": {
    "blue-agent": {
      "url": "https://blueagent.dev/api/mcp"
    }
  }
}`,
  },
  {
    id:    "claude-code",
    label: "Claude Code",
    hint:  "Terminal CLI",
    language: "bash",
    config: `claude mcp add blue-agent \\
  --transport http \\
  https://blueagent.dev/api/mcp`,
  },
  {
    id:    "cursor",
    label: "Cursor / Cline / Windsurf",
    hint:  "Via mcp-remote bridge",
    language: "json",
    config: `{
  "mcpServers": {
    "blue-agent": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://blueagent.dev/api/mcp"]
    }
  }
}`,
  },
  {
    id:    "curl",
    label: "Raw HTTP (any client)",
    hint:  "Test from terminal",
    language: "bash",
    config: `curl -X POST https://blueagent.dev/api/mcp \\
  -H 'Content-Type: application/json' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`,
  },
];

export default function InstallMcp() {
  const [active, setActive] = useState(CLIENTS[0].id);
  const [copied, setCopied] = useState(false);
  const client = CLIENTS.find(c => c.id === active)!;

  async function copy() {
    try {
      await navigator.clipboard.writeText(client.config);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-16 sm:py-20">
      <div className="text-center mb-10">
        <p className="font-mono text-[10px] text-[#4FC3F7] tracking-widest mb-1">🔌 INSTALL MCP</p>
        <h2 className="font-mono text-2xl sm:text-3xl font-bold tracking-tight">One config, every client</h2>
        <p className="font-mono text-xs text-slate-500 mt-2">
          Works with Claude Desktop, Cursor, Cline, Windsurf, and every MCP-compatible AI client
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5 mb-3 justify-center">
        {CLIENTS.map((c) => (
          <button key={c.id}
            onClick={() => setActive(c.id)}
            className={`font-mono text-[11px] px-3 py-1.5 rounded-lg border transition-all ${
              active === c.id
                ? "border-[#4FC3F7]/40 text-[#4FC3F7] bg-[#4FC3F7]/10"
                : "border-[#1A1A2E] text-slate-500 hover:text-slate-300 hover:border-[#1A1A2E]"
            }`}>
            {c.label}
          </button>
        ))}
      </div>

      {/* Code block */}
      <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1A1A2E] bg-[#0d0d12]">
          <p className="font-mono text-[10px] text-slate-600">{client.hint}</p>
          <button onClick={copy}
            className={`font-mono text-[10px] px-2 py-1 rounded border transition-all ${
              copied
                ? "text-[#34D399] border-[#34D399]/40 bg-[#34D399]/5"
                : "text-slate-500 border-[#1A1A2E] hover:text-[#4FC3F7] hover:border-[#4FC3F7]/30"
            }`}>
            {copied ? "✓ Copied!" : "Copy"}
          </button>
        </div>
        <pre className="px-4 py-4 overflow-x-auto font-mono text-xs text-slate-300 leading-relaxed">
          <code>{client.config}</code>
        </pre>
      </div>

      <p className="font-mono text-[10px] text-slate-700 text-center mt-4">
        Free MCP tier · pay only on `tools/call` for priced tools · rate-limit 100 req/min/IP
      </p>
    </div>
  );
}
