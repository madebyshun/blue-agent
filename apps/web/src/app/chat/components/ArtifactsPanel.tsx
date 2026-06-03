"use client";
import { useState } from "react";
import { useChat } from "../ChatContext";
import { isSolidity } from "../artifacts";

export default function ArtifactsPanel() {
  const { artifacts, artifactsPanelOpen, setArtifactsPanelOpen } = useChat();
  const [activeIdx, setActiveIdx] = useState(0);
  const [copied, setCopied]       = useState(false);

  if (!artifactsPanelOpen || artifacts.length === 0) return null;

  const active = artifacts[Math.min(activeIdx, artifacts.length - 1)];

  function handleCopy() {
    navigator.clipboard.writeText(active.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function handleDownload() {
    const blob = new Blob([active.code], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = active.filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const LANG_COLORS: Record<string, string> = {
    solidity: "#627EEA", sol: "#627EEA",
    typescript: "#3178C6", ts: "#3178C6", tsx: "#3178C6",
    javascript: "#F7DF1E", js: "#F7DF1E", jsx: "#F7DF1E",
    python: "#3572A5", py: "#3572A5",
    rust: "#DEA584", rs: "#DEA584",
    go: "#00ADD8",
    bash: "#4EAA25", shell: "#4EAA25", sh: "#4EAA25",
    json: "#8B8B8B",
    sql: "#E38C00",
    html: "#E34C26",
    css: "#563D7C",
  };
  const langColor = LANG_COLORS[active.lang] ?? "#64748B";

  return (
    <div className="flex flex-col h-full bg-[#050508] border-l border-[#1A1A2E]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1A1A2E] flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-[9px] text-slate-600 tracking-widest">ARTIFACTS</span>
          <span
            className="font-mono text-[9px] px-1.5 py-0.5 rounded border"
            style={{ color: langColor, borderColor: `${langColor}40`, background: `${langColor}10` }}
          >
            {active.lang.toUpperCase()}
          </span>
        </div>
        <button
          onClick={() => setArtifactsPanelOpen(false)}
          className="text-slate-600 hover:text-slate-400 transition-colors p-1"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Artifact tabs (if multiple) */}
      {artifacts.length > 1 && (
        <div className="flex gap-1 px-3 py-2 border-b border-[#1A1A2E] overflow-x-auto flex-shrink-0">
          {artifacts.map((art, i) => (
            <button
              key={art.id}
              onClick={() => setActiveIdx(i)}
              className="flex-shrink-0 font-mono text-[10px] px-2 py-1 rounded-lg border transition-all"
              style={i === activeIdx
                ? { color: langColor, borderColor: `${langColor}40`, background: `${langColor}10` }
                : { color: "#475569", borderColor: "transparent" }}
            >
              {art.filename}
            </button>
          ))}
        </div>
      )}

      {/* Filename bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#0D0D14] flex-shrink-0">
        <span className="font-mono text-[10px] text-slate-400 truncate">{active.filename}</span>
        <div className="flex items-center gap-2 ml-2">
          <button
            onClick={handleCopy}
            className="font-mono text-[9px] px-2 py-0.5 rounded border border-[#1A1A2E] text-slate-600 hover:text-[#4FC3F7] hover:border-[#4FC3F7]/30 transition-all"
          >
            {copied ? "copied!" : "copy"}
          </button>
          <button
            onClick={handleDownload}
            className="font-mono text-[9px] px-2 py-0.5 rounded border border-[#1A1A2E] text-slate-600 hover:text-[#4FC3F7] hover:border-[#4FC3F7]/30 transition-all"
          >
            ↓ download
          </button>
          {isSolidity(active.lang) && (
            <a
              href={`https://remix.ethereum.org/#code=${encodeURIComponent(active.code)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[9px] px-2 py-0.5 rounded border border-[#1A1A2E] text-[#627EEA] hover:border-[#627EEA]/40 hover:bg-[#627EEA]/5 transition-all"
            >
              ⚡ remix
            </a>
          )}
        </div>
      </div>

      {/* Code */}
      <div className="flex-1 overflow-auto">
        <pre className="p-4 font-mono text-[11px] text-slate-300 leading-relaxed whitespace-pre">
          <code>{active.code}</code>
        </pre>
      </div>

      {/* Lines / chars footer */}
      <div className="px-4 py-2 border-t border-[#0D0D14] flex items-center gap-3 flex-shrink-0">
        <span className="font-mono text-[9px] text-slate-700">
          {active.code.split("\n").length} lines
        </span>
        <span className="font-mono text-[9px] text-slate-700">
          {active.code.length.toLocaleString()} chars
        </span>
      </div>
    </div>
  );
}
