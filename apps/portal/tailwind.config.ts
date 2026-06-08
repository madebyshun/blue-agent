import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/app/**/*.{ts,tsx}", "./src/components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg:      "#050508",
        surface: "#0d0d12",
        border:  "#1A1A2E",
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      animation: {
        "pulse-slow": "pulse 4s cubic-bezier(0.4,0,0.6,1) infinite",
        "fade-up":    "fadeUp 0.6s ease-out forwards",
      },
      keyframes: {
        fadeUp: {
          "0%":   { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
