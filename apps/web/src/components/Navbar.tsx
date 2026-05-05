"use client";

import { useEffect, useState } from "react";
import { useTheme } from "./ThemeProvider";

const TOKEN = "0xf895783b2931c919955e18b5e3343e7c7c456ba3";

function fmtPrice(p: number): string {
  if (!p) return "$BLUEAGENT";
  if (p < 0.000001) return "$" + p.toExponential(2);
  if (p < 0.0001) return "$" + p.toFixed(8);
  if (p < 0.01) return "$" + p.toFixed(6);
  return "$" + p.toFixed(4);
}

export default function Navbar() {
  const [price, setPrice] = useState<string>("$BLUEAGENT");
  const { theme, toggle } = useTheme();

  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const res = await fetch(`https://api.geckoterminal.com/api/v2/networks/base/tokens/${TOKEN}`);
        const data = await res.json();
        const p = parseFloat(data?.data?.attributes?.price_usd || "0");
        if (p) setPrice(fmtPrice(p));
      } catch {
        // silently ignore
      }
    };
    fetchPrice();
    const iv = setInterval(fetchPrice, 30000);
    return () => clearInterval(iv);
  }, []);

  return (
    <nav>
      <div className="flex items-center justify-between px-6 py-5" style={{ maxWidth: "64rem", margin: "0 auto" }}>
        <div className="flex items-center gap-3">
          <span className="font-bold text-lg tracking-tight" style={{ color: "var(--text)" }}>🔵 Blue Agent</span>
          <a href="/code" className="text-xs font-mono px-2 py-1 rounded-full" style={{ color: "#4a90d9", border: "1px solid rgba(74,144,217,0.3)", background: "rgba(74,144,217,0.06)" }}>
            Founder Console
          </a>
        </div>
        <div className="flex items-center gap-3">
          <div className="price-pill">🔵 <span>{price}</span></div>
          <a href="/rewards" className="text-sm font-medium hidden md:inline" style={{ color: "#4a90d9" }}>
            Rewards
          </a>
          <a href="/code" className="text-sm font-medium hidden sm:inline" style={{ color: "#4a90d9" }}>
            Open Console ↗
          </a>
          <a href="https://x.com/blocky_agent" target="_blank" rel="noopener noreferrer" className="text-sm font-medium hidden sm:inline" style={{ color: "#4a90d9" }}>
            @blocky_agent ↗
          </a>
          <button onClick={toggle} title={theme === "dark" ? "Switch to light" : "Switch to dark"} style={{ background: "rgba(74,144,217,0.1)", border: "1px solid rgba(74,144,217,0.3)", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </div>
      </div>
    </nav>
  );
}
