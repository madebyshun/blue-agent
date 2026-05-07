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
        bg:      "#060C18",
        surface: "#0F1C35",
        mid:     "#162040",
        border:  "#162040",
        blue:    "#1A52FF",
        "blue-400": "#4A7AFF",
        cyan:    "#33C3FF",
        "cyan-300": "#67E5FF",
      },
      fontFamily: {
        sans: ["DM Sans", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      backgroundImage: {
        "grid-pattern":
          "linear-gradient(rgba(26,82,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(26,82,255,0.04) 1px, transparent 1px)",
        "hero-glow":
          "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(26,82,255,0.18) 0%, transparent 70%)",
        "blue-glow":
          "radial-gradient(ellipse 60% 40% at 50% 50%, rgba(26,82,255,0.22) 0%, transparent 70%)",
        "cyan-glow":
          "radial-gradient(ellipse 60% 40% at 50% 50%, rgba(51,195,255,0.15) 0%, transparent 70%)",
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
