"use client";
import {
  createContext, useContext, useState, useEffect,
  useRef, useCallback, useMemo,
  type ReactNode,
} from "react";
import {
  type Message, type ChatTask, type Artifact,
  type CronTask, type PersonaId, type SidebarTab, type Attachment,
} from "./types";
import type { TierInfo } from "@/lib/credits";
import {
  loadTasks, saveTasks, createTask, migrateOldChat,
  loadCrons, saveCrons, isDue,
  loadPersona, savePersona, loadCustomPrompt, saveCustomPrompt,
} from "./storage";
import { extractArtifacts } from "./artifacts";
import { getPersona } from "./personas";
import {
  creditCost, deductCredits,
  getNextRefresh, refreshCreditsIfNeeded, getDailyCr,
  setCredits as setCreditsLS,
} from "@/lib/credits";
import {
  buildMemoryContext, updateMemoryAfterChat,
  addChunk, setChunkEmbedding, searchChunks,
} from "@/lib/memory";

// ── Context type ──────────────────────────────────────────────────────────────

interface ChatContextValue {
  // Tasks
  tasks:              ChatTask[];
  activeTaskId:       string | null;
  activeTask:         ChatTask | null;
  createNewTask:      () => void;
  selectTask:         (id: string) => void;
  deleteTask:         (id: string) => void;

  // Messages / streaming
  streaming:          boolean;
  error:              string | null;
  setError:           (e: string | null) => void;
  input:              string;
  setInput:           (v: string) => void;
  send:               (text: string) => void;
  stop:               () => void;

  // Model
  chatTier:           string;
  setChatTier:        (t: string) => void;

  // Persona
  personaId:          PersonaId;
  setPersonaId:       (id: PersonaId) => void;
  customPersonaPrompt: string;
  setCustomPersonaPrompt: (s: string) => void;

  // Artifacts
  artifacts:          Artifact[];
  artifactsPanelOpen: boolean;
  setArtifactsPanelOpen: (v: boolean) => void;

  // Crons
  crons:      CronTask[];
  addCron:    (c: Omit<CronTask, "id">) => void;
  updateCron: (id: string, patch: Partial<CronTask>) => void;
  deleteCron: (id: string) => void;
  runCron:    (id: string) => Promise<void>;
  cronRunning: string | null; // id of running cron

  // Sidebar
  sidebarTab:    SidebarTab;
  setSidebarTab: (t: SidebarTab) => void;

  // Buy modal
  buyOpen:    boolean;
  setBuyOpen: (v: boolean) => void;

  // Wallet / credits
  walletAddr:     string | undefined;
  holderTier:     TierInfo;
  credits:        number;
  countdown:      string;
  isUnlimited:    boolean;
  daily:          number;
  cost:           number;
  outOfCredits:   boolean;
  walletReady:    boolean;
  onWalletChange: (addr: string | undefined, tier: TierInfo) => void;
  setCredits:     (n: number) => void;
  walletRefresh:  number;          // increment to force WalletBar balance re-fetch
  triggerWalletRefresh: () => void;

  // Web search
  webSearch:    boolean;
  setWebSearch: (v: boolean) => void;

  // File attachments (pending, cleared after send)
  pendingFiles:    Attachment[];
  setPendingFiles: (f: Attachment[]) => void;

  // Slash cmd menu
  cmdMenu:    boolean;
  setCmdMenu: (v: boolean) => void;
  cmdFilter:  string;
  setCmdFilter: (v: string) => void;
}

// ── Provider ──────────────────────────────────────────────────────────────────

const STARTER_TIER: TierInfo = {
  tier: "Starter", blueBalance: 0, dailyCr: 500, discount: 0, color: "#4FC3F7",
};

function formatCountdown(ms: number): string {
  if (ms <= 0) return "now";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const ChatCtx = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  // ── Wallet / credits ──────────────────────────────────────────────────────
  const [walletAddr,    setWalletAddr]    = useState<string | undefined>();
  const [holderTier,    setHolderTier]    = useState<TierInfo>(STARTER_TIER);
  const [credits,       setCredits]       = useState(0);
  // walletReady: true once wallet detection has completed (even if no wallet found)
  // Prevents "out of credits" flash before we know the user's real balance
  const [walletReady,   setWalletReady]   = useState(false);
  const [countdown,     setCountdown]     = useState("");
  const [buyOpen,       setBuyOpen]       = useState(false);
  const [walletRefresh, setWalletRefresh] = useState(0);
  const triggerWalletRefresh = useCallback(() => setWalletRefresh(n => n + 1), []);

  // Source of truth for the spendable `credits` number depends on whether a
  // wallet is connected:
  //   - Wallet connected → read the unified credit ledger
  //     (/api/credits/balance/[address]), which is what the dashboard shows
  //     and what /api/chat actually debits server-side.
  //   - Guest (no wallet) → keep the legacy localStorage daily-quota.
  //
  // The earlier design had both rails active at once: server debited the
  // ledger AND the client also subtracted from localStorage after a send.
  // That double-spend was why Dashboard read 1,170 while Settings read
  // 40/500 for the same user. We pick one source per session and stick.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!walletReady) return;

    if (walletAddr) {
      // Connected — fetch the ledger balance. Refreshes whenever
      // walletRefresh increments (after a send / on demand).
      let cancelled = false;
      fetch(`/api/credits/balance/${walletAddr}`)
        .then(r => r.json())
        .then(d => {
          if (cancelled) return;
          const bal = Number(d?.balance);
          if (Number.isFinite(bal)) setCredits(bal);
        })
        .catch(() => null);
      return () => { cancelled = true; };
    }

    // Guest — keep the legacy localStorage daily quota.
    const result = refreshCreditsIfNeeded(holderTier.blueBalance, walletAddr);
    setCredits(result.credits);
  }, [walletReady, walletAddr, holderTier.blueBalance, walletRefresh]);

  useEffect(() => {
    function tick() {
      const next = getNextRefresh(walletAddr);
      setCountdown(formatCountdown(next - Date.now()));
    }
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [walletAddr]);

  const onWalletChange = useCallback((addr: string | undefined, tier: TierInfo) => {
    setWalletAddr(addr);
    setHolderTier(tier);
    setWalletReady(true); // wallet detection completed — safe to evaluate outOfCredits
  }, []);

  // ── Persona ───────────────────────────────────────────────────────────────
  const [personaId,    setPersonaIdState]    = useState<PersonaId>("blue-agent");
  const [customPersonaPrompt, setCustomPersonaPromptState] = useState("");

  useEffect(() => {
    setPersonaIdState(loadPersona(walletAddr));
    setCustomPersonaPromptState(loadCustomPrompt(walletAddr));
  }, [walletAddr]);

  const setPersonaId = useCallback((id: PersonaId) => {
    setPersonaIdState(id);
    savePersona(id, walletAddr);
  }, [walletAddr]);

  const setCustomPersonaPrompt = useCallback((s: string) => {
    setCustomPersonaPromptState(s);
    saveCustomPrompt(s, walletAddr);
  }, [walletAddr]);

  // ── Tasks ─────────────────────────────────────────────────────────────────
  const [tasks,        setTasksState]  = useState<ChatTask[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [chatTier,     setChatTier]    = useState("pro");

  // Load tasks on wallet change, migrate old chat, or create a fresh default task
  useEffect(() => {
    const loaded = loadTasks(walletAddr);
    if (loaded.length === 0) {
      // Try old single-chat format migration first
      const migrated = migrateOldChat(walletAddr);
      if (migrated) {
        setTasksState([migrated]);
        setActiveTaskId(migrated.id);
        saveTasks([migrated], walletAddr);
        return;
      }
      // If wallet just connected, migrate any guest history across
      if (walletAddr) {
        const guestTasks = loadTasks(undefined); // blue_tasks_v1_guest
        if (guestTasks.length > 0) {
          saveTasks(guestTasks, walletAddr);
          const sorted = [...guestTasks].sort((a, b) => b.updatedAt - a.updatedAt);
          setTasksState(sorted);
          setActiveTaskId(sorted[0].id);
          return;
        }
      }
      // No history at all — put a fresh unsaved task in state so send() has something to attach to
      const fresh = createTask("pro", "blue-agent");
      setTasksState([fresh]);       // in-memory only, NOT saved yet
      setActiveTaskId(fresh.id);
      return;
    }
    // Sort by most recent and activate the latest
    const sorted = [...loaded].sort((a, b) => b.updatedAt - a.updatedAt);
    setTasksState(sorted);
    setActiveTaskId(sorted[0].id);
  }, [walletAddr]);

  const setTasks = useCallback((ts: ChatTask[]) => {
    setTasksState(ts);
    saveTasks(ts, walletAddr);
  }, [walletAddr]);

  const activeTask = useMemo(
    () => tasks.find(t => t.id === activeTaskId) ?? null,
    [tasks, activeTaskId],
  );

  const createNewTask = useCallback(() => {
    const t = createTask(chatTier, personaId);
    const updated = [t, ...tasks];
    setTasks(updated);
    setActiveTaskId(t.id);
    setInput("");
    setError(null);
  }, [tasks, chatTier, personaId]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectTask = useCallback((id: string) => {
    setActiveTaskId(id);
    setError(null);
  }, []);

  const deleteTask = useCallback((id: string) => {
    const updated = tasks.filter(t => t.id !== id);
    setTasks(updated);
    if (activeTaskId === id) {
      setActiveTaskId(updated[0]?.id ?? null);
    }
  }, [tasks, activeTaskId]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateMessages = useCallback((messages: Message[]) => {
    setTasksState(prev => {
      const updated = prev.map(t =>
        t.id === activeTaskId
          ? { ...t, messages, updatedAt: Date.now() }
          : t,
      );
      saveTasks(updated, walletAddr);
      return updated;
    });
  }, [activeTaskId, walletAddr]);

  // ── Artifacts ────────────────────────────────────────────────────────────
  const [artifactsPanelOpen, setArtifactsPanelOpen] = useState(false);

  const artifacts = useMemo(
    () => extractArtifacts(activeTask?.messages ?? []),
    [activeTask?.messages],
  );

  // Auto-open panel when new artifacts detected
  const prevArtCount = useRef(0);
  useEffect(() => {
    if (artifacts.length > prevArtCount.current && artifacts.length > 0) {
      setArtifactsPanelOpen(true);
    }
    prevArtCount.current = artifacts.length;
  }, [artifacts.length]);

  // ── Crons ─────────────────────────────────────────────────────────────────
  const [crons,       setCreonsState] = useState<CronTask[]>([]);
  const [cronRunning, setCronRunning] = useState<string | null>(null);

  useEffect(() => {
    const loaded = loadCrons(walletAddr);
    setCreonsState(loaded);
  }, [walletAddr]);

  const setCrons = useCallback((cs: CronTask[]) => {
    setCreonsState(cs);
    saveCrons(cs, walletAddr);
  }, [walletAddr]);

  const addCron = useCallback((c: Omit<CronTask, "id">) => {
    const newCron: CronTask = { ...c, id: Math.random().toString(36).slice(2, 10) };
    setCrons([...crons, newCron]);
  }, [crons]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateCron = useCallback((id: string, patch: Partial<CronTask>) => {
    setCrons(crons.map(c => c.id === id ? { ...c, ...patch } : c));
  }, [crons]); // eslint-disable-line react-hooks/exhaustive-deps

  const deleteCron = useCallback((id: string) => {
    setCrons(crons.filter(c => c.id !== id));
  }, [crons]); // eslint-disable-line react-hooks/exhaustive-deps

  const runCron = useCallback(async (id: string) => {
    const cron = crons.find(c => c.id === id);
    if (!cron) return;
    setCronRunning(id);
    try {
      const res = await fetch("/api/cron/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: cron.prompt, tier: chatTier }),
        signal: AbortSignal.timeout(60_000),
      });
      const data = await res.json() as { result?: string };
      updateCron(id, { lastRun: Date.now(), lastResult: data.result?.slice(0, 200) });
    } catch {
      updateCron(id, { lastRun: Date.now(), lastResult: "Error running task" });
    } finally {
      setCronRunning(null);
    }
  }, [crons, chatTier]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-run due crons on mount
  useEffect(() => {
    const due = crons.filter(isDue);
    if (due.length === 0) return;
    (async () => { for (const c of due) await runCron(c.id); })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Chat state ─────────────────────────────────────────────────────────────
  const [streaming,    setStreaming]    = useState(false);
  const [error,        setError]       = useState<string | null>(null);
  const [input,        setInput]       = useState("");
  const [sidebarTab,   setSidebarTab]  = useState<SidebarTab>("none");
  const [cmdMenu,      setCmdMenu]     = useState(false);
  const [cmdFilter,    setCmdFilter]   = useState("");
  const [webSearch,    setWebSearch]   = useState(false);
  const [pendingFiles, setPendingFiles] = useState<Attachment[]>([]);
  const abortRef       = useRef<AbortController | null>(null);
  const streamStartRef = useRef<number>(0);

  const cost = creditCost(chatTier, holderTier);
  // Local dev never gates on credits: `process.env.NODE_ENV` is inlined at build
  // time, so this is `true` only under `next dev` and ALWAYS `false` in a
  // production build (the deployed app is unaffected). The server already skips
  // the ledger debit locally when INTERNAL_SERVICE_KEY is unset.
  const DEV_UNLIMITED = process.env.NODE_ENV !== "production";
  const isUnlimited = DEV_UNLIMITED || (holderTier.dailyCr === -1 && !!walletAddr);
  const daily = getDailyCr(holderTier, !!walletAddr);
  // Only block sending after wallet detection is done — avoids false "out of credits" on F5
  const outOfCredits = walletReady && !isUnlimited && credits < cost;

  // ── Tier config ────────────────────────────────────────────────────────────
  const activeTierProvider = chatTier.startsWith("venice") ? "venice" : "bankr";
  const VENICE_MODEL_IDS: Record<string, string> = {
    // Venice — standard
    "venice-deepseek":      "deepseek-v4-flash",
    "venice-deepseek-pro":  "deepseek-v4-pro",
    "venice-kimi":          "kimi-k2-6",
    "venice-claude":        "claude-opus-4-7",
    "venice-fable":         "claude-fable-5",
    "venice-grok":          "grok-4-3",
    "venice-qwen":          "qwen3-235b-a22b-instruct-2507",
    "venice-mistral":       "mistral-small-3-2-24b-instruct",
    "venice-uncut":         "venice-uncensored-1-2",
    // Venice — Privacy / E2EE
    "venice-e2ee-venice":   "e2ee-venice-uncensored-24b-p",
    "venice-e2ee-gemma":    "e2ee-gemma-3-27b-p",
    "venice-e2ee-qwen":     "e2ee-qwen3-6-35b-a3b",
  };

  // ── send() ────────────────────────────────────────────────────────────────
  const send = useCallback(async (text: string) => {
    const userMsg = text.trim();
    if (!userMsg || streaming) return;

    // Gate on the SAME credit value the UI shows — `credits` is the unified
    // ledger balance for connected wallets and the localStorage daily quota
    // for guests. Previously this re-read localStorage directly, which caused
    // a mismatch: the sidebar showed 731 (ledger) while this gate saw a stale
    // localStorage 40 and blocked the send. The server ledger is authoritative
    // regardless and will reject with insufficient_credits if truly short.
    if (!isUnlimited && credits < cost) {
      setError(`Not enough credits. Need ${cost}, have ${credits}.`);
      return;
    }

    setError(null);

    // ── Ensure an active task exists. If not (first-ever message), create one.
    // We capture the task ID in a local variable so all async closures below use
    // the same ID even before React flushes the state update.
    let tid = activeTaskId;
    let baseMessages: Message[] = activeTask?.messages ?? [];

    if (!tid) {
      const freshTask = createTask(chatTier, personaId);
      tid = freshTask.id;
      // Add to state AND persist immediately so it survives a refresh
      setTasksState(prev => {
        const updated = [freshTask, ...prev];
        saveTasks(updated, walletAddr);
        return updated;
      });
      setActiveTaskId(tid);
      baseMessages = [];
    }

    // Capture and clear pending files before async work
    const files = pendingFiles;
    setPendingFiles([]);

    const userMessage: Message = {
      role: "user",
      content: userMsg,
      createdAt: Date.now(),
      ...(files.length > 0 ? { attachments: files } : {}),
    };
    const next: Message[] = [...baseMessages, userMessage];

    // Auto-title task on first message
    if (!activeTask?.title) {
      setTasksState(prev => prev.map(t =>
        t.id === tid ? { ...t, title: userMsg.slice(0, 50) } : t,
      ));
    }

    // Push messages with empty assistant placeholder
    setTasksState(prev => {
      const msgs: Message[] = [...next, { role: "assistant", content: "", createdAt: Date.now() }];
      const updated = prev.map(t => t.id === tid ? { ...t, messages: msgs, updatedAt: Date.now() } : t);
      saveTasks(updated, walletAddr);
      return updated;
    });

    setInput("");
    setStreaming(true);
    streamStartRef.current = Date.now();

    abortRef.current = new AbortController();

    // Build persona system prompt
    const persona = getPersona(personaId);
    const personaPrompt = personaId === "custom" ? customPersonaPrompt : persona.systemPrompt;

    // Semantic memory: embed query and find relevant past conversations
    // This runs quickly using local cosine similarity against stored embeddings
    let queryEmbedding: number[] | null = null;
    try {
      const embedRes = await fetch("/api/memory/embed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: userMsg.slice(0, 512) }),
        signal: AbortSignal.timeout(5_000),
      });
      if (embedRes.ok) {
        const { embedding } = await embedRes.json() as { embedding?: number[] };
        queryEmbedding = embedding ?? null;
      }
    } catch { /* fall back to recency-based memory */ }

    const semanticChunks = searchChunks(queryEmbedding, walletAddr, 3);
    const memoryContext = buildMemoryContext(walletAddr, semanticChunks.length > 0 ? semanticChunks : undefined);
    const modelId = VENICE_MODEL_IDS[chatTier];

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages:    next,
          tier:        chatTier,
          provider:    activeTierProvider,
          // Connected wallet — when present, the chat backend debits the
          // message + tool credit cost from this wallet's unified ledger
          // (Week 2 of the credit redesign). Guest sessions omit this and
          // continue to use the localStorage daily-quota path.
          ...(walletAddr    ? { address: walletAddr } : {}),
          ...(modelId       ? { modelId }       : {}),
          ...(memoryContext ? { memoryContext }  : {}),
          ...(personaPrompt ? { persona: personaPrompt } : {}),
          ...(webSearch     ? { webSearch: true } : {}),
          ...(files.length  ? { attachments: files } : {}),
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? `Error ${res.status}`);
      }

      // Credit accounting: connected wallets are debited server-side by
      // /api/chat against the unified ledger — we just re-fetch the balance.
      // Guest sessions still drain the localStorage daily quota.
      if (walletAddr) {
        fetch(`/api/credits/balance/${walletAddr}`)
          .then(r => r.json())
          .then(d => {
            const bal = Number(d?.balance);
            if (Number.isFinite(bal)) setCredits(bal);
          })
          .catch(() => null);
      } else {
        const remaining = deductCredits(cost, walletAddr);
        setCredits(remaining);
      }

      const reader  = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") break;
          try {
            const parsed = JSON.parse(raw) as {
              type?: string; tool?: string; ms?: number; result?: unknown;
              delta?: { text?: string; value?: string };
            };

            if (parsed.type === "thinking_start") {
              setTasksState(prev => {
                const task = prev.find(t => t.id === tid);
                if (!task) return prev;
                const msgs = [...task.messages];
                const last = msgs[msgs.length - 1];
                if (last?.role === "assistant") {
                  msgs[msgs.length - 1] = { ...last, isThinking: true, thinkingContent: "" };
                }
                return prev.map(t => t.id === tid ? { ...t, messages: msgs } : t);
              });
            } else if (parsed.type === "thinking_delta") {
              setTasksState(prev => {
                const task = prev.find(t => t.id === tid);
                if (!task) return prev;
                const msgs = [...task.messages];
                const last = msgs[msgs.length - 1];
                if (last?.role === "assistant") {
                  msgs[msgs.length - 1] = { ...last, thinkingContent: (last.thinkingContent ?? "") + ((parsed as { text?: string }).text ?? "") };
                }
                return prev.map(t => t.id === tid ? { ...t, messages: msgs } : t);
              });
            } else if (parsed.type === "thinking_end") {
              setTasksState(prev => {
                const task = prev.find(t => t.id === tid);
                if (!task) return prev;
                const msgs = [...task.messages];
                const last = msgs[msgs.length - 1];
                if (last?.role === "assistant") {
                  msgs[msgs.length - 1] = { ...last, isThinking: false };
                }
                return prev.map(t => t.id === tid ? { ...t, messages: msgs } : t);
              });
            } else if (parsed.type === "tool_start") {
              setTasksState(prev => {
                const task = prev.find(t => t.id === tid);
                if (!task) return prev;
                const msgs = [...task.messages];
                const last = msgs[msgs.length - 1];
                if (last?.role === "assistant") {
                  const logs = [...(last.toolLogs ?? []), { tool: parsed.tool!, status: "running" as const }];
                  msgs[msgs.length - 1] = { ...last, toolLogs: logs };
                }
                return prev.map(t => t.id === tid ? { ...t, messages: msgs } : t);
              });
            } else if (parsed.type === "tool_done") {
              const toolCredits = Number((parsed as { credits?: number }).credits ?? 0);
              setTasksState(prev => {
                const task = prev.find(t => t.id === tid);
                if (!task) return prev;
                const msgs = [...task.messages];
                const last = msgs[msgs.length - 1];
                if (last?.role === "assistant") {
                  const logs = (last.toolLogs ?? []).map(l =>
                    l.tool === parsed.tool
                      ? { ...l, status: "done" as const, ms: parsed.ms, result: parsed.result, credits: toolCredits }
                      : l,
                  );
                  msgs[msgs.length - 1] = { ...last, toolLogs: logs };
                }
                return prev.map(t => t.id === tid ? { ...t, messages: msgs } : t);
              });
            } else if (parsed.type === "web_search_used") {
              // Trust signal: the upstream model actually invoked a web
              // search (Anthropic server tool or Venice browse). Attach to
              // the current assistant message so the UI can render a chip
              // alongside tool calls — distinguishes browsed content from
              // model knowledge.
              const p = parsed as unknown as {
                provider?: "anthropic" | "venice" | "grok";
                sources?:  number;
                urls?:     Array<{ url?: string; title?: string }>;
              };
              const urls = Array.isArray(p.urls)
                ? p.urls
                    .filter(u => typeof u?.url === "string")
                    .map(u => ({ url: u.url as string, title: (u.title ?? u.url) as string }))
                : undefined;
              setTasksState(prev => {
                const task = prev.find(t => t.id === tid);
                if (!task) return prev;
                const msgs = [...task.messages];
                const last = msgs[msgs.length - 1];
                if (last?.role === "assistant") {
                  msgs[msgs.length - 1] = {
                    ...last,
                    webSearch: {
                      provider: p.provider ?? "anthropic",
                      sources:  Math.max(0, Number(p.sources ?? 0)),
                      urls,
                    },
                  };
                }
                return prev.map(t => t.id === tid ? { ...t, messages: msgs } : t);
              });
            } else if (parsed.type === "insufficient_credits") {
              // Server signalled the wallet's credit ledger couldn't cover the
              // chat message or tool call. Attach the structured notice to the
              // assistant message so ChatMessages can render a top-up CTA
              // inline. Week 3 ships the actual top-up modal; for now we just
              // expose the data shape and a readable message.
              const p = parsed as unknown as {
                kind?: "chat" | "tool";
                tool?: string;
                needed?: number;
                balance?: number;
                message?: string;
              };
              setTasksState(prev => {
                const task = prev.find(t => t.id === tid);
                if (!task) return prev;
                const msgs = [...task.messages];
                const last = msgs[msgs.length - 1];
                if (last?.role === "assistant") {
                  msgs[msgs.length - 1] = {
                    ...last,
                    insufficientCredits: {
                      kind:    p.kind ?? "chat",
                      tool:    p.tool,
                      needed:  p.needed ?? 0,
                      balance: p.balance ?? 0,
                      message: p.message,
                    },
                  };
                }
                return prev.map(t => t.id === tid ? { ...t, messages: msgs } : t);
              });
            } else {
              const delta = parsed?.delta?.text ?? parsed?.delta?.value ?? "";
              if (delta) {
                setTasksState(prev => {
                  const task = prev.find(t => t.id === tid);
                  if (!task) return prev;
                  const msgs = [...task.messages];
                  const last = msgs[msgs.length - 1];
                  if (last?.role === "assistant") {
                    msgs[msgs.length - 1] = { ...last, content: last.content + delta };
                  }
                  return prev.map(t => t.id === tid ? { ...t, messages: msgs } : t);
                });
              }
            }
          } catch { /* ignore parse errors */ }
        }
      }

      // Persist final state + stamp metadata + update memory
      const responseMs = Date.now() - streamStartRef.current;
      setTasksState(prev => {
        const task = prev.find(t => t.id === tid);
        if (!task) return prev;

        const lastIdx  = task.messages.length - 1;
        const last     = task.messages[lastIdx];

        // Stamp model + timing on the completed assistant message
        const finalMsgs = task.messages.map((m, i) =>
          i === lastIdx && m.role === "assistant"
            ? { ...m, modelUsed: chatTier, responseMs, creditsUsed: cost, isThinking: false }
            : m
        );

        if (last?.role === "assistant" && last.content) {
          updateMemoryAfterChat(walletAddr, userMsg, last.content);
          const chunkText = `Q: ${userMsg.slice(0, 200)}\nA: ${last.content.slice(0, 400)}`;
          const chunkId = addChunk(chunkText, walletAddr);
          fetch("/api/memory/embed", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: chunkText.slice(0, 1024) }),
            signal: AbortSignal.timeout(10_000),
          }).then(r => r.ok ? r.json() : null)
            .then((d: { embedding?: number[] } | null) => {
              if (d?.embedding) setChunkEmbedding(chunkId, d.embedding, walletAddr);
            })
            .catch(() => {});
        }

        const updated = prev.map(t => t.id === tid ? { ...t, messages: finalMsgs, updatedAt: Date.now() } : t);
        saveTasks(updated, walletAddr);
        return updated;
      });

    } catch (err: unknown) {
      if ((err as Error).name !== "AbortError") {
        setError(err instanceof Error ? err.message : String(err));
        // Remove the empty assistant placeholder
        setTasksState(prev => {
          const task = prev.find(t => t.id === tid);
          if (!task) return prev;
          const msgs = task.messages.slice(0, -1);
          return prev.map(t => t.id === tid ? { ...t, messages: msgs } : t);
        });
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [
    streaming, activeTask, activeTaskId, chatTier, walletAddr, cost, credits,
    isUnlimited, personaId, customPersonaPrompt, activeTierProvider,
    webSearch, pendingFiles,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  const stop = useCallback(() => abortRef.current?.abort(), []);

  // ── Context value ─────────────────────────────────────────────────────────
  const value: ChatContextValue = {
    tasks, activeTaskId, activeTask, createNewTask, selectTask, deleteTask,
    streaming, error, setError, input, setInput, send, stop,
    chatTier, setChatTier,
    personaId, setPersonaId, customPersonaPrompt, setCustomPersonaPrompt,
    artifacts, artifactsPanelOpen, setArtifactsPanelOpen,
    crons, addCron, updateCron, deleteCron, runCron, cronRunning,
    sidebarTab, setSidebarTab,
    buyOpen, setBuyOpen,
    walletAddr, holderTier, credits, countdown, isUnlimited, daily, cost, outOfCredits,
    walletReady, onWalletChange, setCredits, walletRefresh, triggerWalletRefresh,
    webSearch, setWebSearch, pendingFiles, setPendingFiles,
    cmdMenu, setCmdMenu, cmdFilter, setCmdFilter,
  };

  return <ChatCtx.Provider value={value}>{children}</ChatCtx.Provider>;
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatCtx);
  if (!ctx) throw new Error("useChat must be used inside <ChatProvider>");
  return ctx;
}
