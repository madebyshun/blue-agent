"use client";

// Client-side store for Blue Chat integrations + installed skills.
// Everything is localStorage-backed and broadcast via a window event so the
// badge row + Skills panel update live. ChatContext reads it at send-time to
// extend the /api/chat body (integration toggles, enabled custom skills, and
// any disabled built-in domain packs).

import { useEffect, useState } from "react";
import { ALL_DOMAIN_SKILL_IDS, DOMAIN_SKILLS, type DomainSkillId } from "@/lib/chat/skill-router";

export interface InstalledSkill {
  name: string;
  description: string;
  url: string;
  content: string;
  enabled: boolean;
  installedAt: number;
  default?: boolean;
  toolCount?: number;
}
export interface Integrations { baseMcp: boolean; coinbase: boolean }

export interface SkillHubEntry {
  id: string;
  repo: string;
  description: string;
}

/** Curated Butler-style Skill Hub catalog installable via `/skill install <repo>`. */
export const SKILL_HUB_CATALOG: readonly SkillHubEntry[] = [
  {
    id: "blueagent",
    repo: "madebyshun/blue-agent",
    description: "Official Blue Agent Hub skill pack (Base 8453 + Robinhood Chain 4663).",
  },
  {
    id: "base-skills",
    repo: "base/skills",
    description: "Official Base builder skill pack (Base tooling, USDC, Basenames).",
  },
  {
    id: "butler-skills",
    repo: "Virtual-Protocol/butler-skills",
    description: "Virtuals Butler open skill hub (SKILL.md playbooks & ACP integrations).",
  },
];

const SKILLS_KEY = "blueagent:skills";
const INTEG_KEY  = "blueagent:integrations";
const EVENT      = "blueagent:integrations-changed";
const isClient   = typeof window !== "undefined";

function emit() { if (isClient) window.dispatchEvent(new Event(EVENT)); }

/**
 * Default packs we shipped once and have since retired or superseded by the
 * server-routed 6 Domain Skill Packs (`lib/chat/skill-router.ts`).
 * loadSkills() drops stored `default` copies of these automatically.
 */
const RETIRED_DEFAULT_PACKS: ReadonlySet<string> = new Set([
  "base-builder-bundle",
  "trader-intel-bundle",
  "blueagent",
  "base",
  "token-safety-bundle",
]);

const DOMAIN_SKILL_DESCRIPTIONS: Record<DomainSkillId, string> = {
  "trade-wallet-alerts": "Non-custodial swap, send (Basename .base.eth), bridge, wallet holdings & price alerts.",
  "markets-stocks": "Tokenized stocks (/markets, Oracle Drift, Weekend Lab), live prices & discovery.",
  "security-pretrade": "Pre-trade token safety, honeypot/tax checks, eth_simulateV1 & approval revokes.",
  b20: "Base native B20 precompile standard, PolicyRegistry authorization & on-chain memos.",
  "quadra-launchpad": "Quadra v3 fixed-supply ERC-20 launchpad (Base 8453) & ecosystem launchpads.",
  "exchange-x402": "Base Agent Exchange (/exchange), Jobs Board (/jobs), x402 & Hub tool registry.",
};

// Built-in default skills synced 1:1 with the 6 server-routed Domain Skill Packs.
// `content` stays empty because `/api/chat` loads only the active domain pack(s)
// on demand via `skill-router.ts` — no duplicate prompt bloat on every turn.
export const DEFAULT_SKILLS: InstalledSkill[] = ALL_DOMAIN_SKILL_IDS.map((id) => ({
  name: id,
  description: `${DOMAIN_SKILL_DESCRIPTIONS[id]} (${DOMAIN_SKILLS[id].tools.length} tools · on-demand)`,
  url: "https://github.com/madebyshun/blue-agent",
  content: "",
  enabled: true,
  installedAt: 0,
  default: true,
  toolCount: DOMAIN_SKILLS[id].tools.length,
}));

// ── Skills CRUD ───────────────────────────────────────────────────────────────
export function loadSkills(): InstalledSkill[] {
  if (!isClient) return DEFAULT_SKILLS;
  try {
    const raw = localStorage.getItem(SKILLS_KEY);
    if (!raw) { localStorage.setItem(SKILLS_KEY, JSON.stringify(DEFAULT_SKILLS)); return DEFAULT_SKILLS; }
    const list: InstalledSkill[] = JSON.parse(raw);
    if (!Array.isArray(list)) return DEFAULT_SKILLS;

    const byName = new Map(DEFAULT_SKILLS.map(d => [d.name, d]));
    let changed  = false;

    const kept = list.filter(s => !(s.default && RETIRED_DEFAULT_PACKS.has(s.name)));
    if (kept.length !== list.length) changed = true;

    const refreshed = kept.map(s => {
      const def = s.default ? byName.get(s.name) : undefined;
      if (!def) return s;
      if (def.content === s.content && def.description === s.description && def.toolCount === s.toolCount) return s;
      changed = true;
      return { ...s, content: def.content, description: def.description, toolCount: def.toolCount };
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
/** Concatenated prompt of enabled custom skills (built-in packs load on demand server-side). */
export function enabledSkillsPrompt(): string {
  return loadSkills()
    .filter(s => s.enabled && !s.default && s.content)
    .map(s => `### ${s.name}\n${s.content}`)
    .join("\n\n");
}
/** Built-in domain skill IDs the user explicitly toggled OFF in the UI or via `/skill disable`. */
export function disabledDomainSkills(): string[] {
  return loadSkills()
    .filter(s => s.default && !s.enabled)
    .map(s => s.name);
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

// ── /skill command engine (Butler-style Skill Hub) ────────────────────────────
function parseRepo(arg: string): { owner: string; repo: string; path: string } | null {
  const s = arg.trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//, "")
    .replace(/^https?:\/\/raw\.githubusercontent\.com\//, "")
    .replace(/\/(tree|blob)\/[^/]+\//, "/");
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
  const [rawSub, ...argsArr] = rest.split(/\s+/);
  const sub = (rawSub ?? "").toLowerCase();
  const arg = argsArr.join(" ").trim();

  if (sub === "list" || !sub) {
    const list = loadSkills();
    const builtIn = list.filter(s => s.default);
    const custom = list.filter(s => !s.default);
    const lines = [
      "**Built-in Domain Skills (on-demand):**",
      ...builtIn.map(s => `- [${s.enabled ? "ON" : "OFF"}] **${s.name}** — ${s.description}`),
    ];
    if (custom.length > 0) {
      lines.push("", "**Custom Installed Skills:**");
      lines.push(...custom.map(s => `- [${s.enabled ? "ON" : "OFF"}] **${s.name}** — ${s.description}`));
    }
    lines.push("", "Use `/skill catalog` to browse the Skill Hub, `/skill disable <name>` to toggle, or `/skill install <owner/repo>` to add one.");
    return lines.join("\n");
  }
  if (sub === "catalog" || sub === "hub") {
    return [
      "**Blue Chat Skill Hub Catalog:**",
      ...SKILL_HUB_CATALOG.map(c => `- **${c.id}** (\`${c.repo}\`) — ${c.description}`),
      "",
      "Install any pack with `/skill install <owner/repo>` (reads `SKILL.md` from GitHub).",
    ].join("\n");
  }
  if (sub === "enable" || sub === "disable") {
    if (!arg) return `Usage: \`/skill ${sub} <name>\``;
    const hit = loadSkills().find(s => s.name.toLowerCase() === arg.toLowerCase());
    if (!hit) return `Skill '${arg}' not found. Run \`/skill list\`.`;
    setSkillEnabled(hit.name, sub === "enable");
    return `Skill '${hit.name}' is now ${sub === "enable" ? "enabled" : "disabled"}.`;
  }
  if (sub === "remove") {
    if (!arg) return "Usage: `/skill remove <name>`";
    const hit = loadSkills().find(s => s.name.toLowerCase() === arg.toLowerCase());
    if (hit?.default) return `'${hit.name}' is a built-in domain skill — use \`/skill disable ${hit.name}\` to turn it off.`;
    return removeSkill(hit?.name ?? arg) ? `Skill '${arg}' removed.` : `Skill '${arg}' not found. Run \`/skill list\`.`;
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
    return `Installed skill '${name}'.${fm.description ? `\n> ${fm.description}` : ""}`;
  }
  return "Commands: `/skill list` · `/skill catalog` · `/skill install <owner/repo>` · `/skill enable|disable <name>` · `/skill remove <name>`";
}

// ── Live hook for the badge row + panels ──────────────────────────────────────
export function useIntegrations() {
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
