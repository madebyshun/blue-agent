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
        bg:      "#050508",
        surface: "#0D0D14",
        border:  "#1A1A2E",
        blue:    "#4FC3F7",
        purple:  "#A78BFA",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      backgroundImage: {
        "grid-pattern":
          "linear-gradient(rgba(79,195,247,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(79,195,247,0.03) 1px, transparent 1px)",
        "hero-glow":
          "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(79,195,247,0.12) 0%, transparent 70%)",
        "blue-glow":
          "radial-gradient(ellipse 60% 40% at 50% 50%, rgba(79,195,247,0.15) 0%, transparent 70%)",
        "purple-glow":
          "radial-gradient(ellipse 60% 40% at 50% 50%, rgba(167,139,250,0.1) 0%, transparent 70%)",
      },
      animation: {
        "pulse-slow": "pulse 4s cubic-bezier(0.4,0,0.6,1) infinite",
        "fade-up":    "fadeUp 0.6s ease forwards",
        "scan-line":  "scanLine 3s linear infinite",
      },
      keyframes: {
        fadeUp: {
          "0%":   { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        scanLine: {
          "0%":   { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
