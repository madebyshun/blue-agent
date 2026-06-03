"use client";
import {
  createContext, useContext, useState, useEffect,
  useRef, useCallback, useMemo,
  type ReactNode,
} from "react";
import {
  type Message, type ChatTask, type Artifact,
  type CronTask, type PersonaId, type SidebarTab,
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
  creditCost, getCredits, deductCredits,
  getNextRefresh, refreshCreditsIfNeeded, getDailyCr,
} from "@/lib/credits";
import { buildMemoryContext, updateMemoryAfterChat } from "@/lib/memory";

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
  onWalletChange: (addr: string | undefined, tier: TierInfo) => void;
  setCredits:     (n: number) => void;
  walletRefresh:  number;          // increment to force WalletBar balance re-fetch
  triggerWalletRefresh: () => void;

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
  const [countdown,     setCountdown]     = useState("");
  const [buyOpen,       setBuyOpen]       = useState(false);
  const [walletRefresh, setWalletRefresh] = useState(0);
  const triggerWalletRefresh = useCallback(() => setWalletRefresh(n => n + 1), []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const result = refreshCreditsIfNeeded(holderTier.blueBalance, walletAddr);
    setCredits(result.credits);
  }, [walletAddr, holderTier.blueBalance]);

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
      const migrated = migrateOldChat(walletAddr);
      if (migrated) {
        setTasksState([migrated]);
        setActiveTaskId(migrated.id);
        saveTasks([migrated], walletAddr);
        return;
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
  const [streaming, setStreaming] = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [input,     setInput]     = useState("");
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("tasks");
  const [cmdMenu,   setCmdMenu]   = useState(false);
  const [cmdFilter, setCmdFilter] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const cost = creditCost(chatTier, holderTier);
  const isUnlimited = holderTier.dailyCr === -1 && !!walletAddr;
  const daily = getDailyCr(holderTier, !!walletAddr);
  const outOfCredits = !isUnlimited && credits < cost;

  // ── Tier config (same as before) ──────────────────────────────────────────
  const ALL_TIERS_IDS = ["fast","pro","max","venice-deepseek","venice-grok","venice-uncut","venice-mistral"];
  const activeTierProvider = ALL_TIERS_IDS.includes(chatTier) && chatTier.startsWith("venice") ? "venice" : "bankr";
  const VENICE_MODEL_IDS: Record<string, string> = {
    "venice-deepseek": "deepseek-v4-flash",
    "venice-grok":     "grok-4-3",
    "venice-uncut":    "venice-uncensored-1-2",
    "venice-mistral":  "mistral-small-3-2-24b-instruct",
  };

  // ── send() ────────────────────────────────────────────────────────────────
  const send = useCallback(async (text: string) => {
    const userMsg = text.trim();
    if (!userMsg || streaming) return;

    const currentCredits = getCredits(walletAddr);
    if (!isUnlimited && currentCredits < cost) {
      setError(`Not enough credits. Need ${cost}, have ${currentCredits}.`);
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

    const next: Message[] = [...baseMessages, { role: "user", content: userMsg }];

    // Auto-title task on first message
    if (!activeTask?.title) {
      setTasksState(prev => prev.map(t =>
        t.id === tid ? { ...t, title: userMsg.slice(0, 50) } : t,
      ));
    }

    // Push messages with empty assistant placeholder
    setTasksState(prev => {
      const msgs: Message[] = [...next, { role: "assistant", content: "" }];
      const updated = prev.map(t => t.id === tid ? { ...t, messages: msgs, updatedAt: Date.now() } : t);
      saveTasks(updated, walletAddr);
      return updated;
    });

    setInput("");
    setStreaming(true);

    abortRef.current = new AbortController();

    // Build persona system prompt
    const persona = getPersona(personaId);
    const personaPrompt = personaId === "custom" ? customPersonaPrompt : persona.systemPrompt;
    const memoryContext = buildMemoryContext(walletAddr);
    const modelId = VENICE_MODEL_IDS[chatTier];

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages:    next,
          tier:        chatTier,
          provider:    activeTierProvider,
          ...(modelId       ? { modelId }       : {}),
          ...(memoryContext ? { memoryContext }  : {}),
          ...(personaPrompt ? { persona: personaPrompt } : {}),
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? `Error ${res.status}`);
      }

      const remaining = deductCredits(cost, walletAddr);
      setCredits(remaining);

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
              type?: string; tool?: string; ms?: number;
              delta?: { text?: string; value?: string };
            };

            if (parsed.type === "tool_start") {
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
              setTasksState(prev => {
                const task = prev.find(t => t.id === tid);
                if (!task) return prev;
                const msgs = [...task.messages];
                const last = msgs[msgs.length - 1];
                if (last?.role === "assistant") {
                  const logs = (last.toolLogs ?? []).map(l =>
                    l.tool === parsed.tool ? { ...l, status: "done" as const, ms: parsed.ms } : l
                  );
                  msgs[msgs.length - 1] = { ...last, toolLogs: logs };
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

      // Persist final state + update memory
      setTasksState(prev => {
        const task = prev.find(t => t.id === tid);
        if (task) {
          const last = task.messages[task.messages.length - 1];
          if (last?.role === "assistant" && last.content) {
            updateMemoryAfterChat(walletAddr, userMsg, last.content);
          }
          const updated = prev.map(t => t.id === tid ? { ...t, updatedAt: Date.now() } : t);
          saveTasks(updated, walletAddr);
          return updated;
        }
        return prev;
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
    streaming, activeTask, activeTaskId, chatTier, walletAddr, cost,
    isUnlimited, personaId, customPersonaPrompt, activeTierProvider,
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
    onWalletChange, setCredits, walletRefresh, triggerWalletRefresh,
    cmdMenu, setCmdMenu, cmdFilter, setCmdFilter,
  };

  return <ChatCtx.Provider value={value}>{children}</ChatCtx.Provider>;
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatCtx);
  if (!ctx) throw new Error("useChat must be used inside <ChatProvider>");
  return ctx;
}
