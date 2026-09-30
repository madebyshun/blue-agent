"use client";

// Client-side store for Blue Chat integrations + installed skills.
// Everything is localStorage-backed and broadcast via a window event so the
// badge row + Skills panel update live. ChatContext reads it at send-time to
// extend the /api/chat body (integration toggles + enabled-skill prompt).

import { useEffect, useState } from "react";
import { TOOL_COUNT } from "@/lib/agent-tools";

export interface InstalledSkill {
  name: string;
  description: string;
  url: string;
  content: string;
  enabled: boolean;
  installedAt: number;
  default?: boolean;
}
export interface Integrations { baseMcp: boolean; coinbase: boolean }

const SKILLS_KEY = "blueagent:skills";
const INTEG_KEY  = "blueagent:integrations";
const EVENT      = "blueagent:integrations-changed";
const isClient   = typeof window !== "undefined";

function emit() { if (isClient) window.dispatchEvent(new Event(EVENT)); }

/**
 * Default packs we shipped once and have since retired. loadSkills() drops a
 * stored `default` copy of any of these; without that, a retired pack would
 * keep being injected into every prompt from localStorage.
 * - base-builder-bundle (2026-09-30): every tool it named left chat.
 */
const RETIRED_DEFAULT_PACKS: ReadonlySet<string> = new Set(["base-builder-bundle"]);

// Pre-installed default skills (no /skill install needed).
const DEFAULT_SKILLS: InstalledSkill[] = [
  {
    name: "blueagent",
    description: `${TOOL_COUNT} x402 AI tools for Base — intelligence, security, DeFi, builder.`,
    // Was https://github.com/BankrBot/skills/tree/main/blueagent until
    // 2026-09-25 — an upstream that has never hosted this catalogue and whose
    // owner 403-bans this project. It points at our own repo now; the skill is
    // published as @blueagent/skill on npm.
    url: "https://github.com/madebyshun/blue-agent",
    content: `BlueAgent: ${TOOL_COUNT} pay-per-use x402 tools on Base. Use hub_token_price for prices, hub_risk_gate / hub_honeypot for safety, and the hub_* tools for intelligence, DeFi, and builder workflows.`,
    enabled: true, installedAt: 0, default: true,
  },
  {
    name: "base",
    description: "Base chain skills — onchain actions and data.",
    url: "https://github.com/base/skills",
    content: "Base: onchain data + actions on Base (chain 8453). Prefer Base, USDC, and Coinbase tooling for all onchain work.",
    enabled: true, installedAt: 0, default: true,
  },
  // ── Bundled skill packs — each teaches the model to chain multiple tools ──
  //
  // COST NOTE, and why none of these say "run ALL of them" any more.
  //
  // These two are default:true — injected into every user's localStorage and
  // merged forward on load — so their text sits in EVERY system prompt whether
  // or not the user ever opted in. Each Hub tool they name is separately
  // metered and debited from the user's ledger (X-Credits-Debited, set by
  // api/x402/[tool]). The old text ordered a full sweep. Priced out against
  // agent-tools.ts at CREDIT_USD = 0.0005 (re-priced 2026-09-30, after
  // hub_key_exposure and hub_whale_signal left chat and the base-builder pack
  // was retired — see RETIRED_DEFAULT_PACKS):
  //
  //   token-safety  3 tools  $0.45  =   900 credits
  //   trader-intel  4 tools  $0.65  = 1,300 credits
  //
  // A connected wallet gets WALLET_DAILY = 500 credits/day and a guest gets
  // GUEST_DAILY = 100 (lib/credits.ts). So one obeyed sweep is ~3-4x a member's
  // ENTIRE DAY and up to 19x a guest's — spent on a single question, from a
  // pack nobody switched on. In practice the user does not even get the sweep
  // they paid for: the ledger runs dry partway and the rest fail
  // insufficient_credits.
  //
  // Second reason the mandate was wrong: it ordered tools whose REQUIRED input
  // the request often does not contain. hub_whale_signal requires `address`,
  // hub_dex_flow requires `token`, hub_repo_health requires `url`. "What should
  // I buy?" supplies none of them, and a prompt that says run all five pushes
  // the model to invent one — the exact failure CLAUDE.md forbids.
  //
  // So each pack now says: pick what the question needs, run only what you have
  // real inputs for, and sweep only on an explicit ask. If you add a tool to a
  // pack, re-price the comment above — the tools are not free.
  {
    name: "token-safety-bundle",
    description: "Token Safety — hub_risk_gate · hub_honeypot · hub_contract_trust",
    url: "",
    content: `## Token Safety Bundle (active)
For token or contract safety questions, these three tools are available. All take a contract address:
- hub_risk_gate: overall risk score and critical flags
- hub_honeypot: buy/sell trap detection and tax analysis
- hub_contract_trust: verification status, ownership and trust signals
Start with hub_risk_gate — it is the broadest single read. Add the others only when the question calls for them (a trade → hub_honeypot; "can the dev rug me?" → hub_contract_trust), or when the user explicitly asks for a full sweep. Each tool is separately charged to the user, so do not run all three by reflex.
Say which checks you ran and which you skipped, and never state a verdict a tool did not return.`,
    enabled: true, installedAt: 0, default: true,
  },
  // `base-builder-bundle` was retired 2026-09-30 with every tool it named
  // (hub_repo_health, hub_base_grant, hub_builder_dd left chat). Removing it
  // here is not enough on its own — see RETIRED_DEFAULT_PACKS in loadSkills().
  {
    name: "trader-intel-bundle",
    description: "Trader Intel — hub_token_pick · hub_narrative_pulse · hub_token_momentum · hub_dex_flow",
    url: "",
    content: `## Trader Intel Bundle (active)
For market questions:
- hub_token_pick: scored token candidates from live data — no input needed
- hub_token_momentum: what is breaking out right now — no input needed
- hub_narrative_pulse: which narratives are running
- hub_dex_flow: buy/sell pressure for one token — REQUIRES a token address
Match the tool to the question. "What's moving?" needs no address — use hub_token_momentum or hub_token_pick. Only call hub_dex_flow when the user actually supplied a token address; NEVER invent one to complete a set.
Run several only when the user explicitly asks for a full picture — each is billed. Report what each tool returned as facts, name the tools that fed the answer, and do not turn them into a buy/sell call.`,
    enabled: true, installedAt: 0, default: true,
  },
];

// ── Skills CRUD ───────────────────────────────────────────────────────────────
export function loadSkills(): InstalledSkill[] {
  if (!isClient) return DEFAULT_SKILLS;
  try {
    const raw = localStorage.getItem(SKILLS_KEY);
    if (!raw) { localStorage.setItem(SKILLS_KEY, JSON.stringify(DEFAULT_SKILLS)); return DEFAULT_SKILLS; }
    const list: InstalledSkill[] = JSON.parse(raw);
    if (!Array.isArray(list)) return DEFAULT_SKILLS;

    // Merge, in two directions.
    //
    // (1) REFRESH the text of every default pack from DEFAULT_SKILLS. This used
    //     to be missing, and the omission was load-bearing: a default skill was
    //     written to localStorage once and then frozen there forever, so editing
    //     the pack in this file only ever reached users who had never opened the
    //     app. Anyone already using Blue Chat kept the original copy — including
    //     the "run ALL four/five tools together" mandate these packs no longer
    //     make. A default pack is OUR prompt, shipped with the build, not user
    //     data; the file is the source of truth for its wording.
    //
    //     `enabled` is the exception and is preserved from storage, because that
    //     one IS the user's decision. Someone who switched a pack off must stay
    //     switched off — a content refresh is not a licence to re-enable it.
    //
    // (2) INJECT any default pack not in storage yet, so new packs reach
    //     existing users (the original behaviour).
    const byName = new Map(DEFAULT_SKILLS.map(d => [d.name, d]));
    let changed  = false;

    // (0) DROP default packs we retired. Refresh (1) only rewrites packs that
    //     still exist in DEFAULT_SKILLS, so a retired default already sitting in
    //     storage would otherwise keep being injected into every prompt forever,
    //     naming tools chat no longer offers. Only `default` copies are dropped —
    //     a pack the user installed themselves is their data and stays.
    const kept = list.filter(s => !(s.default && RETIRED_DEFAULT_PACKS.has(s.name)));
    if (kept.length !== list.length) changed = true;

    const refreshed = kept.map(s => {
      const def = s.default ? byName.get(s.name) : undefined;
      if (!def) return s;
      if (def.content === s.content && def.description === s.description) return s;
      changed = true;
      return { ...s, content: def.content, description: def.description };
    });

    const names       = new Set(refreshed.map(s => s.name));
    const newDefaults = DEFAULT_SKILLS.filter(d => !names.has(d.name));
    if (newDefaults.length > 0) changed = true;

    const merged = newDefaults.length > 0 ? [...refreshed, ...newDefaults] : refreshed;
    if (changed) {
      try { localStorage.setItem(SKILLS_KEY, JSON.stringify(merged.slice(0, 50))); } catch { /* blocked */ }
    }
    return merged;
  } catch { return DEFAULT_SKILLS; }
}
export function saveSkills(list: InstalledSkill[]): void {
  if (!isClient) return;
  try { localStorage.setItem(SKILLS_KEY, JSON.stringify(list.slice(0, 50))); emit(); } catch { /* blocked */ }
}
export function setSkillEnabled(name: string, enabled: boolean): void {
  saveSkills(loadSkills().map(s => (s.name === name ? { ...s, enabled } : s)));
}
export function removeSkill(name: string): boolean {
  const list = loadSkills();
  const next = list.filter(s => s.name !== name);
  if (next.length === list.length) return false;
  saveSkills(next);
  return true;
}
/** Concatenated prompt of all enabled skills — injected into the system prompt. */
export function enabledSkillsPrompt(): string {
  return loadSkills()
    .filter(s => s.enabled && s.content)
    .map(s => `### ${s.name}\n${s.content}`)
    .join("\n\n");
}

// ── Integrations ──────────────────────────────────────────────────────────────
export function loadIntegrations(): Integrations {
  if (!isClient) return { baseMcp: false, coinbase: false };
  try {
    const i = JSON.parse(localStorage.getItem(INTEG_KEY) || "{}");
    return { baseMcp: !!i.baseMcp, coinbase: !!i.coinbase };
  } catch { return { baseMcp: false, coinbase: false }; }
}
export function setIntegration(key: keyof Integrations, on: boolean): void {
  if (!isClient) return;
  const cur = loadIntegrations();
  cur[key] = on;
  try { localStorage.setItem(INTEG_KEY, JSON.stringify(cur)); emit(); } catch { /* blocked */ }
}

// ── /skill command engine ─────────────────────────────────────────────────────
function parseRepo(arg: string): { owner: string; repo: string; path: string } | null {
  let s = arg.trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//, "")
    .replace(/^https?:\/\/raw\.githubusercontent\.com\//, "")
    .replace(/\/(tree|blob)\/[^/]+\//, "/"); // strip /tree/main/ or /blob/main/
  const parts = s.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  return { owner: parts[0], repo: parts[1], path: parts.slice(2).join("/") };
}
function parseFrontmatter(md: string): { name?: string; description?: string } {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const fm = m[1];
  const name = fm.match(/^name:\s*(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
  let description = fm.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  if (!description || description === ">" || description === "|") {
    const block = fm.match(/description:\s*[>|][\s\S]*?(?=\n\S|$)/)?.[0] ?? "";
    description = block.replace(/description:\s*[>|]/, "").split("\n").map(l => l.trim()).filter(Boolean).join(" ");
  }
  return { name, description: description || undefined };
}
async function fetchSkillMd(owner: string, repo: string, path: string): Promise<string | null> {
  const rel = `${path ? path.replace(/\/$/, "") + "/" : ""}SKILL.md`;
  for (const branch of ["main", "master"]) {
    try {
      const r = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${rel}`);
      if (r.ok) return await r.text();
    } catch { /* try next branch */ }
  }
  return null;
}

/** Run a `/skill ...` command. Returns markdown to render as an assistant turn. */
export async function runSkillCommand(input: string): Promise<string> {
  const rest = input.replace(/^\/skill\s*/i, "").trim();
  const [sub, ...argsArr] = rest.split(/\s+/);
  const arg = argsArr.join(" ").trim();

  if (sub === "list" || !sub) {
    const list = loadSkills();
    if (list.length === 0) return "No skills installed. Install one with `/skill install owner/repo`.";
    return "**Installed skills:**\n" +
      list.map(s => `- ${s.enabled ? "🟢" : "⚪️"} **${s.name}**${s.default ? " (default)" : ""} — ${s.description}`).join("\n");
  }
  if (sub === "remove") {
    if (!arg) return "Usage: `/skill remove <name>`";
    return removeSkill(arg) ? `✓ Skill '${arg}' removed.` : `Skill '${arg}' not found. Run \`/skill list\`.`;
  }
  if (sub === "install") {
    if (!arg) return "Usage: `/skill install <owner/repo>` — e.g. `/skill install base/skills`";
    const parsed = parseRepo(arg);
    if (!parsed) return `Couldn't parse "${arg}". Use \`owner/repo\` or \`owner/repo/path\`.`;
    const md = await fetchSkillMd(parsed.owner, parsed.repo, parsed.path);
    if (!md) return `Couldn't fetch SKILL.md from ${parsed.owner}/${parsed.repo}${parsed.path ? "/" + parsed.path : ""} (tried main + master).`;
    const fm = parseFrontmatter(md);
    const name = fm.name || `${parsed.owner}/${parsed.repo}`;
    const entry: InstalledSkill = {
      name,
      description: fm.description || "Installed skill",
      url: `https://github.com/${parsed.owner}/${parsed.repo}`,
      content: md.replace(/^---\n[\s\S]*?\n---\n?/, "").trim().slice(0, 6000),
      enabled: true,
      installedAt: Date.now(),
    };
    saveSkills([entry, ...loadSkills().filter(s => s.name !== name)]);
    return `✓ Skill '${name}' installed.${fm.description ? `\n> ${fm.description}` : ""}`;
  }
  return "Commands: `/skill install <owner/repo>` · `/skill list` · `/skill remove <name>`";
}

// ── Live hook for the badge row + panels ──────────────────────────────────────
export function useIntegrations() {
  // Init with server-safe defaults (no localStorage) to avoid hydration
  // mismatch; the effect reads the real values right after mount.
  const [state, setState] = useState<{ integrations: Integrations; skills: InstalledSkill[] }>(
    { integrations: { baseMcp: false, coinbase: false }, skills: [] },
  );
  useEffect(() => {
    const refresh = () => setState({ integrations: loadIntegrations(), skills: loadSkills() });
    refresh();
    window.addEventListener(EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => { window.removeEventListener(EVENT, refresh); window.removeEventListener("storage", refresh); };
  }, []);
  return state;
}
