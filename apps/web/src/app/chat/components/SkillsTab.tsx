"use client";
import { useState } from "react";
import { HUB_SKILLS, SKILL_CATEGORIES, CATEGORY_ICONS } from "../hub-skills";
import { useChat } from "../ChatContext";

export default function SkillsTab() {
  const { setInput, setSidebarTab } = useChat();
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? HUB_SKILLS.filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.description.toLowerCase().includes(search.toLowerCase())
      )
    : null;

  function handleSelect(trigger: string) {
    setInput(trigger);
    setSidebarTab("tasks"); // switch to chat view
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="px-3 pb-3">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search skills…"
          className="w-full bg-[#050508] border border-[#1A1A2E] rounded-lg px-3 py-1.5 font-mono text-xs text-white placeholder:text-slate-700 outline-none focus:border-[#2A2A4E] transition-colors"
        />
      </div>

      {/* Skills list */}
      <div className="flex-1 overflow-y-auto px-2">
        {filtered ? (
          /* Search results — flat list */
          <div className="space-y-0.5">
            {filtered.length === 0 ? (
              <p className="font-mono text-[10px] text-slate-700 text-center py-4">No skills found</p>
            ) : filtered.map(skill => (
              <SkillRow key={skill.id} skill={skill} onSelect={handleSelect} />
            ))}
          </div>
        ) : (
          /* Categorised */
          SKILL_CATEGORIES.map(cat => {
            const skills = HUB_SKILLS.filter(s => s.category === cat);
            return (
              <div key={cat} className="mb-4">
                <div className="flex items-center gap-1.5 px-2 py-1.5 sticky top-0 bg-[#0D0D14] z-10">
                  <span className="text-[11px]">{CATEGORY_ICONS[cat]}</span>
                  <span className="font-mono text-[9px] text-slate-600 tracking-widest uppercase">{cat}</span>
                  <span className="font-mono text-[9px] text-slate-700 ml-auto">{skills.length}</span>
                </div>
                <div className="space-y-0.5">
                  {skills.map(skill => (
                    <SkillRow key={skill.id} skill={skill} onSelect={handleSelect} />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function SkillRow({ skill, onSelect }: { skill: typeof HUB_SKILLS[number]; onSelect: (t: string) => void }) {
  return (
    <button
      onClick={() => onSelect(skill.trigger)}
      className="w-full text-left px-3 py-2 rounded-lg hover:bg-[#1A1A2E] transition-all group"
    >
      <p className="font-mono text-xs text-slate-300 group-hover:text-white transition-colors truncate">
        {skill.name}
      </p>
      <p className="font-mono text-[9px] text-slate-600 truncate mt-0.5">
        {skill.description}
      </p>
    </button>
  );
}
