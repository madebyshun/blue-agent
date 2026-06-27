"use client";

// EN | 中文 pill toggle. Active language is highlighted blue (#4FC3F7).
// Used in the marketing header (Navbar) and the app shell (side nav + mobile
// top bar). Flipping it writes the shared `.blueagent.dev` cookie, so both
// blueagent.dev and app.blueagent.dev switch language together.

import { useLang, type Lang } from "@/lib/i18n/context";

export default function LanguageToggle({
  className = "",
  vertical = false,
}: {
  className?: string;
  /** Stack EN over 中文 — for the narrow 72px app side rail. */
  vertical?: boolean;
}) {
  const { lang, setLang } = useLang();

  const opt = (value: Lang, label: string) => {
    const active = lang === value;
    return (
      <button
        type="button"
        onClick={() => setLang(value)}
        aria-pressed={active}
        className={`rounded-full font-mono leading-none transition-colors ${
          vertical ? "px-2 py-1 text-[10px] w-full text-center" : "px-2 py-0.5 text-[11px]"
        }`}
        style={
          active
            ? { background: "#4FC3F7", color: "#050508", fontWeight: 600 }
            : { color: "#64748b" }
        }
      >
        {label}
      </button>
    );
  };

  return (
    <div
      className={`${
        vertical ? "flex flex-col w-full gap-0.5" : "inline-flex items-center gap-0.5"
      } rounded-full border border-[#1A1A2E] bg-[#0D0D14] p-0.5 ${className}`}
    >
      {opt("en", "EN")}
      {opt("zh", "中文")}
    </div>
  );
}
