"use client";

import { useState, useEffect, useRef, useCallback, KeyboardEvent } from "react";
import Link from "next/link";
import { AGENT_TOOLS } from "@/lib/agent-tools";

// ─── Types ────────────────────────────────────────────────────────────────────

type LineType = "input" | "output" | "error" | "system" | "success" | "ai" | "table" | "blank";

interface OutputLine {
  id: string;
  type: LineType;
  text: string;
  indent?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const VERSION = "1.0.0";
const NETWORK = "Base Mainnet · eip155:8453";
const USDC    = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const PAY_TO  = "0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f";

const CAT_COLOR: Record<string, string> = {
  intelligence:    "#4FC3F7",
  builder:         "#A78BFA",
  trading:         "#34D399",
  security:        "#F87171",
  "agent-economy": "#FACC15",
  "base-ecosystem":"#60A5FA",
  "on-chain":      "#FB923C",
  content:         "#E879F9",
  investor:        "#FACC15",
};

const COMMANDS = [
  "help", "clear", "whoami", "version", "echo",
  "blue idea", "blue build", "blue audit", "blue ship", "blue raise",
  "blue hub ls", "blue hub info", "blue hub run",
  "blue balance", "blue score", "blue stats",
];

const WELCOME = [
  { type: "system" as LineType, text: "  ██████╗ ██╗     ██╗   ██╗███████╗" },
  { type: "system" as LineType, text: "  ██╔══██╗██║     ██║   ██║██╔════╝" },
  { type: "system" as LineType, text: "  ██████╔╝██║     ██║   ██║█████╗  " },
  { type: "system" as LineType, text: "  ██╔══██╗██║     ██║   ██║██╔══╝  " },
  { type: "system" as LineType, text: "  ██████╔╝███████╗╚██████╔╝███████╗" },
  { type: "system" as LineType, text: "  ╚═════╝ ╚══════╝ ╚═════╝ ╚══════╝" },
  { type: "blank"  as LineType, text: "" },
  { type: "output" as LineType, text: `  Blue Terminal v${VERSION} · ${NETWORK}` },
  { type: "output" as LineType, text: `  ${AGENT_TOOLS.length} tools · x402 payments · Bankr LLM` },
  { type: "blank"  as LineType, text: "" },
  { type: "success" as LineType, text: "  Type 'help' to see available commands." },
  { type: "blank"  as LineType, text: "" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _id = 0;
function uid() { return String(++_id); }

function line(type: LineType, text: string, indent = false): OutputLine {
  return { id: uid(), type, text, indent };
}

function pad(s: string, n: number) {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TerminalPage() {
  const [lines,    setLines]   = useState<OutputLine[]>(() =>
    WELCOME.map(w => ({ id: uid(), ...w }))
  );
  const [input,    setInput]   = useState("");
  const [history,  setHistory] = useState<string[]>([]);
  const [histIdx,  setHistIdx] = useState(-1);
  const [busy,     setBusy]    = useState(false);

  const bottomRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLInputElement>(null);

  // auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  // focus on click anywhere
  const focusInput = () => inputRef.current?.focus();

  // append lines helper
  const push = useCallback((...newLines: OutputLine[]) => {
    setLines(prev => [...prev, ...newLines]);
  }, []);

  // typewriter effect for AI output
  const typewrite = useCallback((text: string) => {
    return new Promise<void>(resolve => {
      const words = text.split(" ");
      const lineId = uid();
      setLines(prev => [...prev, { id: lineId, type: "ai", text: "▌" }]);

      let built = "";
      let i = 0;
      const tick = () => {
        if (i >= words.length) {
          setLines(prev => prev.map(l =>
            l.id === lineId ? { ...l, text: built } : l
          ));
          resolve();
          return;
        }
        built += (i === 0 ? "" : " ") + words[i];
        i++;
        setLines(prev => prev.map(l =>
          l.id === lineId ? { ...l, text: built + " ▌" } : l
        ));
        setTimeout(tick, 12);
      };
      tick();
    });
  }, []);

  // ── Command handlers ──────────────────────────────────────────────────────

  const runCommand = useCallback(async (raw: string) => {
    const cmd = raw.trim();
    if (!cmd) return;

    // echo input
    push(line("input", `> ${cmd}`));

    // history
    setHistory(prev => [cmd, ...prev.filter(h => h !== cmd)].slice(0, 50));
    setHistIdx(-1);

    const parts  = cmd.split(/\s+/);
    const verb   = parts[0].toLowerCase();
    const sub    = parts[1]?.toLowerCase() ?? "";
    const rest   = parts.slice(2).join(" ");
    const allRest = parts.slice(1).join(" ");

    // ── built-ins ──────────────────────────────────────────────────────────

    if (verb === "clear") {
      setLines(WELCOME.map(w => ({ id: uid(), ...w })));
      return;
    }

    if (verb === "help") {
      push(
        line("blank", ""),
        line("success", "  BLUE TERMINAL — Command Reference"),
        line("blank", ""),
        line("system", "  SYSTEM"),
        line("output", "    help                   Show this help"),
        line("output", "    clear                  Clear the terminal"),
        line("output", "    whoami                 Session + wallet info"),
        line("output", "    version                Show version"),
        line("output", "    echo <text>            Echo text"),
        line("blank", ""),
        line("system", "  BLUE COMMANDS  (powered by Bankr LLM)"),
        line("output", "    blue idea <prompt>     Fundable brief from rough concept   $0.05"),
        line("output", "    blue build <prompt>    Architecture, stack, folder plan    $0.50"),
        line("output", "    blue audit <prompt>    Security + risk review              $1.00"),
        line("output", "    blue ship <prompt>     Deployment + launch checklist       $0.10"),
        line("output", "    blue raise <prompt>    Pitch narrative for investors       $0.20"),
        line("blank", ""),
        line("system", "  BLUE HUB  (40 x402 tools)"),
        line("output", "    blue hub ls            List all tools"),
        line("output", "    blue hub ls --cat <c>  Filter by category"),
        line("output", "    blue hub info <id>     Tool details + pricing"),
        line("output", "    blue hub run <id>      Run a tool (opens hub)"),
        line("blank", ""),
        line("system", "  ONCHAIN  (Base mainnet)"),
        line("output", "    blue balance [addr]    USDC + ETH balance"),
        line("output", "    blue score <handle>    Builder Score (0–100)"),
        line("output", "    blue stats             Blue Hub analytics"),
        line("blank", ""),
      );
      return;
    }

    if (verb === "whoami") {
      push(
        line("blank", ""),
        line("system", "  SESSION INFO"),
        line("output", `    Terminal     Blue Terminal v${VERSION}`),
        line("output", `    Network      ${NETWORK}`),
        line("output", `    LLM          Bankr LLM (Haiku / Sonnet)`),
        line("output", `    Tools        ${AGENT_TOOLS.length} live on Blue Hub`),
        line("output", `    Payment      USDC · x402 · ${PAY_TO.slice(0, 10)}...`),
        line("output", `    Registry     ERC-8257 · agentic.market · CDP Bazaar`),
        line("blank", ""),
      );
      return;
    }

    if (verb === "version") {
      push(
        line("blank", ""),
        line("output", `  Blue Terminal  v${VERSION}`),
        line("output", `  Blue Hub       ${AGENT_TOOLS.length} tools`),
        line("output", `  Protocol       x402 v2`),
        line("output", `  Chain          Base Mainnet (8453)`),
        line("blank", ""),
      );
      return;
    }

    if (verb === "echo") {
      push(line("output", `  ${allRest}`));
      return;
    }

    // ── blue hub ──────────────────────────────────────────────────────────

    if (verb === "blue" && sub === "hub") {
      const hubSub = parts[2]?.toLowerCase() ?? "ls";

      // blue hub ls [--cat <category>]
      if (hubSub === "ls" || !parts[2]) {
        const catFilter = parts.includes("--cat") ? parts[parts.indexOf("--cat") + 1] : null;
        const tools = catFilter
          ? AGENT_TOOLS.filter(t => t.category === catFilter)
          : AGENT_TOOLS;

        if (tools.length === 0) {
          push(line("error", `  No tools found for category: ${catFilter}`));
          return;
        }

        push(
          line("blank", ""),
          line("system", catFilter
            ? `  BLUE HUB — ${catFilter.toUpperCase()} (${tools.length} tools)`
            : `  BLUE HUB — ${AGENT_TOOLS.length} tools · x402 · Base Mainnet`
          ),
          line("blank", ""),
          line("system", `  ${pad("ID", 30)} ${pad("CATEGORY", 16)} PRICE`),
          line("system", `  ${"─".repeat(56)}`),
          ...tools.map(t => line("table",
            `  ${pad(t.id, 30)} ${pad(t.category, 16)} ${t.price ?? "free"}`
          )),
          line("blank", ""),
          line("output", `  ${tools.length} tools · 'blue hub info <id>' for details`),
          line("blank", ""),
        );
        return;
      }

      // blue hub info <id>
      if (hubSub === "info") {
        const toolId = parts[3];
        if (!toolId) { push(line("error", "  Usage: blue hub info <tool-id>")); return; }
        const t = AGENT_TOOLS.find(x => x.id === toolId);
        if (!t) { push(line("error", `  Tool not found: ${toolId}`)); return; }

        const catCol = CAT_COLOR[t.category] ?? "#94A3B8";
        push(
          line("blank", ""),
          line("success", `  ${t.name}`),
          line("output", `  ID          ${t.id}`),
          line("output", `  Category    ${t.category}`),
          line("output", `  Agent       ${t.agentName}`),
          line("output", `  Price       ${t.price ?? "free"}`),
          line("output", `  Endpoint    /api/x402/${t.id}`),
          line("output", `  Manifest    /.well-known/ai-tool/${t.id}.json`),
          line("blank", ""),
          line("output", `  Description`),
          line("output", `  ${t.description}`),
          line("blank", ""),
          t.inputs?.length > 0
            ? line("output", `  Inputs      ${t.inputs.map(i => i.key + (i.required ? "*" : "")).join(", ")}`)
            : line("output", "  Inputs      none"),
          line("blank", ""),
          line("system", `  Run: blue hub run ${t.id}`),
          line("blank", ""),
        );
        void catCol;
        return;
      }

      // blue hub run <id>
      if (hubSub === "run") {
        const toolId = parts[3];
        if (!toolId) { push(line("error", "  Usage: blue hub run <tool-id>")); return; }
        const t = AGENT_TOOLS.find(x => x.id === toolId);
        if (!t) { push(line("error", `  Tool not found: ${toolId}`)); return; }
        push(
          line("blank", ""),
          line("output", `  Opening ${t.name} in Blue Hub...`),
          line("output", `  → https://blueagent.dev/hub/${t.id}`),
          line("blank", ""),
        );
        setTimeout(() => window.open(`/hub/${t.id}`, "_blank"), 600);
        return;
      }

      push(line("error", `  Unknown hub command. Try: blue hub ls | blue hub info <id>`));
      return;
    }

    // ── blue stats ────────────────────────────────────────────────────────

    if (verb === "blue" && sub === "stats") {
      setBusy(true);
      push(line("system", "  Fetching Blue Hub analytics..."));
      try {
        const res = await fetch("/api/stats");
        if (!res.ok) throw new Error(`${res.status}`);
        const d = await res.json();
        push(
          line("blank", ""),
          line("success", "  BLUE HUB ANALYTICS"),
          line("blank", ""),
          line("output", `  Tools live      ${d.totals.tools}`),
          line("output", `  Total runs      ${d.totals.totalRuns.toLocaleString()}`),
          line("output", `  Est. revenue    $${d.totals.totalRevenueEst.toFixed(2)}`),
          line("blank", ""),
          line("system", `  TOP TOOLS`),
          ...d.rows.slice(0, 5).map((r: { name: string; runs: number; revenueEst: number }, i: number) =>
            line("output", `  ${i + 1}. ${pad(r.name, 30)} ${pad(String(r.runs) + " runs", 12)} $${r.revenueEst.toFixed(2)}`)
          ),
          line("blank", ""),
          line("output", "  Full analytics → blueagent.dev/hub/stats"),
          line("blank", ""),
        );
      } catch (e) {
        push(line("error", `  Stats error: ${(e as Error).message}`));
      }
      setBusy(false);
      return;
    }

    // ── blue balance ──────────────────────────────────────────────────────

    if (verb === "blue" && sub === "balance") {
      const addr = rest || PAY_TO;
      setBusy(true);
      push(line("system", `  Querying Base mainnet for ${addr.slice(0, 10)}...`));
      try {
        // ETH balance
        const ethRes = await fetch("https://mainnet.base.org", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [addr, "latest"] }),
        });
        const ethData = await ethRes.json() as { result?: string };
        const eth = ethData.result ? (parseInt(ethData.result, 16) / 1e18).toFixed(6) : "?";

        // USDC balance
        const usdcData = "0x70a08231" + addr.slice(2).padStart(64, "0");
        const usdcRes = await fetch("https://mainnet.base.org", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "eth_call", params: [{ to: USDC, data: usdcData }, "latest"] }),
        });
        const usdcJson = await usdcRes.json() as { result?: string };
        const usdc = usdcJson.result ? (parseInt(usdcJson.result, 16) / 1e6).toFixed(2) : "?";

        push(
          line("blank", ""),
          line("success", "  WALLET BALANCE · Base Mainnet"),
          line("blank", ""),
          line("output", `  Address   ${addr}`),
          line("output", `  ETH       ${eth} ETH`),
          line("output", `  USDC      $${usdc} USDC`),
          line("blank", ""),
          line("output", `  Basescan → https://basescan.org/address/${addr}`),
          line("blank", ""),
        );
      } catch (e) {
        push(line("error", `  RPC error: ${(e as Error).message}`));
      }
      setBusy(false);
      return;
    }

    // ── blue score ────────────────────────────────────────────────────────

    if (verb === "blue" && sub === "score") {
      const handle = rest;
      if (!handle) { push(line("error", "  Usage: blue score <handle or wallet>")); return; }
      setBusy(true);
      push(line("system", `  Fetching builder score for ${handle}...`));
      try {
        const res = await fetch(`/api/score?handle=${encodeURIComponent(handle)}`);
        if (!res.ok) throw new Error(`${res.status}`);
        const d = await res.json();
        const score = d.score ?? d.builderScore ?? d.total ?? "?";
        push(
          line("blank", ""),
          line("success", `  BUILDER SCORE — ${handle}`),
          line("blank", ""),
          line("output", `  Score     ${score} / 100`),
          ...(d.breakdown ? Object.entries(d.breakdown).map(([k, v]) =>
            line("output", `  ${pad(k, 16)} ${v}`)
          ) : []),
          line("blank", ""),
        );
      } catch (e) {
        push(line("error", `  Score error: ${(e as Error).message}`));
      }
      setBusy(false);
      return;
    }

    // ── blue idea / build / audit / ship / raise ───────────────────────

    const BLUE_CMDS: Record<string, { cmd: string; label: string }> = {
      idea:  { cmd: "idea",  label: "BLUE IDEA" },
      build: { cmd: "build", label: "BLUE BUILD" },
      audit: { cmd: "audit", label: "BLUE AUDIT" },
      ship:  { cmd: "ship",  label: "BLUE SHIP"  },
      raise: { cmd: "raise", label: "BLUE RAISE" },
    };

    if (verb === "blue" && BLUE_CMDS[sub]) {
      const { cmd, label } = BLUE_CMDS[sub];
      const prompt = rest;
      if (!prompt) {
        push(line("error", `  Usage: blue ${cmd} <your prompt>`));
        return;
      }
      setBusy(true);
      push(
        line("blank", ""),
        line("system", `  ${label} — Bankr LLM running...`),
        line("blank", ""),
      );
      try {
        const res = await fetch("/api/console", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: cmd, prompt }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error((err as { error: string }).error || res.statusText);
        }
        const data = await res.json() as { result: string };
        const result = data.result ?? "";

        // split into paragraphs, typewrite each
        const paras = result.split(/\n\n+/);
        for (const para of paras) {
          const trimmed = para.trim();
          if (!trimmed) { push(line("blank", "")); continue; }
          const subLines = trimmed.split("\n");
          for (const sl of subLines) {
            await typewrite("  " + sl.trim());
          }
          push(line("blank", ""));
        }
      } catch (e) {
        push(line("error", `  Error: ${(e as Error).message}`));
      }
      setBusy(false);
      return;
    }

    // ── unknown ───────────────────────────────────────────────────────────

    push(
      line("error", `  Command not found: ${cmd}`),
      line("output", "  Type 'help' to see available commands."),
    );
  }, [push, typewrite]);

  // ── Keyboard handling ─────────────────────────────────────────────────────

  const handleKey = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !busy) {
      const cmd = input.trim();
      setInput("");
      if (cmd) runCommand(cmd);
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHistIdx(prev => {
        const next = Math.min(prev + 1, history.length - 1);
        setInput(history[next] ?? "");
        return next;
      });
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHistIdx(prev => {
        const next = Math.max(prev - 1, -1);
        setInput(next === -1 ? "" : history[next] ?? "");
        return next;
      });
    }

    if (e.key === "Tab") {
      e.preventDefault();
      const match = COMMANDS.find(c => c.startsWith(input) && c !== input);
      if (match) setInput(match + " ");
    }

    if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      setLines(WELCOME.map(w => ({ id: uid(), ...w })));
    }
  }, [busy, input, history, runCommand]);

  // ── Line renderer ─────────────────────────────────────────────────────────

  function renderLine(l: OutputLine) {
    const colors: Record<LineType, string> = {
      input:   "#94A3B8",
      output:  "#CBD5E1",
      error:   "#F87171",
      system:  "#4FC3F7",
      success: "#34D399",
      ai:      "#E2E8F0",
      table:   "#94A3B8",
      blank:   "transparent",
    };

    if (l.type === "blank") return <div key={l.id} className="h-2" />;

    return (
      <div
        key={l.id}
        className="font-mono text-[12px] leading-5 whitespace-pre-wrap break-all"
        style={{ color: colors[l.type] }}
      >
        {l.text}
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col h-screen bg-[#050508] text-slate-200 overflow-hidden"
      onClick={focusInput}
    >
      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1A1A2E] shrink-0 bg-[#080810]">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-[#4FC3F7]/10 border border-[#4FC3F7]/30 flex items-center justify-center">
              <span className="text-[#4FC3F7] text-[9px] font-bold font-mono">B</span>
            </div>
          </Link>
          <span className="font-mono text-[11px] text-slate-500 uppercase tracking-widest">Terminal</span>
          <span className="font-mono text-[10px] text-[#1A1A2E]">·</span>
          <span className="font-mono text-[10px] text-slate-700">v{VERSION}</span>
        </div>

        <div className="flex items-center gap-3">
          {busy && (
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FACC15] animate-pulse" />
              <span className="font-mono text-[10px] text-[#FACC15]">running</span>
            </div>
          )}
          <span className="font-mono text-[10px] text-slate-700 px-2 py-0.5 border border-[#1A1A2E] rounded">
            {NETWORK}
          </span>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#34D399]"
              style={{ boxShadow: "0 0 6px #34D399" }} />
            <span className="font-mono text-[10px] text-[#34D399]">live</span>
          </div>
        </div>
      </div>

      {/* ── Output area ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-0.5"
        style={{
          backgroundImage:
            "linear-gradient(rgba(79,195,247,0.015) 1px,transparent 1px)," +
            "linear-gradient(90deg,rgba(79,195,247,0.015) 1px,transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      >
        {lines.map(renderLine)}
        <div ref={bottomRef} />
      </div>

      {/* ── Input bar ───────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-[#1A1A2E] bg-[#080810] px-4 py-3">
        <div className="flex items-center gap-3">
          {/* prompt */}
          <span className="font-mono text-[12px] text-[#4FC3F7] shrink-0 select-none">
            blue@terminal:~$
          </span>

          {/* input */}
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            disabled={busy}
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder={busy ? "running…" : "type a command…"}
            className="flex-1 bg-transparent outline-none font-mono text-[12px] text-slate-200 placeholder:text-slate-700 caret-[#4FC3F7] disabled:opacity-40"
          />

          {/* cursor blink */}
          {!busy && (
            <span
              className="w-2 h-4 bg-[#4FC3F7] shrink-0"
              style={{ animation: "pulse 1.2s step-end infinite", opacity: 0.8 }}
            />
          )}
        </div>

        {/* hints */}
        <div className="flex gap-4 mt-1.5 pl-28">
          <span className="font-mono text-[9px] text-slate-800">↑↓ history</span>
          <span className="font-mono text-[9px] text-slate-800">Tab autocomplete</span>
          <span className="font-mono text-[9px] text-slate-800">Ctrl+L clear</span>
        </div>
      </div>
    </div>
  );
}
