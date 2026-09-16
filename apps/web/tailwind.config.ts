import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#050508",
        blue: {
          accent: "#4FC3F7",
          dim: "#29ABE2",
          glow: "rgba(79,195,247,0.15)",
        },
        purple: {
          accent: "#A78BFA",
          dim: "#7C3AED",
          glow: "rgba(167,139,250,0.15)",
        },
        surface: "#0D0D14",
        border: "#1A1A2E",

        // App palette (design handoff). Mirrors the :root custom properties in
        // globals.css — same values, so a class and an inline var() cannot
        // drift. All new keys; nothing above is redefined.
        nav: "#07070c",
        hairline: "rgba(26,26,46,0.5)",

        // Chain identity. `rh` is the Robinhood-chain green and must never be
        // swapped for `purple` (purple is secondary/coming-soon only). It
        // equals `success` today but is a separate key on purpose: the two
        // mean different things and should be free to diverge.
        rh: "#34D399",

        success: "#34D399",
        warning: "#F59E0B",
        error: "#F87171",

        // The handoff calls this "neutral bar" — the fill for a bar/meter
        // segment carrying no status. NOT named `neutral`: Tailwind ships a
        // built-in `neutral-50..950` scale, and a flat string here would
        // shadow all of it, so a later `bg-neutral-700` would silently emit
        // nothing. Nothing uses that scale today (measured: 0 hits), which is
        // exactly why the collision would go unnoticed until it bit someone.
        bar: "#334155",

        // Text ramp, brightest → dimmest. `ink` rather than `text` so the
        // generated classes read `text-ink-2` / `border-ink-3` instead of
        // `text-text-2`.
        ink: {
          1: "#E2E8F0",
          2: "#94A3B8",
          3: "#64748B",
          4: "#475569",
        },
      },
      screens: {
        "3xl": "1920px",
        "4xl": "2560px",
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "monospace"],
        sans: ["Inter", "system-ui", "sans-serif"],
        // Running sentences only. Chrome, numbers and labels stay mono.
        prose: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        // Glow is rationed: primary CTAs only. Status dots use
        // `0 0 8px currentColor` inline so the dot's own color drives it.
        cta: "0 0 16px rgba(79,195,247,0.28)",
        "cta-lg": "0 0 18px rgba(79,195,247,0.28)",
        // The active nav item's inset ring.
        "nav-active": "inset 0 0 0 1px rgba(79,195,247,0.22)",
      },
      backgroundImage: {
        "grid-pattern":
          "linear-gradient(rgba(79,195,247,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(79,195,247,0.03) 1px,transparent 1px)",
        "hero-glow":
          "radial-gradient(ellipse 80% 50% at 50% 0%,rgba(79,195,247,0.12) 0%,transparent 70%)",
        "blue-glow":
          "radial-gradient(circle at center,rgba(79,195,247,0.2) 0%,transparent 70%)",
        "purple-glow":
          "radial-gradient(circle at center,rgba(167,139,250,0.2) 0%,transparent 70%)",
      },
      backgroundSize: {
        grid: "40px 40px",
      },
      animation: {
        "pulse-slow": "pulse 4s cubic-bezier(0.4,0,0.6,1) infinite",
        "fade-up": "fadeUp 0.6s ease-out forwards",
        "scan-line": "scanLine 3s linear infinite",
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        scanLine: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
