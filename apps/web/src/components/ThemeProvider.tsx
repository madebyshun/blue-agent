"use client";

import { createContext, useContext, useEffect, useState } from "react";

/**
 * Theme = which palette the blueagent.dev LANDING renders in. Only the landing
 * (`.landing-root`, which reads the `--ln-*` tokens) responds; the dark app
 * shell ignores `data-theme` by construction, so a light preference never
 * leaks into /app, /hood, /hub.
 *
 * `data-theme` is the single source of truth on <html>. An inline script in the
 * root layout sets it before first paint (localStorage → system pref) so there
 * is no flash; this provider only keeps React state in sync and persists the
 * user's explicit choice under `blueagent_theme`.
 */

type Theme = "light" | "dark";
const STORAGE_KEY = "blueagent_theme";

const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "dark",
  toggle: () => {},
});

function readInitial(): Theme {
  if (typeof document !== "undefined") {
    const attr = document.documentElement.getAttribute("data-theme");
    if (attr === "light" || attr === "dark") return attr;
  }
  return "dark";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Start from whatever the pre-paint inline script already committed to <html>
  // so the first client render matches the DOM (no hydration flip).
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    setTheme(readInitial());
  }, []);

  const toggle = () => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* private mode / storage disabled — theme still applies for the session */
      }
      return next;
    });
  };

  return <ThemeCtx.Provider value={{ theme, toggle }}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  return useContext(ThemeCtx);
}
