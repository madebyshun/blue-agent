import type { Artifact, Message } from "./types";

// langs that produce artifacts (exclude prose / config snippets)
const ARTIFACT_LANGS = new Set([
  "solidity", "sol",
  "typescript", "ts", "tsx",
  "javascript", "js", "jsx",
  "python", "py",
  "rust", "rs",
  "go",
  "shell", "bash", "sh",
  "json",
  "yaml", "yml",
  "sql",
  "html", "css",
  "move",
  "vyper",
]);

const LANG_TO_EXT: Record<string, string> = {
  solidity: "sol", sol: "sol",
  typescript: "ts", ts: "ts", tsx: "tsx",
  javascript: "js", js: "js", jsx: "jsx",
  python: "py", py: "py",
  rust: "rs", rs: "rs",
  go: "go",
  shell: "sh", bash: "sh", sh: "sh",
  json: "json",
  yaml: "yml", yml: "yml",
  sql: "sql",
  html: "html", css: "css",
  move: "move",
  vyper: "vy",
};

export function langToFilename(lang: string, index: number): string {
  const ext = LANG_TO_EXT[lang.toLowerCase()] ?? lang.toLowerCase();
  const base =
    lang === "solidity" || lang === "sol" ? "Contract" :
    lang === "json"                        ? "data"     :
    lang === "sql"                         ? "query"    :
    lang === "html"                        ? "index"    :
    lang === "css"                         ? "styles"   :
    lang === "yaml" || lang === "yml"      ? "config"   :
    lang === "bash" || lang === "shell" || lang === "sh" ? "script" :
    `file${index + 1}`;
  return `${base}.${ext}`;
}

export function isSolidity(lang: string): boolean {
  return lang === "solidity" || lang === "sol";
}

// ─── Extraction ───────────────────────────────────────────────────────────────

const CODE_BLOCK = /```(\w+)?\n([\s\S]*?)```/g;

export function extractArtifacts(messages: Message[]): Artifact[] {
  const result: Artifact[] = [];
  let globalIdx = 0;

  messages.forEach((msg, msgIdx) => {
    if (msg.role !== "assistant") return;
    CODE_BLOCK.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = CODE_BLOCK.exec(msg.content)) !== null) {
      const lang = (match[1] ?? "text").toLowerCase();
      const code = match[2].trim();
      if (!ARTIFACT_LANGS.has(lang)) continue;
      if (code.length < 20) continue; // skip trivial snippets
      result.push({
        id:           `art_${msgIdx}_${globalIdx}`,
        lang,
        filename:     langToFilename(lang, globalIdx),
        code,
        messageIndex: msgIdx,
      });
      globalIdx++;
    }
  });

  return result;
}
