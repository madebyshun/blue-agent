"use client";

import { useEffect } from "react";
import SettingsPanel from "./SettingsPanel";

/**
 * Account / Settings modal — ChatGPT/Claude pattern. Settings used to be a
 * full-screen tab in the chat sidebar; it now opens as an overlay from the
 * footer account chip so the sidebar stays conversations-only. The body reuses
 * SettingsPanel 1:1 (Persona · Credits · Memory · Wallet).
 */
export default function SettingsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative w-full max-w-md max-h-[85vh] flex flex-col rounded-2xl border border-[#1A1A2E] bg-[#050508] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 h-14 border-b border-[#1A1A2E] shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] shrink-0" />
            <p className="font-mono text-[11px] text-[#4FC3F7] tracking-widest">// SETTINGS</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-600 hover:text-slate-300 hover:bg-[#1A1A2E] transition-colors"
            title="Close (Esc)"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body — reuse the existing settings sections */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <SettingsPanel />
        </div>
      </div>
    </div>
  );
}
