"use client";
import { useChat } from "../ChatContext";
import { PERSONAS } from "../personas";

export default function PersonaSelector() {
  const { personaId, setPersonaId, customPersonaPrompt, setCustomPersonaPrompt } = useChat();

  return (
    <div className="space-y-1.5">
      {PERSONAS.map(p => {
        const isActive = personaId === p.id;
        return (
          <button
            key={p.id}
            onClick={() => setPersonaId(p.id)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left border"
            style={isActive
              ? { background: `${p.color}12`, borderColor: `${p.color}35` }
              : { borderColor: "transparent" }}
          >
            {/* Color dot */}
            <span
              className="w-2 h-2 rounded-full shrink-0 transition-all"
              style={{
                background: isActive ? p.color : "#1E293B",
                boxShadow: isActive ? `0 0 6px ${p.color}70` : "none",
              }}
            />
            {/* Icon + label + one-line role description */}
            <span className="text-sm shrink-0">{p.icon}</span>
            <span className="flex-1 min-w-0">
              <span className="flex items-center gap-2">
                <span
                  className="font-mono text-sm font-medium"
                  style={{ color: isActive ? p.color : "#94a3b8" }}
                >
                  {p.label}
                </span>
                {isActive && (
                  <span className="font-mono text-[9px]" style={{ color: p.color }}>active</span>
                )}
              </span>
              <span className="block font-mono text-[10px] text-slate-600 leading-snug mt-0.5">
                {p.desc}
              </span>
            </span>
          </button>
        );
      })}

      {personaId === "custom" && (
        <div className="pt-1">
          <textarea
            value={customPersonaPrompt}
            onChange={e => setCustomPersonaPrompt(e.target.value)}
            placeholder="Enter custom system prompt…"
            rows={4}
            className="w-full bg-[#050508] border border-[#1A1A2E] focus:border-[#FB923C]/40 rounded-xl px-3 py-2.5 font-mono text-xs text-slate-300 placeholder:text-slate-700 outline-none resize-none transition-colors"
          />
        </div>
      )}
    </div>
  );
}
