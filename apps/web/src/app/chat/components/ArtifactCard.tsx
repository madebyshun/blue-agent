"use client";

import { useMemo, useState } from "react";
import { inferFilename, langToExt, isSolidity, LANG_COLOR } from "../artifacts";


// Open Solidity in the Remix IDE — it loads a file from the #code= hash param.
function openRemix(code: string) {
  const b64 = btoa(unescape(encodeURIComponent(code)));
  window.open(`https://remix.ethereum.org/#code=${b64}`, "_blank", "noopener,noreferrer");
}

// Compact inline card (icon · filename · Code · LANG · N lines · Open). Clicking
// Open reveals a modal with the full source + copy / download / preview — so the
// chat stays clean and the heavy view is on-demand and works on any screen.
export default function ArtifactCard({ lang, code }: { lang: string; code: string }) {
  const [open, setOpen]     = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [tab, setTab]       = useState<"code" | "preview">("code");

  const l        = lang.toLowerCase();
  const filename = inferFilename(code, l);
  const color    = LANG_COLOR[l] ?? "#64748B";
  const lines    = code.split("\n").length;

  const isHtml   = l === "html";
  const isSol    = isSolidity(l);

  // Sandboxed previews of LLM pages often look blank because content is hidden
  // behind a JS fade-in / scroll-reveal that never fires in a framed view.
  // Force the common hidden-by-default patterns visible.
  const previewDoc = useMemo(() => {
    if (!isHtml) return code;
    const fix =
      `<style>html,body{opacity:1!important;visibility:visible!important}` +
      `[class*="fade"],[class*="reveal"],[class*="animate"],[class*="scroll-"],[data-aos]{` +
      `opacity:1!important;transform:none!important;visibility:visible!important}</style>`;
    return /<\/head>/i.test(code) ? code.replace(/<\/head>/i, `${fix}</head>`) : fix + code;
  }, [code, isHtml]);

  function copy() {
    navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }
  function download() {
    const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }
  function saveToProjects() {
    try {
      const KEY = "blueagent:projects";
      const list = JSON.parse(localStorage.getItem(KEY) || "[]");
      const arr = Array.isArray(list) ? list : [];
      arr.unshift({ id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: filename, type: langToExt(l), language: l, created: Date.now(), code });
      localStorage.setItem(KEY, JSON.stringify(arr.slice(0, 100)));
      setSaved(true); setTimeout(() => setSaved(false), 1800);
    } catch { /* storage blocked */ }
  }

  const btn = "font-mono text-[11px] px-3 py-1.5 rounded-lg border transition-colors";

  return (
    <>
      {/* ── Compact card ── */}
      <button
        onClick={() => setOpen(true)}
        className="my-3 w-full flex items-center gap-3 rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] hover:border-[#4FC3F7]/40 transition-colors px-3 py-2.5 text-left"
      >
        <span className="w-11 h-11 rounded-xl bg-[#15151f] border border-[#1A1A2E] flex items-center justify-center shrink-0">
          <span className="font-mono text-[14px]" style={{ color }}>&lt;/&gt;</span>
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-mono text-[13px] text-slate-100 truncate">{filename}</span>
          <span className="block font-mono text-[11px] text-slate-500">Code · {l.toUpperCase()} · {lines} line{lines !== 1 ? "s" : ""}</span>
        </span>
        <span className="font-mono text-[12px] px-3.5 py-1.5 rounded-lg border border-[#1A1A2E] text-slate-300 shrink-0">Open</span>
      </button>

      {/* ── Full view modal ── */}
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6">
          <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative z-10 w-full max-w-3xl max-h-[88vh] flex flex-col rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] overflow-hidden shadow-2xl">
            {/* header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[#1A1A2E] shrink-0">
              <span className="text-[13px]">📄</span>
              <span className="font-mono text-[12px] text-slate-200 truncate flex-1">{filename}</span>
              <span className="font-mono text-[9px] px-2 py-0.5 rounded uppercase tracking-wider shrink-0" style={{ color, background: `${color}1a`, border: `1px solid ${color}40` }}>{l}</span>
              <button onClick={() => setOpen(false)} className="ml-1 w-7 h-7 rounded-md font-mono text-[13px] text-slate-500 hover:text-white hover:bg-[#1A1A2E] shrink-0">✕</button>
            </div>

            {/* code / preview tabs (HTML only) */}
            {isHtml && (
              <div className="flex gap-1 px-3 py-2 border-b border-[#1A1A2E] shrink-0">
                {(["code", "preview"] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)} className="font-mono text-[11px] px-3 py-1 rounded-md transition-colors"
                    style={tab === t ? { color: "#4FC3F7", background: "#4FC3F712", border: "1px solid #4FC3F730" } : { color: "#64748b", border: "1px solid transparent" }}>
                    {t === "code" ? "Code" : "Preview"}
                  </button>
                ))}
              </div>
            )}

            {/* body — full code (scroll) or live HTML preview */}
            <div className="flex-1 overflow-auto min-h-0 bg-[#070710]">
              {isHtml && tab === "preview" ? (
                <iframe title={filename} srcDoc={previewDoc} sandbox="allow-scripts allow-popups"
                  className="w-full block bg-white" style={{ minHeight: "62vh", border: "none" }} />
              ) : (
                <pre className="p-4 overflow-x-auto">
                  <code className="font-mono text-[12px] text-slate-300 leading-relaxed whitespace-pre">{code}</code>
                </pre>
              )}
            </div>

            {/* actions */}
            <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-t border-[#1A1A2E] shrink-0">
              <button onClick={copy} className={`${btn} border-[#1A1A2E] text-slate-300 hover:text-white hover:border-[#4FC3F7]/40`}>{copied ? "Copied ✓" : "Copy"}</button>
              <button onClick={download} className={`${btn} border-[#1A1A2E] text-slate-400 hover:text-white hover:border-[#4FC3F7]/40`}>Download</button>
              <button onClick={saveToProjects} className={`${btn} border-[#34D399]/30 text-[#34D399] hover:bg-[#34D399]/10`}>{saved ? "Saved ✓" : "Save"}</button>
              {isSol && <button onClick={() => openRemix(code)} className={`${btn} border-[#1A1A2E] text-slate-400 hover:text-white hover:border-[#627EEA]/50`}>Open in Remix ↗</button>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
