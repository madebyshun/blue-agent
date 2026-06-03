"use client";
import { useChat } from "../ChatContext";
import { PERSONAS } from "../personas";

export default function PersonaSelector() {
  const { personaId, setPersonaId, customPersonaPrompt, setCustomPersonaPrompt } = useChat();
  const active = PERSONAS.find(p => p.id === personaId) ?? PERSONAS[0];

  return (
    <div>
      <p className="font-mono text-[9px] text-slate-600 tracking-widest px-2 mb-2">PERSONA</p>
      <div className="flex flex-wrap gap-1 px-1">
        {PERSONAS.map(p => (
          <button
            key={p.id}
            onClick={() => setPersonaId(p.id)}
            title={p.label}
            className="flex items-center gap-1 px-2 py-1 rounded-lg font-mono text-[10px] transition-all border"
            style={personaId === p.id
              ? { color: p.color, background: `${p.color}12`, borderColor: `${p.color}35` }
              : { color: "#475569", borderColor: "transparent" }}
          >
            <span>{p.icon}</span>
            <span className="hidden xl:inline">{p.label}</span>
          </button>
        ))}
      </div>

      {personaId === "custom" && (
        <div className="mt-2 mx-1">
          <textarea
            value={customPersonaPrompt}
            onChange={e => setCustomPersonaPrompt(e.target.value)}
            placeholder="Enter custom system prompt…"
            rows={3}
            className="w-full bg-[#050508] border border-[#1A1A2E] focus:border-[#FB923C]/40 rounded-lg px-3 py-2 font-mono text-[10px] text-slate-300 placeholder:text-slate-700 outline-none resize-none transition-colors"
          />
        </div>
      )}

      {personaId !== "blue-agent" && personaId !== "custom" && (
        <p className="font-mono text-[9px] text-slate-700 px-2 mt-1" style={{ color: `${active.color}80` }}>
          {active.label} mode active
        </p>
      )}
    </div>
  );
}
